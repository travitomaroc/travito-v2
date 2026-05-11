// ================================================================
//  VERCEL SERVERLESS FUNCTION — Monthly Events Checker
//  File: api/events-checker.js
//  Runs: 1st of every month at 09:00 UTC
//  Uses Tavily + Claude to:
//   - verify existing event status
//   - broaden discovery from categories / cities / sources / time windows
//  Improved:
//   - wider source coverage
//   - saved-source-aware discovery (travito:se_sources)
//   - better dedupe
//   - better response quality without breaking existing UI contract
// ================================================================

const BRAND = {
  name: "Travito Maroc",
  site: "https://travito.ma",
  email: "travito.maroc@gmail.com",
};

const CITIES = [
  "Casablanca",
  "Rabat",
  "Marrakech",
  "Tanger",
  "Agadir",
  "Fès",
  "Meknès",
  "Oujda",
  "El Jadida",
  "Essaouira",
];

const CATEGORY_DEFS = [
  { category: "Tech",        typeHint: "expo|fair|summit",     queries: ["tech conference expo startup innovation digital"] },
  { category: "Emploi",      typeHint: "fair|summit|awareness",queries: ["emploi recrutement job fair formation carrière"] },
  { category: "Immobilier",  typeHint: "expo|fair|summit",     queries: ["immobilier property real estate salon expo"] },
  { category: "Auto",        typeHint: "expo|fair",            queries: ["auto moto mobility car show salon"] },
  { category: "Food",        typeHint: "fair|festival|expo",   queries: ["food agriculture agri salon fair expo"] },
  { category: "Santé",       typeHint: "summit|expo|awareness",queries: ["health medical healthcare pharma hospital summit expo"] },
  { category: "Musique",     typeHint: "festival",             queries: ["music festival concert culture"] },
  { category: "Sport",       typeHint: "tournament|festival",  queries: ["sport tournament championship marathon"] },
  { category: "Education",   typeHint: "fair|summit",          queries: ["education student training school university fair"] },
  { category: "Tourisme",    typeHint: "expo|festival",        queries: ["tourism travel hospitality fair expo"] },
  { category: "Services",    typeHint: "expo|summit",          queries: ["services business entrepreneurs marketplace expo"] },
  { category: "Retail",      typeHint: "expo|promo|fair",      queries: ["retail ecommerce commerce shopping expo fair"] },
  { category: "Construction",typeHint: "expo|summit|fair",     queries: ["construction btp building materials expo fair"] },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function uniqueBy(arr, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(title) {
  return normalizeText(title).replace(/\b(edition|édition|morocco|maroc|2025|2026|2027)\b/g, "").trim();
}

function fuzzySameEvent(a, b) {
  const ta = titleKey(a?.title);
  const tb = titleKey(b?.title);
  if (!ta || !tb) return false;
  if (ta === tb) return true;
  if (ta.includes(tb) || tb.includes(ta)) return true;
  const aWords = new Set(ta.split(" ").filter(Boolean));
  const bWords = new Set(tb.split(" ").filter(Boolean));
  let overlap = 0;
  for (const w of aWords) if (bWords.has(w)) overlap++;
  const denom = Math.max(aWords.size, bWords.size, 1);
  return overlap / denom >= 0.7;
}

function monthWindows() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({
      monthNameFr: d.toLocaleString("fr-FR", { month: "long" }),
      monthNameEn: d.toLocaleString("en-US", { month: "long" }),
      year: d.getFullYear(),
    });
  }
  return out;
}

// ── KV helpers ───────────────────────────────────────────────────
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(key);
  const r = await fetch(url, {
    headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN },
  });
  const d = await r.json();
  if (!d.result) return null;

  let val = d.result;
  try { val = JSON.parse(val); } catch {}
  if (val && typeof val === "object" && !Array.isArray(val) && val.value !== undefined) {
    val = val.value;
  }
  if (typeof val === "string") {
    try { val = JSON.parse(val); } catch {}
  }
  return val;
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(key);
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });
}

// ── Tavily Search ────────────────────────────────────────────────
async function tavilySearch(query, maxResults = 5) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_KEY,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: true,
    }),
  });
  if (!r.ok) throw new Error("Tavily error: " + r.status);
  return await r.json();
}

// ── Claude ───────────────────────────────────────────────────────
async function callClaude(system, user, maxTokens = 1200) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const d = await r.json();
  if (!d.content?.[0]?.text) {
    throw new Error("Claude error: " + JSON.stringify(d));
  }
  return d.content[0].text;
}

// ── Verify single event status ──────────────────────────────────
async function verifyEvent(event) {
  const year = new Date(event.date_start).getFullYear() || new Date().getFullYear();
  const result = {
    id: event.id,
    title: event.title,
    changes: [],
    status: "confirmed",
    newDates: null,
    newVenue: null,
    cancelled: false,
    confidence: "low",
    summary: "",
    lastVerified: new Date().toISOString(),
  };

  try {
    const q1 = await tavilySearch(`"${event.title}" ${year} official dates venue Morocco`, 5);
    const q2 = await tavilySearch(`"${event.title}" ${year} cancelled postponed rescheduled moved`, 4);

    const searchSummary = `
EVENT: ${event.title}
CURRENT DATA:
- date_start: ${event.date_start}
- date_end: ${event.date_end || event.date_start}
- city: ${event.city}
- category: ${event.category}
- source: ${event.source || "unknown"}

STATUS SEARCH:
${q1.answer || "No direct answer"}
${q1.results?.slice(0, 4).map(r => `- ${r.title}: ${String(r.content || "").substring(0, 240)}`).join("\n") || ""}

CHANGE SEARCH:
${q2.answer || "No direct answer"}
${q2.results?.slice(0, 4).map(r => `- ${r.title}: ${String(r.content || "").substring(0, 200)}`).join("\n") || ""}
`;

    const analysis = await callClaude(
      `Tu vérifies le statut réel d'un événement pour ${BRAND.name}.
Réponds UNIQUEMENT en JSON valide:
{
  "status": "confirmed|cancelled|postponed|unknown",
  "cancelled": false,
  "date_changed": false,
  "new_date_start": null,
  "new_date_end": null,
  "venue_changed": false,
  "new_venue": null,
  "new_city": null,
  "confidence": "high|medium|low",
  "summary": "1 phrase",
  "source_hint": "nom ou url de la source la plus crédible"
}`,
      searchSummary,
      1000
    );

    const parsed = JSON.parse(analysis.replace(/```json|```/g, "").trim());

    result.status = parsed.status || "unknown";
    result.cancelled = !!parsed.cancelled;
    result.confidence = parsed.confidence || "low";
    result.summary = parsed.summary || "Aucun résumé";
    result.sourceHint = parsed.source_hint || null;

    if (parsed.date_changed && parsed.new_date_start) {
      result.newDates = {
        start: parsed.new_date_start,
        end: parsed.new_date_end || parsed.new_date_start,
      };
      result.changes.push(`📅 Dates changées: ${parsed.new_date_start}${parsed.new_date_end ? " → " + parsed.new_date_end : ""}`);
    }

    if (parsed.venue_changed && (parsed.new_city || parsed.new_venue)) {
      result.newVenue = {
        venue: parsed.new_venue || null,
        city: parsed.new_city || null,
      };
      result.changes.push(`📍 Lieu changé: ${parsed.new_city || parsed.new_venue}`);
    }

    if (result.cancelled) {
      result.changes.push("❌ Événement annulé ou reporté");
    }

    console.log(`✓ ${event.title}: ${result.status} (${result.confidence}) — ${result.summary}`);
  } catch (e) {
    console.error(`✗ Error checking ${event.title}:`, e.message);
    result.status = "unknown";
    result.confidence = "low";
    result.summary = "Vérification échouée: " + e.message;
  }

  return result;
}

// ── Discovery query builder ─────────────────────────────────────
function buildDiscoveryQueries(savedSources = []) {
  const now = new Date();
  const year = now.getFullYear();
  const year2 = year + 1;
  const windows = monthWindows();

  const queries = [];

  // 1) Broad market-wide category queries
  for (const def of CATEGORY_DEFS) {
    for (const q of def.queries) {
      queries.push({
        query: `Morocco Maroc ${q} ${year} ${year2}`,
        category: def.category,
        sourceName: null,
        city: null,
      });
    }
  }

  // 2) Category + city
  for (const def of CATEGORY_DEFS) {
    for (const city of CITIES) {
      queries.push({
        query: `${city} Morocco ${def.queries[0]} ${year} ${year2}`,
        category: def.category,
        sourceName: null,
        city,
      });
    }
  }

  // 3) Category + month windows
  for (const def of CATEGORY_DEFS) {
    for (const w of windows) {
      queries.push({
        query: `Maroc ${def.queries[0]} ${w.monthNameFr} ${w.year}`,
        category: def.category,
        sourceName: null,
        city: null,
      });
      queries.push({
        query: `Morocco ${def.queries[0]} ${w.monthNameEn} ${w.year}`,
        category: def.category,
        sourceName: null,
        city: null,
      });
    }
  }

  // 4) Saved sources from UI / KV
  for (const src of savedSources) {
    if (!src?.name && !src?.url) continue;
    const base = [src.name, src.url].filter(Boolean).join(" ");
    queries.push({
      query: `${base} Morocco Maroc events ${year} ${year2}`,
      category: src.category || "all",
      sourceName: src.name || src.url || null,
      city: null,
    });

    for (const w of windows.slice(0, 4)) {
      queries.push({
        query: `${base} ${w.monthNameEn} ${w.year} event expo festival conference`,
        category: src.category || "all",
        sourceName: src.name || src.url || null,
        city: null,
      });
    }
  }

  // Deduplicate queries
  return uniqueBy(queries, x => normalizeText(x.query)).slice(0, 80);
}

// ── Claude extraction ────────────────────────────────────────────
async function extractEventsFromSearch(queryObj, tavilyData) {
  const year = new Date().getFullYear();
  const year2 = year + 1;

  const extraction = await callClaude(
    `Tu es un agent de découverte d'événements pour ${BRAND.name}.
Extrais uniquement les événements plausibles, utiles et pertinents pour le Maroc.

RÈGLES STRICTES:
- Événements officiels, publics, salons, foires, festivals, sommets, conférences, tournois, awareness days, seasonal/promo commercial raisonnable
- Pas de politique
- Pas de religion
- Pas de sujets controversés
- Dates ${year} ou ${year2} uniquement
- Réponds UNIQUEMENT en JSON valide

FORMAT:
{
  "events": [
    {
      "title": "Nom officiel",
      "date_start": "YYYY-MM-DD",
      "date_end": "YYYY-MM-DD",
      "city": "Ville ou National",
      "category": "${queryObj.category || "all"}",
      "type": "expo|fair|summit|festival|tournament|awareness|promo|seasonal",
      "source": "URL ou nom de source",
      "confidence": "high|medium|low",
      "summary": "courte description"
    }
  ],
  "sourceHints": [
    { "name": "Nom source", "url": "https://...", "category": "${queryObj.category || "all"}" }
  ]
}`,
    `QUERY: ${queryObj.query}
CATEGORY: ${queryObj.category || "all"}
CITY FOCUS: ${queryObj.city || "none"}
SOURCE FOCUS: ${queryObj.sourceName || "none"}

TAVILY ANSWER:
${tavilyData.answer || ""}

RESULTS:
${tavilyData.results?.slice(0, 5).map(r =>
  `- TITLE: ${r.title}\n  URL: ${r.url || "n/a"}\n  CONTENT: ${String(r.content || "").substring(0, 320)}`
).join("\n\n") || "No results"}`
  );

  return JSON.parse(extraction.replace(/```json|```/g, "").trim());
}

// ── Discover new events ─────────────────────────────────────────
async function discoverNewEvents(existingEvents = [], savedSources = []) {
  const queries = buildDiscoveryQueries(savedSources);
  const discovered = [];
  const newSources = [];
  let processed = 0;

  for (const q of queries) {
    try {
      const tavilyData = await tavilySearch(q.query, 5);
      if (!tavilyData?.results?.length && !tavilyData?.answer) continue;

      const parsed = await extractEventsFromSearch(q, tavilyData);

      const events = asArray(parsed.events)
        .filter(e =>
          e &&
          e.title &&
          e.date_start &&
          e.city &&
          e.confidence !== "low"
        )
        .map(e => ({
          ...e,
          category: e.category || q.category || "all",
          active: true,
          approved: true,
          discovered: true,
          discoveredAt: new Date().toISOString(),
        }));

      discovered.push(...events);

      const hints = asArray(parsed.sourceHints)
        .filter(s => s && (s.name || s.url))
        .map((s, idx) => ({
          id: Date.now() + idx + Math.floor(Math.random() * 1000),
          name: s.name || s.url,
          url: s.url || "",
          category: s.category || q.category || "all",
          active: true,
        }));

      newSources.push(...hints);
      processed++;

      // small pacing to reduce rate limiting
      await sleep(600);

      // avoid excessive runtime
      if (processed >= 26) break;
    } catch (e) {
      console.error(`Discovery error for "${q.query}":`, e.message);
    }
  }

  // dedupe discovered events against each other and existing events
  const deduped = [];
  for (const ev of discovered) {
    const duplicateExisting = existingEvents.some(x => fuzzySameEvent(x, ev));
    const duplicateNew = deduped.some(x => fuzzySameEvent(x, ev));
    if (!duplicateExisting && !duplicateNew) deduped.push(ev);
  }

  const dedupedSources = uniqueBy(
    newSources,
    s => normalizeText((s.url || "") + " " + (s.name || ""))
  ).slice(0, 40);

  console.log(`Total new events discovered: ${deduped.length}`);
  return { events: deduped, newSources: dedupedSources };
}

// ── Send notification email body ────────────────────────────────
function buildEmailReport(verifications, newEvents, existingEvents, newSources = []) {
  const changes = verifications.filter(v => v.changes.length > 0);
  const cancelled = verifications.filter(v => v.cancelled);
  const confirmed = verifications.filter(v => v.status === "confirmed" && !v.cancelled);

  let body = `Rapport mensuel de vérification des événements — ${BRAND.name}

✅ ÉVÉNEMENTS CONFIRMÉS (${confirmed.length}/${existingEvents.length})
${confirmed.map(v => `• ${v.title} — ${v.summary}`).join("\n") || "Aucun"}

${changes.length > 0 ? `⚠️ CHANGEMENTS DÉTECTÉS (${changes.length})
${changes.map(v => `• ${v.title}:\n  ${v.changes.join("\n  ")}`).join("\n")}
` : ""}${cancelled.length > 0 ? `❌ ANNULÉS/REPORTÉS (${cancelled.length})
${cancelled.map(v => `• ${v.title} — ${v.summary}`).join("\n")}
` : ""}🆕 NOUVEAUX ÉVÉNEMENTS DÉCOUVERTS (${newEvents.length})
${newEvents.slice(0, 15).map(e => `• ${e.title} — ${e.date_start} — ${e.city} (${e.category})`).join("\n") || "Aucun nouveau"}

Gérez les événements sur: travito-agents.vercel.app
${BRAND.site} | @TravitoMaroc`;

  if (newSources.length > 0) {
    body += `

🔗 NOUVELLES SOURCES DÉCOUVERTES (${newSources.length})
${newSources.slice(0, 15).map(s => `• ${s.name} — ${s.url || "n/a"} (${s.category})`).join("\n")}`;
  }

  return {
    subject: `📅 [Travito] Rapport Événements — ${new Date().toLocaleDateString("fr-MA")}`,
    body,
  };
}

// ── MAIN HANDLER ────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const isForce = req.query?.force === "true";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"];

  if (!isForce && !isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.TAVILY_KEY) {
    return res.status(200).json({ success: false, error: "TAVILY_KEY not configured" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ success: false, error: "ANTHROPIC_API_KEY not configured" });
  }

  console.log("Events checker started:", new Date().toISOString());

  const report = {
    startedAt: new Date().toISOString(),
    verifications: [],
    newEvents: [],
    newSources: [],
    errors: [],
  };

  try {
    const existingEvents = asArray(req.body?.events);
    const activeEvents = existingEvents.filter(e => e.active !== false);

    let savedSources = [];
    try {
      savedSources = asArray(await kvGet("travito:se_sources"));
    } catch {}

    const manual = isForce;
    const forceDiscover = req.query?.discover === "true";

    console.log(`Checking ${activeEvents.length} active events...`);

    // Verification
    const verifyLimit = manual ? 3 : 8;
    const toVerify = activeEvents.slice(0, verifyLimit);

    for (const event of toVerify) {
      try {
        const verification = await verifyEvent(event);
        report.verifications.push(verification);
        await sleep(250);
      } catch (e) {
        report.errors.push({ event: event.title, error: e.message });
      }
    }

    // Discovery
    if (!manual || forceDiscover) {
      console.log("Discovering new events...");
      const discovery = await discoverNewEvents(existingEvents, savedSources);
      report.newEvents = discovery.events;
      report.newSources = discovery.newSources;
    } else {
      console.log("Skipping discovery on manual run (use ?discover=true to force)");
    }

    // Persist newly discovered sources for later review/use
    if (report.newSources.length > 0) {
      try {
        const mergedSources = uniqueBy(
          [...report.newSources, ...savedSources],
          s => normalizeText((s.url || "") + " " + (s.name || ""))
        ).slice(0, 200);

        await kvSet("travito:se_sources", mergedSources);
      } catch (e) {
        console.log("Source save error:", e.message);
      }
    }

    const emailReport = buildEmailReport(
      report.verifications,
      report.newEvents,
      existingEvents,
      report.newSources
    );

    report.emailReport = emailReport;
    report.summary = {
      total: existingEvents.length,
      verified: report.verifications.length,
      confirmed: report.verifications.filter(v => v.status === "confirmed").length,
      cancelled: report.verifications.filter(v => v.cancelled).length,
      changed: report.verifications.filter(v => v.changes.length > 0).length,
      newFound: report.newEvents.length,
      newSources: report.newSources.length,
      errors: report.errors.length,
    };
    report.completedAt = new Date().toISOString();

    console.log("Events checker complete:", JSON.stringify(report.summary));
    return res.status(200).json({ success: true, ...report });
  } catch (error) {
    console.error("Events checker error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      report,
    });
  }
}

export const config = { maxDuration: 60 };