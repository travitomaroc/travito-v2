// ================================================================
//  X-TWITTER PIPELINE — A1 → A2 (track only) → A3 Post
//  Controller scores for quality tracking but NEVER blocks posting
//  Writer strictly follows mandatory X template
//  PATCHED: image selection now uses selected idea/topic and avoids repeats
// ================================================================
import { useState, useEffect } from "react";
import {
  BRAND, getCurrentRotation, getTodayTopic, getHashtags,
  DISCLAIMER, AUTO_GENERATE_HOUR, DAILY_SUMMARY_HOUR,
  callClaude, getWeekOfMonth,
  getDynamicHashtags, getPromptImprovements, saveArticlePerformance,
} from "../../config/agentConfig";

// ── A1 WRITER — strict mandatory template ────────────────────
const WRITER_SYSTEM = (hashtags) =>
`Tu es l'Agent Rédacteur de ${BRAND.name} (${BRAND.site}).
⚠️ ANNÉE: Nous sommes en ${new Date().getFullYear()}. Utilise ${new Date().getFullYear()} pour données actuelles. Tu peux citer ${new Date().getFullYear()-1} pour stats récentes. INTERDIT: 2024 ou toute année avant ${new Date().getFullYear()-1}.
Tu dois produire un article court qui respecte EXACTEMENT ce template.
Ne dévie JAMAIS du template. Remplis chaque section telle quelle.

RÈGLES DE TON:
- "il semblerait", "on observe", "les tendances indiquent"
- JAMAIS affirmatif — pas de certitudes absolues
- Sources générales — jamais de noms de médias
- 300-400 mots maximum

TEMPLATE OBLIGATOIRE (copie exactement les balises, remplis le contenu):

## [TITRE COURT ÉMOJI]

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

const WRITER_USER = (topic, theme, comparison) =>
`Rédige l'article pour: "${topic}" (${theme}${comparison ? `, comparaison: ${comparison}` : ""}).
⚠️ RAPPEL ANNÉE: Données actuelles = ${new Date().getFullYear()}. Stats récentes = ${new Date().getFullYear()-1} OK. INTERDIT: 2024 ou avant.
Cite 2-3 villes marocaines (Casablanca, Rabat, Marrakech, Tanger, Agadir).`;

// ── A2 CONTROLLER — score only, never blocks ─────────────────
const CONTROLLER_SYSTEM =
`Tu es l'Agent Contrôleur Qualité (A2) de ${BRAND.name}.
Tu évalues la qualité des articles SANS jamais bloquer la publication.
Ton rôle est uniquement de mesurer et informer.

Évalue ces 5 points (0-10 chacun):
1. TON: Informatif, pas affirmatif (10=parfait, 5=quelques certitudes, 0=très affirmatif)
2. STRUCTURE: Template respecté avec toutes sections (10=complet, 5=quelques manques, 0=incomplet)
3. CTA: travito.ma ET @TravitoMaroc présents (10=les deux, 5=un seul, 0=aucun)
4. HASHTAGS: Présents dans l'article (10=présents, 0=absents)
5. MAROC: Ancré au Maroc avec villes citées (10=bien ancré, 5=mention générale, 0=générique)

Réponds UNIQUEMENT en JSON valide:
{"scores":{"TON":8,"STRUCTURE":9,"CTA":10,"HASHTAGS":10,"MAROC":8},"total":45,"max":50,"percent":90,"notes":"observation courte en 1 phrase"}`;

// ── X FORMATTER — 3 tweets strictly under 260 chars each ───────
const XFORMAT_SYSTEM = (site, handle, blogUrl) =>
`Tu es l'agent X de ${BRAND.name}. Produis EXACTEMENT 3 tweets numérotés.
CHAQUE tweet doit faire STRICTEMENT MOINS de 260 caractères.

1/3 — ACCROCHE (< 260 chars):
Fait surprenant ou question percutante + émoji + 2 hashtags

2/3 — VALEUR (< 260 chars):
Les 3 points clés ultra-condensés + émoji

3/3 — CTA (< 260 chars):
"📖 Article complet: ${blogUrl || site+'/category/actualites'}"
"Toutes les annonces: ${site} | ${handle} 🇲🇦" + 2 hashtags

Réponds UNIQUEMENT avec les 3 lignes numérotées 1/3 2/3 3/3, rien d'autre.`;

// ── X POSTING via Vercel proxy ────────────────────────────────
const postToX = async (keys, text, replyToId = null, imageUrl = null) => {
  const body = {
    text: text.substring(0, 275),
    apiKey: keys.apiKey,
    apiSecret: keys.apiSecret,
    accessToken: keys.accessToken,
    accessTokenSecret: keys.accessTokenSecret,
  };
  if (replyToId) body.replyToId = replyToId;
  if (imageUrl)  body.imageUrl  = imageUrl;
  const r = await fetch("/api/tweet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.success) return { success: true, id: d.id };
  throw new Error(d.error || "Post failed");
};

// ── IMAGE HELPERS — PATCHED ───────────────────────────────────
const normalizeText = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const dedupeStrings = (arr = []) => [...new Set(arr.filter(Boolean).map(s => String(s).trim()).filter(Boolean))];

const THEME_FALLBACKS = {
  Immobilier: [
    "apartment building morocco",
    "real estate morocco",
    "morocco residential buildings",
    "casablanca buildings",
  ],
  Automobile: [
    "cars morocco",
    "road car morocco",
    "car dealership",
    "driving city road",
  ],
  Emploi: [
    "morocco professionals",
    "office meeting morocco",
    "job interview office",
    "coworking professionals",
  ],
  Lifestyle: [
    "morocco city people",
    "casablanca lifestyle",
    "marrakech street life",
    "morocco daily life",
  ],
};

const CITY_HINTS = ["casablanca", "rabat", "marrakech", "tanger", "agadir", "morocco", "maroc"];

const loadUsedImageMemory = () => {
  try {
    const raw = localStorage.getItem("x_pipeline_used_images");
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveUsedImageMemory = (items) => {
  try {
    localStorage.setItem("x_pipeline_used_images", JSON.stringify(items.slice(0, 80)));
  } catch {}
};

const rememberUsedImage = (entry) => {
  const cur = loadUsedImageMemory();
  const merged = [entry, ...cur.filter(x => x.id !== entry.id && x.url !== entry.url)];
  saveUsedImageMemory(merged);
};

const recentUsedImageIds = (limit = 20) => {
  return loadUsedImageMemory().slice(0, limit).map(x => x.id).filter(Boolean);
};

const buildTopicImageQueries = (topic = "", theme = "", content = "", comparison = null) => {
  const t = normalizeText(topic);
  const c = normalizeText(content).slice(0, 1200);
  const cmp = normalizeText(comparison || "");

  const detectedCities = CITY_HINTS.filter(city => t.includes(city) || c.includes(city));
  const primaryCity = detectedCities[0] || "";

  const themeFallback = THEME_FALLBACKS[theme] || ["morocco cityscape", "morocco business", "morocco lifestyle"];

  const queries = [];

  // topic-driven queries first
  if (t) {
    queries.push(
      `${t} morocco`,
      `${t} maroc`,
      primaryCity ? `${t} ${primaryCity}` : "",
      `${t} professional photo`,
      `${t} concept`,
    );
  }

  if (cmp) {
    queries.push(
      `${cmp} morocco`,
      `${cmp} comparison city`,
    );
  }

  // content-driven hints
  if (theme === "Immobilier") {
    queries.push(
      primaryCity ? `${primaryCity} apartment building` : "",
      "morocco apartment building",
      "residential buildings morocco",
      "real estate skyline",
    );
  } else if (theme === "Automobile") {
    queries.push(
      primaryCity ? `${primaryCity} car road` : "",
      "cars road morocco",
      "car dealership",
      "urban driving",
    );
  } else if (theme === "Emploi") {
    queries.push(
      primaryCity ? `${primaryCity} office professionals` : "",
      "office meeting morocco",
      "job interview office",
      "coworking professionals",
      "business team morocco",
    );
  } else if (theme === "Lifestyle") {
    queries.push(
      primaryCity ? `${primaryCity} lifestyle` : "",
      "morocco city people",
      "morocco street life",
      "morocco daily life",
    );
  }

  queries.push(...themeFallback);

  return dedupeStrings(
    queries
      .map(q => q.replace(/\s+/g, " ").trim())
      .filter(q => q.length >= 3)
  ).slice(0, 10);
};

const fetchPexelsCandidate = async (query, page = 1, format = "portrait") => {
  const r = await fetch(`/api/kv?action=pexels&query=${encodeURIComponent(query)}&page=${page}&format=${format}`);
  const d = await r.json();
  if (d.imageUrl) {
    return {
      url: d.imageUrl,
      id: d.photoId || d.imageUrl,
      photographer: d.photographer || null,
      query,
      page,
      fallback: !!d.fallback,
    };
  }
  return null;
};

const pickPipelineImage = async ({ topic = "", theme = "", content = "", comparison = null, addLog }) => {
  const recentIds = recentUsedImageIds(24);
  const queries = buildTopicImageQueries(topic, theme, content, comparison);

  addLog(`🖼️ Image queries: ${queries.slice(0, 4).join(" | ")}`);

  // try multiple queries and pages
  for (const query of queries) {
    for (const page of [1, 2, 3]) {
      try {
        const img = await fetchPexelsCandidate(query, page, "portrait");
        if (!img?.url) continue;
        if (recentIds.includes(img.id)) {
          addLog(`↩️ Image ignorée (déjà utilisée): "${query}" p${page}`, "info");
          continue;
        }
        rememberUsedImage({
          id: img.id,
          url: img.url,
          topic,
          theme,
          query: img.query,
          ts: new Date().toISOString(),
        });
        addLog(`✅ Image trouvée: "${query}" p${page}`, "success");
        return img.url;
      } catch (e) {
        addLog(`⚠️ Pexels query error "${query}" p${page}: ${e.message}`, "info");
      }
    }
  }

  addLog(`⚠️ Aucune image variée trouvée`, "info");
  return null;
};

// ── POST FULL THREAD ──────────────────────────────────────────
const postThread = async (keys, xPost, addLog, topic = "", theme = "", content = "", comparison = null) => {
  // Parse tweets
  const tweets = [];
  const lines = xPost.split("\n");
  let current = "";
  let inTweet = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^[123][\/]3/.test(t)) {
      if (inTweet && current.trim()) tweets.push(current.trim());
      current = t.replace(/^[123][\/]3[:\s\-—]*/, "").trim();
      inTweet = true;
    } else if (inTweet) {
      current = current ? current + " " + t : t;
    }
  }
  if (inTweet && current.trim()) tweets.push(current.trim());
  if (tweets.length === 0) {
    lines.filter(l => l.trim().length > 10).slice(0, 3).forEach(l => tweets.push(l.trim()));
  }

  addLog(`📋 Thread: ${tweets.length} tweets détectés`);
  if (tweets.length === 0) throw new Error("Aucun tweet détecté");

  // Fetch topic-aware varied image for CTA tweet
  let imageUrl = null;
  try {
    imageUrl = await pickPipelineImage({
      topic,
      theme,
      content,
      comparison,
      addLog,
    });
  } catch (e) {
    addLog(`⚠️ Image selection error: ${e.message}`, "info");
  }

  let lastId = null;
  let count = 0;
  for (let i = 0; i < tweets.length; i++) {
    if (!tweets[i] || tweets[i].length < 3) continue;
    // Attach image to CTA tweet (last tweet or contains travito.ma)
    const isCTA = i === tweets.length - 1 || tweets[i].toLowerCase().includes("travito.ma");
    const img = (isCTA && imageUrl) ? imageUrl : null;
    addLog(`🚀 Tweet ${i+1}/${tweets.length}${img ? " +🖼️" : ""}: "${tweets[i].substring(0, 50)}..."`);
    const result = await postToX(keys, tweets[i], lastId, img);
    lastId = result.id;
    count++;
    if (i < tweets.length - 1) await new Promise(r => setTimeout(r, 2000));
  }
  addLog(`✅ Thread: ${count}/3 tweets publiés!`, "success");
  return { success: true, id: lastId, count };
};

// ── A4 BLOGGER — post to travito.ma ─────────────────────────
const postToWordPress = async (title, content, slug) => {
  const r = await fetch("/api/wordpress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_post", title, content, slug }),
  });
  const raw = await r.text();
  let d;
  try { d = JSON.parse(raw); }
  catch { throw new Error(`Non-JSON from /api/wordpress (HTTP ${r.status}): ${raw.slice(0, 200)}`); }
  if (d.success) return { success: true, url: d.url, id: d.id };
  throw new Error(d.error || `WordPress post failed (HTTP ${r.status})`);
};

// Generate SEO slug from title
const generateSlug = (title) =>
  title.toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60);

// ── DAILY EMAIL ───────────────────────────────────────────────
const sendDailySummary = (articles) => {
  const today = new Date().toLocaleDateString("fr-MA");
  const posted   = articles.filter(a => a.status === "posted");
  const manual   = articles.filter(a => a.status === "approved");
  const failed   = articles.filter(a => a.status === "failed");

  const sub = encodeURIComponent(`📊 [Travito] Rapport — ${today}`);
  const body = encodeURIComponent(
`Rapport du ${today} — ${BRAND.name}

✅ PUBLIÉS SUR X (${posted.length})
${posted.length === 0 ? "Aucun" : posted.map(a =>
  `• ${a.day} — ${a.topic}
  Score qualité: ${a.qualityPercent || "N/A"}% | ${a.qualityNotes || ""}
  X publié: ${a.postedAt ? new Date(a.postedAt).toLocaleTimeString("fr-MA") : "N/A"}
  Blog: ${a.blogUrl || "Non publié"}`
).join("\n\n")}

${manual.length > 0 ? `📋 PUBLICATION MANUELLE REQUISE (${manual.length})
${manual.map(a =>
  `• ${a.day} — ${a.topic}
  Score: ${a.qualityPercent || "N/A"}% — Clés X @TravitoMaroc manquantes`
).join("\n")}

` : ""}${failed.length > 0 ? `❌ ÉCHECS (${failed.length})
${failed.map(a => `• ${a.day} — ${a.topic}: ${a.error || "Erreur inconnue"}`).join("\n")}

` : ""}Consulter: travito-agents.vercel.app
${BRAND.site} | ${BRAND.x}`);

  window.open(`https://mail.google.com/mail/?view=cm&to=${BRAND.email}&su=${sub}&body=${body}`, "_blank");
};

// ── MAIN COMPONENT ────────────────────────────────────────────
// ── X TWITTER CONFIG COMPONENT ───────────────────────────────────
const DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const THEMES  = ["Immobilier","Automobile","Emploi","Lifestyle"];
const ICONS   = ["🏠","🚗","💼","🎭"];

const DEFAULT_X_CONFIG = {
  monthlyRotation: {
    1:{theme:"Immobilier",icon:"🏠",topics:[
      {day:"Lundi",   label:"Prix immobilier par ville",       comparison:"Casablanca vs Rabat"},
      {day:"Mardi",   label:"Nouveaux projets & promoteurs",   comparison:"Casablanca vs Marrakech"},
      {day:"Mercredi",label:"Marché locatif",                  comparison:"Casablanca vs Tanger"},
      {day:"Jeudi",   label:"Tendances achat/vente",           comparison:"Casablanca vs Agadir"},
      {day:"Vendredi",label:"Réglementation immobilière",      comparison:null},
      {day:"Samedi",  label:"",comparison:null},
      {day:"Dimanche",label:"",comparison:null},
    ]},
    2:{theme:"Automobile",icon:"🚗",topics:[
      {day:"Lundi",   label:"Prix véhicules neufs au Maroc",       comparison:null},
      {day:"Mardi",   label:"Marché occasion — meilleures deals",  comparison:null},
      {day:"Mercredi",label:"Véhicules électriques & hybrides",    comparison:null},
      {day:"Jeudi",   label:"Top marques vendues au Maroc",        comparison:null},
      {day:"Vendredi",label:"Conseils achat/vente auto",           comparison:null},
      {day:"Samedi",  label:"",comparison:null},
      {day:"Dimanche",label:"",comparison:null},
    ]},
    3:{theme:"Emploi",icon:"💼",topics:[
      {day:"Lundi",   label:"Tendances recrutement Maroc",          comparison:null},
      {day:"Mardi",   label:"Secteurs porteurs & opportunités",     comparison:null},
      {day:"Mercredi",label:"Télétravail & emplois internationaux", comparison:null},
      {day:"Jeudi",   label:"Formation & compétences demandées",    comparison:null},
      {day:"Vendredi",label:"Salaires & négociation au Maroc",      comparison:null},
      {day:"Samedi",  label:"",comparison:null},
      {day:"Dimanche",label:"",comparison:null},
    ]},
    4:{theme:"Lifestyle",icon:"🎭",topics:[
      {day:"Lundi",   label:"Sport & fitness au Maroc",             comparison:null},
      {day:"Mardi",   label:"Musique & culture marocaine",          comparison:null},
      {day:"Mercredi",label:"Animaux de compagnie — marché Maroc",  comparison:null},
      {day:"Jeudi",   label:"Santé & bien-être tendances",          comparison:null},
      {day:"Vendredi",label:"Food & restaurants — découvertes",     comparison:null},
      {day:"Samedi",  label:"",comparison:null},
      {day:"Dimanche",label:"",comparison:null},
    ]},
  },
  hashtags:{
    Immobilier:"#TravitoMaroc #Maroc #Morocco #ImmoMaroc #ImmobilierMaroc #عقارات_المغرب",
    Automobile:"#TravitoMaroc #Maroc #Morocco #AutoMaroc #VoitureMaroc #سيارات_المغرب",
    Emploi:    "#TravitoMaroc #Maroc #Morocco #EmploiMaroc #RecrutementMaroc #وظائف_المغرب",
    Lifestyle: "#TravitoMaroc #Maroc #Morocco #MarocLife #Casablanca #Marrakech",
  },
  automation:{autoSearch:true,autoWriteArticle:true,autoFormatTweet:true,autoPost:true,autoPostBlog:true,language:"fr",articleMaxWords:400,tweetsPerPost:3},
  defaultArticlePrompt:`Tu es l'Agent Rédacteur de Travito Maroc (travito.ma).
Utilise TOUJOURS l'année en cours dans les statistiques et données récentes.
RÈGLES DE TON: "il semblerait", "on observe" — jamais affirmatif — 300-400 mots max
TEMPLATE:
## [TITRE]
**EN BREF** [2 phrases]
**CE QU'ON OBSERVE** [2 paragraphes]
**POINTS CLÉS** ① [pt1] ② [pt2] ③ [pt3]
**POUR ALLER PLUS LOIN** [1 phrase → travito.ma]`,
  defaultTweetPrompt:`Tu es l'agent X de Travito Maroc. Produis EXACTEMENT {N} tweets numérotés < 260 chars chacun.
1/N — ACCROCHE: Question/chiffre choc + ville marocaine + émoji + 2 hashtags
2/N — VALEUR: 3 points clés condensés + émoji
3/N — CTA: Lien article + @TravitoMaroc + hashtags`,
};

function XTwitterConfig({ C, parentWeekKey, parentRotation }) {
  const [cfg,       setCfg]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [saved,     setSaved]     = useState(false);
  const [section,   setSection]   = useState("topics");
  const [weekData,  setWeekData]  = useState({});
  const [generating,setGenerating]= useState(false);

  const getISOWeekKey = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset * 7);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const w1 = new Date(d.getFullYear(), 0, 4);
    const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
    return `W${String(wk).padStart(2,"0")}-${d.getFullYear()}`;
  };

  const getThemeForWeek = (wk) => {
    const currentWk  = parentWeekKey || getISOWeekKey(0);
    const currentTheme = parentRotation?.theme || "Immobilier";
    const currentIdx   = THEMES.indexOf(currentTheme);
    const safeIdx      = currentIdx < 0 ? 0 : currentIdx;
    if (wk === currentWk) return { theme: currentTheme, icon: ICONS[safeIdx] };
    const curNum = parseInt(currentWk.replace(/W0?/,"").split("-")[0]) || 14;
    const tgtNum = parseInt(wk.replace(/W0?/,"").split("-")[0]) || 14;
    const offset = tgtNum - curNum;
    const tgtIdx = ((safeIdx + offset) % 4 + 4) % 4;
    return { theme: THEMES[tgtIdx], icon: ICONS[tgtIdx] };
  };

  const currentWeekKey = parentWeekKey || getISOWeekKey(0);

  useEffect(() => {
    fetch("/api/kv?key=travito:x_pipeline_config")
      .then(r => r.json()).then(d => {
        const loaded = d.config?.monthlyRotation ? d.config : null;
        setCfg(loaded ? {
          ...DEFAULT_X_CONFIG, ...loaded,
          automation: { ...DEFAULT_X_CONFIG.automation, ...(loaded.automation||{}) },
        } : DEFAULT_X_CONFIG);
        setLoading(false);
      }).catch(() => { setCfg(DEFAULT_X_CONFIG); setLoading(false); });
  }, []);

  useEffect(() => {
    if (cfg && parentRotation?.topics?.length > 0) loadWeekData(currentWeekKey);
    else if (cfg) loadWeekData(currentWeekKey);
  }, [cfg, currentWeekKey, parentRotation?.theme]);

  const loadWeekData = (wk) => {
    fetch("/api/kv?key=travito:x_topics:" + wk)
      .then(r => r.json()).then(d => {
        const isCurrentWk = wk === currentWeekKey;
        if (d.config && d.config.topics?.length > 0) {
          const kv = d.config;
          if (isCurrentWk && parentRotation?.topics?.length > 0) {
            const rebuilt = {
              ...kv,
              theme:    parentRotation.theme,
              icon:     ICONS[THEMES.indexOf(parentRotation.theme)] || kv.icon,
              hashtags: cfg?.hashtags?.[parentRotation.theme] || kv.hashtags || "",
              topics:   DAYS_FR.map((day, i) => {
                const parT = parentRotation.topics[i] || {};
                const kvT  = kv.topics.find(t => t.day === day) || {};
                return {
                  day,
                  label:         parT.label         || kvT.label         || "",
                  comparison:    parT.comparison    || kvT.comparison    || "",
                  aiSuggestions: kvT.aiSuggestions  || [],
                  generatedAt:   kvT.generatedAt    || null,
                };
              }),
            };
            setWeekData(p => ({ ...p, [wk]: rebuilt }));
          } else {
            setWeekData(p => ({ ...p, [wk]: kv }));
          }
        } else {
          const { theme, icon } = getThemeForWeek(wk);
          const isCurrentWk2 = wk === currentWeekKey;
          const srcTopics = isCurrentWk2 && parentRotation?.topics?.length > 0
            ? parentRotation.topics
            : (cfg?.monthlyRotation
              ? Object.values(cfg.monthlyRotation).find(r => r.theme === theme)?.topics || []
              : []);
          setWeekData(p => ({ ...p, [wk]: {
            weekKey: wk, theme, icon, customName: "",
            hashtags: cfg?.hashtags?.[theme] || "",
            generatedAt: null,
            topics: DAYS_FR.map((day, i) => ({
              day,
              label:         srcTopics[i]?.label      || "",
              comparison:    srcTopics[i]?.comparison || "",
              aiSuggestions: [],
            })),
          }}));
        }
      }).catch(() => {});
  };

  const saveWeek = (wk, data) => {
    setWeekData(p => ({ ...p, [wk]: data }));
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:x_topics:" + wk, value: JSON.stringify(data) })
    }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }).catch(() => {});
  };

  const saveCfg = (updated) => {
    setCfg(updated);
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:x_pipeline_config", value: JSON.stringify(updated) })
    }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }).catch(() => {});
  };

  const generateAISuggestions = async (wk) => {
    const wd = weekData[wk]; if (!wd) return;
    setGenerating(true);
    try {
      const recentLabels = Object.entries(weekData)
        .filter(([k]) => k !== wk)
        .flatMap(([,w]) => (w.topics||[]).filter(t=>t.label).map(t=>t.label));
      const r = await fetch("/api/claude", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ max_tokens:1500,
          system:`Tu es un expert contenu Twitter pour Travito Maroc (${wd.theme}). Réponds UNIQUEMENT en JSON valide.`,
          messages:[{role:"user",content:`Semaine: ${wk} | Thème: ${wd.theme} ${wd.icon}
Sujets officiels: ${wd.topics.filter(t=>t.label).map(t=>`${t.day}:${t.label}`).join(", ")||"aucun"}
ÉVITER (sujets récents): ${recentLabels.slice(0,20).join(" | ")||"aucun"}

Génère 2-3 alternatives créatives par jour. Angle unique, jamais répété.
JSON uniquement: {"suggestions":{"Lundi":["s1","s2","s3"],"Mardi":["..."],"Mercredi":["..."],"Jeudi":["..."],"Vendredi":["..."],"Samedi":["..."],"Dimanche":["..."]}}`}]})});
      const d = await r.json();
      const raw = (d.content?.[0]?.text||"");
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s > -1) {
        const parsed = JSON.parse(raw.substring(s, e+1));
        if (parsed.suggestions) {
          const updated = { ...wd, generatedAt: new Date().toISOString(),
            topics: wd.topics.map(t => ({
              ...t, aiSuggestions: parsed.suggestions[t.day] || t.aiSuggestions || [],
            }))};
          saveWeek(wk, updated);
        }
      }
    } catch(e) { console.error("Suggestions error:", e); }
    setGenerating(false);
  };

  const resetWeek = async (wk) => {
    await fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:x_topics:"+wk, value: JSON.stringify(null) })});
    setWeekData(p => { const n={...p}; delete n[wk]; return n; });
    setTimeout(() => loadWeekData(wk), 300);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{padding:20,color:C.muted,fontSize:9}}>Chargement...</div>;

  const inp = {fontSize:8.5,padding:"5px 8px",background:"rgba(0,0,0,0.4)",
    border:`1px solid ${C.border}`,borderRadius:5,color:C.text,
    outline:"none",width:"100%",boxSizing:"border-box"};

  const SECTIONS = [["topics","📋 Sujets"],["automation","⚡ Auto"],["prompts","✍️ Prompts"]];

  const wd = weekData[currentWeekKey];
  const { theme:autoTheme, icon:autoIcon } = getThemeForWeek(currentWeekKey);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"6px 12px",borderBottom:`1px solid ${C.border}`,
        display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontSize:8.5,color:C.gold,fontFamily:"monospace",fontWeight:700}}>⚙️ X PIPELINE CONFIG</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {saved && <span style={{fontSize:7.5,color:C.green}}>✅ Sauvegardé</span>}
          <button onClick={()=>{ if(window.confirm("⚠️ RESET CONFIG\n\nCeci efface TOUS vos paramètres personnalisés.\nCette action est irréversible.\n\nConfirmer?")) saveCfg(DEFAULT_X_CONFIG); }}
            style={{fontSize:7,padding:"2px 8px",background:"rgba(239,68,68,0.08)",
              border:"1px solid rgba(239,68,68,0.25)",borderRadius:4,color:"#ef4444",cursor:"pointer"}}>
            ↺ Reset
          </button>
        </div>
      </div>

      <div style={{display:"flex",gap:4,padding:"5px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        {SECTIONS.map(([id,label]) => (
          <button key={id} onClick={()=>setSection(id)}
            style={{fontSize:7.5,padding:"3px 10px",borderRadius:12,cursor:"pointer",
              background:section===id?`rgba(212,175,55,0.15)`:"rgba(0,0,0,0.3)",
              border:`1px solid ${section===id?C.gold:C.border}`,
              color:section===id?C.gold:C.muted}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>

        {section==="topics" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:7.5,color:C.muted}}>
                Semaine: <span style={{color:C.gold,fontWeight:700}}>{currentWeekKey}</span>
                <span style={{color:autoIcon?C.muted:C.muted,marginLeft:8}}>{autoIcon} {autoTheme}</span>
                {wd?.generatedAt && <span style={{marginLeft:8,fontSize:7}}>· IA: {new Date(wd.generatedAt).toLocaleDateString("fr-FR")}</span>}
              </div>
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>generateAISuggestions(currentWeekKey)} disabled={generating}
                  style={{fontSize:7,padding:"3px 10px",borderRadius:5,cursor:"pointer",
                    background:`rgba(212,175,55,0.12)`,border:`1px solid rgba(212,175,55,0.3)`,
                    color:C.gold}}>
                  {generating?"⏳...":"✨ Suggestions IA"}
                </button>
                <button onClick={()=>resetWeek(currentWeekKey)}
                  style={{fontSize:7,padding:"3px 8px",borderRadius:5,cursor:"pointer",
                    background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",
                    color:"#ef4444"}}>
                  🔄 Reset semaine
                </button>
              </div>
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:7,color:C.muted,marginBottom:2}}>Nom de la semaine (optionnel)</div>
              <input value={wd?.customName||""} placeholder={`${autoTheme} — ${currentWeekKey}`}
                onChange={e => { if(wd) saveWeek(currentWeekKey,{...wd,customName:e.target.value}); }}
                style={inp}/>
            </div>

            {!wd ? (
              <div style={{fontSize:8,color:C.muted,textAlign:"center",padding:20}}>
                Chargement...
              </div>
            ) : wd.topics.map((topic, ti) => {
              const isWeekend = ti >= 5;
              return (
                <div key={ti} style={{marginBottom:6,padding:"8px 10px",
                  background:isWeekend?"rgba(0,0,0,0.1)":"rgba(0,0,0,0.2)",
                  border:`1px solid ${C.border}`,borderRadius:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:8,fontWeight:700,color:isWeekend?C.muted:C.gold}}>
                        {topic.day}{isWeekend?" 🌙":""}
                      </span>
                      {topic.label && <span style={{fontSize:7,color:C.green}}>✓ sujet défini</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <select value={topic.lang||cfg?.automation?.language||"fr"}
                        onChange={e=>saveWeek(currentWeekKey,{...wd,topics:wd.topics.map((t,i)=>i===ti?{...t,lang:e.target.value}:t)})}
                        style={{fontSize:7,padding:"1px 4px",background:"rgba(0,0,0,0.4)",
                          border:`1px solid ${C.border}`,borderRadius:4,color:C.text,outline:"none"}}>
                        <option value="fr">FR</option>
                        <option value="ar">AR</option>
                        <option value="en">EN</option>
                      </select>
                      <button onClick={()=>saveWeek(currentWeekKey,{...wd,topics:wd.topics.map((t,i)=>i===ti?{...t,enabled:t.enabled===false?true:false}:t)})}
                        style={{fontSize:7,padding:"1px 8px",borderRadius:10,cursor:"pointer",
                          background:topic.enabled===false?"rgba(0,0,0,0.3)":`rgba(16,185,129,0.15)`,
                          border:`1px solid ${topic.enabled===false?C.border:"rgba(16,185,129,0.4)"}`,
                          color:topic.enabled===false?C.muted:C.green}}>
                        {topic.enabled===false?"OFF":"ON"}
                      </button>
                    </div>
                  </div>
                  {(()=>{
                    const parT = !isWeekend ? (parentRotation?.topics?.[ti] || {}) : {};
                    const displayLabel      = topic.label?.trim()      || parT.label      || "";
                    const displayComparison = topic.comparison?.trim() || parT.comparison || "";
                    return (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:topic.aiSuggestions?.length?5:0}}>
                      <div>
                        <div style={{fontSize:7,color:C.muted,marginBottom:2}}>📌 Sujet officiel</div>
                        <input value={displayLabel}
                          placeholder={isWeekend?"Vide = pas de post":"Sujet du jour..."}
                          onChange={e => saveWeek(currentWeekKey,{...wd,topics:wd.topics.map((t,i)=>i===ti?{...t,label:e.target.value}:t)})}
                          style={{...inp,fontSize:8}}/>
                      </div>
                      <div>
                        <div style={{fontSize:7,color:C.muted,marginBottom:2}}>⚖️ Comparaison (opt.)</div>
                        <input value={displayComparison}
                          placeholder="Ex: Casablanca vs Rabat"
                          onChange={e => saveWeek(currentWeekKey,{...wd,topics:wd.topics.map((t,i)=>i===ti?{...t,comparison:e.target.value||null}:t)})}
                          style={{...inp,fontSize:8}}/>
                      </div>
                    </div>
                    );
                  })()}
                  {topic.aiSuggestions?.length > 0 && (
                    <div>
                      <div style={{fontSize:7,color:C.muted,marginBottom:3}}>✨ Suggestions IA</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {topic.aiSuggestions.map((sug,si) => (
                          <div key={si} style={{display:"flex",alignItems:"center",gap:3,
                            padding:"2px 6px",background:"rgba(212,175,55,0.06)",
                            border:`1px solid rgba(212,175,55,0.2)`,borderRadius:4}}>
                            <span style={{fontSize:7,color:C.muted,maxWidth:220,overflow:"hidden",
                              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sug}</span>
                            <button onClick={() => saveWeek(currentWeekKey,{...wd,topics:wd.topics.map((t,i)=>i===ti?{...t,label:sug,aiSuggestions:[]}:t)})}
                              style={{fontSize:7,padding:"1px 6px",borderRadius:3,cursor:"pointer",
                                background:"rgba(212,175,55,0.15)",border:`1px solid ${C.gold}`,
                                color:C.gold,flexShrink:0}}>
                              Copier
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{marginTop:12}}>
              <div style={{fontSize:8,color:C.text,fontWeight:700,marginBottom:4}}># Hashtags — {wd?.theme||autoTheme}</div>
              <input value={wd?.hashtags||""}
                onChange={e => { if(wd) saveWeek(currentWeekKey,{...wd,hashtags:e.target.value}); }}
                style={inp}/>
              <div style={{fontSize:7,color:C.muted,marginTop:3}}>Sauvegardé par semaine · Utilisé par cron cette semaine</div>
            </div>
          </div>
        )}

        {section==="automation" && (
          <div>
            <div style={{fontSize:8,color:C.text,fontWeight:700,marginBottom:10}}>AUTOMATISATION X PIPELINE</div>
            <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(0,0,0,0.2)",border:`1px solid ${C.border}`,borderRadius:7}}>
              <div style={{fontSize:7.5,color:C.muted,marginBottom:4}}>Langue par défaut</div>
              <div style={{display:"flex",gap:6}}>
                {[["fr","🇫🇷 Français"],["ar","🇲🇦 Arabe"],["en","🇬🇧 Anglais"]].map(([l,label])=>(
                  <button key={l} onClick={()=>saveCfg({...cfg,automation:{...cfg.automation,language:l}})}
                    style={{fontSize:8,padding:"4px 12px",borderRadius:12,cursor:"pointer",
                      background:cfg.automation?.language===l?`rgba(212,175,55,0.15)`:"rgba(0,0,0,0.3)",
                      border:`1px solid ${cfg.automation?.language===l?C.gold:C.border}`,
                      color:cfg.automation?.language===l?C.gold:C.muted}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[["articleMaxWords","Mots max article",200,800],["tweetsPerPost","Tweets par post",1,5]].map(([k,label,min,max])=>(
                <div key={k} style={{padding:"7px 10px",background:"rgba(0,0,0,0.2)",border:`1px solid ${C.border}`,borderRadius:7}}>
                  <div style={{fontSize:7.5,color:C.muted,marginBottom:3}}>{label}</div>
                  <input type="number" min={min} max={max} value={cfg.automation?.[k]||(k==="articleMaxWords"?400:3)}
                    onChange={e=>saveCfg({...cfg,automation:{...cfg.automation,[k]:+e.target.value}})}
                    style={{...inp,width:60,textAlign:"center"}}/>
                </div>
              ))}
            </div>
            {[["autoSearch","1. Recherche Tavily","Recherche web avant génération"],
              ["autoWriteArticle","2. Rédaction article","Claude rédige automatiquement"],
              ["autoPostBlog","3. Publication blog","Publie sur travito.ma via WordPress"],
              ["autoFormatTweet","4. Formatage tweets","Claude formate le thread"],
              ["autoPost","5. Publication X","Poste sur @TravitoMaroc"]
            ].map(([key,label,desc])=>(
              <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"7px 10px",marginBottom:4,background:"rgba(0,0,0,0.15)",
                border:`1px solid ${C.border}`,borderRadius:7}}>
                <div>
                  <div style={{fontSize:8,color:C.text,fontWeight:600}}>{label}</div>
                  <div style={{fontSize:7,color:C.muted,marginTop:1}}>{desc}</div>
                </div>
                <button onClick={()=>saveCfg({...cfg,automation:{...cfg.automation,[key]:!cfg.automation?.[key]}})}
                  style={{fontSize:8,padding:"3px 12px",borderRadius:12,cursor:"pointer",flexShrink:0,
                    background:cfg.automation?.[key]?`rgba(16,185,129,0.15)`:"rgba(0,0,0,0.3)",
                    border:`1px solid ${cfg.automation?.[key]?"rgba(16,185,129,0.4)":C.border}`,
                    color:cfg.automation?.[key]?C.green:C.muted}}>
                  {cfg.automation?.[key]?"ON":"OFF"}
                </button>
              </div>
            ))}
          </div>
        )}

        {section==="prompts" && (
          <div>
            <div style={{fontSize:8,color:C.muted,marginBottom:10,lineHeight:1.6}}>
              Prompts injectés dans Claude. Laisser vide = valeurs par défaut.
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:8,color:C.text,fontWeight:700,marginBottom:4}}>📝 Prompt Article</div>
              <textarea value={cfg.defaultArticlePrompt||""} rows={10}
                onChange={e=>saveCfg({...cfg,defaultArticlePrompt:e.target.value})}
                placeholder="Laisser vide = prompt par défaut"
                style={{...inp,resize:"vertical",fontFamily:"monospace",fontSize:7.5,lineHeight:1.5}}/>
            </div>
            <div>
              <div style={{fontSize:8,color:C.text,fontWeight:700,marginBottom:4}}>𝕏 Prompt Tweet</div>
              <textarea value={cfg.defaultTweetPrompt||""} rows={8}
                onChange={e=>saveCfg({...cfg,defaultTweetPrompt:e.target.value})}
                placeholder="Laisser vide = prompt par défaut"
                style={{...inp,resize:"vertical",fontFamily:"monospace",fontSize:7.5,lineHeight:1.5}}/>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function XTwitterPipeline({ articles = [], onArticleReady, xKeys = {} }) {
  const [running, setRunning]     = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [log, setLog]             = useState([]);
  const [kvStats, setKvStats]     = useState(null);
  const [lastRun, setLastRun]     = useState(null);
  const [activeTab, setActiveTab] = useState("article");
  const [summarySent, setSummarySent] = useState(false);
  const [kvHistory, setKvHistory] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [backfilling, setBackfilling] = useState(false);

  const rotation = getCurrentRotation();
  const today    = getTodayTopic();
  const getISOWeek = (d = new Date()) => {
    const dt = new Date(d); dt.setHours(0,0,0,0);
    dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
    const w1 = new Date(dt.getFullYear(), 0, 4);
    return Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7) + 1;
  };
  const isoWeek = getISOWeek();
  const weekKey = `W${String(isoWeek).padStart(2,"0")}-${new Date().getFullYear()}`;
  const hasKeys  = !!(xKeys?.apiKey && xKeys?.accessToken && xKeys?.apiSecret && xKeys?.accessTokenSecret);

  const normalise = (a) => ({ ...a, weekKey: a.weekKey || weekKey });

  const allArticles = [...kvHistory.map(normalise), ...articles.map(normalise)].reduce((acc, a) => {
    if (!acc.find(x => x.id === a.id)) acc.push(a);
    return acc;
  }, []);

  const allWeeks = [...new Set([weekKey, ...allArticles.map(a => a.weekKey).filter(Boolean)])].sort().reverse();
  const activeWeek = selectedWeek || weekKey;
  const weekArticles = allArticles.filter(a => a.weekKey === activeWeek);

  const addLog = (msg, type = "info") =>
    setLog(p => [{ msg, type, time: new Date().toLocaleTimeString("fr-MA") }, ...p.slice(0, 99)]);

  const runBackfill = async () => {
    setBackfilling(true);
    addLog("Backfill en cours — lecture historique KV...", "auto");
    try {
      const r = await fetch("/api/kv?action=backfill_x_history");
      const d = await r.json();
      if (d.success) {
        addLog("Backfill OK: "+d.newEntries+" posts importes, "+d.totalInHistory+" total | Semaines: "+(d.weeks||[]).join(", "), "success");
        const hr = await fetch("/api/kv?key=travito:x_history");
        const hd = await hr.json();
        if (hd.success && hd.config) {
          const hist = Array.isArray(hd.config) ? hd.config : [];
          setKvHistory(hist);
          addLog(hist.length+" articles charges dans le dashboard", "success");
        }
      } else {
        addLog("Backfill erreur: " + (d.error || "unknown"), "error");
      }
    } catch(e) { addLog("Backfill erreur: " + e.message, "error"); }
    setBackfilling(false);
  };

  useEffect(() => {
    fetch("/api/kv?key=travito:stats")
      .then(r => r.json())
      .then(d => { if (d.success && d.config) setKvStats(d.config); })
      .catch(() => {});
    fetch("/api/kv?key=travito:last_run")
      .then(r => r.json())
      .then(d => { if (d.success && d.config) setLastRun(d.config); })
      .catch(() => {});
    fetch("/api/kv?key=travito:x_history")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config) {
          const hist = Array.isArray(d.config) ? d.config : [];
          setKvHistory(hist);
          addLog(`📚 ${hist.length} articles chargés depuis KV`, "success");
        }
      })
      .catch(() => {});
    fetch("/api/kv?key=travito:last_run")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config) {
          const lr = d.config;
          if (lr?.ranAt) {
            setLog(p => [{
              msg: `🤖 Dernier cron: ${lr.topic||""} — ${lr.success?"publié":"échoué"} — ${new Date(lr.ranAt).toLocaleString("fr-MA")}`,
              type: lr.success ? "success" : "error",
              time: new Date(lr.ranAt).toLocaleTimeString("fr-MA"),
            }, ...p]);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tick = async () => {
      const n = new Date();
      const h = n.getUTCHours(), m = n.getUTCMinutes(), d = n.getUTCDay();
      if (h === AUTO_GENERATE_HOUR && m === 0 && d >= 1 && d <= 5) {
        const t = getTodayTopic();
        if (t && !articles.find(a => a.day === t.day && a.weekKey === weekKey) && !running) {
          addLog(`⏰ Auto: ${t.label}`, "auto");
          runPipeline(t);
        }
      }
      if (h === DAILY_SUMMARY_HOUR && m === 0 && !summarySent) {
        const arts = articles.filter(a => a.weekKey === weekKey);
        if (arts.length > 0) {
          sendDailySummary(arts);
          setSummarySent(true);
          addLog(`📧 Rapport envoyé à ${BRAND.email}`, "success");
        }
      }
      if (h === 0 && m === 0) setSummarySent(false);
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [articles, running, summarySent]);

  const runPipeline = async (topicItem) => {
    setRunning(true);
    const tags = getHashtags(topicItem.theme || rotation.theme);

    let article = {
      id: Date.now(),
      day: topicItem.day,
      topic: topicItem.label,
      theme: topicItem.theme || rotation.theme,
      icon: topicItem.icon,
      color: topicItem.color || rotation.color,
      comparison: topicItem.comparison || null,
      hashtags: tags,
      content: "",
      xPost: null,
      status: "writing",
      weekKey,
      createdAt: new Date().toISOString(),
      qualityScores: null,
      qualityPercent: null,
      qualityNotes: null,
    };

    setSelectedDay(article.day);
    onArticleReady?.({ ...article });

    try {
      addLog(`✍️ A1 rédaction: ${topicItem.label}...`);
      const content = await callClaude(
        WRITER_SYSTEM(tags),
        WRITER_USER(topicItem.label, topicItem.theme || rotation.theme, topicItem.comparison)
      );
      article = { ...article, content, status: "checking" };
      setSelectedDay(article.day);
      onArticleReady?.({ ...article });
      addLog(`✅ A1 article rédigé`, "success");

      addLog(`🔍 A2 évaluation qualité...`);
      try {
        const checkRaw = await callClaude(CONTROLLER_SYSTEM, `Évalue cet article:\n\n${content}`);
        let check;
        try { check = JSON.parse(checkRaw.replace(/```json|```/g, "").trim()); }
        catch { check = { scores: {}, total: 40, max: 50, percent: 80, notes: "Évaluation automatique" }; }

        article = {
          ...article,
          qualityScores: check.scores,
          qualityPercent: check.percent || Math.round((check.total / check.max) * 100),
          qualityNotes: check.notes,
        };
        addLog(`📊 A2 Score: ${article.qualityPercent}% — ${check.notes}`, "success");
        saveArticlePerformance({ ...article, theme: rotation.theme }).catch(()=>{});
      } catch (e) {
        addLog(`⚠️ A2 évaluation ignorée: ${e.message}`, "error");
      }

      addLog(`🎨 A3 formatage X...`);
      article = { ...article, status: "formatting" };
      setSelectedDay(article.day);
      onArticleReady?.({ ...article });

      const xPost = await callClaude(
        XFORMAT_SYSTEM(BRAND.site, BRAND.x, article.blogUrl||null),
        `Article:\n\n${content}\n\nHashtags: ${tags}`
      );
      article = { ...article, xPost, status: "posting" };
      setSelectedDay(article.day);
      onArticleReady?.({ ...article });

      if (hasKeys) {
        addLog(`🚀 A3 publication thread @TravitoMaroc...`);
        const result = await postThread(
          xKeys,
          xPost,
          addLog,
          topicItem.label || "",
          topicItem.theme || rotation.theme || "",
          content || "",
          topicItem.comparison || null
        );
        article = { ...article, status: "posted", postedAt: new Date().toISOString(), tweetCount: result.count };
        addLog(`✅ Thread publié @TravitoMaroc! ${result.count} tweets · Qualité: ${article.qualityPercent}%`, "success");
      } else {
        article = { ...article, status: "approved" };
        addLog(`⚠️ Clés X requises — post prêt`, "error");
      }

      addLog(`📝 A4 publication sur travito.ma/blog...`);
      try {
        const titleMatch = article.content.match(/## (.+)/);
        const blogTitle = titleMatch
          ? titleMatch[1].replace(/[🏠🚗💼🎭💰🔑📈⚖️✍️🌍🎓👑📣🎯𝕏🚀🔍]/gu, "").trim()
          : article.topic;
        const blogSlug = generateSlug(blogTitle);

        const wpResult = await postToWordPress(blogTitle, article.content, blogSlug);
        article = { ...article, blogUrl: wpResult.url, blogId: wpResult.id };
        addLog(`✅ Article publié sur travito.ma: ${wpResult.url}`, "success");
      } catch(e) {
        addLog(`⚠️ Blog non publié: ${e.message}`, "error");
      }
    } catch (e) {
      addLog(`❌ Erreur pipeline: ${e.message}`, "error");
      article = { ...article, status: "failed", error: e.message };
    }

    setSelectedDay(article.day);
    onArticleReady?.({ ...article });

    try {
      const existing = kvHistory.filter(a => a.id !== article.id);
      const updated  = [article, ...existing].slice(0, 200);
      setKvHistory(updated);
      await fetch("/api/kv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "travito:x_history", value: JSON.stringify(updated) }),
      });
    } catch(e) { console.log("KV save error:", e.message); }

    setRunning(false);
  };

  const C = { bg: "rgba(12,18,35,0.95)", border: "rgba(212,175,55,0.18)", gold: "#D4AF37", text: "#e8dcc8", muted: "#6b6050", green: "#10b981", red: "#ef4444", blue: "#1DA1F2", amber: "#f59e0b" };
  const SI = {
    writing:    { color: C.amber,  label: "✍️ A1 Rédaction..." },
    checking:   { color: C.amber,  label: "🔍 A2 Évaluation..." },
    formatting: { color: C.amber,  label: "🎨 A3 Formatage X..." },
    posting:    { color: C.blue,   label: "🚀 A3 Publication X..." },
    blogging:   { color: "#f97316", label: "📝 A4 Publication Blog..." },
    approved:   { color: C.green,  label: "✅ Prêt — copier sur X" },
    posted:     { color: C.blue,   label: "✅ Thread publié @TravitoMaroc" },
    failed:     { color: C.red,    label: "❌ Erreur" },
    draft:      { color: C.muted,  label: "📝 En attente" },
  };

  const todayArticle   = weekArticles.find(a => a.day === today?.day);
  const defaultArticle = todayArticle || weekArticles[weekArticles.length - 1] || null;
  const cur = selectedDay
    ? weekArticles.find(a => a.day === selectedDay) || null
    : defaultArticle;
  const si = cur ? (SI[cur.status] || SI.draft) : null;
  const activeDayLabel = selectedDay || cur?.day || today?.day;

  const qualityColor = (pct) => pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gridTemplateRows: "38px 1fr", flex: 1, minHeight: 0, overflow: "hidden" }}>

      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <div style={{ width: 22, height: 22, background: "linear-gradient(135deg,#1DA1F2,#0a5f8a)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, color: "#fff", flexShrink: 0 }}>𝕏</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#1DA1F2", flexShrink: 0 }}>X Pipeline</div>
        <div style={{ fontSize: 7, color: C.muted, fontFamily: "monospace" }}>A1→A2→A3(X)→A4(Blog) · {rotation.theme} · {BRAND.x}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[["article", "📝 Article"], ["quality", "📊 Qualité"], ["xpost", "𝕏 X Post"], ["log", "📋 Log"], ["report", "📊 Rapport"], ["config", "⚙️ Config"]].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{ fontSize: 7, padding: "2px 7px", borderRadius: 8, background: activeTab === id ? `${C.gold}18` : "transparent", border: `1px solid ${activeTab === id ? C.gold : C.border}`, color: activeTab === id ? C.gold : C.muted, cursor: "pointer" }}>
              {label}
            </button>
          ))}
          {!hasKeys && <span style={{ fontSize: 7, color: C.red, fontFamily: "monospace" }}>⚠️ Clés X</span>}
          <div style={{ display:"flex", alignItems:"center", gap:3, marginLeft:4 }}>
            <span style={{ fontSize:6, color:C.muted }}>Semaine:</span>
            <select value={activeWeek} onChange={e=>{setSelectedWeek(e.target.value===weekKey?null:e.target.value);setSelectedDay(null);}}
              style={{ fontSize:7, background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:4, color:C.gold, padding:"1px 4px", cursor:"pointer" }}>
              {allWeeks.length === 0
                ? <option value={weekKey}>{weekKey} (courante)</option>
                : allWeeks.map(w => {
                    const m = w.match(/W(\d+)-(\d+)/);
                    let lbl = w;
                    if (m) {
                      const wn=parseInt(m[1]),yr=parseInt(m[2]);
                      const jan4=new Date(yr,0,4);
                      const mon=new Date(jan4); mon.setDate(jan4.getDate()-(jan4.getDay()+6)%7+(wn-1)*7);
                      const sun=new Date(mon); sun.setDate(mon.getDate()+6);
                      const fmt=d=>d.toLocaleDateString("fr-MA",{day:"2-digit",month:"2-digit"});
                      lbl=`${w} (${fmt(mon)}-${fmt(sun)})`;
                    }
                    return <option key={w} value={w}>{lbl}{w===weekKey?" ◀":""}</option>;
                  })
              }
            </select>
            {allArticles.length > 0 && <span style={{ fontSize:6, color:C.muted }}>{allArticles.length} total</span>}
            <button onClick={runBackfill} disabled={backfilling}
              style={{ fontSize:6, padding:"1px 6px", background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.3)", borderRadius:4, color:"#D4AF37", cursor:"pointer", marginLeft:4 }}>
              {backfilling ? "..." : "📥 Backfill"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ gridRow: 2, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "4px 7px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, fontSize: 7, color: C.muted, fontFamily: "monospace", background: "rgba(0,0,0,0.2)" }}>
          ⏰ Auto 08:00 · 📧 21:00 UTC
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "5px" }}>
          {rotation.topics.map((t, i) => {
            const done = weekArticles.find(a => a.day === t.day);
            const isToday = today?.day === t.day;
            const isSel = activeDayLabel === t.day;
            const dsi = done ? (SI[done.status] || SI.draft) : null;
            return (
              <div key={i} onClick={() => setSelectedDay(t.day)}
                style={{ background: isSel ? `${rotation.color}15` : isToday ? `${rotation.color}08` : C.bg, border: `1px solid ${isSel ? rotation.color : isToday ? rotation.color + "55" : C.border}`, borderRadius: 8, padding: "7px 8px", marginBottom: 4, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <span style={{ fontSize: 11 }}>{t.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{t.day}</span>
                  {isToday && <span style={{ fontSize: 6, padding: "1px 3px", background: rotation.color, color: "#000", borderRadius: 3, fontWeight: 700 }}>TODAY</span>}
                </div>
                <div style={{ fontSize: 7, color: C.muted, lineHeight: 1.3, marginBottom: 3 }}>{t.label}</div>
                {t.comparison && <div style={{ fontSize: 6, color: rotation.color, marginBottom: 3 }}>⚖️ {t.comparison}</div>}
                {done ? (
                  <div>
                    <div style={{ fontSize: 7, color: dsi?.color, marginBottom: 2 }}>{dsi?.label}</div>
                    {done.qualityPercent && <div style={{ fontSize: 7, color: qualityColor(done.qualityPercent), fontFamily: "monospace" }}>📊 {done.qualityPercent}%</div>}
                    <button onClick={e=>{e.stopPropagation();runPipeline(t);}} disabled={running}
                      style={{width:"100%",marginTop:4,fontSize:6.5,padding:"2px 0",
                        background:"rgba(107,96,80,0.15)",border:"1px solid rgba(107,96,80,0.3)",
                        borderRadius:4,color:"#6b6050",cursor:running?"not-allowed":"pointer"}}>
                      {running?"⏳...":"🔄 Re-lancer"}
                    </button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); runPipeline(t); }} disabled={running}
                    style={{ width: "100%", fontSize: 7, padding: "3px 0", background: `${rotation.color}15`, border: `1px solid ${rotation.color}44`, borderRadius: 4, color: rotation.color, cursor: "pointer", fontWeight: 700 }}>
                    {running ? "⏳..." : "🚀 Lancer"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "5px 7px", flexShrink: 0 }}>
          {lastRun && (
            <div style={{ fontSize:7, color:C.green, fontFamily:"monospace", marginBottom:4, padding:"3px 4px", background:`${C.green}10`, borderRadius:4 }}>
              Dernier run: {lastRun.ranAt ? new Date(lastRun.ranAt).toLocaleString("fr-MA") : "—"}
            </div>
          )}
          {[["✅ Publiés", kvStats?.totalArticles || weekArticles.filter(a => a.status === "posted").length, C.blue], ["🐦 Tweets", kvStats?.totalTweets || articles.filter(a => a.status === "posted").length * 3, C.amber], ["📝 Blogs", kvStats?.totalBlogs || 0, C.green]].map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
              <span style={{ fontSize: 7, color: C.muted }}>{l}</span>
              <span style={{ fontSize: 7, fontWeight: 700, color: c, fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ gridRow: 2, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {activeTab === "config" && (
          <XTwitterConfig C={C} parentWeekKey={activeWeek} parentRotation={rotation} />
        )}
        {activeTab !== "config" && (cur ? (
          <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", minHeight:0 }}>
            <div style={{ padding: "7px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: C.bg }}>
              <span style={{ fontSize: 16 }}>{cur.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{cur.topic}</div>
                <div style={{ fontSize: 7, color: C.muted, fontFamily: "monospace" }}>{cur.day} · {cur.theme} · {new Date(cur.createdAt).toLocaleDateString("fr-MA")}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {cur.qualityPercent && (
                  <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 5, background: `${qualityColor(cur.qualityPercent)}18`, color: qualityColor(cur.qualityPercent), border: `1px solid ${qualityColor(cur.qualityPercent)}44`, fontFamily: "monospace", fontWeight: 700 }}>
                    📊 {cur.qualityPercent}%
                  </span>
                )}
                <span style={{ fontSize: 7, padding: "2px 8px", borderRadius: 6, background: `${si?.color}18`, color: si?.color, border: `1px solid ${si?.color}44`, fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>{si?.label}</span>
              </div>
            </div>

            {activeTab === "article" && (
              <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
                <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "10px 12px" }}>
                {cur.content
                  ? <div style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.9,
                      color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "12px 14px" }}>
                      {cur.content}
                    </div>
                  : <div style={{ display: "flex", flexDirection:"column", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, gap:10 }}>
                      {["checking","writing"].includes(cur.status)
                        ? <div style={{fontSize:11,color:C.amber}}>✍️ Génération en cours...</div>
                        : <>
                            <div style={{fontSize:10,color:C.muted}}>
                              {cur.status==="posted"
                                ? "Article publié — texte non sauvegardé (ancien post)"
                                : "Aucun contenu pour "+cur.day}
                            </div>
                            {cur.blogUrl && (
                              <a href={cur.blogUrl} target="_blank" rel="noopener"
                                style={{fontSize:9,padding:"5px 14px",
                                  background:"rgba(249,115,22,0.1)",
                                  border:"1px solid rgba(249,115,22,0.3)",
                                  borderRadius:6,color:"#f97316",textDecoration:"none"}}>
                                📖 Lire sur le blog
                              </a>
                            )}
                            {cur.status !== "posted" && (
                              <button onClick={()=>{const t=rotation.topics.find(t=>t.day===cur.day);if(t)runPipeline(t);}} disabled={running}
                                style={{fontSize:10,padding:"7px 18px",
                                  background:`${rotation.color}15`,
                                  border:`1px solid ${rotation.color}55`,
                                  borderRadius:7,color:rotation.color,
                                  cursor:running?"not-allowed":"pointer",fontWeight:700}}>
                                🚀 Lancer pour {cur.day}
                              </button>
                            )}
                          </>
                      }
                    </div>
                }
                </div>
              </div>
            )}

            {activeTab === "quality" && (
              <div style={{ position:"relative", flex:1, minHeight:0 }}><div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"10px 12px" }}>
                {cur.qualityScores ? (
                  <>
                    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: qualityColor(cur.qualityPercent), fontFamily: "monospace" }}>{cur.qualityPercent}%</div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: qualityColor(cur.qualityPercent) }}>Score Qualité A2</div>
                          <div style={{ fontSize: 9, color: C.muted }}>{cur.qualityNotes}</div>
                        </div>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 4, height: 6, marginBottom: 12 }}>
                        <div style={{ background: qualityColor(cur.qualityPercent), width: `${cur.qualityPercent}%`, height: "100%", borderRadius: 4 }} />
                      </div>
                      {Object.entries(cur.qualityScores).map(([key, score]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 9, color: C.muted, width: 100, fontFamily: "monospace" }}>{key}</span>
                          <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 3, height: 5 }}>
                            <div style={{ background: score >= 8 ? C.green : score >= 5 ? C.amber : C.red, width: `${score * 10}%`, height: "100%", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 9, color: score >= 8 ? C.green : score >= 5 ? C.amber : C.red, fontFamily: "monospace", width: 30, textAlign: "right" }}>{score}/10</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, textAlign: "center", fontStyle: "italic" }}>
                      ℹ️ Score indicatif uniquement — n'affecte pas la publication
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 11 }}>
                    {["checking","writing"].includes(cur.status) ? "🔍 Évaluation en cours..." : cur.status==="posted" ? "Score disponible après prochain run" : "Pas encore évalué — lancez le pipeline"}
                  </div>
                )}
              </div></div>
            )}

            {activeTab === "xpost" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", minHeight: 0 }}>
                {cur.xPost ? (
                  <>
                    <div style={{ fontSize: 9, color: C.blue, marginBottom: 8, fontFamily: "monospace" }}>𝕏 3 TWEETS — @TravitoMaroc:</div>
                    {cur.xPost.split("\n").filter(l => l.trim()).map((line, i) => {
                      const isTweet = line.match(/^\d\/3/);
                      const charCount = line.replace(/^\d\/3\s*/, "").length;
                      return (
                        <div key={i} style={{ background: isTweet ? "rgba(29,161,242,0.08)" : "transparent", border: isTweet ? "1px solid rgba(29,161,242,0.25)" : "none", borderRadius: 8, padding: isTweet ? "10px 12px" : "2px 4px", marginBottom: isTweet ? 8 : 2 }}>
                          <div style={{ fontSize: 11, color: isTweet ? "#93c5fd" : C.muted, fontFamily: "monospace", lineHeight: 1.6 }}>{line}</div>
                          {isTweet && <div style={{ fontSize: 7, color: charCount > 280 ? C.red : C.muted, marginTop: 4, fontFamily: "monospace" }}>{charCount}/280 chars</div>}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 11 }}>
                    {["writing", "checking", "formatting"].includes(cur.status) ? "🎨 Formatage en cours..." : "X post pas encore généré"}
                  </div>
                )}
              </div>
            )}

            {activeTab === "log" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", fontFamily: "monospace", minHeight: 0 }}>
                {log.length === 0
                  ? <div style={{ color: C.muted, fontSize: 9, textAlign: "center", paddingTop: 20 }}>Aucune activité</div>
                  : log.map((l, i) => <div key={i} style={{ fontSize: 8, color: l.type === "error" ? C.red : l.type === "success" ? C.green : l.type === "auto" ? C.amber : C.muted, marginBottom: 3, lineHeight: 1.4 }}><span style={{ opacity: 0.5, marginRight: 5 }}>{l.time}</span>{l.msg}</div>)
                }
              </div>
            )}

            {activeTab === "report" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", minHeight: 0 }}>
                {cur && (
                  <div style={{ background: C.bg, border: `1px solid ${rotation.color}33`, borderRadius: 9, padding: "12px", marginBottom: 10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                      <span style={{fontSize:14}}>{cur.icon}</span>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.gold }}>{cur.topic}</div>
                        <div style={{ fontSize:7, color:C.muted }}>{cur.day} · {cur.theme} · {cur.postedAt ? new Date(cur.postedAt).toLocaleDateString("fr-MA") : "—"}</div>
                      </div>
                      {si && <span style={{marginLeft:"auto",fontSize:8,padding:"2px 8px",borderRadius:5,background:`${si.color}18`,color:si.color,border:`1px solid ${si.color}44`}}>{si.label}</span>}
                    </div>
                    {cur.qualityPercent && (
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:7,color:C.muted}}>Score A2:</span>
                        <span style={{fontSize:12,fontWeight:700,color:qualityColor(cur.qualityPercent),fontFamily:"monospace"}}>{cur.qualityPercent}%</span>
                        <div style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:3,height:4}}>
                          <div style={{background:qualityColor(cur.qualityPercent),width:`${cur.qualityPercent}%`,height:"100%",borderRadius:3}}/>
                        </div>
                      </div>
                    )}
                    {cur.blogUrl && <div style={{fontSize:8,color:"#f97316"}}>📖 <a href={cur.blogUrl} target="_blank" rel="noopener" style={{color:"#f97316"}}>{cur.blogUrl}</a></div>}
                    {cur.tweetUrl && <div style={{fontSize:8,color:C.blue,marginTop:3}}>🐦 <a href={cur.tweetUrl} target="_blank" rel="noopener" style={{color:C.blue}}>{cur.tweetUrl}</a></div>}
                  </div>
                )}
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px", marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: C.gold, fontFamily: "monospace", marginBottom: 8 }}>📊 RAPPORT SEMAINE — {activeWeek}</div>
                  {[
                    ["✅ Publiés auto", weekArticles.filter(a => a.status === "posted").length, C.blue],
                    ["📋 Manuel requis", weekArticles.filter(a => a.status === "approved").length, C.amber],
                    ["❌ Échecs", weekArticles.filter(a => a.status === "failed").length, C.red],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <span style={{ fontSize: 10, color: C.text }}>{l}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: "monospace" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => sendDailySummary(articles.filter(a => a.weekKey === weekKey))}
                  style={{ width: "100%", padding: "9px 0", background: `${C.gold}12`, border: `1px solid ${C.gold}44`, borderRadius: 8, color: C.gold, cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                  📧 Envoyer Rapport Maintenant
                </button>
              </div>
            )}

            <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "8px 12px", background: "rgba(8,13,26,0.98)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {cur.content && <button onClick={() => navigator.clipboard.writeText(cur.content)} style={{ padding: "6px 10px", background: `${C.gold}12`, border: `1px solid ${C.gold}44`, borderRadius: 6, color: C.gold, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>📋 Copier</button>}
              {cur.content && <button onClick={() => { const b = new Blob([cur.content], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${cur.day}.txt`; a.click(); }} style={{ padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>⬇️ Export</button>}
              {running && <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.amber, fontSize: 9 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber, animation: "pulse 1s infinite" }} />Pipeline en cours...</div>}
              {cur.status === "approved" && cur.xPost && (
                <>
                  <button onClick={() => { navigator.clipboard.writeText(cur.xPost); alert("X post copié!"); }}
                    style={{ padding: "8px 14px", background: "rgba(29,161,242,0.12)", border: "1px solid rgba(29,161,242,0.3)", borderRadius: 7, color: C.blue, cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                    𝕏 Copier X Post
                  </button>
                  <span style={{ fontSize: 8, color: C.red }}>⚠️ Configurez clés @TravitoMaroc</span>
                </>
              )}
{cur.status === "posted" && (
  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
    <div style={{ color: C.blue, fontSize: 9, fontWeight: 700 }}>✅ Publié @TravitoMaroc{cur.qualityPercent ? ` · Qualité: ${cur.qualityPercent}%` : ""}</div>
    {cur.blogUrl && <div style={{ color:"#f97316", fontSize: 8 }}>📖 Blog: <a href={cur.blogUrl} target="_blank" rel="noopener" style={{ color:"#f97316" }}>{cur.blogUrl.replace("https://travito.ma","")}</a></div>}
    {!cur.blogUrl && cur.content && (
      <button
        onClick={async () => {
          addLog(`📝 Retry A4 publication blog...`);
          try {
            const titleMatch = cur.content.match(/^#\s+(.+)$/m) || cur.content.match(/^(.+)$/m);
            const blogTitle = titleMatch ? titleMatch[1].trim() : (cur.topic || "Article Travito");
            const blogSlug = generateSlug(blogTitle);
            const wp = await postToWordPress(blogTitle, cur.content, blogSlug);
            onArticleReady?.({ ...cur, blogUrl: wp.url, blogId: wp.id });
            addLog(`✅ Blog publié: ${wp.url}`, "success");
          } catch (e) {
            addLog(`⚠️ Retry échoué: ${e.message}`, "error");
          }
        }}
        style={{ fontSize: 8, padding: "3px 8px", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 5, color: "#f97316", cursor: "pointer", marginTop: 2, width: "fit-content", fontWeight: 700 }}
      >
        📝 Republier sur le blog
      </button>
    )}
  </div>
)}
              {cur.status === "failed" && <div style={{ color: C.red, fontSize: 9 }}>❌ {cur.error}</div>}
              {!cur.content && !running && (
                <button onClick={() => { const t = rotation.topics.find(t => t.day === cur.day); if (t) runPipeline(t); }}
                  style={{ padding: "8px 16px", background: `linear-gradient(135deg,${rotation.color},${rotation.color}88)`, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                  🚀 Lancer Pipeline
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: 36 }}>🚀</div>
            {activeDayLabel
              ? <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>{activeDayLabel} — Aucun article cette semaine</div>
              : <div style={{ fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.8 }}>
                  Pipeline: A1 → A2 → A3 (X) → A4 (Blog)<br />
                  📝 08:00 UTC · 🚀 Publication immédiate<br />
                  📊 Qualité suivie · 📖 Blog auto-publié<br />
                  📧 Rapport: 21:00 UTC
                </div>
            }
            {!running && (() => {
              const launchDay = activeDayLabel
                ? rotation.topics.find(t => t.day === activeDayLabel)
                : today;
              return launchDay ? (
                <button onClick={() => runPipeline(launchDay)}
                  style={{ fontSize: 11, padding: "9px 20px", background: `${rotation.color}15`, border: `1px solid ${rotation.color}55`, borderRadius: 8, color: rotation.color, cursor: "pointer", fontWeight: 700, marginTop: 6 }}>
                  🚀 Lancer — {launchDay.day}
                </button>
              ) : null;
            })()}
            {running && <div style={{ color: C.amber, fontSize: 10, display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: C.amber, animation: "pulse 1s infinite" }} />Pipeline en cours...</div>}
          </div>
        ))}
      </div>
    </div>
  );
}