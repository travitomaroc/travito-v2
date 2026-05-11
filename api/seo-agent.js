// ================================================================
//  api/seo-agent.js — SEO Agent Engine
//  Agents: strategist | technical | onpage | onpage_bulk | monitoring | programmatic | schema
// ================================================================

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const d = await r.json();
    if (!d.result) return null;
    let val = d.result;
    try { val = JSON.parse(val); } catch {}
    if (val && typeof val === "object" && !Array.isArray(val) && val.value !== undefined) val = val.value;
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  } catch { return null; }
}

async function kvSet(key, value, ex = null) {
  const url = ex ? `${KV_URL}/set/${encodeURIComponent(key)}?ex=${ex}` : `${KV_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

async function callClaude(prompt, maxTokens = 2000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  if (!d.content?.[0]?.text) throw new Error("Claude error: " + JSON.stringify(d).slice(0, 200));
  return d.content[0].text;
}

function parseJSON(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON in response");
  return JSON.parse(text.substring(s, e + 1));
}

// ── Google Auth + SEO Data (merged from seo-data.js) ──────────
// ── Google Service Account JWT ─────────────────────────────────
async function getGoogleToken(scopes) {
  const clientEmail = process.env.GOOGLE_SC_CLIENT_EMAIL;
  const privateKey  = (process.env.GOOGLE_SC_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("Google credentials not configured — set GOOGLE_SC_CLIENT_EMAIL + GOOGLE_SC_PRIVATE_KEY");

  const now = Math.floor(Date.now() / 1000);
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header  = encode({ alg: "RS256", typ: "JWT" });
  const payload = encode({ iss: clientEmail, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now });
  const sigInput = `${header}.${payload}`;

  const keyData = privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", Buffer.from(keyData, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, Buffer.from(sigInput));
  const jwt = `${sigInput}.${Buffer.from(sig).toString("base64url")}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token error: " + JSON.stringify(d));
  return d.access_token;
}

// ── Search Console — Keywords + Pages ─────────────────────────
async function fetchSearchConsole(token) {
  const siteUrl   = process.env.GOOGLE_SC_SITE_URL || "sc-domain:travito.ma";
  const endDate   = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 28*24*3600*1000).toISOString().split("T")[0];
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Keywords
  const rKw = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 25, dataState: "all" }),
  });
  const dKw = await rKw.json();
  if (dKw.error) throw new Error("SC keywords: " + JSON.stringify(dKw.error));

  // Pages
  const rPg = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit: 15, dataState: "all" }),
  });
  const dPg = await rPg.json();

  // Country breakdown
  const rCo = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({ startDate, endDate, dimensions: ["country"], rowLimit: 8, dataState: "all" }),
  });
  const dCo = await rCo.json();

  // Device breakdown
  const rDv = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({ startDate, endDate, dimensions: ["device"], rowLimit: 5, dataState: "all" }),
  });
  const dDv = await rDv.json();

  return {
    keywords: (dKw.rows || []).map(r => ({
      keyword: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10,
    })),
    pages: (dPg.rows || []).map(r => ({
      page: r.keys[0].replace("https://travito.ma", "") || "/",
      clicks: r.clicks, impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10,
    })),
    countries: (dCo.rows || []).map(r => ({ country: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    devices: (dDv.rows || []).map(r => ({ device: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    period: `${startDate} → ${endDate}`,
    totals: {
      clicks: (dKw.rows || []).reduce((s, r) => s + r.clicks, 0),
      impressions: (dKw.rows || []).reduce((s, r) => s + r.impressions, 0),
    },
  };
}

// ── Search Console — URL Coverage / Index Report ───────────────
async function fetchSCCoverage(token) {
  const siteUrl = process.env.GOOGLE_SC_SITE_URL || "sc-domain:travito.ma";
  // SC URL Inspection is per-URL. For coverage we use the sitemap endpoint
  try {
    const r = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json();
    const sitemaps = (d.sitemap || []).map(s => ({
      path: s.path,
      submitted: s.contents?.reduce((sum, c) => sum + (c.submitted || 0), 0) || 0,
      indexed: s.contents?.reduce((sum, c) => sum + (c.indexed || 0), 0) || 0,
      lastDownloaded: s.lastDownloaded,
      warnings: s.warnings || 0,
      errors: s.errors || 0,
    }));
    const totalSubmitted = sitemaps.reduce((s, m) => s + m.submitted, 0);
    const totalIndexed   = sitemaps.reduce((s, m) => s + m.indexed, 0);
    return { sitemaps, totalSubmitted, totalIndexed, coverageRate: totalSubmitted > 0 ? Math.round((totalIndexed/totalSubmitted)*100) : 0 };
  } catch(e) {
    return { sitemaps: [], totalSubmitted: 0, totalIndexed: 0, coverageRate: 0, error: e.message };
  }
}

// ── GA4 — Sessions + Traffic ───────────────────────────────────
async function fetchGA4(token) {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("GA4_PROPERTY_ID not configured");
  const base    = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Daily trend
  const rDaily = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }, { name: "bounceRate" }],
      dimensions: [{ name: "date" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 30,
    }),
  });
  const dDaily = await rDaily.json();

  // Channel breakdown
  const rChan = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "newUsers" }, { name: "bounceRate" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      limit: 10,
    }),
  });
  const dChan = await rChan.json();

  // Top pages by pageviews
  const rPages = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "averageSessionDuration" }],
      dimensions: [{ name: "pagePath" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }),
  });
  const dPages = await rPages.json();

  const daily = (dDaily.rows || []).map(r => ({
    date: r.dimensionValues[0].value,
    sessions: parseInt(r.metricValues[0].value),
    users: parseInt(r.metricValues[1].value),
    pageviews: parseInt(r.metricValues[2].value),
    bounce: Math.round(parseFloat(r.metricValues[3].value) * 100),
  }));

  const channels = (dChan.rows || []).map(r => ({
    channel: r.dimensionValues[0].value,
    sessions: parseInt(r.metricValues[0].value),
    users: parseInt(r.metricValues[1].value),
    newUsers: parseInt(r.metricValues[2].value),
    bounce: Math.round(parseFloat(r.metricValues[3].value) * 100),
  })).sort((a, b) => b.sessions - a.sessions);

  const topPages = (dPages.rows || []).map(r => ({
    path: r.dimensionValues[0].value,
    pageviews: parseInt(r.metricValues[0].value),
    users: parseInt(r.metricValues[1].value),
    avgDuration: Math.round(parseFloat(r.metricValues[2].value)),
  }));

  const total = daily.reduce((s, d) => ({
    sessions: s.sessions + d.sessions,
    users: s.users + d.users,
    pageviews: s.pageviews + d.pageviews,
  }), { sessions: 0, users: 0, pageviews: 0 });

  return { daily, channels, topPages, total, period: "28 derniers jours" };
}

// ── Claude AI Insights ─────────────────────────────────────────
async function generateInsights(scData, ga4Data, coverage) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 800,
      messages: [{ role: "user", content:
        `SEO Director de Travito Maroc (annonces immobilier/auto/emploi Maroc).
SC (28j): ${scData.totals.clicks} clics | ${scData.totals.impressions} impressions
Top kw: ${scData.keywords.slice(0,5).map(k=>`${k.keyword}(pos ${k.position})`).join(", ")}
Coverage: ${coverage.totalIndexed}/${coverage.totalSubmitted} pages indexées (${coverage.coverageRate}%)
GA4: ${ga4Data.total.sessions} sessions | ${ga4Data.total.users} users
Top channel: ${ga4Data.channels[0]?.channel || "N/A"} (${ga4Data.channels[0]?.sessions || 0} sessions)

Génère 3 insights actionnables. JSON UNIQUEMENT:
{"insights":[
  {"type":"win|warning|opportunity","title":"...","detail":"...","action":"...","priority":"high|medium"}
]}`
      }],
    }),
  });
  const d = await r.json();
  const text = d.content?.[0]?.text || "{}";
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    return JSON.parse(text.substring(s, e+1));
  } catch { return { insights: [] }; }
}


// ── WordPress REST helpers ─────────────────────────────────────
function wpHeaders() {
  return {
    Authorization: "Basic " + Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASSWORD}`).toString("base64"),
    "Content-Type": "application/json",
  };
}

async function wpGet(path) {
  const r = await fetch(`${process.env.WP_URL}/wp-json/wp/v2${path}`, { headers: wpHeaders() });
  if (!r.ok) throw new Error(`WP ${r.status}: ${path}`);
  return r.json();
}

async function wpPost(path, data) {
  const r = await fetch(`${process.env.WP_URL}/wp-json/wp/v2${path}`, {
    method: "POST", headers: wpHeaders(), body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`WP ${r.status}: ${path}`);
  return r.json();
}

async function getWPContent() {
  const [pages, posts, categories] = await Promise.all([
    wpGet("/pages?per_page=50&status=publish&_fields=id,title,slug,link,meta").catch(() => []),
    wpGet("/posts?per_page=30&status=publish&_fields=id,title,slug,link,meta").catch(() => []),
    wpGet("/categories?per_page=50&_fields=id,name,slug,count,description").catch(() => []),
  ]);
  return { pages, posts, categories };
}

async function getSiteInfo() {
  const [sitemap, robots] = await Promise.all([
    fetch(`${process.env.WP_URL}/sitemap_index.xml`).then(r => r.text()).catch(() => ""),
    fetch(`${process.env.WP_URL}/robots.txt`).then(r => r.text()).catch(() => ""),
  ]);
  const sitemapUrls = (sitemap.match(/<loc>(.*?)<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, ""));
  return { sitemapUrls, robots: robots.substring(0, 800) };
}

// ── AGENT 1: SEO Strategist ────────────────────────────────────
async function runStrategist(seoData, input) {
  const sc  = seoData?.searchConsole;
  const { pages, categories } = await getWPContent();

  const raw = await callClaude(`Tu es SEO Strategist de Travito Maroc (${process.env.WP_URL}).
Site d'annonces: immobilier, automobile, emploi, services. Plugin: RankMath. Langue: français/arabe.

SEARCH CONSOLE (28j):
Clics totaux: ${sc?.totals?.clicks || 0} | Impressions: ${sc?.totals?.impressions || 0}
Top keywords: ${(sc?.keywords||[]).slice(0,10).map(k=>`"${k.keyword}"(pos ${k.position}, ${k.clicks}clics)`).join(", ")}
Coverage: ${seoData?.coverage?.totalIndexed||0}/${seoData?.coverage?.totalSubmitted||0} pages indexées

CATÉGORIES WP (${categories.length}):
${categories.slice(0,20).map(c=>`${c.slug}(${c.count} annonces)`).join(", ")}

PAGES (${pages.length}): ${pages.slice(0,15).map(p=>p.slug).join(", ")}

${input ? "INSTRUCTION: "+input : ""}

Analyse et génère stratégie complète. Réponds UNIQUEMENT en JSON valide:
{
  "summary": "...",
  "priorityPages": [{"url":"/slug","priority":"high|medium|low","targetKeyword":"...","reason":"...","action":"optimize|noindex|canonical","estimatedTraffic":"high|medium|low"}],
  "keywordMap": [{"category":"...","primary":"...","secondary":["..."],"intent":"commercial|informational","volume":"high|medium|low"}],
  "indexPolicy": {
    "noindex": ["types de pages à mettre en noindex avec raison"],
    "index": ["types de pages importantes à indexer"],
    "canonical": ["règles canonical"]
  },
  "filterPagesPolicy": "recommandation spécifique pour pages search/filter Listivo",
  "cityStrategy": "stratégie ville + catégorie pour Maroc",
  "roadmap": [{"week":1,"task":"...","impact":"high|medium","agent":"Technical|OnPage|Monitoring"}],
  "quickWins": ["action rapide 1","action rapide 2","action rapide 3"]
}`, 2500);

  const result = parseJSON(raw);
  await kvSet("travito:seo_strategy", { ...result, updatedAt: new Date().toISOString() }, 7*24*3600);
  return result;
}

// ── AGENT 2: Technical SEO ─────────────────────────────────────
async function runTechnical(seoData) {
  const { sitemapUrls, robots } = await getSiteInfo();
  const { pages, categories } = await getWPContent();
  const coverage = seoData?.coverage;

  const raw = await callClaude(`Tu es Technical SEO Agent de Travito Maroc.
Stack: Listivo theme + RankMath + Elementor + WordPress.
Site annonces: immobilier, auto, emploi.

SITEMAP (${sitemapUrls.length} sitemaps):
${sitemapUrls.join("\n")}

ROBOTS.TXT:
${robots}

SC COVERAGE:
Soumis: ${coverage?.totalSubmitted||"N/A"} | Indexés: ${coverage?.totalIndexed||"N/A"} | Taux: ${coverage?.coverageRate||"N/A"}%
Sitemaps SC: ${JSON.stringify((coverage?.sitemaps||[]).map(s=>({path:s.path,submitted:s.submitted,indexed:s.indexed,errors:s.errors})))}

CATÉGORIES (${categories.length}): ${categories.map(c=>c.slug).join(", ")}
PAGES (${pages.length}): ${pages.slice(0,20).map(p=>p.slug).join(", ")}

Détecte problèmes techniques. Réponds UNIQUEMENT en JSON:
{
  "summary": "...",
  "overallScore": 0-100,
  "issues": [{"type":"noindex_leak|canonical|sitemap|robots|thin_content|duplicate|schema|crawl","severity":"critical|high|medium|low","description":"...","affected":"...","fix":"...","rankMathSetting":"si applicable"}],
  "sitemapAnalysis": {"status":"ok|warning|error","totalUrls":0,"issues":["..."],"recommendations":["..."]},
  "robotsAnalysis": {"status":"ok|warning|error","issues":["..."],"recommendations":["..."]},
  "coverageAnalysis": {"indexedRatio":"...","gaps":["types de pages non indexées"],"recommendations":["..."]},
  "listivoCritical": ["problèmes spécifiques Listivo à corriger en priorité"],
  "rankMathConfig": ["paramètres RankMath à vérifier/configurer"],
  "quickFixes": ["fix 1 — 5min","fix 2 — 10min","fix 3 — 15min"]
}`, 2000);

  const result = parseJSON(raw);
  await kvSet("travito:seo_technical", { ...result, updatedAt: new Date().toISOString() }, 24*3600);
  return result;
}

// ── AGENT 3: On-Page Content (single) ─────────────────────────
async function runOnPage(target) {
  const seoData = await kvGet("travito:seo_data");
  const strategy = await kvGet("travito:seo_strategy");
  const sc = seoData?.searchConsole;
  const { pageType = "category", slug = "", category = "", currentTitle = "" } = target || {};

  const relevantKws = (sc?.keywords || [])
    .filter(k => !category || k.keyword.toLowerCase().includes(category.toLowerCase()))
    .slice(0, 6);

  const strategyKw = (strategy?.keywordMap || [])
    .find(k => k.category?.toLowerCase().includes(category.toLowerCase()));

  const raw = await callClaude(`Tu es On-Page Content Agent de Travito Maroc.
Site annonces Maroc: immobilier, automobile, emploi, services.
Plugin: RankMath | Langue: Français | Ton: informatif, ancré Maroc

PAGE:
- Type: ${pageType}
- Slug: ${slug}
- Titre actuel: ${currentTitle || "non défini"}
- Catégorie: ${category}

MOTS-CLÉS SEARCH CONSOLE pertinents:
${relevantKws.map(k=>`"${k.keyword}" pos ${k.position} | ${k.clicks} clics`).join("\n") || "Aucun"}

STRATÉGIE EN COURS:
${strategyKw ? JSON.stringify(strategyKw) : "Aucune stratégie spécifique"}

Génère contenu on-page optimisé. Réponds UNIQUEMENT en JSON:
{
  "seoTitle": "max 60 chars",
  "metaDescription": "max 155 chars avec CTA",
  "h1": "...",
  "introText": "90-140 mots intro SEO pour cette page catégorie/terme",
  "faqSchema": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
  "internalLinks": [{"anchor":"...","suggestedUrl":"...","context":"où placer ce lien"}],
  "socialSnippet": "texte pour partage social 100-120 chars",
  "ogTitle": "...",
  "targetKeyword": "...",
  "secondaryKeywords": ["...", "...", "..."],
  "ctrScore": 0-10,
  "ctrTips": "...",
  "rankMathInstructions": "que configurer dans RankMath pour cette page"
}`, 1800);

  return parseJSON(raw);
}

// ── AGENT 4: On-Page Bulk ──────────────────────────────────────
async function runOnPageBulk(pushToWP = false) {
  const { categories } = await getWPContent();
  const seoData = await kvGet("travito:seo_data");
  const sc = seoData?.searchConsole;

  // Focus on main categories with most listings
  const mainCats = categories
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const results = [];
  for (const cat of mainCats) {
    try {
      const relevantKws = (sc?.keywords || [])
        .filter(k => k.keyword.toLowerCase().includes(cat.name.toLowerCase()) ||
                     k.keyword.toLowerCase().includes(cat.slug.toLowerCase()))
        .slice(0, 4);

      const raw = await callClaude(`SEO On-Page pour catégorie Travito Maroc.
Catégorie: "${cat.name}" (slug: ${cat.slug}, ${cat.count} annonces)
KW pertinents: ${relevantKws.map(k=>`"${k.keyword}"(pos ${k.position})`).join(", ") || "aucun"}
JSON uniquement:
{"seoTitle":"...","metaDescription":"...","h1":"...","introText":"60-100 mots","targetKeyword":"..."}`, 600);

      const content = parseJSON(raw);
      results.push({ category: cat.name, slug: cat.slug, id: cat.id, ...content });

      // Push to WordPress if requested
      if (pushToWP && cat.id) {
        try {
          await wpPost(`/categories/${cat.id}`, {
            description: content.introText,
            meta: { rank_math_title: content.seoTitle, rank_math_description: content.metaDescription },
          });
        } catch(e) {
          results[results.length-1].wpError = e.message;
        }
      }

      await new Promise(r => setTimeout(r, 500));
    } catch(e) {
      results.push({ category: cat.name, slug: cat.slug, error: e.message });
    }
  }

  const output = { results, total: results.length, pushed: pushToWP, updatedAt: new Date().toISOString() };
  await kvSet("travito:seo_onpage_bulk", output, 7*24*3600);
  return output;
}

// ── AGENT 5: Monitoring ────────────────────────────────────────
async function runMonitoring() {
  const seoData  = await kvGet("travito:seo_data");
  const prevData = await kvGet("travito:seo_monitoring_prev");
  const sc = seoData?.searchConsole;
  const coverage = seoData?.coverage;

  // Compare keywords with prev week
  const kwChanges = [];
  if (prevData?.searchConsole?.keywords && sc?.keywords) {
    for (const kw of sc.keywords.slice(0, 15)) {
      const prev = prevData.searchConsole.keywords.find(k => k.keyword === kw.keyword);
      if (prev) {
        const posDelta   = Math.round((prev.position - kw.position) * 10) / 10;
        const clickDelta = kw.clicks - prev.clicks;
        if (Math.abs(posDelta) >= 1 || Math.abs(clickDelta) >= 3) {
          kwChanges.push({ keyword: kw.keyword, posDelta, clickDelta, current: kw.position, prev: prev.position });
        }
      }
    }
  }

  // Coverage change
  const prevCoverage = prevData?.coverage;
  const coverageDelta = prevCoverage
    ? (coverage?.totalIndexed || 0) - (prevCoverage.totalIndexed || 0)
    : 0;

  const raw = await callClaude(`Tu es SEO Monitoring Agent de Travito Maroc.
Analyse les changements SEO de la semaine.

DONNÉES ACTUELLES (28j):
Clics: ${sc?.totals?.clicks||0} | Impressions: ${sc?.totals?.impressions||0}
Top KW: ${(sc?.keywords||[]).slice(0,8).map(k=>`"${k.keyword}"(pos ${k.position}, ${k.clicks}c)`).join(" | ")}
Top pages: ${(sc?.pages||[]).slice(0,5).map(p=>`${p.page}(${p.clicks}c pos ${p.position})`).join(" | ")}

COVERAGE:
Indexées: ${coverage?.totalIndexed||"N/A"} / Soumises: ${coverage?.totalSubmitted||"N/A"}
Delta coverage: ${coverageDelta > 0 ? "+" : ""}${coverageDelta} pages

CHANGEMENTS KW DÉTECTÉS:
${kwChanges.length > 0
  ? kwChanges.map(c=>`"${c.keyword}": pos ${c.posDelta>0?"+":""}${c.posDelta} (était ${c.prev} → ${c.current}), clics ${c.clickDelta>0?"+":""}${c.clickDelta}`).join("\n")
  : "Première analyse ou aucun changement significatif"}

Génère rapport monitoring. Réponds UNIQUEMENT en JSON:
{
  "weeklyScore": 0-100,
  "summary": "...",
  "alerts": [{"severity":"critical|warning|info","message":"...","fix":"..."}],
  "kwMovements": [{"keyword":"...","direction":"up|down|stable|new","detail":"...","action":"..."}],
  "coverageInsight": "...",
  "opportunities": ["...","..."],
  "losses": ["..."],
  "nextActions": [{"priority":1,"action":"...","agent":"Strategist|Technical|OnPage","effort":"1h|1j|1s"}]
}`, 1800);

  const result = parseJSON(raw);

  // Save current as prev for next week
  if (seoData) await kvSet("travito:seo_monitoring_prev", seoData, 9*24*3600);
  await kvSet("travito:seo_monitoring", { ...result, kwChanges, coverageDelta, updatedAt: new Date().toISOString() }, 7*24*3600);
  return result;
}

// ── AGENT 6: Schema Validation ────────────────────────────────
async function runSchema() {
  const { pages, categories } = await getWPContent();
  const siteUrl = process.env.WP_URL;

  // Fetch a few pages and check for JSON-LD
  const schemaChecks = [];
  const pagesToCheck = [...pages.slice(0, 5), ...categories.slice(0, 5).map(c => ({
    id: c.id, slug: c.slug, link: `${siteUrl}/category/${c.slug}`,
    title: { rendered: c.name }
  }))];

  for (const page of pagesToCheck) {
    try {
      const url = page.link || `${siteUrl}/${page.slug}`;
      const r   = await fetch(url, { headers: { "User-Agent": "TravitoBotSEO/1.0" } });
      const html = await r.text();

      const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
      const schemas = jsonLdMatches.map(m => {
        try { return JSON.parse(m.replace(/<script[^>]*>|<\/script>/g, "").trim()); }
        catch { return null; }
      }).filter(Boolean);

      const hasOrg     = schemas.some(s => s["@type"] === "Organization" || s["@type"] === "LocalBusiness");
      const hasWebSite = schemas.some(s => s["@type"] === "WebSite");
      const hasBreadcrumb = schemas.some(s => s["@type"] === "BreadcrumbList");
      const hasItemList   = schemas.some(s => s["@type"] === "ItemList");

      schemaChecks.push({
        url, title: page.title?.rendered || page.slug,
        schemasFound: schemas.map(s => s["@type"]).filter(Boolean),
        hasOrg, hasWebSite, hasBreadcrumb, hasItemList,
        missing: [
          !hasOrg && "Organization/LocalBusiness",
          !hasBreadcrumb && "BreadcrumbList",
          !hasItemList && page.slug?.includes("categor") && "ItemList for category",
        ].filter(Boolean),
      });
    } catch(e) {
      schemaChecks.push({ url: page.link, error: e.message });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const raw = await callClaude(`Tu es Technical SEO Expert schema markup pour Travito Maroc.
Site annonces: immobilier, auto, emploi. Stack: WordPress + RankMath + Listivo.

RÉSULTATS VÉRIFICATION SCHEMA:
${JSON.stringify(schemaChecks, null, 2)}

Analyse et recommande. Réponds UNIQUEMENT en JSON:
{
  "summary": "...",
  "overallScore": 0-100,
  "issues": [{"page":"...","missing":["..."],"severity":"critical|high|medium","fix":"...","rankMathStep":"..."}],
  "recommendations": [{"schema":"...","why":"...","howToAdd":"...avec RankMath"}],
  "schemaTemplates": {
    "categoryPage": "JSON-LD template pour page catégorie Listivo",
    "listingPage": "JSON-LD template pour page annonce individuelle",
    "organization": "JSON-LD template Organization pour Travito"
  }
}`, 2000);

  const result = parseJSON(raw);
  result.schemaChecks = schemaChecks;
  result.updatedAt = new Date().toISOString();
  await kvSet("travito:seo_schema", result, 7*24*3600);
  return result;
}

// ── AGENT 7: Programmatic SEO ─────────────────────────────────
async function runProgrammatic() {
  const { categories } = await getWPContent();
  const seoData = await kvGet("travito:seo_data");
  const sc = seoData?.searchConsole;

  const MOROCCO_CITIES = ["Casablanca","Rabat","Marrakech","Fès","Tanger","Agadir","Meknès","Oujda","Kénitra","Tétouan"];

  const raw = await callClaude(`Tu es Programmatic SEO Agent de Travito Maroc.
Site annonces: immobilier, automobile, emploi, services.

CATÉGORIES EXISTANTES (${categories.length}):
${categories.map(c=>`${c.name}(${c.count})`).join(", ")}

VILLES MAROC: ${MOROCCO_CITIES.join(", ")}

KEYWORDS SC avec opportunité:
${(sc?.keywords||[]).filter(k=>k.position > 5 && k.impressions > 50).slice(0,10).map(k=>`"${k.keyword}"(pos ${k.position}, ${k.impressions} imp.)`).join(", ")}

Génère stratégie programmatique. Réponds UNIQUEMENT en JSON:
{
  "summary": "...",
  "cityPages": [{"template":"[categorie] à [ville]","priority":"high|medium","estimatedPages":0,"targetKeyword":"...","action":"create|optimize"}],
  "termPages": [{"term":"...","parent":"...","priority":"high|medium","why":"...","targetKeyword":"..."}],
  "templates": {
    "cityCategory": {"titleTemplate":"...","metaTemplate":"...","introTemplate":"..."},
    "termPage": {"titleTemplate":"...","metaTemplate":"...","introTemplate":"..."}
  },
  "priorityMatrix": [{"type":"city+category|term|subcategory","pages":["..."],"monthlyEstimatedTraffic":"...","effort":"low|medium|high"}],
  "filterPagesRule": "règle spécifique Listivo pour pages search/filter — noindex ou canonical",
  "implementationPlan": [{"phase":1,"description":"...","pages":0,"effort":"..."}]
}`, 2000);

  const result = parseJSON(raw);
  result.updatedAt = new Date().toISOString();
  await kvSet("travito:seo_programmatic", result, 7*24*3600);
  return result;
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = req.query?.action || req.body?.action;
  if (!action) return res.status(400).json({ error: "Missing action" });

  try {
    const seoData = await kvGet("travito:seo_data");

    switch(action) {
      case "strategist": {
        const result = await runStrategist(seoData, req.body?.input || null);
        return res.status(200).json({ success: true, action, ...result });
      }
      case "technical": {
        const result = await runTechnical(seoData);
        return res.status(200).json({ success: true, action, ...result });
      }
      case "onpage": {
        const result = await runOnPage(req.body?.target || {});
        return res.status(200).json({ success: true, action, ...result });
      }
      case "onpage_bulk": {
        const result = await runOnPageBulk(req.body?.pushToWP === true);
        return res.status(200).json({ success: true, action, ...result });
      }
      case "monitoring": {
        const result = await runMonitoring();
        return res.status(200).json({ success: true, action, ...result });
      }
      case "schema": {
        const result = await runSchema();
        return res.status(200).json({ success: true, action, ...result });
      }
      case "programmatic": {
        const result = await runProgrammatic();
        return res.status(200).json({ success: true, action, ...result });
      }
      case "get_cache": {
        const data = await kvGet(req.query?.key || "travito:seo_strategy");
        return res.status(200).json({ success: true, data });
      }
      case "fetch_data": {
        // Merged from seo-data.js — fetch SC + GA4 + AI insights
        const isForce = req.query?.force === "true";
        const isVercelCron = req.headers?.["x-vercel-cron"] === "1";
        if (!isForce && !isVercelCron) {
          const cached = await kvGet("travito:seo_data");
          if (cached?.fetchedAt) {
            const age = (Date.now() - new Date(cached.fetchedAt).getTime()) / 3600000;
            if (age < 6) return res.status(200).json({ success: true, cached: true, age: Math.round(age*10)/10, ...cached });
          }
        }
        if (!process.env.GOOGLE_SC_CLIENT_EMAIL) {
          return res.status(200).json({ success: false, error: "GOOGLE_SC_CLIENT_EMAIL not configured", configured: false });
        }
        try {
          const token = await getGoogleToken([
            "https://www.googleapis.com/auth/webmasters.readonly",
            "https://www.googleapis.com/auth/analytics.readonly",
          ]);
          const [scData, coverage, ga4Data] = await Promise.all([
            fetchSearchConsole(token),
            fetchSCCoverage(token),
            fetchGA4(token),
          ]);
          const aiResult = await generateInsights(scData, ga4Data, coverage);
          const result = { fetchedAt: new Date().toISOString(), searchConsole: scData, coverage, ga4: ga4Data, insights: aiResult.insights || [] };
          await kvSet("travito:seo_data", result, 6 * 3600);
          return res.status(200).json({ success: true, cached: false, configured: true, ...result });
        } catch(err) {
          console.error("fetch_data error:", err.message);
          const cached = await kvGet("travito:seo_data");
          if (cached) return res.status(200).json({ success: true, cached: true, stale: true, ...cached });
          return res.status(500).json({ success: false, error: err.message });
        }
      }
      default:
        return res.status(400).json({ error: "Unknown action: " + action });
    }
  } catch(error) {
    console.error("SEO agent error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export const config = { maxDuration: 60 };
