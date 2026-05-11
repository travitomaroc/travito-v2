// ================================================================
//  VERCEL SERVERLESS FUNCTION — Self-Improvement Engine
//  File: api/self-improve.js
//  Runs: 1st of every month at 10:00 UTC (after events-checker)
//  Uses Tavily to discover trends + Claude to improve prompts
//  Stores performance data in Vercel KV
// ================================================================

const BRAND = {
  name:  "Travito Maroc",
  site:  "https://travito.ma",
  email: "travito.maroc@gmail.com",
  x:     "@TravitoMaroc",
};

const CATEGORIES = ["Immobilier", "Automobile", "Emploi", "Lifestyle", "Tech", "Sport", "Food"];

// ── Vercel KV helpers ─────────────────────────────────────────
async function kvGet(key) {
  const r = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value, exSeconds = null) {
  const url = exSeconds
    ? `${process.env.KV_REST_API_URL}/set/${key}?ex=${exSeconds}`
    : `${process.env.KV_REST_API_URL}/set/${key}`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

// ── Tavily Search ─────────────────────────────────────────────
async function tavilySearch(query, maxResults = 5) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:        process.env.TAVILY_KEY,
      query,
      max_results:    maxResults,
      search_depth:   "basic",
      include_answer: true,
    }),
  });
  if (!r.ok) throw new Error("Tavily error: " + r.status);
  return await r.json();
}

// ── Call Claude ───────────────────────────────────────────────
async function callClaude(system, user, maxTokens = 1500) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages:   [{ role: "user", content: user }],
    }),
  });
  const d = await r.json();
  if (!d.content?.[0]?.text) throw new Error("Claude error: " + JSON.stringify(d));
  return d.content[0].text;
}

// ── Step 1: Load performance data from KV ────────────────────
async function loadPerformanceData() {
  const data = await kvGet("travito:performance") || {
    articles:    [],
    qualityAvg:  {},
    topTopics:   {},
    topHashtags: {},
    lastUpdated: null,
  };
  return data;
}

// ── Step 2: Discover trending Morocco topics via Tavily ───────
async function discoverTrendingTopics() {
  const month = new Date().toLocaleString("fr-FR", { month: "long" });
  const year  = new Date().getFullYear();
  const trending = {};

  for (const cat of CATEGORIES) {
    try {
      console.log(`Searching trends for ${cat}...`);
      const results = await tavilySearch(
        `tendances ${cat} Maroc ${month} ${year} Casablanca Rabat actualités`,
        5
      );

      const extraction = await callClaude(
        `Tu es un expert du marché marocain pour ${BRAND.name}.
Extrais 5 sujets d'articles pertinents et tendance pour la catégorie "${cat}" au Maroc.
Réponds UNIQUEMENT en JSON valide:
{
  "topics": [
    {
      "label": "Sujet court et accrocheur",
      "angle": "angle spécifique pour travito.ma",
      "cities": ["Casablanca", "Rabat"],
      "trending_score": 85
    }
  ]
}`,
        `Résultats de recherche pour ${cat} Maroc ${month} ${year}:
${results.answer || ""}
${results.results?.slice(0,4).map(r => `- ${r.title}: ${r.content?.substring(0,200)}`).join("\n") || ""}`
      );

      const parsed = JSON.parse(extraction.replace(/```json|```/g, "").trim());
      if (parsed.topics?.length) {
        trending[cat] = parsed.topics.sort((a, b) => b.trending_score - a.trending_score);
        console.log(`Found ${parsed.topics.length} trending topics for ${cat}`);
      }

      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error(`Trending error for ${cat}:`, e.message);
    }
  }

  return trending;
}

// ── Step 3: Discover trending hashtags ───────────────────────
async function discoverTrendingHashtags() {
  try {
    const results = await tavilySearch(
      "hashtags tendance Maroc Morocco Twitter X 2026 immobilier emploi auto",
      5
    );

    const extraction = await callClaude(
      `Extrais les hashtags les plus pertinents et tendance pour le Maroc sur X/Twitter.
Réponds UNIQUEMENT en JSON valide:
{
  "hashtags": [
    { "tag": "#HashtagMaroc", "category": "Emploi", "trending": true, "score": 90 }
  ]
}`,
      `${results.answer || ""}\n${results.results?.slice(0,4).map(r => r.content?.substring(0,200)).join("\n") || ""}`
    );

    const parsed = JSON.parse(extraction.replace(/```json|```/g, "").trim());
    return parsed.hashtags || [];
  } catch (e) {
    console.error("Hashtag discovery error:", e.message);
    return [];
  }
}

// ── Step 4: Improve writer prompt based on performance ────────
async function improveWriterPrompt(perfData) {
  const avgQuality = perfData.qualityAvg?.overall || 85;
  const weakAreas  = perfData.weakAreas || [];

  if (avgQuality >= 90 && weakAreas.length === 0) {
    return null; // No improvement needed
  }

  try {
    const improvement = await callClaude(
      `Tu es un expert en optimisation de prompts pour agents IA.
Améliore les instructions du rédacteur d'articles pour ${BRAND.name}.
Score qualité actuel: ${avgQuality}%
Points faibles: ${weakAreas.join(", ") || "aucun identifié"}

Génère des améliorations spécifiques et actionnables.
Réponds en JSON:
{
  "improvements": [
    "Amélioration spécifique 1",
    "Amélioration spécifique 2"
  ],
  "new_rules": [
    "Nouvelle règle de rédaction"
  ],
  "estimated_quality_gain": 5
}`,
      `Contexte: Articles pour plateforme d'annonces marocaine. Thèmes: Immobilier, Auto, Emploi, Lifestyle.`
    );

    return JSON.parse(improvement.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("Prompt improvement error:", e.message);
    return null;
  }
}

// ── Step 5: Build updated config ─────────────────────────────
async function buildUpdatedConfig(trendingTopics, trendingHashtags, promptImprovements, perfData) {
  const now    = new Date();
  const config = {
    updatedAt:    now.toISOString(),
    month:        now.toLocaleString("fr-FR", { month: "long", year: "numeric" }),
    trendingTopics,
    trendingHashtags,
    promptImprovements,
    performance: {
      avgQuality:  perfData.qualityAvg?.overall || null,
      topTheme:    perfData.topTheme || null,
      totalPosts:  perfData.articles?.length || 0,
    },
    // Inject top trending topic per category into rotation
    dynamicRotation: Object.entries(trendingTopics).reduce((acc, [cat, topics]) => {
      acc[cat] = topics.slice(0, 5).map((t, i) => ({
        day:   ["Lundi","Mardi","Mercredi","Jeudi","Vendredi"][i],
        label: t.label,
        angle: t.angle,
        cities: t.cities,
        trending: true,
      }));
      return acc;
    }, {}),
  };

  return config;
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req, res) {
  const isForce      = req.query?.force === "true";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const cronSecret   = process.env.CRON_SECRET;
  const authHeader   = req.headers["authorization"];

  if (!isForce && !isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.KV_REST_API_URL) {
    return res.status(500).json({ error: "Vercel KV not configured" });
  }

  console.log("Self-improvement engine started:", new Date().toISOString());

  const report = {
    startedAt: new Date().toISOString(),
    steps:     [],
  };

  try {
    // Step 1: Load performance data
    console.log("Loading performance data...");
    const perfData = await loadPerformanceData();
    report.steps.push({ step: "load_performance", articles: perfData.articles?.length || 0 });

    // Step 2: Discover trending topics
    console.log("Discovering trending topics...");
    const trendingTopics = await discoverTrendingTopics();
    const topicCount = Object.values(trendingTopics).reduce((s, t) => s + t.length, 0);
    report.steps.push({ step: "trending_topics", found: topicCount });

    // Step 3: Discover trending hashtags
    console.log("Discovering trending hashtags...");
    const trendingHashtags = await discoverTrendingHashtags();
    report.steps.push({ step: "trending_hashtags", found: trendingHashtags.length });

    // Step 4: Improve prompts if needed
    console.log("Analyzing prompt improvements...");
    const promptImprovements = await improveWriterPrompt(perfData);
    report.steps.push({
      step: "prompt_improvement",
      improved: !!promptImprovements,
      gain: promptImprovements?.estimated_quality_gain || 0,
    });

    // Step 5: Build and save updated config to KV
    console.log("Saving updated config to KV...");
    const updatedConfig = await buildUpdatedConfig(
      trendingTopics,
      trendingHashtags,
      promptImprovements,
      perfData
    );

    // Save to KV — expires in 35 days (covers full month + buffer)
    await kvSet("travito:dynamic_config", updatedConfig, 35 * 24 * 60 * 60);
    await kvSet("travito:last_improvement", {
      date:    new Date().toISOString(),
      summary: report,
    });

    report.steps.push({ step: "save_config", success: true });

    // Step 6: Save improvement report for dashboard
    await kvSet("travito:improvement_report", {
      date:              new Date().toISOString(),
      trendingTopics:    Object.keys(trendingTopics).map(k => ({
        category: k,
        count:    trendingTopics[k].length,
        top:      trendingTopics[k][0]?.label,
      })),
      newHashtags:       trendingHashtags.slice(0, 10),
      promptImproved:    !!promptImprovements,
      improvements:      promptImprovements?.improvements || [],
    }, 35 * 24 * 60 * 60);

    report.summary = {
      topicsDiscovered:   topicCount,
      hashtagsDiscovered: trendingHashtags.length,
      promptImproved:     !!promptImprovements,
      configUpdated:      true,
    };

    report.completedAt = new Date().toISOString();
    console.log("Self-improvement complete:", JSON.stringify(report.summary));

    return res.status(200).json({ success: true, ...report });

  } catch (error) {
    console.error("Self-improvement error:", error.message);
    return res.status(500).json({ success: false, error: error.message, report });
  }
}
