// ================================================================
//  TRAVITO MAROC — SHARED AGENT CONFIG
// ================================================================

export const BRAND = {
  name:    "Travito Maroc",
  site:    "https://travito.ma",
  email:   "travito.maroc@gmail.com",
  x:       "@TravitoMaroc",
  youtube: "@TravitoMaroc",
  tiktok:  "@TravitoMaroc",
};

export const MONTHLY_ROTATION = {
  1: {
    theme: "Immobilier", icon: "🏠", color: "#f59e0b",
    topics: [
      { day:"Lundi",    icon:"🏙️", label:"Prix immobilier par ville",      comparison:"Casablanca vs Rabat" },
      { day:"Mardi",    icon:"🏗️", label:"Nouveaux projets & promoteurs",  comparison:"Casablanca vs Marrakech" },
      { day:"Mercredi", icon:"🔑", label:"Marché locatif",                 comparison:"Casablanca vs Tanger" },
      { day:"Jeudi",    icon:"📈", label:"Tendances achat/vente",          comparison:"Casablanca vs Agadir" },
      { day:"Vendredi", icon:"⚖️", label:"Réglementation immobilière",     comparison:null },
    ],
  },
  2: {
    theme: "Automobile", icon: "🚗", color: "#3b82f6",
    topics: [
      { day:"Lundi",    icon:"💰", label:"Prix véhicules neufs au Maroc",      comparison:null },
      { day:"Mardi",    icon:"🔄", label:"Marché occasion — meilleures deals", comparison:null },
      { day:"Mercredi", icon:"⚡", label:"Véhicules électriques & hybrides",   comparison:null },
      { day:"Jeudi",    icon:"🏆", label:"Top marques vendues au Maroc",       comparison:null },
      { day:"Vendredi", icon:"📋", label:"Conseils achat/vente auto",          comparison:null },
    ],
  },
  3: {
    theme: "Emploi", icon: "💼", color: "#10b981",
    topics: [
      { day:"Lundi",    icon:"📊", label:"Tendances recrutement Maroc 2025",    comparison:null },
      { day:"Mardi",    icon:"💡", label:"Secteurs porteurs & opportunités",    comparison:null },
      { day:"Mercredi", icon:"🌍", label:"Télétravail & emplois internationaux",comparison:null },
      { day:"Jeudi",    icon:"🎓", label:"Formation & compétences demandées",   comparison:null },
      { day:"Vendredi", icon:"💰", label:"Salaires & négociation au Maroc",     comparison:null },
    ],
  },
  4: {
    theme: "Lifestyle", icon: "🎭", color: "#8b5cf6",
    topics: [
      { day:"Lundi",    icon:"⚽", label:"Sport & fitness au Maroc",           comparison:null },
      { day:"Mardi",    icon:"🎵", label:"Musique & culture marocaine",         comparison:null },
      { day:"Mercredi", icon:"🐾", label:"Animaux de compagnie — marché Maroc", comparison:null },
      { day:"Jeudi",    icon:"🥗", label:"Santé & bien-être tendances",         comparison:null },
      { day:"Vendredi", icon:"🍽️", label:"Food & restaurants — découvertes",   comparison:null },
    ],
  },
};

// Auto-generate at 08:00 UTC, daily summary email at 21:00 UTC
export const AUTO_GENERATE_HOUR  = 8;
export const DAILY_SUMMARY_HOUR  = 21;
export const MAX_CONTROLLER_ATTEMPTS = 5;
export const CONTROLLER_PASS_SCORE   = 70; // Pass threshold (was 80, lowered to 70)

export const POST_TIMES = [
  { hour:7,  minute:30, lang:"en", label:"English — Morning" },
  { hour:18, minute:30, lang:"fr", label:"French — Evening" },
  { hour:20, minute:0,  lang:"ar", label:"Arabic — Prime time" },
];

export const HASHTAGS = {
  base:       ["#TravitoMaroc","#Maroc","#Morocco"],
  immobilier: ["#Immobilier","#MarocImmo","#عقارات_المغرب"],
  automobile: ["#AutoMaroc","#VoitureMaroc","#سيارات_المغرب"],
  emploi:     ["#EmploiMaroc","#RecrutementMaroc","#وظائف_المغرب"],
  lifestyle:  ["#LifestyleMaroc","#MarocLife"],
  cities:     ["#Casablanca","#Rabat","#Marrakech","#Tanger","#Agadir"],
};

export const getHashtags = (theme) => {
  const map = {
    "Immobilier": [...HASHTAGS.base,...HASHTAGS.immobilier,...HASHTAGS.cities.slice(0,3)],
    "Automobile": [...HASHTAGS.base,...HASHTAGS.automobile],
    "Emploi":     [...HASHTAGS.base,...HASHTAGS.emploi],
    "Lifestyle":  [...HASHTAGS.base,...HASHTAGS.lifestyle],
  };
  return (map[theme]||HASHTAGS.base).join(" ");
};

export const SOURCE_PHRASES = [
  "selon des sources officielles",
  "d'après les données du marché",
  "les observateurs du secteur notent",
  "selon les tendances confirmées",
  "des chiffres récents indiquent",
  "le secteur enregistre",
];

export const DISCLAIMER =
  "📌 Cet article est à titre informatif uniquement. " +
  "Les données sont indicatives. Consultez un professionnel pour tout conseil personnalisé.";

export const getWeekOfMonth   = () => Math.ceil(new Date().getDate() / 7);
export const getCurrentRotation = () => MONTHLY_ROTATION[getWeekOfMonth()]||MONTHLY_ROTATION[1];
export const getTodayTopic = () => {
  const d = new Date().getUTCDay();
  if (d===0||d===6) return null;
  const r = getCurrentRotation();
  return { ...r.topics[d-1], theme:r.theme, themeIcon:r.icon, color:r.color };
};

export const callClaude = async (system, user, history=[]) => {
  const isProduction = !window.location.hostname.includes("stackblitz") &&
                       !window.location.hostname.includes("webcontainer") &&
                       window.location.hostname !== "localhost";
  const url = isProduction ? "/api/claude" : "https://api.anthropic.com/v1/messages";
  const res = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      model:"claude-sonnet-4-5",
      max_tokens:1500,
      system,
      messages:[...history,{ role:"user", content:user }],
    }),
  });
  const d = await res.json();
  return d.content?.map(b=>b.text||"").join("\n")||"Erreur.";
};

// ================================================================
//  DYNAMIC CONFIG — Loads live updates from Vercel KV
//  Updated monthly by self-improve.js
// ================================================================

// Cache dynamic config in memory for current session
let _dynamicConfig = null;
let _dynamicConfigLoadedAt = null;

export const getDynamicConfig = async () => {
  // Use cached config if loaded less than 1 hour ago
  const now = Date.now();
  if (_dynamicConfig && _dynamicConfigLoadedAt && (now - _dynamicConfigLoadedAt) < 3600000) {
    return _dynamicConfig;
  }
  try {
    const r = await fetch("/api/kv");
    const d = await r.json();
    if (d.success && d.config) {
      _dynamicConfig = d.config;
      _dynamicConfigLoadedAt = now;
      console.log("Dynamic config loaded:", d.config.month);
      return d.config;
    }
  } catch (e) {
    console.log("Dynamic config unavailable, using static defaults");
  }
  return null;
};

// Get topics — dynamic if available, static as fallback
export const getDynamicTopics = async (theme) => {
  const config = await getDynamicConfig();
  if (config?.dynamicRotation?.[theme]?.length > 0) {
    return config.dynamicRotation[theme];
  }
  // Fallback to static rotation
  const rotation = getCurrentRotation();
  return rotation?.topics || [];
};

// Get hashtags — dynamic if available, static as fallback
export const getDynamicHashtags = async (theme) => {
  const config = await getDynamicConfig();
  if (config?.trendingHashtags?.length > 0) {
    const themeHashtags = config.trendingHashtags
      .filter(h => h.category === theme || h.category === "all")
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(h => h.tag);
    if (themeHashtags.length > 0) return themeHashtags.join(" ");
  }
  // Fallback to static hashtags
  return getHashtags(theme);
};

// Get prompt improvements if available
export const getPromptImprovements = async () => {
  const config = await getDynamicConfig();
  return config?.promptImprovements?.improvements || [];
};

// Save article performance to KV via API
export const saveArticlePerformance = async (article) => {
  try {
    await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic:          article.topic,
        theme:          article.theme,
        qualityPercent: article.qualityPercent,
        status:         article.status,
        postedAt:       article.postedAt,
        weekKey:        article.weekKey,
      }),
    });
  } catch (e) {
    console.log("Performance save skipped:", e.message);
  }
};
