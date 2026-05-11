// ================================================================
//  NETWORK ENGAGER — X Twitter Engagement Agent
//  Discovery via Lists, Bookmarks, Mentions, Timeline (free tier)
//  Hard limits: 3 likes/day, 2 follows/day, 1 repost/day, 1 poll/week
// ================================================================
import { useState, useEffect } from "react";
import { BRAND, callClaude } from "../../config/agentConfig";

// ── ISO week helpers ──────────────────────────────────────────
const getISOWeek = (d=new Date()) => {
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const y=new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return `W${String(Math.ceil((((date-y)/86400000)+1)/7)).padStart(2,"0")}-${date.getUTCFullYear()}`;
};
const getISOWeeksList = (n=16) => {
  const weeks=[],today=new Date();
  for(let i=0;i<n;i++){const d=new Date(today);d.setDate(d.getDate()-i*7);weeks.push(getISOWeek(d));}
  return weeks;
};

// ── STARTER HASHTAGS ─────────────────────────────────────────
const STARTER_HASHTAGS = [
  // Morocco Discovery
  { id:1,  tag:"#Maroc",           type:"broad",   lang:"MULTI", category:"all",        active:true,  priority:1, score:0 },
  { id:2,  tag:"#Morocco",         type:"broad",   lang:"EN",    category:"all",        active:true,  priority:1, score:0 },
  { id:3,  tag:"#المغرب",          type:"broad",   lang:"AR",    category:"all",        active:true,  priority:1, score:0 },
  { id:4,  tag:"#Casablanca",      type:"city",    lang:"MULTI", category:"all",        active:true,  priority:2, score:0 },
  { id:5,  tag:"#Rabat",           type:"city",    lang:"MULTI", category:"all",        active:true,  priority:2, score:0 },
  { id:6,  tag:"#Marrakech",       type:"city",    lang:"MULTI", category:"all",        active:true,  priority:2, score:0 },
  { id:7,  tag:"#Tanger",          type:"city",    lang:"MULTI", category:"all",        active:true,  priority:2, score:0 },
  { id:8,  tag:"#Agadir",          type:"city",    lang:"MULTI", category:"all",        active:true,  priority:2, score:0 },
  // Emploi
  { id:9,  tag:"#EmploiMaroc",     type:"niche",   lang:"FR",    category:"Emploi",     active:true,  priority:1, score:0 },
  { id:10, tag:"#RecrutementMaroc",type:"niche",   lang:"FR",    category:"Emploi",     active:true,  priority:1, score:0 },
  { id:11, tag:"#FormationMaroc",  type:"niche",   lang:"FR",    category:"Emploi",     active:true,  priority:2, score:0 },
  { id:12, tag:"#JobMaroc",        type:"niche",   lang:"EN",    category:"Emploi",     active:true,  priority:2, score:0 },
  { id:13, tag:"#وظائف_المغرب",    type:"niche",   lang:"AR",    category:"Emploi",     active:true,  priority:1, score:0 },
  // Immobilier
  { id:14, tag:"#ImmoMaroc",       type:"niche",   lang:"FR",    category:"Immobilier", active:true,  priority:1, score:0 },
  { id:15, tag:"#ImmobilierMaroc", type:"niche",   lang:"FR",    category:"Immobilier", active:true,  priority:1, score:0 },
  { id:16, tag:"#LocationMaroc",   type:"niche",   lang:"FR",    category:"Immobilier", active:true,  priority:2, score:0 },
  { id:17, tag:"#عقارات_المغرب",   type:"niche",   lang:"AR",    category:"Immobilier", active:true,  priority:1, score:0 },
  // Auto
  { id:18, tag:"#AutoMaroc",       type:"niche",   lang:"FR",    category:"Auto",       active:true,  priority:1, score:0 },
  { id:19, tag:"#VoitureMaroc",    type:"niche",   lang:"FR",    category:"Auto",       active:true,  priority:2, score:0 },
  { id:20, tag:"#سيارات_المغرب",   type:"niche",   lang:"AR",    category:"Auto",       active:true,  priority:1, score:0 },
  // Tech
  { id:21, tag:"#HighTechMaroc",   type:"niche",   lang:"FR",    category:"Tech",       active:true,  priority:2, score:0 },
  { id:22, tag:"#InformatiqueMaroc",type:"niche",  lang:"FR",    category:"Tech",       active:true,  priority:2, score:0 },
  // Services
  { id:23, tag:"#ServicesMaroc",   type:"niche",   lang:"FR",    category:"Services",   active:true,  priority:2, score:0 },
  { id:24, tag:"#MarocBusiness",   type:"broad",   lang:"FR",    category:"Services",   active:true,  priority:2, score:0 },
  // Marketplace
  { id:25, tag:"#TravitoMaroc",    type:"brand",   lang:"MULTI", category:"all",        active:true,  priority:1, score:0 },
  { id:26, tag:"#AnnoncesMaroc",   type:"broad",   lang:"FR",    category:"all",        active:true,  priority:2, score:0 },
  { id:27, tag:"#SportMaroc",      type:"niche",   lang:"FR",    category:"Sport",      active:true,  priority:2, score:0 },
  { id:28, tag:"#FoodMaroc",       type:"niche",   lang:"FR",    category:"Food",       active:true,  priority:2, score:0 },
  { id:29, tag:"#ModeMaroc",       type:"niche",   lang:"FR",    category:"Mode",       active:true,  priority:2, score:0 },
  { id:30, tag:"#AnimauxMaroc",    type:"niche",   lang:"FR",    category:"Animaux",    active:true,  priority:2, score:0 },
];

const STARTER_ACCOUNTS = [
  { id:1, handle:"@jobedge",       label:"partner",     category:"Emploi",     trusted:true,  active:true  },
  { id:2, handle:"@EmploiM",       label:"competitor",  category:"Emploi",     trusted:true,  active:true  },
  { id:3, handle:"@JdidJob",       label:"marketplace", category:"Emploi",     trusted:true,  active:true  },
  { id:4, handle:"@Mubawab_Maroc", label:"competitor",  category:"Immobilier", trusted:true,  active:true  },
  { id:5, handle:"@AvitoMaroc",    label:"competitor",  category:"all",        trusted:true,  active:true  },
  { id:6, handle:"@ANAPEC_Maroc",  label:"media",       category:"Emploi",     trusted:true,  active:true  },
];

const DEFAULT_CATEGORIES = [
  "all","Emploi","Immobilier","Auto","Tech","Services","Sport",
  "Food","Mode","Animaux","Musique","Maison","Santé","Loisirs",
];

const WEEKLY_POLLS = [
  { q:"Où préférez-vous vivre au Maroc?",       opts:["Casablanca","Rabat","Marrakech","Agadir"] },
  { q:"Acheter ou louer en 2026?",              opts:["Acheter","Louer","Ça dépend","Pas encore décidé"] },
  { q:"Appartement ou villa?",                  opts:["Appartement","Villa","Riad","Peu importe"] },
  { q:"Voiture neuve ou occasion?",             opts:["Neuve","Occasion","Leasing","Pas de voiture"] },
  { q:"Télétravail ou bureau?",                 opts:["100% télétravail","Bureau","Hybride","Freelance"] },
  { q:"Meilleure ville business au Maroc?",     opts:["Casablanca","Rabat","Tanger","Marrakech"] },
  { q:"Votre budget loyer mensuel à Casa?",     opts:["<3000 MAD","3-6000 MAD","6-10000 MAD",">10000 MAD"] },
  { q:"Réseau préféré pour chercher un emploi?",opts:["LinkedIn","Rekrute","Indeed","Bouche à oreille"] },
];

const DAILY_LIMITS = { likes:4, follows:1, reposts:3, replies:2, unfollowPerDay:2, pollsPerWeek:1 };

const SAFETY_BLOCKED = ["politique","religion","violence","haine","adulte","arnaque","gambling","toxique"];

// ── SCORING ENGINE ────────────────────────────────────────────
const scorePost = (post, hashtags, accounts) => {
  let score = 0;
  const text = (post.text || "").toLowerCase();

  // Morocco relevance
  if (text.includes("maroc") || text.includes("morocco") || text.includes("المغرب")) score += 30;
  ["casablanca","rabat","marrakech","tanger","agadir"].forEach(c => { if(text.includes(c)) score += 10; });

  // Hashtag match
  hashtags.filter(h=>h.active).forEach(h => { if(text.includes(h.tag.toLowerCase())) score += 15; });

  // Trusted account
  if(accounts.find(a=>a.trusted && a.active && text.includes(a.handle.toLowerCase()))) score += 20;

  // Safety check
  if(SAFETY_BLOCKED.some(w=>text.includes(w))) score = -100;

  // Recency bonus (if post has timestamp)
  if(post.age_minutes && post.age_minutes < 60) score += 10;

  return Math.min(100, Math.max(0, score));
};

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function NetworkEngager({ xKeys={} }) {
  const [tab, setTab]               = useState("overview");
  const [hashtags, setHashtags]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("ne_hashtags") || "null") || STARTER_HASHTAGS; } catch { return STARTER_HASHTAGS; }
  });
  const [accounts, setAccounts]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("ne_accounts") || "null") || STARTER_ACCOUNTS; } catch { return STARTER_ACCOUNTS; }
  });
  const [activityLog, setActivityLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ne_log") || "[]"); } catch { return []; }
  });
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ne_settings") || "null") || {
      autoRun: false, runHour: 9, safetyThreshold: 60,
      langFR: true, langAR: true, langEN: true,
      approvalMode: false, simulationMode: false,
      limits: { likes: 4, follows: 1, reposts: 3, replies: 2, unfollowPerDay: 2, pollsPerWeek: 1 },
      pollDuration: 1440,
    }; } catch { return { autoRun:false, runHour:9, safetyThreshold:60, langFR:true, langAR:true, langEN:true, approvalMode:false, simulationMode:false, limits:{ likes:3, follows:2, reposts:1, pollsPerWeek:1 } }; }
  });
  const [polls, setPolls]           = useState([]);
  const [pollsLoaded, setPollsLoaded] = useState(false);
  const [pollLibrary, setPollLibrary] = useState(() => {
    try { const s=localStorage.getItem("ne_poll_library"); if(s) return JSON.parse(s); } catch {}
    return [
      {id:"d0",q:"Où préférez-vous vivre au Maroc?",       opts:["Casablanca","Rabat","Marrakech","Agadir"],            status:"active",source:"default"},
      {id:"d1",q:"Acheter ou louer en 2026?",              opts:["Acheter","Louer","Ça dépend","Pas encore décidé"],    status:"active",source:"default"},
      {id:"d2",q:"Appartement ou villa?",                  opts:["Appartement","Villa","Riad","Peu importe"],           status:"active",source:"default"},
      {id:"d3",q:"Voiture neuve ou occasion?",             opts:["Neuve","Occasion","Leasing","Pas de voiture"],        status:"active",source:"default"},
      {id:"d4",q:"Télétravail ou bureau?",                 opts:["100% télétravail","Bureau","Hybride","Freelance"],    status:"active",source:"default"},
      {id:"d5",q:"Meilleure ville business au Maroc?",     opts:["Casablanca","Rabat","Tanger","Marrakech"],            status:"active",source:"default"},
      {id:"d6",q:"Votre budget loyer mensuel à Casa?",     opts:["<3000 MAD","3-6000 MAD","6-10000 MAD",">10000 MAD"], status:"active",source:"default"},
      {id:"d7",q:"Réseau préféré pour chercher un emploi?",opts:["LinkedIn","Rekrute","Indeed","Bouche à oreille"],     status:"active",source:"default"},
    ];
  });
  const [libraryFilter,   setLibraryFilter]   = useState("active");
  const [refreshingPolls, setRefreshingPolls] = useState(false);
  const [filterWeekFrom, setFilterWeekFrom] = useState(()=>getISOWeek(new Date()));
  const [filterWeekTo,   setFilterWeekTo]   = useState("");
  const [quotas, setQuotas]         = useState({ likes:0, follows:0, reposts:0, date:"" });
  const [running, setRunning]       = useState(false);
  const [forbidden, setForbidden]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("ne_forbidden")||"null") || [
      "war","guerre","weapon","missile","bomb","explosion","strike","attack",
      "military","army","soldier","drone","tank","israel","palestine","gaza",
      "ukraine","russia","nato","iron dome","hezbollah","hamas","isis","terroris",
      "killed","mort","dead","victim","massacre","genocide","shooting","financial times","apartheid",
    ]; } catch { return []; }
  });
  const [newForbidden, setNewForbidden] = useState("");
  const [categories, setCategories]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("ne_categories")||"null") || DEFAULT_CATEGORIES; }
    catch { return DEFAULT_CATEGORIES; }
  });
  const [newCategory, setNewCategory] = useState("");
  const [refreshingHashtags, setRefreshingHashtags] = useState(false);
  const [log, setLog]               = useState([]);

  // Hashtag editor state
  const [editingHash, setEditingHash] = useState(null);
  const [newHash, setNewHash]         = useState({ tag:"", type:"niche", lang:"FR", category:"all", priority:2 });
  const [showAddHash, setShowAddHash] = useState(false);

  // Account editor state
  const [newAccount, setNewAccount]   = useState({ handle:"", label:"partner", category:"all" });
  const [showAddAcc, setShowAddAcc]   = useState(false);

  // Poll state
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [pollSchedule, setPollSchedule] = useState("");

  const C = {
    bg:"rgba(12,18,35,0.95)", border:"rgba(29,161,242,0.2)", blue:"#1DA1F2",
    gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050", green:"#10b981",
    red:"#ef4444", amber:"#f59e0b", purple:"#8b5cf6",
  };

  // Reset quotas daily
  useEffect(() => {
    const today = new Date().toDateString();
    const todayISO = new Date().toISOString().split("T")[0];
    // Load real quota from KV (includes cron + curl runs)
    fetch("/api/kv?key=travito:ne_quota")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config && d.config.date === todayISO) {
          setQuotas({ likes: d.config.likes||0, follows: d.config.follows||0, reposts: d.config.reposts||0, replies: d.config.replies||0, unfollows: d.config.unfollows||0, date: today });
        } else {
          // No KV quota for today — reset
          if (quotas.date !== today) setQuotas({ likes:0, follows:0, reposts:0, replies:0, unfollows:0, date:today });
        }
      })
      .catch(() => {
        if (quotas.date !== today) setQuotas({ likes:0, follows:0, reposts:0, replies:0, unfollows:0, date:today });
      });
    // Also load week quota for polls
    // Load KV hashtag list (auto-generated weekly by cron)
    fetch("/api/kv?key=travito:ne_hashtag_list")
      .then(r=>r.json())
      .then(d=>{
        if(d.success && d.config && Array.isArray(d.config) && d.config.length > 0) {
          setHashtags(prev => {
            const existingTags = new Set(prev.map(h=>h.tag.toLowerCase()));
            const newOnes = d.config.filter(h=>h.tag && !existingTags.has(h.tag.toLowerCase()));
            if(newOnes.length > 0) {
              addLog(newOnes.length+" nouveaux hashtags chargés depuis KV", "success");
              return [...prev, ...newOnes];
            }
            return prev;
          });
        }
      }).catch(()=>{});

    // Load real activity log from KV (cron actions)
    fetch("/api/kv?key=travito:ne_activity_log")
      .then(r=>r.json())
      .then(d=>{
        let configData = d.config;
        if (typeof configData === "string") { try { configData = JSON.parse(configData); } catch {} }
        if(d.success && configData && Array.isArray(configData)) {
          const kvActs = configData.slice(0,200).map(e=>({
            id: (e.ts||"")+e.action,
            timestamp: e.ts,
            action: e.action,
            target: e.target||"",
            score: 100,
            reason: "cron automatique",
            executed: true,
            safetyOk: true,
            quota: {},
            simulation: false,
            source: e.source||"cron",
          }));
          setActivityLog(prev=>{
            const existingIds = new Set(prev.map(a=>a.id));
            const newOnes = kvActs.filter(a=>!existingIds.has(a.id));
            if(newOnes.length>0) addLog(newOnes.length+" actions chargees depuis KV", "success");
            return [...newOnes, ...prev].slice(0,400);
          });
        }
      }).catch(()=>{});

    // Load AI-discovered accounts from KV
    fetch("/api/kv?key=travito:ne_accounts")
      .then(r=>r.json())
      .then(d=>{
        if(d.success && d.config && Array.isArray(d.config) && d.config.length>0) {
          setAccounts(prev=>{
            const existingHandles = new Set(prev.map(a=>(a.handle||"").toLowerCase()));
            const newOnes = d.config.filter(a=>a.handle&&!existingHandles.has(a.handle.toLowerCase()));
            if(newOnes.length>0) addLog(newOnes.length+" comptes IA charges depuis KV","success");
            return [...prev,...newOnes];
          });
        }
      }).catch(()=>{});

    // Load hashtag performance
    fetch("/api/kv?key=travito:ne_hashtag_perf")
      .then(r=>r.json())
      .then(d=>{
        if(d.success && d.config) {
          // Update hashtag scores from performance data
          setHashtags(prev => prev.map(h => {
            const perf = d.config[h.tag];
            if (!perf) return h;
            const score = perf.searches > 0 ? Math.round((perf.liked / perf.searches) * 10) : 0;
            return { ...h, score };
          }));
        }
      }).catch(()=>{});

    fetch("/api/kv?key=travito:ne_week_quota")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config) {
          // Use ISO week to match engage.js
          const now = new Date();
          const d1 = new Date(now.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((now - d1) / 86400000 + d1.getDay() + 1) / 7);
          const weekStr = now.getFullYear()+"-W"+String(weekNum).padStart(2,"0");
          if (d.config.week === weekStr && d.config.polls !== undefined) {
            setQuotas(prev => ({ ...prev, weekPolls: d.config.polls || 0 }));
          }
        }
      }).catch(() => {});
  }, []);

  // Persist data
  useEffect(() => { localStorage.setItem("ne_hashtags", JSON.stringify(hashtags)); }, [hashtags]);
  // Restore from KV on mount if localStorage empty (new device)
  useEffect(() => {
    const hasForbidden = localStorage.getItem("ne_forbidden");
    const hasCategories = localStorage.getItem("ne_categories");
    if (!hasForbidden || !hasCategories) {
      fetch("/api/kv?key=travito:ne_settings").then(r=>r.json()).then(d=>{
        const s = d.config || {};
        if (!hasForbidden && Array.isArray(s.forbidden) && s.forbidden.length > 0)
          setForbidden(s.forbidden);
        if (!hasCategories && Array.isArray(s.categories) && s.categories.length > 0)
          setCategories(s.categories);
      }).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem("ne_forbidden", JSON.stringify(forbidden));
    // Sync forbidden to ne_settings in KV
    fetch("/api/kv?key=travito:ne_settings").then(r=>r.json()).then(d=>{
      const s = d.config || {};
      s.forbidden = forbidden;
      fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:"travito:ne_settings",value:JSON.stringify(s)})}).catch(()=>{});
    }).catch(()=>{}); }, [forbidden]);
  useEffect(() => { localStorage.setItem("ne_categories", JSON.stringify(categories));
    fetch("/api/kv?key=travito:ne_settings").then(r=>r.json()).then(d=>{
      const s = d.config || {};
      s.categories = categories;
      fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:"travito:ne_settings",value:JSON.stringify(s)})}).catch(()=>{});
    }).catch(()=>{}); }, [categories]);
  // Restore from KV on mount if localStorage empty (new device)
  useEffect(() => {
    const hasForbidden = localStorage.getItem("ne_forbidden");
    const hasCategories = localStorage.getItem("ne_categories");
    if (!hasForbidden || !hasCategories) {
      fetch("/api/kv?key=travito:ne_settings").then(r=>r.json()).then(d=>{
        const s = d.config || {};
        if (!hasForbidden && Array.isArray(s.forbidden) && s.forbidden.length > 0)
          setForbidden(s.forbidden);
        if (!hasCategories && Array.isArray(s.categories) && s.categories.length > 0)
          setCategories(s.categories);
      }).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem("ne_forbidden", JSON.stringify(forbidden));
    // Sync forbidden to ne_settings in KV
    fetch("/api/kv?key=travito:ne_settings").then(r=>r.json()).then(d=>{
      const s = d.config || {};
      s.forbidden = forbidden;
      fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:"travito:ne_settings",value:JSON.stringify(s)})}).catch(()=>{});
    }).catch(()=>{}); }, [forbidden]);
  useEffect(() => { localStorage.setItem("ne_categories", JSON.stringify(categories));
    fetch("/api/kv?key=travito:ne_settings").then(r=>r.json()).then(d=>{
      const s = d.config || {};
      s.categories = categories;
      fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:"travito:ne_settings",value:JSON.stringify(s)})}).catch(()=>{});
    }).catch(()=>{}); }, [categories]);
  useEffect(() => {
    localStorage.setItem("ne_accounts", JSON.stringify(accounts));
    // Sync to KV so cron picks up changes
    fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:"travito:ne_accounts",value:JSON.stringify(accounts)})
    }).catch(()=>{});
  }, [accounts]);
  useEffect(() => { localStorage.setItem("ne_log", JSON.stringify(activityLog.slice(0,200))); }, [activityLog]);
  useEffect(() => { localStorage.setItem("ne_settings", JSON.stringify(settings)); }, [settings]);
  // Sync limits to KV for engage.js cron
  useEffect(()=>{
    const kvData = {
      limits: settings.limits || { likes:4, follows:1, reposts:3, replies:2, unfollowPerDay:2, pollsPerWeek:1 },
      hashtags: hashtags.filter(h=>h.active).map(h=>h.tag),
      targetAccounts: accounts.filter(a=>a.active&&a.trusted).map(a=>a.handle),
      safetyThreshold: settings.safetyThreshold || 60,
      pollDuration: settings.pollDuration || 1440,
      enabled: !settings.simulationMode,
      forbidden: forbidden,
      categories: categories.filter(c=>c!=="all"),
    };
    fetch("/api/kv", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:ne_settings", value: JSON.stringify(kvData) })
    }).catch(()=>{});
  },[settings, hashtags, accounts]);

  // pollLibrary KV persist + load
  useEffect(() => {
    localStorage.setItem("ne_poll_library", JSON.stringify(pollLibrary));
    fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:"travito:ne_poll_library",value:JSON.stringify(pollLibrary)})}).catch(()=>{});
  }, [pollLibrary]);
  useEffect(() => {
    fetch("/api/kv?key=travito:ne_poll_library")
      .then(r=>r.json()).then(d=>{
        if(d.success&&d.config&&Array.isArray(d.config)&&d.config.length>0){
          setPollLibrary(d.config);
          localStorage.setItem("ne_poll_library",JSON.stringify(d.config));
        }
      }).catch(()=>{});
  }, []);

  // Load polls from KV
  useEffect(() => {
    if (pollsLoaded) return;
    fetch(`/api/kv?key=${encodeURIComponent("travito:ne_polls")}`)
      .then(r=>r.json())
      .then(d=>{
        const raw = d.config;
        const arr = Array.isArray(raw) ? raw : [];
        setPolls(arr);
        setPollsLoaded(true);
      }).catch(()=>setPollsLoaded(true));
  }, [pollsLoaded]);
  // polls are loaded from KV on mount (see useEffect below)

  const addLog = (msg, type="info") => setLog(p=>[{msg,type,time:new Date().toLocaleTimeString("fr-MA")},...p.slice(0,99)]);

  // Auto-refresh hashtags daily from KV
  useEffect(() => {
    fetch("/api/kv?key=travito:ne_hashtags_updated")
      .then(r=>r.json())
      .then(d=>{
        if(d.success && d.config) {
          const lastUpdate = new Date(d.config.updatedAt||0);
          const hoursSince = (Date.now()-lastUpdate)/3600000;
          if(hoursSince > 20) {
            refreshHashtagsFromAI(false); // silent daily refresh
          }
        } else {
          refreshHashtagsFromAI(false); // first run
        }
      }).catch(()=>{});
  }, []);

  const refreshHashtagsFromAI = async (manual=true) => {
    if(refreshingHashtags) return;
    setRefreshingHashtags(true);
    if(manual) addLog("Actualisation hashtags via IA...", "auto");
    try {
      const activeCats = categories.filter(c=>c!=="all");
      const prompt = "Generate the best X (Twitter) hashtags for a Moroccan marketplace app (travito.ma) covering these categories: "
        + activeCats.join(", ")
        + ". For each category suggest 3-5 relevant hashtags in French, Arabic and English."
        + " Include city hashtags: Casablanca, Rabat, Marrakech, Tanger, Agadir."
        + " Return ONLY a JSON array: [{tag:'#HashTag',category:'Emploi',lang:'FR',type:'niche',priority:1}]"
        + " Priority 1=very relevant, 2=relevant. No markdown.";
      const raw = await callClaude("You suggest optimal Twitter hashtags for Moroccan marketplace. Return only JSON array.", prompt);
      const s = raw.indexOf("["), e = raw.lastIndexOf("]");
      if(s===-1) throw new Error("No JSON array");
      const suggestions = JSON.parse(raw.substring(s,e+1));
      // Merge with existing - add new ones, keep existing
      setHashtags(prev => {
        const existing = new Set(prev.map(h=>h.tag.toLowerCase()));
        const newOnes = suggestions
          .filter(s=>s.tag && !existing.has(s.tag.toLowerCase()))
          .map((s,i)=>({ id: Date.now()+i, tag:s.tag, type:s.type||"niche",
            lang:s.lang||"FR", category:s.category||"all",
            active:true, priority:s.priority||2, score:0 }));
        if(manual) addLog(newOnes.length+" nouveaux hashtags ajoutés", "success");
        return [...prev, ...newOnes];
      });
      // Save update timestamp
      fetch("/api/kv", {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:"travito:ne_hashtags_updated",value:JSON.stringify({updatedAt:new Date().toISOString()})})
      }).catch(()=>{});
    } catch(e) {
      if(manual) addLog("Erreur refresh hashtags: "+e.message, "error");
    }
    setRefreshingHashtags(false);
  };

  const logAction = (action, target, score, reason, executed, safetyOk) => {
    const entry = {
      id: Date.now(), timestamp: new Date().toISOString(),
      action, target, score, reason, executed, safetyOk,
      quota: { ...quotas }, simulation: settings.simulationMode,
    };
    setActivityLog(p=>[entry,...p.slice(0,199)]);
    addLog(`${executed?"✅":"⏭️"} ${action}: ${target} (score:${score}) — ${reason}`, executed?"success":"info");
  };

  // ── SIMULATION MODE ENGINE ─────────────────────────────────
  const runSimulation = async () => {
    setRunning(true);
    addLog(settings.simulationMode?"🧪 SIMULATION locale — aucun post reel":"🚀 Utilisez le bouton Run ci-dessus pour lancer le vrai cron");

    const today = new Date().toDateString();
    const todayQuotas = quotas.date === today ? quotas : { likes:0, follows:0, reposts:0, date:today };

    // Simulate discovered posts from followed accounts/lists
    const simulatedPosts = hashtags.filter(h=>h.active).slice(0,5).map((h,i) => ({
      id: `sim_${i}`, text: `Post sur ${h.tag} au Maroc — contenu pertinent pour Travito`,
      author: accounts[i % accounts.length]?.handle || "@unknown",
      age_minutes: Math.floor(Math.random() * 120),
    }));

    let likesUsed = todayQuotas.likes;
    let followsUsed = todayQuotas.follows;
    let repostsUsed = todayQuotas.reposts;

    for (const post of simulatedPosts) {
      const score = scorePost(post, hashtags, accounts);

      // Like logic
      if (likesUsed < DAILY_LIMITS.likes && score >= settings.safetyThreshold) {
        const executed = !settings.approvalMode && !settings.simulationMode;
        if (!settings.simulationMode) likesUsed++;
        logAction("LIKE", post.author, score, `Score ${score} >= seuil ${settings.safetyThreshold}`, executed || settings.simulationMode, true);
      } else if (score < settings.safetyThreshold) {
        logAction("LIKE", post.author, score, `Score ${score} < seuil ${settings.safetyThreshold}`, false, score >= 0);
      } else if (likesUsed >= DAILY_LIMITS.likes) {
        logAction("LIKE", post.author, score, `Quota likes atteint (${DAILY_LIMITS.likes}/jour)`, false, true);
        break;
      }
    }

    // Follow simulation
    const followCandidates = accounts.filter(a=>a.active&&a.trusted).slice(0,2);
    for (const acc of followCandidates) {
      if (followsUsed < DAILY_LIMITS.follows) {
        const executed = !settings.approvalMode && !settings.simulationMode;
        if (!settings.simulationMode) followsUsed++;
        logAction("FOLLOW", acc.handle, 80, `Compte de confiance — catégorie: ${acc.category}`, executed || settings.simulationMode, true);
      }
    }

    if (!settings.simulationMode) {
      setQuotas({ likes:likesUsed, follows:followsUsed, reposts:repostsUsed, date:today });
    }

    addLog(`${settings.simulationMode?"🧪 Simulation":"✅ Run"} terminé — ${likesUsed} likes, ${followsUsed} follows`, "success");
    setRunning(false);
  };

  // ── REFRESH POLL LIBRARY VIA AI ─────────────────────────
  const refreshPollLibrary = async (manual=true) => {
    if(refreshingPolls) return;
    setRefreshingPolls(true);
    if(manual) addLog("🗳️ Actualisation bibliothèque via IA...", "auto");
    try {
      const existingQs = pollLibrary.map(p=>p.q||p.question||"").filter(Boolean);
      const usedQs = polls.filter(p=>p.status==="published"||p.status==="posted")
        .sort((a,b)=>new Date(b.postedAt||0)-new Date(a.postedAt||0))
        .slice(0,20).map(p=>p.question||p.q||"").filter(Boolean);
      const r = await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({max_tokens:2000,
          system:"Tu génères des sondages X/Twitter pour Travito Maroc. Réponds UNIQUEMENT en JSON tableau valide, sans markdown.",
          messages:[{role:"user",content:
            "Génère 10 nouveaux sondages pour @TravitoMaroc en "+new Date().getFullYear()+"."
            +"\nEVITER (déjà en bibliothèque): "+existingQs.slice(0,20).join(" | ")
            +"\nEVITER (récemment postés): "+usedQs.join(" | ")
            +"\nThèmes: immobilier Maroc, auto, emploi, lifestyle, prix, villes, tendances."
            +"\nJSON: [{q:Question?,opts:[A,B,C,D]}]"}]})});
      const d = await r.json();
      const raw = (d.content||[]).map(b=>b.text||"").join("").trim();
      const s = raw.indexOf("["), e = raw.lastIndexOf("]");
      if(s===-1) throw new Error("No JSON array");
      const newPolls = JSON.parse(raw.substring(s,e+1));
      if(!Array.isArray(newPolls)||newPolls.length===0) throw new Error("Empty");
      const archived = pollLibrary.map(p=>p.status==="active"?{...p,status:"history",archivedAt:new Date().toISOString()}:p);
      const fresh = newPolls.map((p,i)=>({...p,id:"ai_"+Date.now()+"_"+i,status:"active",source:"ai",addedAt:new Date().toISOString()}));
      setPollLibrary([...fresh,...archived]);
      setSettings(prev=>({...prev,pollsLastRefreshed:new Date().toISOString()}));
      if(manual) addLog("✅ "+fresh.length+" nouveaux · "+archived.filter(p=>p.status==="history").length+" archivés","success");
    } catch(e){ if(manual) addLog("❌ Refresh: "+e.message,"error"); }
    setRefreshingPolls(false);
  };

  // ── GENERATE POLL VIA AI ───────────────────────────────────
  const generatePoll = async () => {
    addLog("🗳️ Génération sondage...");
    try {
      const src = selectedPoll || WEEKLY_POLLS[Math.floor(Math.random() * WEEKLY_POLLS.length)];
      const newPoll = {
        id: Date.now(),
        question: src.q || src.question,
        options:  src.opts || src.options,
        status:   pollSchedule ? "scheduled" : "draft",
        scheduled: pollSchedule || "",
        createdAt: new Date().toISOString(),
        isoWeek: (() => {
          const d = pollSchedule ? new Date(pollSchedule) : new Date();
          d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7);
          const w1=new Date(d.getFullYear(),0,4);
          const wk=1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7);
          return `W${String(wk).padStart(2,"0")}-${d.getFullYear()}`;
        })(),
        results: null, tweetId: null, tweetUrl: null,
      };
      const updated = [newPoll, ...polls];
      setPolls(updated);
      setSelectedPoll(newPoll);
      // Save to KV
      await fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ key:"travito:ne_polls", value:JSON.stringify(updated) }) });
      addLog(`✅ Sondage ${newPoll.status==="scheduled"?"planifié":"créé"}: "${newPoll.question}"`, "success");
    } catch(e) { addLog(`❌ Erreur: ${e.message}`, "error"); }
  };

  // ── WEEKLY REPORT ──────────────────────────────────────────
  const sendWeeklyReport = () => {
    const weekLogs = activityLog.filter(l => {
      const d = new Date(l.timestamp);
      const now = new Date();
      return (now - d) < 7 * 24 * 60 * 60 * 1000;
    });
    const executed = weekLogs.filter(l=>l.executed);
    const likes = executed.filter(l=>l.action==="LIKE").length;
    const follows = executed.filter(l=>l.action==="FOLLOW").length;
    const reposts = executed.filter(l=>l.action==="REPOST").length;
    const skipped = weekLogs.filter(l=>!l.executed).length;

    const sub = encodeURIComponent(`📊 [Travito] Rapport Network Engager — Semaine ${new Date().toLocaleDateString("fr-MA")}`);
    const body = encodeURIComponent(
`Rapport hebdomadaire Network Engager — @TravitoMaroc

ACTIONS EXÉCUTÉES:
✅ Likes: ${likes}/${DAILY_LIMITS.likes * 7} max
✅ Follows: ${follows}/${DAILY_LIMITS.follows * 7} max  
✅ Reposts: ${reposts}/${DAILY_LIMITS.pollsPerWeek * 7} max

ACTIONS IGNORÉES: ${skipped}

HASHTAGS ACTIFS: ${hashtags.filter(h=>h.active).length}/${hashtags.length}
COMPTES DE CONFIANCE: ${accounts.filter(a=>a.trusted&&a.active).length}

Mode: ${settings.simulationMode?"SIMULATION":"PRODUCTION"}
Mode approbation: ${settings.approvalMode?"OUI":"NON"}

Consulter: travito-agents.vercel.app
${BRAND.site} | ${BRAND.x}`);

    window.open(`https://mail.google.com/mail/?view=cm&to=${BRAND.email}&su=${sub}&body=${body}`, "_blank");
    addLog("📧 Rapport hebdomadaire envoyé", "success");
  };

  // ── TAB CONTENT ────────────────────────────────────────────
  const tabs = [
    ["overview","📊 Vue"],["hashtags","#️⃣ Hashtags"],["categories","📁 Catégories"],
    ["accounts","👥 Comptes"],["activity","📋 Activité"],["polls","🗳️ Sondages"],
    ["forbidden","🚫 Blocklist"],["settings","⚙️ Config"],
  ];

  return (
    <div style={{ display:"grid", gridTemplateRows:"38px 1fr", height:"100%", overflow:"hidden" }}>

      {/* TOP BAR */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"0 10px", borderBottom:`1px solid ${C.border}`, background:C.bg, overflowX:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginRight:8, flexShrink:0 }}>
          <div style={{ width:20,height:20,background:"linear-gradient(135deg,#1DA1F2,#0a5f8a)",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700 }}>🤝</div>
          <span style={{ fontSize:10,fontWeight:700,color:C.blue,whiteSpace:"nowrap" }}>Network Engager</span>
          {settings.simulationMode && <span style={{ fontSize:7,padding:"1px 5px",background:"rgba(245,158,11,0.2)",color:C.amber,border:`1px solid ${C.amber}`,borderRadius:4,fontFamily:"monospace" }}>SIMULATION</span>}
        </div>
        {tabs.map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ fontSize:8,padding:"3px 8px",borderRadius:8,background:tab===id?`${C.blue}18`:"transparent",border:`1px solid ${tab===id?C.blue:C.border}`,color:tab===id?C.blue:C.muted,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0 }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:5, flexShrink:0 }}>
          <button onClick={async ()=>{
                  setRunning(true);
                  addLog("Lancement engagement reel via API...");
                  try {
                    const r = await fetch("/api/engage?force=true", {
                      method:"GET",
                      headers:{"Authorization":"Bearer "+(process.env.CRON_SECRET||"")}
                    });
                    const d = await r.json();
                    if(d.success) {
                      addLog("Likes: "+d.summary.likes+" Follows: "+d.summary.follows+" Reposts: "+d.summary.reposts+" Polls: "+d.summary.polls,"success");
                      if(d.errors?.length>0) addLog(d.errors.length+" erreurs - voir logs Vercel","error");
                      // Update quota counters from API response
                      if(d.quota) {
                        const today = new Date().toDateString();
                        setQuotas({ likes: d.quota.likes||0, follows: d.quota.follows||0, reposts: d.quota.reposts||0, date: today });
                      }
                    } else {
                      addLog("Erreur: "+(d.error||"unknown"),"error");
                    }
                  } catch(e){ addLog("Erreur: "+e.message,"error"); }
                  setRunning(false);
                }} disabled={running}
            style={{ fontSize:8,padding:"3px 10px",background:settings.simulationMode?`${C.amber}18`:`${C.green}18`,border:`1px solid ${settings.simulationMode?C.amber:C.green}`,borderRadius:7,color:settings.simulationMode?C.amber:C.green,cursor:"pointer",fontWeight:700 }}>
            {running?"⏳...":settings.simulationMode?"🧪 Simuler":"▶️ Lancer"}
          </button>
          <button onClick={sendWeeklyReport}
            style={{ fontSize:8,padding:"3px 8px",background:`${C.gold}12`,border:`1px solid ${C.gold}44`,borderRadius:7,color:C.gold,cursor:"pointer" }}>
            📧 Rapport
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ overflow:"hidden", display:"flex", flexDirection:"column" }}>

        {/* OVERVIEW */}
        {tab==="overview" && (
          <div style={{ flex:1,overflowY:"auto",padding:"12px" }}>
            {/* Weekly breakdown table */}
            {(() => {
              const dayNames = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi"];
              const todayDow = new Date().getDay(); // 1=Mon...5=Fri
              const daysElapsed = Math.max(1, todayDow >= 1 && todayDow <= 5 ? todayDow : 5);
              const lim = {
                L:  settings.limits?.likes          || DAILY_LIMITS.likes,
                F:  settings.limits?.follows        || DAILY_LIMITS.follows,
                R:  settings.limits?.reposts        || DAILY_LIMITS.reposts,
                Re: settings.limits?.replies        || DAILY_LIMITS.replies,
                U:  settings.limits?.unfollowPerDay || 2,
              };
              // Polls is per week not per day
              const pollsPerWeek = settings.limits?.pollsPerWeek || DAILY_LIMITS.pollsPerWeek || 1;
              const cols = [
                ["👍 Likes",     "LIKE",     lim.L,  C.blue,   false],
                ["👥 Follows",   "FOLLOW",   lim.F,  C.green,  false],
                ["🔁 Reposts",   "REPOST",   lim.R,  C.purple, false],
                ["💬 Replies",   "REPLY",    lim.Re, C.amber,  false],
                ["↩️ Unfollow",  "UNFOLLOW", lim.U,  C.muted,  false],
                ["🗳️ Semaine",   "POLL",     pollsPerWeek, C.gold, true], // true = weekly limit
              ];

              // Get this week's data from activity log
              const now2 = new Date();
              const weekStart = new Date(now2); weekStart.setDate(now2.getDate()-now2.getDay()+1); weekStart.setHours(0,0,0,0);
              const weekData = activityLog.filter(a => { const t = a.timestamp||a.ts; return t && new Date(t) >= weekStart; });

              const dayRows = dayNames.map((day, di) => {
                const dow = di+1;
                const isPast = dow < todayDow;
                const isToday = dow === todayDow;
                const isFuture = dow > todayDow;
                const dayData = weekData.filter(a => new Date(a.timestamp||a.ts).getDay() === dow);
                const cnt = (action) => {
                  const fromLog = dayData.filter(a=>a.action===action).length;
                  if (action === "POLL" && isToday) {
                    return Math.max(fromLog, polls.filter(p=>p.status==="posted").length > 0 ? 1 : 0);
                  }
                  return fromLog;
                };
                return { day, dow, isPast, isToday, isFuture, cnt };
              });

              const weekCnt = (action) => {
                const fromLog = weekData.filter(a=>a.action===action).length;
                // Fallback: also count from local polls state for POLL action
                if (action === "POLL") {
                  const pollsThisWeek = polls.filter(p => p.status==="posted" && p.postedAt && new Date(p.postedAt) >= weekStart).length;
                  return Math.max(fromLog, pollsThisWeek, polls.filter(p=>p.status==="posted").length > 0 ? 1 : 0);
                }
                return fromLog;
              };
              const weekMax = (max) => max * daysElapsed;
              const onTrack = (action, max) => weekCnt(action) >= Math.floor(max * (daysElapsed-0.5));

              return (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ fontSize:10, color:C.gold, fontFamily:"monospace", fontWeight:700 }}>
                      📊 SEMAINE EN COURS
                    </div>
                    <div style={{ fontSize:8, color:C.muted }}>
                      {now2.toLocaleDateString("fr-MA",{weekday:"long",day:"numeric",month:"long"})}
                    </div>
                  </div>

                  <div style={{ background:"rgba(0,0,0,0.25)", borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
                    {/* Header */}
                    <div style={{ display:"grid", gridTemplateColumns:"80px repeat(6,1fr)", padding:"6px 10px",
                      borderBottom:`1px solid ${C.border}`, background:"rgba(0,0,0,0.3)" }}>
                      <span style={{ fontSize:8, color:C.muted, fontWeight:700 }}>JOUR</span>
                      {cols.map(([label,,,,isWeekly])=>(
                        <div key={label} style={{ textAlign:"center" }}>
                          <div style={{ fontSize:8, color:C.muted, fontWeight:600 }}>{label}</div>
                          {isWeekly && <div style={{ fontSize:6, color:C.muted }}>/semaine</div>}
                        </div>
                      ))}
                    </div>

                    {/* Day rows */}
                    {dayRows.map(({ day, dow, isPast, isToday, isFuture, cnt }) => (
                      <div key={day} style={{ display:"grid", gridTemplateColumns:"80px repeat(6,1fr)",
                        padding:"5px 10px", borderBottom:`1px solid rgba(255,255,255,0.04)`,
                        background:isToday?"rgba(212,175,55,0.08)":"transparent",
                        opacity:isFuture?0.35:1, alignItems:"center" }}>
                        <div style={{ fontSize:9, fontWeight:isToday?700:400,
                          color:isToday?C.gold:isPast?C.muted:"#e8dcc8" }}>
                          {day}{isToday?" ◀":""}
                        </div>
                        {cols.map(([label, action, max, c, isWeekly]) => {
                          const v = cnt(action);
                          const done = isWeekly ? false : v >= max;
                          const missed = isPast && !isWeekly && v === 0;
                          const col = isFuture?"#555":done?C.green:missed?C.red:v>0?c:C.muted;
                          return (
                            <div key={action} style={{ textAlign:"center", fontFamily:"monospace",
                              fontSize:10, fontWeight:600, color:col }}>
                              {v}/{isWeekly?max+"wk":max}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {/* Total + on-track row */}
                    <div style={{ display:"grid", gridTemplateColumns:"80px repeat(6,1fr)",
                      padding:"6px 10px", background:"rgba(212,175,55,0.06)",
                      borderTop:`1px solid ${C.border}`, alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:9, color:C.gold, fontWeight:700 }}>TOTAL</div>
                        <div style={{ fontSize:7, color:C.muted }}>{daysElapsed}j/{isNaN(todayDow)||todayDow<1||todayDow>5?5:5}</div>
                      </div>
                      {cols.map(([label, action, max, c, isWeekly]) => {
                        const v = weekCnt(action);
                        const weekMax2 = isWeekly ? max : max * 5;
                        const expected = isWeekly ? max : max * daysElapsed;
                        const track = v >= Math.floor(expected * 0.5);
                        return (
                          <div key={action} style={{ textAlign:"center" }}>
                            <div style={{ fontFamily:"monospace", fontSize:11, fontWeight:700,
                              color:track?C.green:C.red }}>{v}/{weekMax2}</div>
                            <div style={{ fontSize:7, color:track?C.green:C.red, fontWeight:700 }}>
                              {track?"✓":"✗ "+expected+"exp"}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Config row */}
                    <div style={{ display:"grid", gridTemplateColumns:"80px repeat(6,1fr)",
                      padding:"4px 10px", background:"rgba(0,0,0,0.15)",
                      borderTop:`1px solid rgba(255,255,255,0.03)`, alignItems:"center" }}>
                      <div style={{ fontSize:7, color:C.muted }}>Config</div>
                      {cols.map(([label, action, max, c, isWeekly]) => (
                        <div key={action} style={{ textAlign:"center", fontSize:8,
                          color:c, fontFamily:"monospace", fontWeight:600 }}>
                          {max}{isWeekly?"/sem":"/j"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Stats */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14 }}>
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px" }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:8,textTransform:"uppercase" }}>Statut Système</div>
                {[
                  ["Hashtags actifs", `${hashtags.filter(h=>h.active).length}/${hashtags.length}`, C.blue],
                  ["Comptes confiance", `${accounts.filter(a=>a.trusted&&a.active).length}`, C.green],
                  ["Actions ce jour", `${activityLog.filter(l=>new Date(l.timestamp).toDateString()===new Date().toDateString()).length}`, C.amber],
                  ["Mode", settings.simulationMode?"Simulation":"Production", settings.simulationMode?C.amber:C.green],
                  ["Approbation", settings.approvalMode?"Requise":"Auto", settings.approvalMode?C.amber:C.green],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ fontSize:9,color:C.muted }}>{l}</span>
                    <span style={{ fontSize:9,fontWeight:700,color:c,fontFamily:"monospace" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px" }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:8,textTransform:"uppercase" }}>Limites Journalières</div>
                {[
                  ["👍 Likes",          settings.limits?.likes         || DAILY_LIMITS.likes,         "/jour",    C.blue],
                  ["👥 Follows",        settings.limits?.follows       || DAILY_LIMITS.follows,       "/jour",    C.green],
                  ["🔁 Reposts",        settings.limits?.reposts       || DAILY_LIMITS.reposts,       "/jour",    C.purple],
                  ["🗳️ Sondages",       settings.limits?.pollsPerWeek  || DAILY_LIMITS.pollsPerWeek,  "/semaine", C.amber],
                  ["💬 Réponses",       settings.limits?.replies       || 2,                          "/jour",    C.blue],
                  ["🚫 Auto-unfollow",  settings.limits?.unfollowPerDay|| 2,                          "/jour",    C.muted],
                ].map(([l,v,unit,c])=>(
                  <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ fontSize:9,color:C.muted }}>{l}</span>
                    <span style={{ fontSize:10,color:c,fontWeight:700,fontFamily:"monospace" }}>{v}<span style={{ fontSize:8,color:C.muted }}> {unit}</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent log */}
            <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px" }}>
              <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:8,textTransform:"uppercase" }}>Activité Récente</div>
              {(() => {
                // Merge session log + KV activity log, show most recent 10
                const kvRecent = activityLog.slice(0,8).map(a=>({
                  time: a.timestamp ? new Date(a.timestamp).toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"}) : "",
                  msg: a.action + ": " + (a.target||"").substring(0,40) + (a.source==="cron"?" (cron)":""),
                  type: "success",
                }));
                const combined = [...log.slice(0,5), ...kvRecent].slice(0,10);
                return combined.length === 0
                  ? <div style={{ fontSize:9,color:C.muted }}>Aucune activité — lancez Lancer ou attendez le cron</div>
                  : combined.map((l,i)=>(
                    <div key={i} style={{ fontSize:8,fontFamily:"monospace",
                      color:l.type==="error"?C.red:l.type==="success"?C.green:C.muted,marginBottom:2,lineHeight:1.4 }}>
                      <span style={{ opacity:0.5 }}>{l.time} </span>{l.msg}
                    </div>
                  ));
              })()}
            </div>
          </div>
        )}

        {/* HASHTAGS */}
        {tab==="hashtags" && (
          <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
              <div style={{ fontSize:10,color:C.gold,fontFamily:"monospace" }}>
                {hashtags.filter(h=>h.active).length} actifs / {hashtags.length} total
              </div>
              <button onClick={()=>setShowAddHash(p=>!p)}
                style={{ fontSize:9,padding:"4px 12px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:7,color:C.green,cursor:"pointer",fontWeight:700 }}>
                + Ajouter Hashtag
              </button>
            </div>

            {/* Add hashtag form */}
            {showAddHash && (
              <div style={{ background:C.bg,border:`1px solid ${C.green}`,borderRadius:9,padding:"12px",marginBottom:12 }}>
                <div style={{ fontSize:9,color:C.green,fontFamily:"monospace",marginBottom:8 }}>NOUVEAU HASHTAG</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8 }}>
                  {[["Tag (ex: #MarocAuto)","tag"],["Type","type"],["Langue","lang"]].map(([l,f])=>(
                    <div key={f}>
                      <div style={{ fontSize:8,color:C.muted,marginBottom:3 }}>{l}</div>
                      {f==="type" ? (
                        <select value={newHash.type} onChange={e=>setNewHash(p=>({...p,type:e.target.value}))}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                          {["broad","niche","city","seasonal","brand"].map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : f==="lang" ? (
                        <select value={newHash.lang} onChange={e=>setNewHash(p=>({...p,lang:e.target.value}))}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                          {["FR","AR","EN","MULTI"].map(l=><option key={l} value={l}>{l}</option>)}
                        </select>
                      ) : (
                        <input value={newHash[f]} onChange={e=>setNewHash(p=>({...p,[f]:e.target.value}))}
                          placeholder={l}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}/>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:8,color:C.muted,marginBottom:3 }}>Catégorie</div>
                    <select value={newHash.category} onChange={e=>setNewHash(p=>({...p,category:e.target.value}))}
                      style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                      {categories.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:8,color:C.muted,marginBottom:3 }}>Priorité (1=haute)</div>
                    <select value={newHash.priority} onChange={e=>setNewHash(p=>({...p,priority:parseInt(e.target.value)}))}
                      style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                      {[1,2,3].map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>{
                    if(!newHash.tag.startsWith("#")) { alert("Le hashtag doit commencer par #"); return; }
                    setHashtags(p=>[...p,{...newHash,id:Date.now(),active:true,score:0}]);
                    setNewHash({tag:"",type:"niche",lang:"FR",category:"all",priority:2});
                    setShowAddHash(false);
                    addLog(`✅ Hashtag ajouté: ${newHash.tag}`,"success");
                  }} style={{ padding:"6px 16px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:7,color:C.green,cursor:"pointer",fontSize:10,fontWeight:700 }}>
                    ✅ Ajouter
                  </button>
                  <button onClick={()=>setShowAddHash(false)} style={{ padding:"6px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,cursor:"pointer",fontSize:10 }}>
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Hashtag table */}
            <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,overflow:"hidden" }}>
              <div style={{ display:"grid",gridTemplateColumns:"30px 1fr 70px 50px 80px 80px 60px 90px",gap:0,padding:"6px 10px",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)" }}>
                {["On","Tag","Type","Lang","Catégorie","Priorité","Score","Actions"].map(h=>(
                  <div key={h} style={{ fontSize:7,color:C.muted,fontFamily:"monospace",textTransform:"uppercase" }}>{h}</div>
                ))}
              </div>
              {hashtags.map((h,i)=>(
                <div key={h.id} style={{ display:"grid",gridTemplateColumns:"30px 1fr 70px 50px 80px 80px 60px 90px",gap:0,padding:"6px 10px",borderBottom:`1px solid rgba(255,255,255,0.03)`,alignItems:"center",background:editingHash===h.id?"rgba(29,161,242,0.06)":"transparent" }}>
                  <input type="checkbox" checked={h.active} onChange={()=>setHashtags(p=>p.map(x=>x.id===h.id?{...x,active:!x.active}:x))} style={{ cursor:"pointer" }}/>
                  {editingHash===h.id ? (
                    <input value={h.tag} onChange={e=>setHashtags(p=>p.map(x=>x.id===h.id?{...x,tag:e.target.value}:x))}
                      style={{ padding:"2px 5px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.blue}`,borderRadius:4,color:C.text,fontSize:10,outline:"none" }}/>
                  ) : (
                    <span style={{ fontSize:10,color:h.active?C.text:C.muted,fontFamily:"monospace" }}>{h.tag}</span>
                  )}
                  <span style={{ fontSize:8,color:C.muted,fontFamily:"monospace" }}>{h.type}</span>
                  <span style={{ fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(255,255,255,0.06)",color:C.text,fontFamily:"monospace",display:"inline-block" }}>{h.lang}</span>
                  <span style={{ fontSize:8,color:C.amber }}>{h.category}</span>
                  <span style={{ fontSize:8,color:h.priority===1?C.green:h.priority===2?C.amber:C.muted,fontFamily:"monospace" }}>P{h.priority}</span>
                  <span style={{ fontSize:8,color:C.blue,fontFamily:"monospace" }}>{h.score}</span>
                  <div style={{ display:"flex",gap:3 }}>
                    <button onClick={()=>setEditingHash(editingHash===h.id?null:h.id)}
                      style={{ fontSize:7,padding:"2px 5px",background:`${C.blue}18`,border:`1px solid ${C.blue}44`,borderRadius:4,color:C.blue,cursor:"pointer" }}>
                      {editingHash===h.id?"💾":"✏️"}
                    </button>
                    <button onClick={()=>{ if(confirm(`Supprimer ${h.tag}?`)) setHashtags(p=>p.filter(x=>x.id!==h.id)); }}
                      style={{ fontSize:7,padding:"2px 5px",background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:4,color:C.red,cursor:"pointer" }}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

                {/* CATEGORIES */}
        {tab==="categories" && (
          <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
              <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace" }}>CATEGORIES → HASHTAGS</div>
              <button onClick={()=>refreshHashtagsFromAI(true)} disabled={refreshingHashtags}
                style={{ fontSize:8,padding:"3px 10px",background:"rgba(139,92,246,0.12)",border:"1px solid rgba(139,92,246,0.4)",borderRadius:6,color:"#8b5cf6",cursor:"pointer" }}>
                {refreshingHashtags?"...":"✨ Actualiser IA"}
              </button>
            </div>
            <div style={{ display:"flex",gap:6,marginBottom:12 }}>
              <input value={newCategory} onChange={e=>setNewCategory(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&newCategory.trim()){
                  const cats=newCategory.split(",").map(c=>c.trim()).filter(c=>c&&!categories.includes(c));
                  if(cats.length) setCategories(p=>[...p,...cats]);
                  setNewCategory("");
                }}}
                placeholder="Nouvelle categorie, separees par virgule..."
                style={{ flex:1,fontSize:9,padding:"4px 8px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(212,175,55,0.18)",borderRadius:5,color:"#e8dcc8",outline:"none" }}/>
              <button onClick={()=>{
                const cats=newCategory.split(",").map(c=>c.trim()).filter(c=>c&&!categories.includes(c));
                if(cats.length){setCategories(p=>[...p,...cats]);setNewCategory("");}
              }} style={{ fontSize:8,padding:"4px 10px",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.4)",borderRadius:5,color:"#10b981",cursor:"pointer",fontWeight:700 }}>+ Ajouter</button>
            </div>
            {categories.filter(c=>c!=="all").map(cat=>{
              const catHashtags = hashtags.filter(h=>h.category===cat||h.category==="all");
              const active = catHashtags.filter(h=>h.active).length;
              return (
                <div key={cat} style={{ background:"rgba(12,18,35,0.95)",border:"1px solid rgba(212,175,55,0.18)",borderRadius:9,padding:"10px 12px",marginBottom:8 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
                    <span style={{ fontSize:10,fontWeight:700,color:"#e8dcc8" }}>{cat}</span>
                    <span style={{ fontSize:8,color:"#10b981",fontFamily:"monospace" }}>{active} hashtags actifs</span>
                    <button onClick={()=>{ if(window.confirm("Supprimer "+cat+"?")) setCategories(p=>p.filter(c=>c!==cat)); }}
                      style={{ fontSize:7,padding:"1px 5px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:4,color:"#ef4444",cursor:"pointer",marginLeft:"auto" }}>🗑️</button>
                  </div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                    {catHashtags.map(h=>(
                      <span key={h.id} onClick={()=>setHashtags(p=>p.map(x=>x.id===h.id?{...x,active:!x.active}:x))}
                        style={{ fontSize:8,padding:"2px 7px",borderRadius:10,cursor:"pointer",fontFamily:"monospace",
                          background:h.active?"rgba(29,161,242,0.12)":"rgba(255,255,255,0.04)",
                          color:h.active?"#1DA1F2":"#6b6050",
                          border:"1px solid "+(h.active?"rgba(29,161,242,0.4)":"rgba(212,175,55,0.18)") }}>
                        {h.tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ACCOUNTS */}
        {tab==="accounts" && (
          <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
              <div style={{ fontSize:10,color:C.gold,fontFamily:"monospace" }}>{accounts.filter(a=>a.trusted&&a.active).length} comptes de confiance</div>
              <button onClick={()=>setShowAddAcc(p=>!p)}
                style={{ fontSize:9,padding:"4px 12px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:7,color:C.green,cursor:"pointer",fontWeight:700 }}>
                + Ajouter Compte
              </button>
            </div>

            {showAddAcc && (
              <div style={{ background:C.bg,border:`1px solid ${C.green}`,borderRadius:9,padding:"12px",marginBottom:12 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8 }}>
                  {[["@Handle","handle"],["Label","label"],["Catégorie","category"]].map(([l,f])=>(
                    <div key={f}>
                      <div style={{ fontSize:8,color:C.muted,marginBottom:3 }}>{l}</div>
                      {f==="label" ? (
                        <select value={newAccount.label} onChange={e=>setNewAccount(p=>({...p,label:e.target.value}))}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                          {["partner","competitor","influencer","media","marketplace","unknown"].map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : f==="category" ? (
                        <select value={newAccount.category} onChange={e=>setNewAccount(p=>({...p,category:e.target.value}))}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                          {categories.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input value={newAccount[f]} onChange={e=>setNewAccount(p=>({...p,[f]:e.target.value}))} placeholder={l}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}/>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>{
                    setAccounts(p=>[...p,{...newAccount,id:Date.now(),trusted:true,active:true,blacklisted:false}]);
                    setNewAccount({handle:"",label:"partner",category:"all"});
                    setShowAddAcc(false);
                    addLog(`✅ Compte ajouté: ${newAccount.handle}`,"success");
                  }} style={{ padding:"6px 16px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:7,color:C.green,cursor:"pointer",fontSize:10,fontWeight:700 }}>
                    ✅ Ajouter
                  </button>
                  <button onClick={()=>setShowAddAcc(false)} style={{ padding:"6px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,cursor:"pointer",fontSize:10 }}>Annuler</button>
                </div>
              </div>
            )}

            <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,overflow:"hidden" }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 90px 90px 70px 80px",gap:0,padding:"6px 10px",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)" }}>
                {["Handle","Label","Catégorie","Confiance","Actions"].map(h=>(
                  <div key={h} style={{ fontSize:7,color:C.muted,fontFamily:"monospace",textTransform:"uppercase" }}>{h}</div>
                ))}
              </div>
              {accounts.map(a=>(
                <div key={a.id} style={{ display:"grid",gridTemplateColumns:"1fr 90px 90px 70px 80px",gap:0,padding:"7px 10px",borderBottom:`1px solid rgba(255,255,255,0.03)`,alignItems:"center" }}>
                  <span style={{ fontSize:10,color:a.active?C.text:C.muted,fontFamily:"monospace" }}>{a.handle}</span>
                  <span style={{ fontSize:8,padding:"1px 6px",borderRadius:4,background:a.label==="partner"?`${C.green}18`:a.label==="competitor"?`${C.red}18`:`${C.blue}18`,color:a.label==="partner"?C.green:a.label==="competitor"?C.red:C.blue }}>{a.label}</span>
                  <span style={{ fontSize:8,color:C.amber }}>{a.category}</span>
                  {a.source==="ai_discovery" && <span style={{ fontSize:6,padding:"1px 4px",background:"rgba(139,92,246,0.15)",color:"#8b5cf6",borderRadius:3 }}>🤖 IA</span>}
                  <input type="checkbox" checked={a.trusted} onChange={()=>setAccounts(p=>p.map(x=>x.id===a.id?{...x,trusted:!x.trusted}:x))} style={{ cursor:"pointer" }}/>
                  <div style={{ display:"flex",gap:3 }}>
                    <button onClick={()=>setAccounts(p=>p.map(x=>x.id===a.id?{...x,active:!x.active}:x))}
                      style={{ fontSize:7,padding:"2px 5px",background:a.active?`${C.amber}18`:`${C.green}18`,border:`1px solid ${a.active?C.amber:C.green}44`,borderRadius:4,color:a.active?C.amber:C.green,cursor:"pointer" }}>
                      {a.active?"Pause":"Activer"}
                    </button>
                    <button onClick={()=>{ if(confirm(`Supprimer ${a.handle}?`)) setAccounts(p=>p.filter(x=>x.id!==a.id)); }}
                      style={{ fontSize:7,padding:"2px 5px",background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:4,color:C.red,cursor:"pointer" }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVITY LOG */}
        {tab==="activity" && (
          <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
              <div style={{ fontSize:10,color:C.gold,fontFamily:"monospace" }}>{activityLog.length} actions enregistrées</div>
              <button onClick={()=>{ if(confirm("Effacer le log?")) setActivityLog([]); }}
                style={{ fontSize:8,padding:"3px 10px",background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,color:C.red,cursor:"pointer" }}>
                🗑️ Effacer
              </button>
            </div>
            {activityLog.length===0 ? (
              <div style={{ color:C.muted,fontSize:10,textAlign:"center",paddingTop:30 }}>Aucune activité — lancez le pipeline</div>
            ) : (
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,overflow:"hidden" }}>
                <div style={{ display:"grid",gridTemplateColumns:"120px 70px 1fr 50px 50px 70px",gap:0,padding:"6px 10px",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)" }}>
                  {["Timestamp","Action","Cible","Score","Exécuté","Safety"].map(h=>(
                    <div key={h} style={{ fontSize:7,color:C.muted,fontFamily:"monospace",textTransform:"uppercase" }}>{h}</div>
                  ))}
                </div>
                {activityLog.slice(0,50).map((l,i)=>(
                  <div key={i} style={{ display:"grid",gridTemplateColumns:"120px 70px 1fr 50px 50px 70px",gap:0,padding:"6px 10px",borderBottom:`1px solid rgba(255,255,255,0.03)`,alignItems:"center" }}>
                    <span style={{ fontSize:7,color:C.muted,fontFamily:"monospace" }}>{new Date(l.timestamp).toLocaleString("fr-MA")}</span>
                    <span style={{ fontSize:8,padding:"1px 5px",borderRadius:4,background:l.action==="LIKE"?`${C.blue}18`:l.action==="FOLLOW"?`${C.green}18`:`${C.purple}18`,color:l.action==="LIKE"?C.blue:l.action==="FOLLOW"?C.green:C.purple,fontFamily:"monospace" }}>{l.action}</span>
                    <span style={{ fontSize:8,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{l.target}</span>
                    <span style={{ fontSize:8,fontFamily:"monospace",color:l.score>=60?C.green:l.score>=30?C.amber:C.red }}>{l.score}</span>
                    <span style={{ fontSize:9 }}>{l.executed?"✅":"⏭️"}{l.simulation?" 🧪":""}</span>
                    <span style={{ fontSize:9 }}>{l.safetyOk?"🟢":"🔴"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* POLLS */}
        {tab==="polls" && (
          <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>

            {/* LEFT PANEL — Status + History */}
            <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              {/* Status summary */}
              <div style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
                <div style={{ fontSize:9, color:C.gold, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>État sondages</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                  {[
                    ["Publiés",  polls.filter(p=>p.status==="published").length,  C.green],
                    ["Planifiés",polls.filter(p=>p.status==="scheduled").length,  C.blue],
                    ["Brouillons",polls.filter(p=>p.status==="draft").length,     C.muted],
                  ].map(([label,count,color])=>(
                    <div key={label} style={{ background:"rgba(0,0,0,0.3)", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
                      <div style={{ fontSize:16, fontWeight:700, color }}>{count}</div>
                      <div style={{ fontSize:8, color:C.muted }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Week range filter — dropdowns */}
              <div style={{ padding:"8px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
                <div style={{ fontSize:8, color:C.muted, marginBottom:6 }}>Filtrer par semaine</div>
                {(() => {
                  const weeks = getISOWeeksList(16);
                  const selStyle = { width:"100%", padding:"3px 5px", background:"rgba(0,0,0,0.4)",
                    border:`1px solid ${C.border}`, borderRadius:5, color:C.text,
                    fontSize:9, outline:"none", cursor:"pointer" };
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
                      <div>
                        <div style={{ fontSize:7, color:C.muted, marginBottom:2 }}>De</div>
                        <select value={filterWeekFrom} onChange={e=>setFilterWeekFrom(e.target.value)} style={selStyle}>
                          <option value="">— Toutes —</option>
                          {weeks.map(w=><option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize:7, color:C.muted, marginBottom:2 }}>À</div>
                        <select value={filterWeekTo} onChange={e=>setFilterWeekTo(e.target.value)} style={selStyle}>
                          <option value="">— Toutes —</option>
                          {weeks.map(w=><option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })()}
                {(filterWeekFrom||filterWeekTo)&&(
                  <button onClick={()=>{setFilterWeekFrom("");setFilterWeekTo("");}}
                    style={{ marginTop:4, fontSize:8, padding:"2px 8px", background:"transparent",
                      border:`1px solid ${C.border}`, borderRadius:4, color:C.muted,
                      cursor:"pointer", width:"100%" }}>
                    ✕ Reset filtre
                  </button>
                )}
              </div>

              {/* Poll history list */}
              <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
                {(() => {
                  const filtered = polls.filter(p => {
                    if (!filterWeekFrom && !filterWeekTo) return true;
                    const w = p.isoWeek || "";
                    if (filterWeekFrom && w < filterWeekFrom) return false;
                    if (filterWeekTo   && w > filterWeekTo)   return false;
                    return true;
                  });
                  if (filtered.length === 0) return (
                    <div style={{ fontSize:9, color:C.muted, textAlign:"center", paddingTop:20 }}>
                      {polls.length === 0 ? "Aucun sondage enregistré" : "Aucun résultat pour ce filtre"}
                    </div>
                  );
                  return filtered.map((p,i) => {
                    const stColor = p.status==="published"?C.green:p.status==="scheduled"?C.blue:C.muted;
                    const stLabel = p.status==="published"?"✓ Publié":p.status==="scheduled"?"📅 Planifié":"✎ Brouillon";
                    return (
                      <div key={p.id||i} onClick={()=>setSelectedPoll(p)}
                        style={{ padding:"8px 10px", borderRadius:7, marginBottom:5, cursor:"pointer",
                          background: selectedPoll?.id===p.id ? `${C.blue}18` : "rgba(0,0,0,0.3)",
                          border:`1px solid ${selectedPoll?.id===p.id ? C.blue : C.border}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3,
                            background:`${stColor}18`, color:stColor }}>{stLabel}</span>
                          <span style={{ fontSize:7, color:C.muted }}>{p.isoWeek||""}</span>
                        </div>
                        <div style={{ fontSize:9, color:C.text, lineHeight:1.4 }}>{p.question}</div>
                        <div style={{ fontSize:7, color:C.muted, marginTop:3 }}>
                          {p.status==="published" && p.postedAt
                            ? new Date(p.postedAt).toLocaleDateString("fr-MA")
                            : p.status==="scheduled" && p.scheduled
                            ? `📅 ${new Date(p.scheduled).toLocaleDateString("fr-MA")}`
                            : new Date(p.createdAt||Date.now()).toLocaleDateString("fr-MA")}
                        </div>
                        {p.tweetUrl && (
                          <a href={p.tweetUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:7, color:C.blue, display:"block", marginTop:2 }}>
                            🔗 Voir sur X
                          </a>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* RIGHT PANEL — Detail + Create */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

              {/* Selected poll detail */}
              {selectedPoll && (
                <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
                  <div style={{ fontSize:9, color:C.gold, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>
                    {selectedPoll.tweetId ? "✓ Sondage publié" : selectedPoll.status==="scheduled" ? "📅 Sondage planifié" : "✎ Brouillon"}
                  </div>
                  <div style={{ fontSize:12, color:C.text, fontWeight:600, marginBottom:8 }}>{selectedPoll.question}</div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                    {(selectedPoll.opts||selectedPoll.options||[]).map((o,i)=>(
                      <span key={i} style={{ fontSize:10, padding:"3px 10px", borderRadius:5,
                        background:"rgba(255,255,255,0.07)", border:`1px solid ${C.border}`, color:C.text }}>{o}</span>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:12, fontSize:9, color:C.muted }}>
                    {selectedPoll.isoWeek && <span>📅 {selectedPoll.isoWeek}</span>}
                    {selectedPoll.postedAt && <span>Publié: {new Date(selectedPoll.postedAt).toLocaleString("fr-MA")}</span>}
                    {selectedPoll.scheduled && !selectedPoll.postedAt && <span>Planifié: {new Date(selectedPoll.scheduled).toLocaleString("fr-MA")}</span>}
                    {selectedPoll.tweetId && <span style={{ color:C.blue }}>ID: {selectedPoll.tweetId}</span>}
                  </div>
                  {selectedPoll.tweetUrl && (
                    <a href={selectedPoll.tweetUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-block", marginTop:6, fontSize:9, color:C.blue }}>
                      🔗 Voir le sondage sur X →
                    </a>
                  )}
                </div>
              )}

              {/* Bibliothèque + New poll */}
              <div style={{ flex:1, overflowY:"auto", padding:"12px 14px" }}>
                {/* Library header + refresh + filter */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:9,color:C.gold,textTransform:"uppercase",letterSpacing:1}}>
                    📚 Bibliothèque
                    <span style={{fontSize:7,color:C.muted,marginLeft:5,textTransform:"none"}}>
                      {" "}{pollLibrary.filter(p=>p.status==="active").length} actives · {pollLibrary.filter(p=>p.status==="history").length} archivées
                    </span>
                  </span>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <button onClick={()=>setSettings(prev=>({...prev,autoRefreshPolls:!prev.autoRefreshPolls}))}
                      style={{fontSize:7,padding:"2px 8px",borderRadius:10,cursor:"pointer",
                        background:settings.autoRefreshPolls?"rgba(16,185,129,0.15)":"rgba(0,0,0,0.3)",
                        border:`1px solid ${settings.autoRefreshPolls?"rgba(16,185,129,0.5)":C.border}`,
                        color:settings.autoRefreshPolls?C.green:C.muted}}>
                      🔄 Auto {settings.autoRefreshPolls?"ON":"OFF"}
                    </button>
                    <button onClick={()=>refreshPollLibrary(true)} disabled={refreshingPolls}
                      style={{fontSize:7,padding:"2px 10px",borderRadius:6,cursor:"pointer",
                        background:"rgba(139,92,246,0.12)",border:"1px solid rgba(139,92,246,0.4)",color:"#8b5cf6"}}>
                      {refreshingPolls?"⏳...":"✨ IA"}
                    </button>
                  </div>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:8}}>
                  {[["active","✅ Actives"],["history","📦 Historique"],["all","Tout"]].map(([v,label])=>(
                    <button key={v} onClick={()=>setLibraryFilter(v)}
                      style={{fontSize:7,padding:"2px 10px",borderRadius:10,cursor:"pointer",
                        background:libraryFilter===v?"rgba(212,175,55,0.15)":"rgba(0,0,0,0.3)",
                        border:`1px solid ${libraryFilter===v?C.gold:C.border}`,
                        color:libraryFilter===v?C.gold:C.muted}}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ marginBottom:14 }}>
                  {(()=>{
                    const visLib=pollLibrary.filter(p=>libraryFilter==="all"?true:libraryFilter==="active"?p.status==="active":p.status==="history");

return visLib.map((p,i)=>{
  const pq = p.q || p.question || "";
  const isSel = selectedPoll?.question === pq || selectedPoll?.q === pq;

  // ✅ NEW (important)
  const isPosted = p.status === "posted";

  const wasUsed =
    isPosted ||
    polls.some(h =>
      (h.status === "published" || h.status === "posted") &&
      (h.question === pq || h.q === pq)
    );

  const lastUsed = polls
    .filter(h =>
      (h.status === "published" || h.status === "posted") &&
      (h.question === pq || h.q === pq)
    )
    .sort((a,b)=>new Date(b.postedAt||0)-new Date(a.postedAt||0))[0];

  const isArch = p.status === "history";

                      return (

<div key={p.id||i}
  onClick={()=>setSelectedPoll({...p,id:null,status:"draft",question:pq,options:p.opts||p.options||[]})}
  style={{
    padding:"7px 10px",
    borderRadius:7,
    marginBottom:4,
    cursor: isPosted ? "not-allowed" : "pointer",

    background: isSel ? `${C.blue}18` : "rgba(0,0,0,0.2)",

    border:`1px solid ${
      isSel
        ? C.blue
        : isArch
        ? "rgba(107,96,80,0.2)"
        : isPosted
        ? C.green
        : wasUsed
        ? "rgba(245,158,11,0.4)"
        : "rgba(16,185,129,0.3)"
    }`,

    opacity: isPosted ? 0.5 : (isArch||wasUsed)&&!isSel ? 0.6 : 1,

    pointerEvents: isPosted ? "none" : "auto",
  }}>
                      
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                          <div style={{fontSize:10,color:(isArch||wasUsed)?C.muted:C.text}}>{pq}</div>
                          {isArch?<span style={{fontSize:7,padding:"1px 5px",background:"rgba(107,96,80,0.12)",color:C.muted,borderRadius:3,flexShrink:0,marginLeft:6}}>📦</span>

:isPosted
  ? <span style={{
      fontSize:7,
      padding:"1px 5px",
      background:`${C.green}18`,
      color:C.green,
      borderRadius:3,
      flexShrink:0,
      marginLeft:6
    }}>
      ✓ POSTED
    </span>
:wasUsed
  ? <span style={{
      fontSize:7,
      padding:"1px 5px",
      background:`${C.amber}18`,
      color:C.amber,
      borderRadius:3,
      flexShrink:0,
      marginLeft:6
    }}>
      {lastUsed?.isoWeek || "Posté"}
    </span>


                           :<span style={{fontSize:7,padding:"1px 5px",background:"rgba(16,185,129,0.12)",color:C.green,borderRadius:3,flexShrink:0,marginLeft:6}}>✅</span>}
                        </div>
                        <div style={{fontSize:8,color:C.muted}}>{(p.opts||p.options||[]).join(" · ")}{p.source==="ai"?" 🤖":""}</div>
                      </div>
                      );
                    });
                  })()}
                </div>

                {/* Schedule + create */}
                <div style={{ padding:"12px", background:"rgba(0,0,0,0.3)", borderRadius:8, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:9, color:C.gold, marginBottom:8 }}>➕ Créer / Planifier</div>
                  <div style={{ fontSize:8, color:C.muted, marginBottom:4 }}>
                    {selectedPoll ? `Sondage sélectionné: "${(selectedPoll.question||selectedPoll.q||"").slice(0,40)}..."` : "Sélectionnez un sondage dans la bibliothèque"}
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>
                      Date de publication (laisser vide = brouillon)
                    </div>
                    <input type="datetime-local" value={pollSchedule} onChange={e=>setPollSchedule(e.target.value)}
                      style={{ width:"100%", padding:"5px 7px", background:"rgba(0,0,0,0.4)",
                        border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:10, outline:"none", boxSizing:"border-box" }}/>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={generatePoll} disabled={!selectedPoll}
                      style={{ flex:1, padding:"7px 0", background:`${C.blue}18`, border:`1px solid ${C.blue}`,
                        borderRadius:7, color:C.blue, cursor:selectedPoll?"pointer":"not-allowed",
                        opacity:selectedPoll?1:0.5, fontSize:10, fontWeight:700 }}>
                      {pollSchedule ? "📅 Planifier sondage" : "✎ Créer brouillon"}
                    </button>
                    {selectedPoll && !selectedPoll.tweetId && (
                      <button onClick={async()=>{
                        if(!window.confirm("Publier ce sondage maintenant sur X?")) return;
                        addLog("🗳️ Publication sondage...");
                        try {
                          const r=await fetch("/api/tweet",{method:"POST",headers:{"Content-Type":"application/json"},
                            body:JSON.stringify({action:"poll",text:selectedPoll.question||selectedPoll.q,
                              pollOptions:selectedPoll.options||selectedPoll.opts,pollDuration:10080})});
                          const d=await r.json();
                          if(d.success){
                            const updated=polls.map(p=>p.id===selectedPoll.id?{...p,status:"published",tweetId:d.id,tweetUrl:`https://twitter.com/TravitoMaroc/status/${d.id}`,postedAt:new Date().toISOString()}:p);
                            const newEntry=selectedPoll.id?updated:[{...selectedPoll,status:"published",tweetId:d.id,tweetUrl:`https://twitter.com/TravitoMaroc/status/${d.id}`,postedAt:new Date().toISOString()},...polls];
                            setPolls(newEntry);
                            await fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"travito:ne_polls",value:JSON.stringify(newEntry)})});
                            addLog(`✅ Sondage publié! ID: ${d.id}`,"success");
                          } else { addLog("❌ Échec publication: "+(d.error||d.message||JSON.stringify(d)),"error"); alert("Échec: "+(d.error||d.message||"Vérifiez les logs")); }
                        } catch(e){ addLog("❌ Erreur: "+e.message,"error"); alert("Erreur: "+e.message); }
                      }}
                        style={{ padding:"7px 12px", background:`${C.green}18`, border:`1px solid ${C.green}`,
                          borderRadius:7, color:C.green, cursor:"pointer", fontSize:10, fontWeight:700 }}>
                        🚀 Publier maintenant
                      </button>
                    )}
                  </div>
                  {/* Manual add to history — for polls posted outside dashboard */}
                  <div style={{ marginTop:10, padding:"8px 10px", background:"rgba(0,0,0,0.2)", borderRadius:6, border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:8, color:C.muted, marginBottom:6 }}>
                      📥 Ajouter un sondage passé à l'historique (posté hors dashboard)
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <input id="manualTweetId" placeholder="Tweet ID (ex: 1234567890)" 
                        style={{ flex:1, padding:"4px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:5, color:C.text, fontSize:9, outline:"none" }}/>
                      <button onClick={async()=>{
                        const tweetId = document.getElementById("manualTweetId")?.value?.trim();
                        if(!selectedPoll){alert("Sélectionnez un sondage dans la bibliothèque");return;}
                        if(!tweetId){alert("Entrez le Tweet ID");return;}
                        const entry={
                          id:Date.now(), question:selectedPoll.question||selectedPoll.q,
                          options:selectedPoll.options||selectedPoll.opts,
                          status:"published", tweetId,
                          tweetUrl:`https://twitter.com/TravitoMaroc/status/${tweetId}`,
                          postedAt:new Date().toISOString(),
                          isoWeek:"W13-2026",
                          createdAt:new Date().toISOString(),
                        };
                        const updated=[entry,...polls];
                        setPolls(updated);
                        await fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
                          body:JSON.stringify({key:"travito:ne_polls",value:JSON.stringify(updated)})});
                        addLog("✅ Sondage ajouté à l'historique","success");
                        document.getElementById("manualTweetId").value="";
                      }} style={{ padding:"4px 10px", background:`${C.blue}18`, border:`1px solid ${C.blue}`, borderRadius:5, color:C.blue, cursor:"pointer", fontSize:9, whiteSpace:"nowrap" }}>
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
                    {tab==="forbidden" && (
              <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", fontWeight:700, marginBottom:8 }}>🚫 BLOCKLIST — Termes interdits likes/reposts</div>
                <div style={{ fontSize:8, color:C.muted, marginBottom:10 }}>Tout tweet contenant ces mots sera ignore. Sauvegarde dans KV automatiquement.</div>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  <input value={newForbidden} onChange={e=>setNewForbidden(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter"&&newForbidden.trim()){
                      const words = newForbidden.split(",").map(w=>w.trim().toLowerCase()).filter(w=>w&&!forbidden.includes(w));
                      if(words.length) setForbidden(p=>[...p,...words]);
                      setNewForbidden("");
                    }}}
                    placeholder="Ajouter termes separes par virgule: war, حرب, missile..."
                    style={{ flex:1, fontSize:9, padding:"4px 8px", background:"rgba(0,0,0,0.3)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:5, color:"#e8dcc8", outline:"none" }}/>
                  <button onClick={()=>{
                    const words = newForbidden.split(",").map(w=>w.trim().toLowerCase()).filter(w=>w&&!forbidden.includes(w));
                    if(words.length){setForbidden(p=>[...p,...words]);setNewForbidden("");}
                  }}
                    style={{ fontSize:8, padding:"4px 10px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:5, color:"#ef4444", cursor:"pointer", fontWeight:700 }}>+ Ajouter</button>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {(forbidden||[]).map((word,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:3, padding:"2px 8px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:12 }}>
                      <span style={{ fontSize:8, color:"#ef4444" }}>{word}</span>
                      <button onClick={()=>setForbidden(p=>p.filter((_,j)=>j!==i))}
                        style={{ fontSize:9, color:"#6b6050", background:"none", border:"none", cursor:"pointer", padding:"0 2px" }}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:10, fontSize:7, color:"#6b6050" }}>{(forbidden||[]).length} termes bloques</div>
              </div>
            )}
            {tab==="settings" && (
          <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>

            {/* CRON STATUS BANNER */}
            <div style={{ padding:"8px 12px",background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:8,marginBottom:12,display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ fontSize:14 }}>🤖</span>
              <div>
                <div style={{ fontSize:9,color:"#10b981",fontWeight:700 }}>CRON ACTIF — engage.js tourne chaque jour ouvrable a 09:00 UTC</div>
                <div style={{ fontSize:8,color:"#6b6050" }}>Likes, follows, reposts automatiques. Sondage chaque lundi. Modifiez les limites ci-dessous.</div>
              </div>
            </div>

            {/* EDITABLE LIMITS */}
            <div style={{ background:"rgba(20,28,48,0.9)",border:"1px solid rgba(212,175,55,0.3)",borderRadius:9,padding:"12px",marginBottom:12 }}>
              <div style={{ fontSize:9,color:"#D4AF37",fontFamily:"monospace",marginBottom:10,fontWeight:700 }}>LIMITES QUOTIDIENNES / HEBDOMADAIRES</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                {[
                  ["Likes max/jour",         "likes",          4,  10],
                  ["Follows max/jour",       "follows",        1,  10],
                  ["Reposts max/jour",       "reposts",        3,  10],
                  ["Replies max/jour",       "replies",        2,  10],
                  ["Unfollows max/jour",     "unfollowPerDay", 2,  10],
                  ["Sondages max/semaine",   "pollsPerWeek",   1,  4 ],
                ].map(([label, key, min, max]) => (
                  <div key={key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7 }}>
                    <span style={{ fontSize:9,color:"#e8dcc8" }}>{label}</span>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <button onClick={()=>setSettings(p=>({...p,limits:{...(p.limits||{}), [key]:Math.max(0,((p.limits||{})[key]||0)-1)}}))}
                        style={{ width:20,height:20,borderRadius:4,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444",cursor:"pointer",fontSize:12,lineHeight:1 }}>-</button>
                      <span style={{ fontSize:11,fontWeight:700,color:"#D4AF37",fontFamily:"monospace",minWidth:16,textAlign:"center" }}>
                        {(settings.limits||{})[key] ?? 0}
                      </span>
                      <button onClick={()=>setSettings(p=>({...p,limits:{...(p.limits||{}), [key]:Math.min(max,((p.limits||{})[key]||min)+1)}}))}
                        style={{ width:20,height:20,borderRadius:4,background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.3)",color:"#10b981",cursor:"pointer",fontSize:12,lineHeight:1 }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:7,color:"#6b6050",marginTop:8 }}>
                Les limites sont synchronisees avec le cron automatiquement. Sondages: seulement le lundi.
              </div>
              {/* Poll duration */}
              <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:9, color:"#e8dcc8" }}>Duree sondage</div>
                    <div style={{ fontSize:7, color:"#6b6050", marginTop:1 }}>
                      1h–120h · ou 1–4 jours · X max = 5 jours (7200 min)
                    </div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:"#D4AF37", fontFamily:"monospace" }}>
                    {(settings.pollDuration||1440) >= 1440
                      ? Math.round((settings.pollDuration||1440)/1440) + "j"
                      : (settings.pollDuration||1440)/60 + "h"}
                    {" "}({settings.pollDuration||1440} min)
                  </span>
                </div>
                {/* Day presets — single select */}
                <div style={{ display:"flex", gap:5, marginBottom:8 }}>
                  {[[1,1440],[2,2880],[3,4320],[4,5760]].map(([days,mins])=>{
                    const active = (settings.pollDuration||1440) === mins;
                    return (
                      <button key={days}
                        onClick={()=>setSettings(p=>({...p, pollDuration:mins}))}
                        style={{ flex:1, fontSize:9, padding:"4px 0", borderRadius:5, cursor:"pointer",
                          fontWeight:active?700:400,
                          background:active?"rgba(212,175,55,0.15)":"rgba(0,0,0,0.3)",
                          border:"1px solid "+(active?"#D4AF37":"rgba(212,175,55,0.18)"),
                          color:active?"#D4AF37":"#6b6050" }}>
                        {days}j
                      </button>
                    );
                  })}
                </div>
                {/* Free integer hours input */}
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:8, color:"#6b6050", flexShrink:0 }}>Heures (1–120):</span>
                  <input
                    type="number" min={1} max={120}
                    value={Math.round((settings.pollDuration||1440)/60)}
                    onChange={e=>{
                      const h = Math.max(1, Math.min(120, parseInt(e.target.value)||1));
                      setSettings(p=>({...p, pollDuration: h*60}));
                    }}
                    style={{ width:60, fontSize:10, fontWeight:700, padding:"3px 7px", textAlign:"center",
                      background:"rgba(0,0,0,0.4)", border:"1px solid rgba(212,175,55,0.3)",
                      borderRadius:5, color:"#D4AF37", outline:"none", fontFamily:"monospace" }}/>
                  <span style={{ fontSize:7.5, color:"#6b6050" }}>
                    → {Math.round((settings.pollDuration||1440)/60)}h = {settings.pollDuration||1440} min
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"12px" }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:10,textTransform:"uppercase" }}>Exécution</div>
                {[
                  ["Mode Simulation (test sans poster)", "simulationMode", "toggle"],
                  ["Mode Approbation (confirmer avant d'agir)", "approvalMode", "toggle"],
                  ["Auto-run (planifié)", "autoRun", "toggle"],
                ].map(([l,k,t])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ fontSize:9,color:C.text }}>{l}</span>
                    <button onClick={()=>setSettings(p=>({...p,[k]:!p[k]}))}
                      style={{ padding:"3px 12px",borderRadius:20,background:settings[k]?`${C.green}18`:"rgba(255,255,255,0.06)",border:`1px solid ${settings[k]?C.green:C.border}`,color:settings[k]?C.green:C.muted,cursor:"pointer",fontSize:9,fontWeight:700 }}>
                      {settings[k]?"ON":"OFF"}
                    </button>
                  </div>
                ))}
                <div style={{ padding:"8px 0" }}>
                  <div style={{ fontSize:9,color:C.text,marginBottom:4 }}>Seuil relevance ({settings.safetyThreshold}/100)</div>
                  <input type="range" min="0" max="100" value={settings.safetyThreshold}
                    onChange={e=>setSettings(p=>({...p,safetyThreshold:parseInt(e.target.value)}))}
                    style={{ width:"100%" }}/>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:7,color:C.muted }}>
                    <span>0 (permissif)</span><span>100 (strict)</span>
                  </div>
                </div>
              </div>
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"12px" }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:10,textTransform:"uppercase" }}>Langues Ciblées</div>
                {[["Français","langFR"],["Arabe","langAR"],["Anglais","langEN"]].map(([l,k])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ fontSize:9,color:C.text }}>{l}</span>
                    <button onClick={()=>setSettings(p=>({...p,[k]:!p[k]}))}
                      style={{ padding:"3px 12px",borderRadius:20,background:settings[k]?`${C.blue}18`:"rgba(255,255,255,0.06)",border:`1px solid ${settings[k]?C.blue:C.border}`,color:settings[k]?C.blue:C.muted,cursor:"pointer",fontSize:9,fontWeight:700 }}>
                      {settings[k]?"ON":"OFF"}
                    </button>
                  </div>
                ))}

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
