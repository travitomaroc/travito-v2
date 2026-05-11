// ================================================================
//  youtubeConfig.js — Shared YouTube Manager Configuration
//  Agents, voices, weekly slots, automation toggles
// ================================================================

export const DEFAULT_AGENT_PROMPT = (agent) =>
  "Tu es un expert contenu YouTube Shorts specialise en " + agent.name + " pour le marche marocain (travito.ma). " +
  "Cible: audience marocaine 18-40 ans, francophone, urbaine. " +
  "Priorite: contenu ancre dans la realite quotidienne marocaine, visualisable avec des clips stock, " +
  "format court punchy, hook fort dans les 3 premieres secondes. " +
  "Evite: generalites non-marocaines, sujets abstraits, contenu difficile a illustrer.";

export const DEFAULT_AGENTS = [
  {
    id: "facts",
    name: "Morocco Facts & Identity",
    icon: "🇲🇦",
    color: "#10b981",
    enabled: true,
    lang: "fr",
    durationRange: [35, 50],
    voiceIdFR: "",
    voiceIdAR: "",
    voiceIdEN: "",
    description: "Faits, culture, identite marocaine",
    customPrompt: "",
    customBiblePrompt: "",
  },
  {
    id: "consumer",
    name: "Smart Life & Consumer",
    icon: "🛡️",
    color: "#1DA1F2",
    enabled: true,
    lang: "fr",
    durationRange: [40, 60],
    voiceIdFR: "",
    voiceIdAR: "",
    voiceIdEN: "",
    description: "Conseils consommateur, vie intelligente",
    customPrompt: "",
    customBiblePrompt: "",
  },
  {
    id: "skills",
    name: "Skills & Life Hacks",
    icon: "🎓",
    color: "#8b5cf6",
    enabled: true,
    lang: "fr",
    durationRange: [35, 55],
    voiceIdFR: "",
    voiceIdAR: "",
    voiceIdEN: "",
    description: "Competences pratiques, astuces quotidiennes",
    customPrompt: "",
    customBiblePrompt: "",
  },
  {
    id: "top",
    name: "Top & Rankings",
    icon: "🏆",
    color: "#f59e0b",
    enabled: true,
    lang: "fr",
    durationRange: [45, 60],
    voiceIdFR: "",
    voiceIdAR: "",
    voiceIdEN: "",
    description: "Classements, tops, comparaisons",
    customPrompt: "",
    customBiblePrompt: "",
  },
  {
    id: "opps",
    name: "Opportunities & Business",
    icon: "💡",
    color: "#ef4444",
    enabled: true,
    lang: "fr",
    durationRange: [40, 60],
    voiceIdFR: "",
    voiceIdAR: "",
    voiceIdEN: "",
    description: "Business, opportunites, entrepreneuriat",
    customPrompt: "",
    customBiblePrompt: "",
  },
];

export const DEFAULT_WEEKLY_SLOTS = [
  { day: "Lundi",    dow: 1, enabled: true,  agentId: "facts",    mode: "auto" },
  { day: "Mardi",    dow: 2, enabled: true,  agentId: "consumer", mode: "auto" },
  { day: "Mercredi", dow: 3, enabled: true,  agentId: "skills",   mode: "auto" },
  { day: "Jeudi",    dow: 4, enabled: true,  agentId: "top",      mode: "auto" },
  { day: "Vendredi", dow: 5, enabled: true,  agentId: "opps",     mode: "auto" },
  { day: "Samedi",   dow: 6, enabled: false, agentId: null,       mode: "manual" },
  { day: "Dimanche", dow: 0, enabled: false, agentId: null,       mode: "manual" },
];

export const DEFAULT_AUTOMATION = {
  autoGenerateIdeas:   false,
  autoGenerateBible:   false,
  autoGenerateVideo:   false,
  autoPublishYoutube:  false,
  autoApproveTopIdea:  false,
  // QC Agent config
  qcEnabled:           true,
  qcThreshold:         60,   // % minimum to pass
  qcMaxRetriesPerDay:  3,    // max regenerations per agent per day
};

export const SUPPORTED_LANGUAGES = ["fr", "en", "ar"];

export const IDEA_STATUSES = [
  "generated", "selected", "approved", "queued", "rendering",
  "rendered", "scheduled", "published", "parked", "failed", "regeneration_requested"
];

export const STATUS_STYLE = {
  generated:  { bg: "rgba(107,96,80,0.15)",  color: "#6b6050", label: "Generee"      },
  selected:   { bg: "rgba(212,175,55,0.15)", color: "#D4AF37", label: "Selectee"     },
  approved:   { bg: "rgba(29,161,242,0.15)", color: "#1DA1F2", label: "Approuvee"    },
  queued:     { bg: "rgba(20,184,166,0.15)", color: "#14b8a6", label: "En queue"     },
  rendering:  { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Rendu..."     },
  rendered:   { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Rendu"        },
  scheduled:  { bg: "rgba(29,161,242,0.15)", color: "#1DA1F2", label: "Programme"    },
  published:  { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Publiee"      },
  parked:     { bg: "rgba(107,96,80,0.15)",  color: "#6b6050", label: "Parkee"       },
  failed:     { bg: "rgba(239,68,68,0.15)",  color: "#ef4444", label: "Echec"        },
  regeneration_requested: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "A regenerer" },
};

export const C = {
  bg:     "rgba(12,18,35,0.95)",
  card:   "rgba(20,28,48,0.9)",
  border: "rgba(212,175,55,0.18)",
  gold:   "#D4AF37",
  text:   "#e8dcc8",
  muted:  "#6b6050",
  green:  "#10b981",
  red:    "#ef4444",
  blue:   "#1DA1F2",
  amber:  "#f59e0b",
  purple: "#8b5cf6",
  teal:   "#14b8a6",
};

export const IDEAS_PER_DAY       = 5;
export const PARK_DAYS           = 30;
export const DUPLICATE_WINDOW_DAYS = 30;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const getWeekKey = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
  const iso = d.toISOString().split("T")[0];
  return "W-" + iso;
};

export const todayAgentIdFromSlots = (slots) => {
  const dow = new Date().getDay();
  const slot = (slots || DEFAULT_WEEKLY_SLOTS).find(s => s.dow === dow && s.enabled);
  return slot?.agentId || null;
};
