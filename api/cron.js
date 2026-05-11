// ================================================================
//  VERCEL CRON JOB — Daily Article Pipeline
//  File: api/cron.js
//  Runs: weekdays at 08:00 UTC (article) + 21:00 UTC (summary email)
//  No browser needed — fully server-side
// ================================================================

const BRAND = {
  name:  "Travito Maroc",
  site:  "https://travito.ma",
  email: "travito.maroc@gmail.com",
  x:     "@TravitoMaroc",
};

const DISCLAIMER = `📌 Cet article est à titre informatif uniquement. Les données sont indicatives. Consultez un professionnel pour tout conseil personnalisé.`;

const MONTHLY_ROTATION = {
  1: {
    theme: "Immobilier", icon: "🏠",
    topics: [
      { day:"Lundi",    label:"Prix immobilier par ville",      comparison:"Casablanca vs Rabat" },
      { day:"Mardi",    label:"Nouveaux projets & promoteurs",  comparison:"Casablanca vs Marrakech" },
      { day:"Mercredi", label:"Marché locatif",                 comparison:"Casablanca vs Tanger" },
      { day:"Jeudi",    label:"Tendances achat/vente",          comparison:"Casablanca vs Agadir" },
      { day:"Vendredi", label:"Réglementation immobilière",     comparison:null },
    ],
  },
  2: {
    theme: "Automobile", icon: "🚗",
    topics: [
      { day:"Lundi",    label:"Prix véhicules neufs au Maroc",      comparison:null },
      { day:"Mardi",    label:"Marché occasion — meilleures deals", comparison:null },
      { day:"Mercredi", label:"Véhicules électriques & hybrides",   comparison:null },
      { day:"Jeudi",    label:"Top marques vendues au Maroc",       comparison:null },
      { day:"Vendredi", label:"Conseils achat/vente auto",          comparison:null },
    ],
  },
  3: {
    theme: "Emploi", icon: "💼",
    topics: [
      { day:"Lundi",    label:"Tendances recrutement Maroc " + new Date().getFullYear(),    comparison:null },
      { day:"Mardi",    label:"Secteurs porteurs & opportunités",    comparison:null },
      { day:"Mercredi", label:"Télétravail & emplois internationaux",comparison:null },
      { day:"Jeudi",    label:"Formation & compétences demandées",   comparison:null },
      { day:"Vendredi", label:"Salaires & négociation au Maroc",     comparison:null },
    ],
  },
  4: {
    theme: "Lifestyle", icon: "🎭",
    topics: [
      { day:"Lundi",    label:"Sport & fitness au Maroc",            comparison:null },
      { day:"Mardi",    label:"Musique & culture marocaine",         comparison:null },
      { day:"Mercredi", label:"Animaux de compagnie — marché Maroc", comparison:null },
      { day:"Jeudi",    label:"Santé & bien-être tendances",         comparison:null },
      { day:"Vendredi", label:"Food & restaurants — découvertes",    comparison:null },
    ],
  },
};

const HASHTAGS_BY_THEME = {
  Immobilier: "#TravitoMaroc #Maroc #Morocco #ImmoMaroc #ImmobilierMaroc #عقارات_المغرب",
  Automobile: "#TravitoMaroc #Maroc #Morocco #AutoMaroc #VoitureMaroc #سيارات_المغرب",
  Emploi:     "#TravitoMaroc #Maroc #Morocco #EmploiMaroc #RecrutementMaroc #وظائف_المغرب",
  Lifestyle:  "#TravitoMaroc #Maroc #Morocco #MarocLife #Casablanca #Marrakech",
};

// ── Get current rotation — from KV config, fallback to hardcoded ─
async function getCurrentRotation(kvUrl, kvToken) {
  // Get ISO week key
  const getISOWeekKey = () => {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay()+6)%7);
    const w1 = new Date(d.getFullYear(),0,4);
    const wk = 1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7);
    return `W${String(wk).padStart(2,"0")}-${d.getFullYear()}`;
  };
  const currentWeekKey = getISOWeekKey();

  try {
    // First: try ISO week-specific topics
    const wr = await fetch(`${kvUrl}/get/${encodeURIComponent("travito:x_topics:"+currentWeekKey)}`,
      { headers: { Authorization: `Bearer ${kvToken}` } });
    const wd = await wr.json();
    if (wd.result) {
      const weekCfg = JSON.parse(wd.result);
      if (weekCfg?.topics?.length > 0) {
        console.log("Using ISO week topics:", currentWeekKey, "theme:", weekCfg.theme);
        return {
          theme:            weekCfg.theme || "Immobilier",
          icon:             weekCfg.icon  || "🏠",
          topics:           weekCfg.topics,
          hashtags:         weekCfg.hashtags || "",
          weekKey:          currentWeekKey,
          customName:       weekCfg.customName || "",
        };
      }
    }

    // Fallback: global config monthlyRotation
    const r = await fetch(`${kvUrl}/get/travito:x_pipeline_config`,
      { headers: { Authorization: `Bearer ${kvToken}` } });
    const d = await r.json();
    if (d.result) {
      const cfg = JSON.parse(d.result);
      if (cfg?.monthlyRotation) {
        const wkNum = parseInt(currentWeekKey.split("-")[0].replace("W",""));
        const themeIdx = ((wkNum % 4) + 4) % 4;
        const themeMap = {0:"Lifestyle",1:"Immobilier",2:"Automobile",3:"Emploi"};
        const week = String(themeIdx === 0 ? 4 : themeIdx);
        const rot = cfg.monthlyRotation[week];
        if (rot) return {
          ...rot,
          hashtags:             cfg.hashtags?.[rot.theme] || HASHTAGS_BY_THEME[rot.theme] || "",
          articleTone:          cfg.articleTone || null,
          tweetStyle:           cfg.tweetStyle || null,
          language:             cfg.automation?.language || "fr",
          articleMaxWords:      cfg.automation?.articleMaxWords || 400,
          tweetsPerPost:        cfg.automation?.tweetsPerPost || 3,
          autoSearch:           cfg.automation?.autoSearch !== false,
          autoPostBlog:         cfg.automation?.autoPostBlog !== false,
          autoPost:             cfg.automation?.autoPost !== false,
          defaultArticlePrompt: cfg.defaultArticlePrompt || null,
          defaultTweetPrompt:   cfg.defaultTweetPrompt || null,
          weeklySlots:          cfg.weeklySlots || null,
        };
      }
    }
  } catch {}
  // Fallback to hardcoded
  const weekOfMonth = Math.ceil(new Date().getDate() / 7);
  const week = ((weekOfMonth - 1) % 4) + 1;
  const rot = MONTHLY_ROTATION[week];
  return { ...rot, hashtags: HASHTAGS_BY_THEME[rot.theme] || "" };
}

// ── Get today's topic based on day of week ───────────────────
function getTodayTopic(rotation) {
  const days = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const dayName = days[new Date().getDay()];
  return rotation.topics.find(t => t.day === dayName) || null;
}

// ── Call Claude API ──────────────────────────────────────────
async function callClaude(system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":         "application/json",
      "x-api-key":            process.env.ANTHROPIC_API_KEY,
      "anthropic-version":    "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      messages:   [{ role: "user", content: user }],
    }),
  });
  const d = await r.json();
  if (!d.content?.[0]?.text) throw new Error("Claude error: " + JSON.stringify(d));
  return d.content[0].text;
}

// ── Post tweet via our own tweet proxy ───────────────────────
async function postTweet(text, replyToId, keys, imageUrl = null) {
  const body = {
    text: text.substring(0, 275),
    apiKey:              keys.apiKey,
    apiSecret:           keys.apiSecret,
    accessToken:         keys.accessToken,
    accessTokenSecret:   keys.accessTokenSecret,
  };
  if (replyToId) body.replyToId = replyToId;
  if (imageUrl)  body.imageUrl  = imageUrl;

  const r = await fetch(`${process.env.APP_URL}/api/tweet`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.error || "Tweet failed");
  return d.id;
}

// ── Post to WordPress ─────────────────────────────────────────
async function postToWordPress(title, content, imageUrl = null) {
  const r = await fetch(`${process.env.APP_URL}/api/wordpress`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      action: "create_post",
      title,
      content,
      ...(imageUrl ? { imageUrl } : {}),
    }),
  });
  const raw = await r.text();
  let d;
  try { d = JSON.parse(raw); }
  catch {
    console.error(`postToWordPress non-JSON (HTTP ${r.status}):`, raw.slice(0, 200));
    return null;
  }
  if (!d.success) console.error("postToWordPress failed:", d.error || d);
  return d.success ? d.url : null;
}

// ── Parse thread tweets ───────────────────────────────────────
function parseThread(xPost) {
  const tweets = [];
  const lines  = xPost.split("\n");
  let current  = "";
  let inTweet  = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^[123][\/]3/.test(t)) {
      if (inTweet && current.trim()) tweets.push(current.trim());
      current = t.replace(/^[123][\/]3[\s\-—]*/, "").trim();
      inTweet = true;
    } else if (inTweet) {
      current = current ? current + " " + t : t;
    }
  }
  if (inTweet && current.trim()) tweets.push(current.trim());
  if (tweets.length === 0) lines.filter(l=>l.trim().length>10).slice(0,3).forEach(l=>tweets.push(l.trim()));
  return tweets;
}

// ── MAIN CRON HANDLER ────────────────────────────────────────


// ================================================================
//  X WEEKLY SUGGESTIONS — Generates AI topic suggestions + hashtags
//  for current week + next 3 weeks. Runs every Monday.
// ================================================================
async function generateWeeklyXSuggestions(env) {
  const KV_URL   = env.KV_REST_API_URL;
  const KV_TOKEN = env.KV_REST_API_TOKEN;
  const APP_URL  = env.APP_URL || "https://travito-agents.vercel.app";

  const kvGet = async (key) => {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  };
  const kvSet = async (key, value) => {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify(value)),
    });
  };

  const getISOWeekKey = (offset=0) => {
    const d = new Date(); d.setDate(d.getDate() + offset*7);
    d.setHours(0,0,0,0); d.setDate(d.getDate() + 3 - (d.getDay()+6)%7);
    const w1 = new Date(d.getFullYear(),0,4);
    const wk = 1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7);
    return `W${String(wk).padStart(2,"0")}-${d.getFullYear()}`;
  };

  const themeMap = {0:"Lifestyle",1:"Immobilier",2:"Automobile",3:"Emploi"};
  const iconMap  = {0:"🎭",1:"🏠",2:"🚗",3:"💼"};
  const DAYS_FR  = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

  // Load global config for default topics
  const globalCfg = await kvGet("travito:x_pipeline_config") || {};

  for (let offset = 0; offset <= 3; offset++) {
    const weekKey = getISOWeekKey(offset);
    const wkNum   = parseInt(weekKey.split("-")[0].replace("W",""));
    const themeIdx = ((wkNum % 4) + 4) % 4;
    const theme = themeMap[themeIdx];
    const icon  = iconMap[themeIdx];

    // Load existing week data
    let wd = await kvGet("travito:x_topics:" + weekKey);
    if (!wd) {
      // Init from global config defaults
      const defaultTopics = globalCfg.monthlyRotation
        ? Object.values(globalCfg.monthlyRotation).find(r=>r.theme===theme)?.topics || []
        : [];
      wd = {
        weekKey, theme, icon, customName: "",
        topics: DAYS_FR.map((day, i) => ({
          day, label: defaultTopics[i]?.label || "",
          comparison: defaultTopics[i]?.comparison || "",
          aiSuggestions: [],
        })),
        hashtags: globalCfg.hashtags?.[theme] || "",
      };
    }

    // Load recent topics from past 4 weeks to avoid repetition
    let recentTopics = "aucun";
    try {
      const recentLabels = [];
      for (let rOffset = 1; rOffset <= 4; rOffset++) {
        const pastKey = getISOWeekKey(-rOffset);
        const pastData = await kvGet("travito:x_topics:" + pastKey);
        if (pastData?.topics) {
          pastData.topics.filter(t=>t.label).forEach(t => recentLabels.push(t.label));
        }
      }
      if (recentLabels.length) recentTopics = recentLabels.join(" | ");
    } catch {}

    // Generate AI suggestions via Claude
    try {
      const r = await fetch(`${APP_URL}/api/claude`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1500,
          system: `Tu es un expert contenu pour Travito Maroc (${theme}). Génère des suggestions de sujets d'articles X/Twitter en JSON uniquement.`,
          messages: [{role:"user",content:`Semaine: ${weekKey} | Thème: ${theme} ${icon}
Sujets officiels: ${wd.topics.filter(t=>t.label).map(t=>`${t.day}: ${t.label}`).join(", ")||"aucun"}

SUJETS À ÉVITER (4 semaines précédentes — éviter répétitions):
${recentTopics}

Pour chaque jour (Lundi→Dimanche), génère 2-3 sujets DIFFÉRENTS des sujets récents ci-dessus.
Angle unique requis — jamais le même sujet deux semaines de suite.
Si un sujet officiel existe, génère des alternatives créatives avec angle différent.
Si vide, improvise avec sujets d'actualité ${theme} Maroc ${new Date().getFullYear()}.

JSON uniquement sans markdown:
{"suggestions":{"Lundi":["sujet1","sujet2","sujet3"],"Mardi":["..."],"Mercredi":["..."],"Jeudi":["..."],"Vendredi":["..."],"Samedi":["..."],"Dimanche":["..."]}}`}],
        }),
      });
      const d = await r.json();
      const raw = d.content?.[0]?.text || "";
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s > -1) {
        const parsed = JSON.parse(raw.substring(s, e+1));
        if (parsed.suggestions) {
          wd.topics = wd.topics.map(t => ({
            ...t, aiSuggestions: parsed.suggestions[t.day] || t.aiSuggestions || [],
          }));
          wd.generatedAt = new Date().toISOString();
        }
      }
    } catch(e) { console.log("Suggestions error for", weekKey, ":", e.message); }

    // Generate hashtags for this week's theme if not set
    if (!wd.hashtags) {
      try {
        const hr = await fetch(`${APP_URL}/api/claude`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            max_tokens: 300,
            system: "Tu génères des hashtags Twitter. Réponds uniquement avec une liste de hashtags séparés par des espaces.",
            messages: [{role:"user",content:`Génère 6-8 hashtags Twitter pertinents pour des articles sur le thème "${theme}" au Maroc. Mix français, arabe, anglais. Inclure #Maroc #TravitoMaroc.`}],
          }),
        });
        const hd = await hr.json();
        const htags = hd.content?.[0]?.text || "";
        if (htags.includes("#")) wd.hashtags = htags.trim();
      } catch {}
    }

    await kvSet("travito:x_topics:" + weekKey, wd);
    console.log("X suggestions saved for", weekKey, "theme:", theme);
  }
}

// ================================================================
//  YOUTUBE PIPELINE — Server-side automation
//  Called at end of each cron run if YouTube automation is enabled
//  Handles: ideas → QC → Bible → QC → approve → video → publish
// ================================================================

async function runYouTubePipeline(env) {
  const KV_URL   = env.KV_REST_API_URL;
  const KV_TOKEN = env.KV_REST_API_TOKEN;
  const APP_URL  = env.APP_URL || "https://travito-agents.vercel.app";
  const log      = [];

  const kvGet = async (key) => {
    try {
      const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
      const d = await r.json();
      return d.result ? JSON.parse(d.result) : null;
    } catch { return null; }
  };

  const kvSet = async (key, value) => {
    try {
      await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify(value)),
      });
    } catch {}
  };

  const callClaude = async (system, user, maxTokens = 2000) => {
    const r = await fetch(`${APP_URL}/api/claude`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_tokens: maxTokens, system,
        messages: [{ role: "user", content: user }] }),
    });
    const d = await r.json();
    if (d.error) throw new Error("Claude: " + (d.error.message || JSON.stringify(d.error)));
    return d.content?.map(b => b.text || "").join("\n") || "";
  };

  try {
    // Load config
    const agents     = await kvGet("travito:yt_agents_config") || [];
    const config     = await kvGet("travito:yt_config") || {};
    const automation = config.automation || {};
    const ideas      = await kvGet("travito:yt_ideas") || [];

    if (!automation.autoGenerateIdeas) {
      log.push("YouTube automation disabled — skipping");
      return { log, skipped: true };
    }

    // Determine today's agent from weekly slots
    const today    = new Date();
    const dayNames = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
    const todayName = dayNames[today.getDay()];
    const slots    = config.weeklySlots || [];
    const todaySlot = slots.find(s => s.enabled && s.agentId && s.day === todayName);
    if (!todaySlot) {
      log.push(`No agent assigned to ${todayName}`);
      return { log, skipped: true };
    }

    const agent = agents.find(a => a.id === todaySlot.agentId && a.enabled !== false);
    if (!agent) { log.push("Agent not found or disabled"); return { log, skipped: true }; }

    // Week key
    const wkDate = new Date(today);
    wkDate.setHours(0,0,0,0);
    wkDate.setDate(wkDate.getDate() - wkDate.getDay() + 1);
    const weekKey = "W-" + wkDate.toISOString().split("T")[0];

    log.push(`Agent: ${agent.name} | Day: ${todayName} | Week: ${weekKey}`);

    // ── STEP 1: IDEAS GENERATION ────────────────────────────────
    const todayIdeas = ideas.filter(i => i.agentId === agent.id && i.weekKey === weekKey);
    const protected_ = todayIdeas.filter(i =>
      ["published","approved","queued","rendering","rendered"].includes(i.status));
    const ideasPerDay = Math.min(5, Math.max(1, automation.ideasPerDay || 5));
    const slotsNeeded = Math.max(1, ideasPerDay - protected_.length);

    if (todayIdeas.length === 0 || protected_.length < ideasPerDay) {
      log.push(`Generating ${slotsNeeded} ideas for ${agent.name}...`);

      // Build avoid list
      const avoidList = ideas.filter(i => i.agentId === agent.id &&
        (i.status === "published" || ["approved","queued","rendering","rendered"].includes(i.status)))
        .map(i => ({ topic: i.topic, status: i.status }));

      // Fetch KV history
      const hist = await kvGet("travito:yt_history:" + agent.id);
      const histTopics = Array.isArray(hist?.topics) ? hist.topics
        .filter(t => new Date(t.date||0) > new Date(Date.now() - 60*24*3600*1000))
        .map(t => ({ topic: t.topic, status: "published" })) : [];

      const fullAvoid = [...avoidList, ...histTopics].slice(0, 60);
      const avoidStr = fullAvoid.map(t =>
        (t.status === "published" ? "[PUBLIE] " : "[RECENT] ") + t.topic).join(" | ");

      // Fetch global blacklist
      const bl = await kvGet("travito:global_blacklist");
      const blacklistStr = Array.isArray(bl?.words) && bl.words.length > 0
        ? "MOTS/MARQUES INTERDITS: " + bl.words.join(", ") : "";

      const dur = agent.dur || [40, 55];
      const avgDur = Math.round((dur[0] + dur[1]) / 2);
      const spokenSec = Math.max(20, avgDur - 6);
      const wordsTarget = Math.max(70, Math.round(spokenSec * 2.2));

      const prompt = `Tu es un strategiste YouTube Shorts pour Travito Maroc (travito.ma).
AGENT: ${agent.name} | LANGUE: ${agent.lang || "fr"} | DUREE: ${dur[0]}-${dur[1]}s (~${avgDur}s)
${agent.customPrompt ? "INSTRUCTIONS AGENT: " + agent.customPrompt : ""}
${blacklistStr}

MEMOIRE — EVITER: ${avoidStr || "aucun"}
REGLE: [PUBLIE] et [RECENT] = INTERDITS 60j. Chaque idee doit avoir un angle NOUVEAU jamais vu.

Genere exactement ${slotsNeeded} idees UNIQUES triees par score. JSON UNIQUEMENT:
{"ideas":[{"topic":"Titre max 60 chars","angle":"Angle unique","hook":"Accroche 15 mots max",
"format":"listicle|tips|facts|comparison","scores":{"morocco":18,"hook":17,"visual":13,"fresh":14,"auto":14,"short":14,"repeat_penalty":0},
"total_score":90,"reason":"Pourquoi en 1 phrase","estimated_words":${wordsTarget},
"key_points":["Point 1","Point 2","Point 3"],"pexels_theme":"theme visuel","visual_mood":"bright_urban"}]}`;

      const raw = await callClaude(
        "Tu generes des idees YouTube Shorts. Reponds UNIQUEMENT en JSON valide.", prompt, 4000);

      // Parse ideas
      let newIdeas = [];
      try {
        const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
        if (s > -1) {
          const parsed = JSON.parse(raw.substring(s, e + 1));
          newIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
        }
      } catch {}

      if (newIdeas.length === 0) {
        log.push("Ideas parse failed: " + raw.slice(0, 100));
      } else {
        // QC ideas if enabled
        let passedIdeas = newIdeas;
        if (automation.qcEnabled !== false) {
          const threshold = automation.qcThreshold || 60;
          const avgScore = newIdeas.reduce((s, i) => s + (i.total_score || 0), 0) / newIdeas.length;
          if (avgScore < threshold) {
            log.push(`QC Ideas: ${Math.round(avgScore)}% FAIL (threshold ${threshold}%) — using anyway`);
          } else {
            log.push(`QC Ideas: ${Math.round(avgScore)}% PASS`);
          }
        }

        // Tag and add to ideas array
        const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
        const tagged = passedIdeas
          .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
          .slice(0, slotsNeeded)
          .map((idea, rank) => ({
            ...idea, id: "idea_" + uid(), agentId: agent.id, weekKey,
            status: "selected", rank: rank + 1,
            createdAt: new Date().toISOString(),
            estimatedWords: Number(idea.estimated_words || wordsTarget),
          }));

        const updatedIdeas = [...ideas.filter(i =>
          !(i.agentId === agent.id && i.weekKey === weekKey && i.status === "selected")),
          ...tagged];
        await kvSet("travito:yt_ideas", updatedIdeas);
        ideas.splice(0, ideas.length, ...updatedIdeas);
        log.push(`${tagged.length} ideas generated — top: ${tagged[0]?.total_score}% — ${tagged[0]?.topic?.slice(0,40)}`);
      }
    } else {
      log.push(`Ideas already exist (${todayIdeas.length}) — skipping generation`);
    }

    // ── STEP 2: BIBLE GENERATION ─────────────────────────────────
    if (!automation.autoGenerateBible) { log.push("Bible auto disabled"); }
    else {
      const todayIdeas2 = ideas.filter(i => i.agentId === agent.id && i.weekKey === weekKey);
      const topIdea = todayIdeas2.filter(i => i.status === "selected")
        .sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];

      const todayStr = today.toISOString().split("T")[0];
      const bibleTriggered = await kvGet("travito:yt_bible_triggered:" + todayStr) || { ids: [] };

      if (!topIdea) { log.push("No selected idea for Bible"); }
      else if (topIdea.bible) { log.push("Bible already exists"); }
      else if (bibleTriggered.ids.includes(topIdea.id)) { log.push("Bible already triggered today"); }
      else {
        log.push(`Generating Bible: ${topIdea.topic?.slice(0, 40)}...`);

        // Mark triggered
        bibleTriggered.ids.push(topIdea.id);
        await kvSet("travito:yt_bible_triggered:" + todayStr, bibleTriggered);

        const bl2 = await kvGet("travito:global_blacklist");
        const blStr2 = Array.isArray(bl2?.words) && bl2.words.length > 0
          ? "MOTS INTERDITS: " + bl2.words.join(", ") : "";

        const dur2 = agent.dur || [40, 55];
        const avgDur2 = Math.round((dur2[0] + dur2[1]) / 2);
        const spokenSec2 = Math.max(20, avgDur2 - 6);
        const wMin = Math.round(spokenSec2 * 2.0);
        const wMax = Math.round(spokenSec2 * 2.4);

        const bibleInstructions = [
          `STRUCTURE OBLIGATOIRE (${avgDur2}s total):`,
          `- opener: 3s — image choc + hook vocal`,
          `- hook: ~5s — question ou stat surprenante`,
          `- points: ${Math.round((spokenSec2-8)/3)}-${Math.round((spokenSec2-8)/2)}s chacun (3-4 points)`,
          `- payoff: ~5s — reponse ou chiffre cle`,
          `- cta: 3s — travito.ma + abonnement`,
          `VOICEOVER: ${wMin}-${wMax} mots | ${spokenSec2}s de parole`,
          `INTERDIT: script tronque, CTA absent, travito.ma absent`,
          `PEXELS: queries en anglais generiques (pas de noms propres)`,
        ].join("\n");

        const biblePrompt = `Genere une Bible de production YouTube Shorts pour Travito Maroc.
IDEE: ${topIdea.topic} | ANGLE: ${topIdea.angle || ""} | HOOK: ${topIdea.hook || ""}
LANGUE: ${agent.lang || "fr"} | DUREE CIBLE: ${avgDur2}s
${agent.customBiblePrompt || agent.customPrompt ? "INSTRUCTIONS AGENT: " + (agent.customBiblePrompt || agent.customPrompt) : ""}
${blStr2}

${bibleInstructions}

REPONDS EN JSON UNIQUEMENT:
{"title":"${topIdea.topic}","language":"${agent.lang || "fr"}","quality_score":88,
"estimated_word_count":${wMin},"voiceover_script":"Script complet ${wMin}-${wMax} mots avec travito.ma en CTA",
"segment_timeline":[
  {"segment_id":1,"segment_type":"opener","target_duration_sec":3,"on_screen_text":"",
   "subtitle_text":"","narration_text":"","pexels_query":"morocco cityscape aerial"},
  {"segment_id":2,"segment_type":"hook","target_duration_sec":5,"on_screen_text":"",
   "subtitle_text":"","narration_text":"hook narration","pexels_query":"relevant query"}
]}`;

        const bibleRaw = await callClaude(
          "Tu crees des Bibles de production YouTube Shorts. Reponds UNIQUEMENT en JSON valide.", biblePrompt, 4000);

        let bible = null;
        try {
          const s = bibleRaw.indexOf("{"), e = bibleRaw.lastIndexOf("}");
          if (s > -1) bible = JSON.parse(bibleRaw.substring(s, e + 1));
        } catch {}

        if (!bible) {
          log.push("Bible parse failed: " + bibleRaw.slice(0, 100));
        } else {
          // QC Bible
          let biblePass = true;
          if (automation.qcEnabled !== false) {
            const bibleScore = bible.quality_score || 0;
            const threshold = automation.qcThreshold || 60;
            biblePass = bibleScore >= threshold;
            log.push(`QC Bible: ${bibleScore}% ${biblePass ? "PASS" : "FAIL"}`);
          }

          if (biblePass) {
            const updatedIdeas2 = ideas.map(i =>
              i.id === topIdea.id ? { ...i, bible, status: "selected" } : i);
            await kvSet("travito:yt_ideas", updatedIdeas2);
            ideas.splice(0, ideas.length, ...updatedIdeas2);
            log.push("Bible saved: " + (bible.segment_timeline?.length || 0) + " segments");
          }
        }
      }
    }

    // ── STEP 3: AUTO APPROVE ──────────────────────────────────────
    if (automation.autoApproveTopIdea) {
      const todayStr = today.toISOString().split("T")[0];
      const approveTriggered = await kvGet("travito:yt_approve_triggered:" + todayStr) || { ids: [] };
      const todayIdeas3 = ideas.filter(i => i.agentId === agent.id && i.weekKey === weekKey);
      const topWithBible = todayIdeas3.find(i => i.status === "selected" && i.bible);

      if (topWithBible && !approveTriggered.ids.includes(topWithBible.id)) {
        approveTriggered.ids.push(topWithBible.id);
        await kvSet("travito:yt_approve_triggered:" + todayStr, approveTriggered);

        const updatedIdeas3 = ideas.map(i =>
          i.id === topWithBible.id ? { ...i, status: "approved" } : i);
        await kvSet("travito:yt_ideas", updatedIdeas3);
        ideas.splice(0, ideas.length, ...updatedIdeas3);
        log.push(`Auto-approved: ${topWithBible.topic?.slice(0, 40)}`);
      }
    }

    // ── STEP 4: VIDEO PRODUCTION ──────────────────────────────────
    if (automation.autoGenerateVideo) {
      const approvedIdea = ideas.find(i =>
        i.agentId === agent.id && i.status === "approved" && i.bible && !i.productionJob);

      if (!approvedIdea) { log.push("No approved idea ready for production"); }
      else {
        log.push(`Starting video production: ${approvedIdea.topic?.slice(0, 40)}...`);

        // Step 4a: Pexels search
        const bible = approvedIdea.bible;
        const segments = bible.segment_timeline || [];
        const pexelsAssets = [];
        for (const seg of segments) {
          if (!seg.pexels_query) continue;
          try {
            const pr = await fetch(
              `${APP_URL}/api/kv?action=pexels&query=${encodeURIComponent(seg.pexels_query)}&format=shorts`);
            const pd = await pr.json();
            if (pd.url) pexelsAssets.push({ segmentId: seg.segment_id,
              url: pd.url, mediaType: pd.type, width: pd.width,
              height: pd.height, isPortrait: pd.isPortrait });
          } catch {}
        }
        log.push(`Pexels: ${pexelsAssets.length} clips`);

        // Step 4b: TTS
        const lang = (bible.language || agent.lang || "fr").toUpperCase();
        const voiceId = lang.startsWith("AR") ? agent.voiceIdAR
          : lang.startsWith("EN") ? agent.voiceIdEN
          : (agent.voiceIdFR || agent.voiceId || "");

        let audioBase64 = null, audioDurationSec = 0;
        try {
          const ttsR = await fetch(`${APP_URL}/api/youtube`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "tts", text: bible.voiceover_script || "",
              language: lang, voiceId }),
          });
          const ttsD = await ttsR.json();
          if (ttsD.success && ttsD.audio) {
            audioBase64 = ttsD.audio;
            audioDurationSec = Math.round((ttsD.bytes || 0) / 16000 * 10) / 10;
            log.push(`TTS OK (~${audioDurationSec}s)`);
          } else { log.push("TTS failed: " + (ttsD.error || "unknown")); }
        } catch(e) { log.push("TTS error: " + e.message); }

        // Step 4c: Shotstack render
        let renderId = null, renderUrl = null;
        try {
          const scenes = segments.map((seg, i) => {
            const asset = pexelsAssets.find(a => a.segmentId === seg.segment_id)
              || pexelsAssets[i] || null;
            return { type: seg.segment_type || "content", clip: asset?.url || null,
              mediaType: asset?.mediaType || null, width: asset?.width || null,
              height: asset?.height || null, isPortrait: asset?.isPortrait ?? true,
              duration: Math.max(2, seg.target_duration_sec || 5), text: "", narration: "" };
          });
          const vidR = await fetch(`${APP_URL}/api/youtube`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "video", audioBase64,
              audioDurationSec, scenes, title: bible.title, format: "9:16" }),
          });
          const vidD = await vidR.json();
          if (vidD.success && (vidD.renderId || vidD.url)) {
            renderId = vidD.renderId;
            renderUrl = vidD.url;
            log.push(`Render launched: ${renderId || "instant"}`);
          } else { log.push("Render failed: " + (vidD.error || "unknown")); }
        } catch(e) { log.push("Render error: " + e.message); }

        // Poll render if needed
        if (renderId && !renderUrl) {
          for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise(r => setTimeout(r, 10000)); // wait 10s
            try {
              const pr = await fetch(
                `${APP_URL}/api/youtube?action=status&renderId=${renderId}`);
              const pd = await pr.json();
              if (pd.url) { renderUrl = pd.url; log.push("Render ready!"); break; }
              if (pd.status === "failed") { log.push("Render failed"); break; }
            } catch {}
          }
        }

        // Save production job to KV
        const job = { id: "job_" + Date.now().toString(36), ideaId: approvedIdea.id,
          status: renderUrl ? "rendered" : "failed",
          renderResult: renderId ? { renderId, url: renderUrl, status: renderUrl ? "rendered" : "failed" } : null,
          voiceId, steps: { pexels: pexelsAssets.length > 0 ? "done" : "failed",
            voice: audioBase64 ? "done" : "failed", render: renderUrl ? "done" : "failed" } };

        const updatedIdeas4 = ideas.map(i =>
          i.id === approvedIdea.id ? { ...i,
            status: renderUrl ? "rendered" : "failed", productionJob: job } : i);
        await kvSet("travito:yt_ideas", updatedIdeas4);
        ideas.splice(0, ideas.length, ...updatedIdeas4);

        // ── STEP 5: PUBLISH TO YOUTUBE ────────────────────────────
        if (automation.autoPublishYouTube && renderUrl) {
          log.push("Publishing to YouTube...");
          try {
            const pubR = await fetch(`${APP_URL}/api/youtube`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "publish", videoUrl: renderUrl,
                title: bible.title || approvedIdea.topic,
                description: bible.voiceover_script?.slice(0, 500) || "",
                tags: ["Maroc", "Morocco", approvedIdea.format || "tips"],
                language: lang, isShorts: true }),
            });
            const pubD = await pubR.json();
            if (pubD.success) {
              const ytUrl = pubD.youtubeUrl || "https://youtube.com/watch?v=" + pubD.videoId;
              log.push("Published: " + ytUrl);

              // Save to history
              const hist2 = await kvGet("travito:yt_history:" + agent.id) || { topics: [] };
              hist2.topics = [...(hist2.topics || []).filter(t => t.topic !== approvedIdea.topic),
                { topic: approvedIdea.topic, date: new Date().toISOString(), url: ytUrl }]
                .slice(-200);
              await kvSet("travito:yt_history:" + agent.id, hist2);

              // Delete Shotstack render
              if (renderId) {
                await fetch(`${APP_URL}/api/youtube`, { method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "delete_render", renderId }) });
              }

              const updatedIdeas5 = ideas.map(i =>
                i.id === approvedIdea.id ? { ...i, status: "published",
                  publishedAt: new Date().toISOString(), publishedUrl: ytUrl } : i);
              await kvSet("travito:yt_ideas", updatedIdeas5);
            } else {
              log.push("Publish failed: " + (pubD.error || "unknown"));
            }
          } catch(e) { log.push("Publish error: " + e.message); }
        } else if (!automation.autoPublishYouTube && renderUrl) {
          log.push("Video rendered — auto-publish OFF. Manual publish required.");
        }
      }
    }

    return { log, agent: agent.name, weekKey };
  } catch(e) {
    log.push("YouTube pipeline error: " + e.message);
    return { log, error: e.message };
  }
}

export default async function handler(req, res) {
  // Security: Vercel cron sends authorization header
  // Manual GET requests with ?force=true are allowed without auth
  const authHeader = req.headers["authorization"];
  const cronSecret = process.env.CRON_SECRET;
  const isForce    = req.query?.force === "true";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";

  if (!isForce && !isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now    = new Date();
  const hour   = now.getUTCHours();
  const dayNum = now.getDay(); // 0=Sun, 6=Sat

  console.log(`Cron triggered: ${now.toISOString()}, hour=${hour}, day=${dayNum}`);

  // Ping KV so we can see in dashboard that cron fired
  try {
    await fetch(`${process.env.KV_REST_API_URL}/set/travito:cron_last_ping`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify({ firedAt: now.toISOString(), hour, day: dayNum })),
    });
  } catch(e) { console.log("Ping KV failed:", e.message); }

  // ── 21:00 UTC — Evening: YouTube pipeline check ──────────────
  if (hour === 21) {
    console.log("Evening run: YouTube pipeline check...");
    let ytEveningResult = { skipped: true, log: [] };
    try {
      ytEveningResult = await runYouTubePipeline(process.env);
    } catch(e) {
      console.log("YouTube evening error:", e.message);
    }
    return res.status(200).json({ success: true, action: "evening_youtube",
      youtube: ytEveningResult });
  }

  // Allow manual force trigger for testing
  const force = req.query?.force === "true" || req.method === "POST";

  // ── 08:00 UTC weekdays only — Generate & post article ────
  if (!force && (dayNum === 0 || dayNum === 6)) {
    return res.status(200).json({ success: true, action: "skipped", message: "Weekend — no posting. Add ?force=true to test manually." });
  }

  // Get X API keys from environment
  const keys = {
    apiKey:            process.env.X_API_KEY,
    apiSecret:         process.env.X_API_SECRET,
    accessToken:       process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };

  if (!keys.apiKey || !keys.accessToken) {
    console.error("X API keys not configured in environment");
    return res.status(500).json({ error: "X API keys not configured. Add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET to Vercel env vars" });
  }

  const rotation  = await getCurrentRotation(process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN);
  const topic     = getTodayTopic(rotation);

  if (!topic || !topic.label?.trim()) {
    return res.status(200).json({ success: true, action: "skipped",
      message: topic ? `No topic set for ${topic.day || "today"} — skipping` : "No topic for today" });
  }

  // ── Per-day overrides from Sujets KV ────────────────────────
  // Read lang + enabled from travito:x_topics:{weekKey}
  let dayLang    = rotation.language || "fr";
  let dayEnabled = true;
  try {
    const weekKvR = await fetch(
      `${process.env.KV_REST_API_URL}/get/${encodeURIComponent("travito:x_topics:" + (rotation.weekKey || ""))}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
    const weekKvD = await weekKvR.json();
    if (weekKvD.result) {
      const weekCfg = JSON.parse(weekKvD.result);
      const dayTopic = weekCfg?.topics?.find(t => t.day === topic.day);
      if (dayTopic) {
        if (dayTopic.lang)    dayLang    = dayTopic.lang;
        if (dayTopic.enabled === false) dayEnabled = false;
        // Also use KV label if set (user edited in Config)
        if (dayTopic.label?.trim()) topic.label = dayTopic.label.trim();
        if (dayTopic.comparison)    topic.comparison = dayTopic.comparison;
      }
    }
  } catch(e) { console.log("Day override read failed (non-blocking):", e.message); }

  if (!dayEnabled) {
    return res.status(200).json({ success: true, action: "skipped",
      message: `${topic.day} is disabled in Config — skipping` });
  }

  const hashtags = rotation.hashtags || HASHTAGS_BY_THEME[rotation.theme] || HASHTAGS_BY_THEME.Emploi;
  const results  = { topic: topic.label, theme: rotation.theme, steps: [] };

  try {
    // ── A1: Search live data with Tavily ──────────────────────
    console.log("A1: Searching live data for", topic.label);
    let searchContext = "";
    try {
      const tavRes = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_KEY,
          query: topic.label + " Maroc " + new Date().getFullYear(),
          search_depth: "basic",
          max_results: 4,
          include_answer: true,
        }),
      });
      const tavData = await tavRes.json();
      if (tavData.answer) searchContext = "DONNÉES RÉCENTES:\n" + tavData.answer + "\n\n";
      if (tavData.results?.length) {
        searchContext += tavData.results.slice(0,3).map(r =>
          "• " + r.title + ": " + (r.content||"").slice(0,200)
        ).join("\n");
      }
      results.steps.push({ step: "A1_search", status: "success", chars: searchContext.length });
      console.log("A1 search done:", searchContext.length, "chars");
    } catch(e) {
      console.log("A1 Tavily error (non-blocking):", e.message);
      results.steps.push({ step: "A1_search", status: "warning", error: e.message });
    }

    // ── Fetch Pexels image for CTA tweet ─────────────────────
    let tweetImageUrl = null;
    try {
      let pexelsKeywords = [];
      try {
        const kwRes = await callClaude(
          "You generate short Pexels image search queries in English. Return JSON only.",
          `Article topic: "${topic.label}" (theme: ${rotation.theme || "real estate"}, Morocco)
Generate 3 short English search queries (2-4 words each) for a relevant professional photo.
Concrete visual subjects only. Examples: "apartment building exterior", "car dealership", "office meeting"
JSON: {"queries": ["query1", "query2", "query3"]}`
        );
        const kwClean = kwRes.replace(/```json|```/g,"").trim();
        const kwData  = JSON.parse(kwClean.substring(kwClean.indexOf("{"), kwClean.lastIndexOf("}")+1));
        pexelsKeywords = kwData.queries || [];
        console.log("Pexels keywords:", JSON.stringify(pexelsKeywords));
      } catch(e) {
        console.log("Pexels keyword generation failed:", e.message);
      }
      const themeMap = { "Immobilier":"apartment building Morocco", "Automobile":"car road Morocco", "Lifestyle":"Morocco city people", "Emploi":"office professionals" };
      const fallback = themeMap[rotation.theme] || "Morocco cityscape";
      const queries  = [...pexelsKeywords, fallback].filter(Boolean).slice(0, 4);
      for (const q of queries) {
        try {
          console.log("Pexels trying:", q);
          const pr  = await fetch(`${process.env.APP_URL}/api/kv?action=pexels&query=${encodeURIComponent(q)}&format=portrait`);
          const pd  = await pr.json();
          console.log("Pexels result:", q, "→", pd.imageUrl ? "FOUND" : ("null: " + (pd.error||"")));
          if (pd.imageUrl) { tweetImageUrl = pd.imageUrl; break; }
        } catch(e) { console.log("Pexels query error:", q, e.message); }
      }
      if (!tweetImageUrl) console.log("⚠️ Pexels: no image found — posting without image");
    } catch(e) {
      console.log("Pexels failed (non-blocking):", e.message);
    }

    // ── A1: Write article ──────────────────────────────────
    console.log("A1: Writing article for", topic.label);
    const writerSystem = rotation.defaultArticlePrompt
      ? rotation.defaultArticlePrompt
        .replace("{BRAND}", BRAND.name).replace("{SITE}", BRAND.site)
        .replace("{YEAR}", new Date().getFullYear())
        + `\n⚠️ ANNÉE: Nous sommes en ${new Date().getFullYear()}. Utilise ${new Date().getFullYear()} pour toute donnée actuelle. Pour des statistiques récentes tu peux citer ${new Date().getFullYear()-1} (l'année dernière). INTERDIT d'écrire 2024 ou toute année antérieure à ${new Date().getFullYear()-1}.`
      : `Tu es l'Agent Rédacteur de ${BRAND.name} (${BRAND.site}).
⚠️ ANNÉE: Nous sommes en ${new Date().getFullYear()}. Utilise ${new Date().getFullYear()} pour toute donnée actuelle. Pour des statistiques récentes tu peux citer ${new Date().getFullYear()-1} (l'année dernière). INTERDIT d'écrire 2024 ou toute année antérieure à ${new Date().getFullYear()-1}.
LANGUE: ${dayLang === "ar" ? "Arabe (العربية)" : dayLang === "en" ? "English" : "Français"} — rédige TOUT le contenu dans cette langue.
${rotation.articleTone ? "TON ET STYLE: " + rotation.articleTone : ""}
Tu dois produire un article court qui respecte EXACTEMENT ce template.
Ne dévie JAMAIS du template. Remplis chaque section telle quelle.

RÈGLES DE TON:
- "il semblerait", "on observe", "les tendances indiquent"
- JAMAIS affirmatif — pas de certitudes absolues
- Sources générales — jamais de noms de médias
- 300-400 mots maximum

TEMPLATE OBLIGATOIRE:
## [TITRE COURT]
**EN BREF**
[2 phrases — tendance principale + villes marocaines]
**CE QU'ON OBSERVE**
[Paragraphe 1: 2-3 lignes sur la tendance]
[Paragraphe 2: 2-3 lignes sur l'impact pratique au Maroc]
**3 POINTS CLÉS**
• [conseil pratique 1]
• [conseil pratique 2]
• [conseil pratique 3]
**Découvrez sur ${BRAND.site} | Suivez ${BRAND.x}**
HASHTAGS: ${hashtags}
FORMAT X: THREAD 3 tweets
${DISCLAIMER}`;

    const currentYear = new Date().getFullYear();
    const writerUser = `Rédige l'article pour: "${topic.label}" (${rotation.theme}${topic.comparison ? `, comparaison: ${topic.comparison}` : ""}).
⚠️ RAPPEL ANNÉE: Données actuelles = ${currentYear}. Stats récentes = ${currentYear-1} acceptées. INTERDIT: 2024 ou avant.
Cite 2-3 villes marocaines (Casablanca, Rabat, Marrakech, Tanger, Agadir).
${searchContext ? "\n" + searchContext : ""}`;

    const article = await callClaude(writerSystem, writerUser);
    results.article = article;  // save for KV history
    results.steps.push({ step: "A1", status: "success", chars: article.length });
    console.log("A1 done:", article.length, "chars");

    // ── A2: Score quality ──────────────────────────────────
    const controllerSystem = `Tu es l'Agent Contrôleur Qualité (A2) de ${BRAND.name}.
Évalue ces 5 points (0-10 chacun):
1. TON: Informatif, pas affirmatif
2. STRUCTURE: Template respecté avec toutes sections
3. CTA: travito.ma ET @TravitoMaroc présents
4. HASHTAGS: Présents dans l'article
5. MAROC: Ancré au Maroc avec villes citées
Réponds UNIQUEMENT en JSON valide:
{"scores":{"TON":8,"STRUCTURE":9,"CTA":10,"HASHTAGS":10,"MAROC":8},"total":45,"max":50,"percent":90,"notes":"observation courte en 1 phrase"}`;

    let quality = 80;
    try {
      const checkRaw = await callClaude(controllerSystem, `Évalue cet article:\n\n${article}`);
      const check    = JSON.parse(checkRaw.replace(/```json|```/g, "").trim());
      quality = check.percent || Math.round((check.total / check.max) * 100);
      results.steps.push({ step: "A2", status: "success", quality });
      console.log("A2 score:", quality + "%");
    } catch (e) {
      results.steps.push({ step: "A2", status: "warning", error: e.message });
    }

    // ── A4 FIRST: Publish to WordPress → get real article URL ──
    const titleMatch = article.match(/## (.+)/);
    const blogTitle  = titleMatch
      ? titleMatch[1].replace(/[^\x00-\x7FÀ-ÿ\s\-:!?.,()]/gu, "").trim()
      : topic.label;

    let blogUrl = null;
    try {
      blogUrl = await postToWordPress(blogTitle, article, tweetImageUrl);
      results.steps.push({ step: "A4", status: "success", blogUrl });
      console.log("A4 published:", blogUrl);
    } catch (e) {
      results.steps.push({ step: "A4", status: "warning", error: e.message });
      console.error("A4 error:", e.message);
    }

    // ── A3: Format & post X thread (with real blogUrl) ──────
    const articleUrl = blogUrl || BRAND.site;
    const xFormatSystem = rotation.defaultTweetPrompt
        ? rotation.defaultTweetPrompt
          .replace("{BRAND}", BRAND.name).replace("{X}", BRAND.x)
          .replace("{N}", String(rotation.tweetsPerPost || 3))
        : `Tu es l'agent X de ${BRAND.name}. Produis EXACTEMENT ${rotation.tweetsPerPost || 3} tweets numérotés.
CHAQUE tweet doit faire STRICTEMENT MOINS de 260 caractères.
RÈGLES OBLIGATOIRES pour chaque tweet:
- Mentionner une ville marocaine OU une stat Maroc OU "au Maroc" au moins dans 1/3
- Minimum 2 hashtags pertinents (#Maroc #[ThèmeMaroc]) dans 1/3 et 3/3
- @TravitoMaroc doit apparaître dans le tweet 3/3
- Un emoji pertinent par tweet

1/3 — ACCROCHE (< 260 chars): Question OU chiffre choc + ville marocaine + émoji + 2 hashtags pertinents
2/3 — VALEUR (< 260 chars): Les 3 points clés ultra-condensés + émoji + ancrage Maroc
3/3 — CTA (< 260 chars): "📖 Article complet: ${articleUrl}" + "@TravitoMaroc 🇲🇦" + 2 hashtags

Réponds UNIQUEMENT avec les 3 lignes numérotées 1/3 2/3 3/3, rien d'autre.`;

    const xPost  = await callClaude(xFormatSystem, `Article:\n\n${article}\n\nHashtags: ${hashtags}`);
    results.xPost = xPost;  // save for KV history
    const tweets = parseThread(xPost);
    results.steps.push({ step: "A3_format", status: "success", tweets: tweets.length });
    console.log("A3 formatted:", tweets.length, "tweets, blogUrl:", articleUrl);

    // Post thread
    let lastId    = null;
    let postedCount = 0;
    console.log("Posting thread:", tweets.length, "tweets | image:", tweetImageUrl ? "YES" : "NO");
    for (let i = 0; i < tweets.length; i++) {
      if (!tweets[i] || tweets[i].length < 3) continue;
      // Attach image to CTA tweet: last tweet OR tweet containing article/travito link
      const isCTA = i === tweets.length - 1 || tweets[i].toLowerCase().includes("travito.ma");
      const img = (isCTA && tweetImageUrl) ? tweetImageUrl : null;
      console.log(`Tweet ${i+1}/${tweets.length} [${isCTA?"CTA":"body"}]: ${tweets[i].substring(0,60)}...${img?" +IMG":""}`);
      lastId = await postTweet(tweets[i], lastId, keys, img);
      postedCount++;
      if (i < tweets.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    results.steps.push({ step: "A3_post", status: "success", tweetsPosted: postedCount, lastId });
    console.log("A3 posted:", postedCount, "tweets, last id:", lastId);

    results.status   = "success";
    results.quality  = quality;
    results.blogUrl  = blogUrl;
    results.tweetId  = lastId;
    results.postedAt = now.toISOString();

    console.log("Pipeline complete!", JSON.stringify(results));

    // Save run results to KV for dashboard display
    if (process.env.KV_REST_API_URL) {
      try {
        // Save last run
        await fetch(`${process.env.KV_REST_API_URL}/set/travito:last_run`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(JSON.stringify({
            ranAt:    now.toISOString(),
            topic:    results.topic,
            theme:    results.theme,
            quality:  results.quality,
            blogUrl:  results.blogUrl,
            tweetId:  results.tweetId,
            success:  true,
          })),
        });

        // Save to x_history for XTwitterPipeline dashboard
        try {
          const histRes = await fetch(`${process.env.KV_REST_API_URL}/get/travito:x_history`, {
            headers: { "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}` },
          });
          const histData = await histRes.json();
          let hist = [];
          if (histData.result) {
            try {
              let hval = histData.result;
              try { hval = JSON.parse(hval); } catch {}
              if (hval && typeof hval === "object" && !Array.isArray(hval) && hval.value !== undefined) hval = hval.value;
              if (typeof hval === "string") { try { hval = JSON.parse(hval); } catch {} }
              hist = Array.isArray(hval) ? hval : [];
            } catch {}
          }
          const newEntry = {
            id: Date.now(),
            day: now.toLocaleDateString("fr-MA", { weekday:"long" }),
            topic: results.topic,
            theme: results.theme,
            icon: "🤖",
            content: results.article || "",
            xPost: results.xPost || "",
            qualityPercent: results.quality,
            status: results.tweetId ? "posted" : "failed",
            postedAt: now.toISOString(),
            createdAt: now.toISOString(),
            blogUrl: results.blogUrl || null,
            tweetId: results.tweetId || null,
            weekKey: (() => { const d=new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w1=new Date(d.getFullYear(),0,4); const wn=Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7)+1; return `W${String(wn).padStart(2,"0")}-${d.getFullYear()}`; })(),
            source: "cron",
          };
          const updated = [newEntry, ...hist].slice(0, 200);
          await fetch(`${process.env.KV_REST_API_URL}/set/travito:x_history`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(JSON.stringify(updated)),
          });
        } catch(e) { console.log("History save error:", e.message); }

        // Save post to audit log
        const postKey = `travito:posts:x:${now.toISOString().split("T")[0]}:${Date.now()}`;
        await fetch(`${process.env.KV_REST_API_URL}/set/${postKey}?ex=${90*24*3600}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(JSON.stringify({
            id:        results.tweetId || Date.now().toString(),
            platform:  "x",
            agent:     "A3 Poster",
            topic:     results.topic,
            theme:     results.theme,
            content:   results.article?.substring(0, 500) || results.topic,
            blogUrl:   results.blogUrl,
            tweetUrl:  results.tweetId ? `https://twitter.com/TravitoMaroc/status/${results.tweetId}` : null,
            postedAt:  now.toISOString(),
            audited:   false,
            auditedAt: null,
          })),
        });

        // Increment total counters
        const statsRes = await fetch(`${process.env.KV_REST_API_URL}/get/travito:stats`, {
          headers: { "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}` },
        });
        const statsData = await statsRes.json();
        let stats = { totalArticles: 0, totalTweets: 0, totalBlogs: 0, lastReset: now.toISOString() };
        if (statsData.result) {
          try {
            let sv = statsData.result;
            try { sv = JSON.parse(sv); } catch {}
            if (sv && typeof sv === "object" && !Array.isArray(sv) && sv.value !== undefined) sv = sv.value;
            if (typeof sv === "string") { try { sv = JSON.parse(sv); } catch {} }
            if (sv && typeof sv === "object") stats = { ...stats, ...sv };
          } catch {}
        }
        stats.totalArticles += 1;
        stats.totalTweets   += 3; // 3 tweets per thread
        stats.totalBlogs    += results.blogUrl ? 1 : 0;
        stats.lastUpdated    = now.toISOString();

        await fetch(`${process.env.KV_REST_API_URL}/set/travito:stats`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(JSON.stringify(stats)),
        });
        console.log("Stats saved to KV:", JSON.stringify(stats));
      } catch(e) {
        console.log("KV save error (non-critical):", e.message);
      }
    }

    // ── YouTube Pipeline (server-side automation) ──────────────
    let ytResult = { skipped: true, log: [] };
    try {
      ytResult = await runYouTubePipeline(process.env);
    } catch(e) {
      console.log("YouTube pipeline error:", e.message);
    }
    console.log("YouTube pipeline:", JSON.stringify(ytResult.log));

    // ── Monday: X Topics AI Suggestions + Hashtag refresh ────
    if (now.getDay() === 1) {
      try {
        await generateWeeklyXSuggestions(process.env);
        console.log("Weekly X suggestions generated");
      } catch(e) {
        console.log("X suggestions error (non-blocking):", e.message);
      }
    }

    return res.status(200).json({ success: true, ...results, youtube: ytResult });

  } catch (error) {
    console.error("Pipeline error:", error.message);
    return res.status(500).json({ success: false, error: error.message, results });
  }
}
