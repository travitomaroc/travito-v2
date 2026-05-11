// ================================================================
//  VERCEL SERVERLESS FUNCTION — Daily Events Auto-Poster
//  File: api/events-post.js
//  Runs: Every day at 07:30 UTC (before main cron at 08:00)
//  Logic: Check which event phases are due today, generate + post
//  Improved:
//   - fixes imageOrientation scope bug
//   - reduces repeated images with per-event image memory
//   - uses more relevant event-specific image queries
//   - respects se_settings.autoPost / imageEnabled / postPhases
//   - syncs posted results back into travito:se_posts for dashboard
// ================================================================

const BRAND = {
  name: "Travito Maroc",
  site: "https://travito.ma",
  handle: "@TravitoMaroc",
};

const PHASES = [
  { key: "save_date",   label: "Save the Date",  daysBefore: 14 },
  { key: "coming_soon", label: "Coming Soon",    daysBefore: 7  },
  { key: "this_week",   label: "Cette semaine!", daysBefore: 3  },
  { key: "tomorrow",    label: "Demain!",        daysBefore: 1  },
  { key: "today",       label: "Aujourd'hui!",   daysBefore: 0  },
  { key: "recap",       label: "Recap",          daysBefore: -2 },
];

const DEFAULT_SETTINGS = {
  autoPost: true,
  imageEnabled: true,
  imageOrientation: "landscape",
  postPhases: PHASES.map(p => p.key),
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function safeJsonParse(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
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

function uniqueStrings(arr) {
  return [...new Set(asArray(arr).filter(Boolean).map(x => String(x).trim()).filter(Boolean))];
}

function isoDateOnly(d) {
  return new Date(d).toISOString().split("T")[0];
}

function cleanCity(city) {
  const c = String(city || "").trim();
  return c || "Maroc";
}

function cleanCategory(cat) {
  return String(cat || "Événement").trim();
}

function cleanType(type) {
  return String(type || "event").trim();
}

function formatDateRange(start, end) {
  if (!start) return "";
  if (!end || start === end) return start;
  return `${start} au ${end}`;
}

function buildEventContext(event) {
  return {
    title: String(event.title || "").trim(),
    city: cleanCity(event.city),
    category: cleanCategory(event.category),
    type: cleanType(event.type),
    date_start: event.date_start,
    date_end: event.date_end || event.date_start,
    summary: String(event.summary || event.description || event.note || "").trim(),
    source: String(event.source || "").trim(),
    official: !!event.official,
  };
}

function phaseEnabled(settings, phaseKey) {
  const allowed = asArray(settings?.postPhases);
  if (!allowed.length) return true;
  return allowed.includes(phaseKey);
}

function isEventActive(event) {
  return event && event.active !== false;
}

function getPexelsOrientation(imageOrientation) {
  const o = String(imageOrientation || "landscape").toLowerCase();
  if (o === "portrait" || o === "square" || o === "landscape") return o;
  return "landscape";
}

function buildPhaseText(phase) {
  if (phase.daysBefore > 1) return `dans ${phase.daysBefore} jours`;
  if (phase.daysBefore === 1) return "demain";
  if (phase.daysBefore === 0) return "aujourd'hui";
  return "vient de se terminer";
}

function getPhaseSpecificImageQueries(event, phase) {
  const ctx = buildEventContext(event);
  const title = ctx.title;
  const city = ctx.city;
  const category = ctx.category;
  const type = ctx.type;

  const generic = [
    `${title} ${city}`,
    `${category} ${city} Morocco`,
    `${type} ${city} Morocco`,
    `${category} Morocco`,
  ];

  const byPhase = {
    save_date: [
      `${title} poster conference`,
      `${category} event calendar`,
      `${city} skyline business`,
      `${category} announcement Morocco`,
    ],
    coming_soon: [
      `${title} expo hall`,
      `${category} conference audience`,
      `${city} event venue`,
      `${category} anticipation Morocco`,
    ],
    this_week: [
      `${category} conference networking`,
      `${type} exhibition attendees`,
      `${city} convention center`,
      `${category} event crowd Morocco`,
    ],
    tomorrow: [
      `${category} registration desk`,
      `${city} business venue`,
      `${type} final preparations`,
      `${category} countdown event`,
    ],
    today: [
      `${category} live event`,
      `${type} opening ceremony`,
      `${category} stage audience`,
      `${city} expo event`,
    ],
    recap: [
      `${category} award success`,
      `${type} happy attendees`,
      `${category} networking team`,
      `${city} event success`,
    ],
  };

  return uniqueStrings([...(byPhase[phase.key] || []), ...generic]);
}

function pickHashtags(event, phase) {
  const cat = normalizeText(event.category);
  const city = normalizeText(event.city);

  const base = ["#TravitoMaroc", "#Maroc"];
  const categoryTags = [];

  if (cat.includes("tech")) categoryTags.push("#TechMaroc", "#InnovationMaroc");
  else if (cat.includes("emploi")) categoryTags.push("#EmploiMaroc", "#RecrutementMaroc");
  else if (cat.includes("immobilier")) categoryTags.push("#ImmobilierMaroc", "#ImmoMaroc");
  else if (cat.includes("auto")) categoryTags.push("#AutoMaroc", "#VoitureMaroc");
  else if (cat.includes("food") || cat.includes("agri")) categoryTags.push("#FoodMaroc", "#AgriMaroc");
  else if (cat.includes("sante")) categoryTags.push("#SanteMaroc", "#HealthTech");
  else if (cat.includes("musique")) categoryTags.push("#MusiqueMaroc", "#FestivalMaroc");
  else if (cat.includes("sport")) categoryTags.push("#SportMaroc", "#EventMaroc");
  else categoryTags.push("#EventMaroc", "#SortirAuMaroc");

  const cityTags = [];
  if (city.includes("casa")) cityTags.push("#Casablanca");
  else if (city.includes("rabat")) cityTags.push("#Rabat");
  else if (city.includes("marrakech")) cityTags.push("#Marrakech");
  else if (city.includes("tanger")) cityTags.push("#Tanger");
  else if (city.includes("agadir")) cityTags.push("#Agadir");
  else if (city.includes("meknes")) cityTags.push("#Meknes");
  else if (city.includes("fes")) cityTags.push("#Fes");

  if (phase.key === "today") categoryTags.push("#AujourdHui");
  if (phase.key === "tomorrow") categoryTags.push("#Demain");
  if (phase.key === "save_date") categoryTags.push("#SaveTheDate");

  return uniqueStrings([...base, ...categoryTags, ...cityTags]).slice(0, 4);
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

// ── Claude content generator ─────────────────────────────────────
async function generatePost(event, phase) {
  const ctx = buildEventContext(event);
  const hashtags = pickHashtags(event, phase).join(" ");
  const phaseText = buildPhaseText(phase);

  const prompt = `Tu es le rédacteur X de ${BRAND.name} (${BRAND.site}).
Rédige un seul post X en français pour un événement marocain.

ÉVÉNEMENT
Titre: ${ctx.title}
Ville: ${ctx.city}
Catégorie: ${ctx.category}
Type: ${ctx.type}
Dates: ${formatDateRange(ctx.date_start, ctx.date_end)}
Phase: ${phase.label}
Timing: ${phaseText}
Source: ${ctx.source || "non précisée"}
Contexte utile: ${ctx.summary || "aucun résumé disponible"}

OBJECTIF
- Donner un post pertinent pour l'événement réel
- Éviter le texte générique
- Mettre en avant la valeur utilisateur (découverte, opportunité, visite, networking, recrutement, salon, expo, etc.)
- Mentionner naturellement ${BRAND.site}

RÈGLES STRICTES
- Maximum 240 caractères
- 1 à 2 emojis max
- Pas de politique, pas de religion
- Pas de phrases creuses du type "à ne pas manquer" sans contexte
- Si la ville est "National", ne force pas une ville précise
- Terminer par 2 à 4 hashtags pertinents
- Répondre UNIQUEMENT avec le texte final

HASHTAGS SUGGÉRÉS
${hashtags}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const d = await r.json();
  const raw = d.content?.[0]?.text?.trim() || "";
  return raw.replace(/^["'`]+|["'`]+$/g, "").trim();
}

// ── Pexels image via existing proxy ──────────────────────────────
async function getPexelsImage({ query, imageOrientation = "landscape", usedImageIds = [] }) {
  try {
    const APP_URL = process.env.APP_URL || "https://travito-agents.vercel.app";
    const orientation = getPexelsOrientation(imageOrientation);

    // We vary page based on already-used images for this event to reduce repeats.
    const candidatePages = [1, 2, 3, 4].slice(0, Math.min(4, Math.max(2, usedImageIds.length + 1)));

    for (const page of candidatePages) {
      const url = `${APP_URL}/api/kv?action=pexels&query=${encodeURIComponent(query)}&page=${page}&format=${encodeURIComponent(orientation)}`;
      const r = await fetch(url);
      if (!r.ok) continue;

      const d = await r.json();
      if (!d?.imageUrl) continue;

      const candidateId = String(d.photoId || d.imageUrl);
      if (usedImageIds.includes(candidateId)) continue;

      return {
        imageUrl: d.imageUrl,
        imageId: candidateId,
        pexelsUrl: d.pexelsUrl || null,
        fallback: !!d.fallback,
      };
    }
  } catch (e) {
    console.log("Pexels proxy error:", e.message);
  }
  return null;
}

// ── Tweet poster ─────────────────────────────────────────────────
async function postTweet(text, imageUrl) {
  const body = {
    text,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
    apiKey: process.env.X_API_KEY,
    apiSecret: process.env.X_API_SECRET,
    imageUrl: imageUrl || null,
  };

  const APP_URL = process.env.APP_URL || "https://travito-agents.vercel.app";
  const r = await fetch(`${APP_URL}/api/tweet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return await r.json();
}

// ── Dashboard sync ───────────────────────────────────────────────
async function appendPostedItemsToSePosts(items) {
  if (!items.length) return;

  try {
    const existing = asArray(await kvGet("travito:se_posts"));
    const merged = [...items, ...existing].slice(0, 300);
    await kvSet("travito:se_posts", merged);
  } catch (e) {
    console.log("se_posts sync error:", e.message);
  }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
export default async function handler(req, res) {
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const isForce = req.query?.force === "true";
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"];

  if (!isForce && !isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDateOnly(today);

  console.log("Events auto-poster started:", todayStr);

  try {
    await fetch(process.env.KV_REST_API_URL + "/set/travito:events_last_ping", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(JSON.stringify({ firedAt: new Date().toISOString(), date: todayStr })),
    });
  } catch {}

  let events = [];
  let seSettings = { ...DEFAULT_SETTINGS };

  try {
    const kvEvents = await kvGet("travito:se_events");
    if (Array.isArray(kvEvents)) events = kvEvents;
  } catch (e) {
    console.log("KV events load failed:", e.message);
  }

  try {
    const kvSettings = await kvGet("travito:se_settings");
    if (kvSettings && typeof kvSettings === "object") {
      seSettings = { ...DEFAULT_SETTINGS, ...kvSettings };
    }
  } catch (e) {
    console.log("KV settings load failed:", e.message);
  }

  if (events.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No events in KV. Open the Special Events dashboard at least once to sync events to KV.",
      posted: 0,
    });
  }

  if (seSettings.autoPost === false && !isForce) {
    return res.status(200).json({
      success: true,
      date: todayStr,
      posted: 0,
      errors: 0,
      results: [],
      message: "Auto-post disabled in se_settings",
    });
  }

  let postedLog = {};
  try {
    postedLog = (await kvGet("travito:se_posted_log")) || {};
  } catch {
    postedLog = {};
  }

  const results = [];
  const errors = [];
  const dashboardPosts = [];

  for (const event of events) {
    if (!isEventActive(event)) continue;
    if (!event?.title || !event?.date_start) continue;

    const eventStart = new Date(event.date_start);
    if (Number.isNaN(eventStart.getTime())) continue;
    eventStart.setHours(0, 0, 0, 0);

    const usedImageIds = uniqueStrings(
      Object.values(postedLog)
        .filter(x => x && x.eventId === event.id && x.imageId)
        .map(x => x.imageId)
    );

    for (const phase of PHASES) {
      if (!phaseEnabled(seSettings, phase.key)) continue;

      const phaseDate = new Date(eventStart);
      phaseDate.setDate(phaseDate.getDate() - phase.daysBefore);
      const phaseDateStr = isoDateOnly(phaseDate);

      // allow today or 1-day catch-up
      const diffDays = Math.round((new Date(todayStr) - new Date(phaseDateStr)) / 86400000);
      if (diffDays < 0 || diffDays > 1) continue;

      const logKey = `${event.id}_${phase.key}`;
      if (postedLog[logKey]) {
        console.log(`Already posted: ${event.title} — ${phase.label}`);
        continue;
      }

      console.log(`Due today: ${event.title} — ${phase.label}`);

      try {
        const text = await generatePost(event, phase);
        if (!text) throw new Error("Empty content from Claude");

        let imageUrl = null;
        let imageId = null;
        let pexelsUrl = null;

        if (seSettings.imageEnabled !== false) {
          const queries = getPhaseSpecificImageQueries(event, phase);

          for (const query of queries) {
            const img = await getPexelsImage({
              query,
              imageOrientation: seSettings.imageOrientation,
              usedImageIds: [...usedImageIds, ...(imageId ? [imageId] : [])],
            });

            if (img?.imageUrl) {
              imageUrl = img.imageUrl;
              imageId = img.imageId || null;
              pexelsUrl = img.pexelsUrl || null;
              break;
            }
          }
        }

        const tweetResult = await postTweet(text, imageUrl);

        if (!tweetResult.success) {
          throw new Error(tweetResult.error || "Tweet failed");
        }

        postedLog[logKey] = {
          eventId: event.id,
          phase: phase.key,
          postedAt: new Date().toISOString(),
          tweetId: tweetResult.tweetId || tweetResult.id || null,
          tweetUrl: tweetResult.tweetUrl || null,
          imageId,
          imageUrl,
          pexelsUrl,
        };

        if (imageId) usedImageIds.push(imageId);

        const resultRow = {
          event: event.title,
          phase: phase.label,
          tweetId: tweetResult.tweetId || tweetResult.id || null,
          text: text.substring(0, 120),
          hasImage: !!imageUrl,
        };

        results.push(resultRow);

        dashboardPosts.push({
          id: Date.now().toString() + "_" + Math.random().toString(36).slice(2, 7),
          eventId: event.id,
          eventTitle: event.title,
          phase: phase.key,
          phaseLabel: phase.label,
          text,
          imageUrl,
          imageId,
          category: event.category,
          city: event.city,
          eventDate: event.date_start,
          status: "posted",
          createdAt: new Date().toISOString(),
          postedAt: new Date().toISOString(),
          tweetId: tweetResult.tweetId || tweetResult.id || null,
          tweetUrl: tweetResult.tweetUrl || null,
        });

        console.log(`Posted: ${event.title} — ${phase.label} — ${tweetResult.tweetId || tweetResult.id || "ok"}`);
        await sleep(1800);
      } catch (e) {
        console.error(`Error posting ${event.title} ${phase.label}:`, e.message);
        errors.push({
          event: event.title,
          phase: phase.label,
          error: e.message,
        });
      }
    }
  }

  await kvSet("travito:se_posted_log", postedLog);
  await appendPostedItemsToSePosts(dashboardPosts);

  try {
    const stats = (await kvGet("travito:stats")) || {};
    stats.lastEventPost = new Date().toISOString();
    stats.totalEventPosts = (stats.totalEventPosts || 0) + results.length;
    await kvSet("travito:stats", stats);
  } catch (e) {
    console.log("Stats update error:", e.message);
  }

  return res.status(200).json({
    success: true,
    date: todayStr,
    posted: results.length,
    errors: errors.length,
    results,
    errorRows: errors,
    message: results.length === 0
      ? "No event phases due today"
      : `Posted ${results.length} event phase(s)`,
  });
}