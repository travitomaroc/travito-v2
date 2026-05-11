// ================================================================
//  CTO — Chief Technology Officer
//  Manages: IT Admin Agent, IT Integration Agent, IT Operator
// ================================================================
import { useState, useEffect } from "react";

// ================================================================
//  DATA PROTECTION RULES — DO NOT MODIFY BELOW MARKERS
//  User data lives in localStorage — code updates NEVER erase it.
//  Seed data only loads when localStorage is empty (first run).
//  Future updates: touch UI/features only, never seed arrays.
// ================================================================

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(212,175,55,0.18)",
  gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  green:"#10b981", red:"#ef4444", blue:"#1DA1F2",
  amber:"#f59e0b", purple:"#8b5cf6", card:"rgba(20,28,48,0.9)",
};

const AGENTS = [
  { id:"admin",       icon:"🖥️", label:"IT Admin Agent",       sub:"Software & Subscriptions", color:"#1DA1F2" },
  { id:"integration", icon:"🔌", label:"IT Integration Agent", sub:"APIs & Integrations",       color:"#8b5cf6" },
  { id:"operator",    icon:"⚙️", label:"IT Operator",          sub:"Operations (coming soon)",  color:"#6b6050" },
];

// ── Helpers ───────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const store = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch{} };
const load  = (key, def) => { try { const v=localStorage.getItem(key); return v?JSON.parse(v):def; } catch{ return def; } };

// ================================================================
//  IT ADMIN — Software Registry + Subscriptions
// ================================================================
function ITAdmin() {
  const [tab, setTab]   = useState("software");
  const [software, setSoftware] = useState(()=>{ const s=load("it_software",null); return (s&&s.length>0)?s:[{"id": "sw001", "name": "ElevenLabs", "url": "https://elevenlabs.io", "login": "travito.maroc@gmail.com", "password": "", "description": "AI voiceover generation in AR/FR/EN for YouTube videos", "status": "Active", "icon": "\ud83c\udf99\ufe0f"}, {"id": "sw002", "name": "Shotstack", "url": "https://shotstack.io", "login": "travito.maroc@gmail.com", "password": "", "description": "Cloud video assembly and rendering - production environment", "status": "Active", "icon": "\ud83c\udfac"}, {"id": "sw003", "name": "fal.ai", "url": "https://fal.ai", "login": "travito.maroc@gmail.com", "password": "", "description": "Veo 3 Fast AI video generation - $0.64/clip pay-as-you-go", "status": "Active", "icon": "\ud83c\udfa5"}, {"id": "sw004", "name": "Anthropic", "url": "https://anthropic.com", "login": "travito.maroc@gmail.com", "password": "", "description": "Claude API - powers all AI agents (A1 writer, A2 quality, A3 poster, A4 blogger, CEO, CFO, CTO...)", "status": "Active", "icon": "\ud83e\udd16"}, {"id": "sw005", "name": "Vercel", "url": "https://vercel.com", "login": "travito.maroc@gmail.com", "password": "", "description": "Hosting + serverless functions + cron jobs - Free Hobby plan", "status": "Active", "icon": "\u25b2"}, {"id": "sw006", "name": "Pexels", "url": "https://pexels.com", "login": "travito.maroc@gmail.com", "password": "", "description": "Free stock images API for Special Events agent - 200 req/hour", "status": "Active", "icon": "\ud83d\udcf7"}, {"id": "sw007", "name": "Tavily", "url": "https://tavily.com", "login": "travito.maroc@gmail.com", "password": "", "description": "AI search API - used by Events Checker + Self-Improve agents", "status": "Active", "icon": "\ud83d\udd0d"}, {"id": "sw008", "name": "Upstash", "url": "https://upstash.com", "login": "travito.maroc@gmail.com", "password": "", "description": "Redis KV storage for agent memory and cron stats - Free tier", "status": "Active", "icon": "\ud83d\uddc4\ufe0f"}, {"id": "sw009", "name": "X Corp (Twitter)", "url": "https://developer.twitter.com", "login": "travito.snet@gmail.com", "password": "", "description": "X API v2 - posting tweets @TravitoMaroc - pay-per-use $0.01/tweet", "status": "Active", "icon": "\ud835\udd4f"}, {"id": "sw010", "name": "Google Cloud Console", "url": "https://console.cloud.google.com", "login": "travito.maroc@gmail.com", "password": "", "description": "Manages all Google APIs: YouTube Data API v3, Search Console API, Analytics Data API (GA4). Free tier. Service Account: GOOGLE_SC_CLIENT_EMAIL + GOOGLE_SC_PRIVATE_KEY configured in Vercel.", "status": "Active", "icon": "☁️", "envVars": ["GOOGLE_SC_CLIENT_EMAIL", "GOOGLE_SC_PRIVATE_KEY", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"], "cost": "Free", "plan": "Free Tier"}, {"id": "sw011", "name": "Supadata", "url": "https://supadata.ai", "login": "travito.maroc@gmail.com", "password": "", "description": "YouTube transcript extraction API for YouTube Manager agent", "status": "Active", "icon": "\ud83d\udcdd"}, {"id": "sw012", "name": "WordPress (travito.ma)", "url": "https://travito.ma", "login": "Travito Agents", "password": "6BNo j5r8 EXMf ZcSY GcuK sarX", "description": "Main classified ads site - A4 Blogger publishes articles to category 9364", "status": "Active", "icon": "\ud83c\udf10"}, {"id": "sw013", "name": "Google Search Console", "url": "https://search.google.com/search-console", "login": "travito.maroc@gmail.com", "password": "", "description": "SEO monitoring: keyword rankings, impressions, CTR, page coverage, sitemap status, indexing errors. Property: sc-domain:travito.ma. API via service account. Data refreshed daily 07:00 via /api/seo-data.", "status": "Active", "icon": "🔍", "envVars": ["GOOGLE_SC_SITE_URL", "GOOGLE_SC_CLIENT_EMAIL", "GOOGLE_SC_PRIVATE_KEY"], "cost": "Free", "plan": "Free"}, {"id": "sw014", "name": "Google Analytics 4", "url": "https://analytics.google.com", "login": "travito.maroc@gmail.com", "password": "", "description": "Traffic analytics for travito.ma: sessions, users, pageviews, bounce rate, channel attribution (organic/direct/social), daily trends. Site Kit plugin installed. Data refreshed daily via /api/seo-data.", "status": "Active", "icon": "📊", "envVars": ["GA4_PROPERTY_ID"], "cost": "Free", "plan": "Free"}, {"id": "sw015", "name": "RankMath SEO", "url": "https://rankmath.com", "login": "travito.maroc@gmail.com", "password": "", "description": "WordPress SEO plugin — titles, metas, schema, sitemap, robots.txt", "status": "Active", "icon": "🏆"}]; });
  const [subs, setSubs]         = useState(()=>{ const s=load("it_subs",null); return (s&&s.length>0)?s:[{"id": "sub001", "software": "ElevenLabs", "plan": "Starter", "cost": "11", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "2026-04-01", "status": "Active", "notes": "Voiceover AI - AR/FR/EN generation"}, {"id": "sub002", "software": "Shotstack", "plan": "Production", "cost": "19", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "2026-04-01", "status": "Active", "notes": "Video assembly - 5.85 credits remaining"}, {"id": "sub003", "software": "fal.ai", "plan": "Pay-as-you-go", "cost": "20", "currency": "USD", "cycle": "Usage", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "$20 initial credits - ~$0.64/clip Veo 3 Fast"}, {"id": "sub004", "software": "Anthropic", "plan": "Pay-as-you-go", "cost": "5", "currency": "USD", "cycle": "Usage", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "~$0.02/article est. ~$5/month"}, {"id": "sub005", "software": "X Corp (Twitter)", "plan": "Pay-per-use", "cost": "3", "currency": "USD", "cycle": "Usage", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "$0.01/tweet - est. 300 tweets/month"}, {"id": "sub006", "software": "Vercel", "plan": "Hobby", "cost": "0", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "Free - serverless + cron jobs"}, {"id": "sub007", "software": "Pexels", "plan": "Free", "cost": "0", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "Free tier - 200 req/hour"}, {"id": "sub008", "software": "Tavily", "plan": "Free", "cost": "0", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "Free tier - AI search"}, {"id": "sub009", "software": "Upstash", "plan": "Free", "cost": "0", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "Free Redis KV - agent memory"}, {"id": "sub010", "software": "Google Cloud", "plan": "Free Tier", "cost": "0", "currency": "USD", "cycle": "Mensuel", "startDate": "2026-01-01", "renewalDate": "", "status": "Active", "notes": "YouTube Data API v3 free quota"}, {"id": "sub011", "software": "RankMath SEO", "plan": "Free (Plugin)", "cost": "0", "currency": "USD", "billingCycle": "Free", "renewalDate": "N/A", "status": "Active", "notes": "WordPress SEO plugin — free version installed on travito.ma", "icon": "🏆"}, {"id": "sub012", "software": "Google Search Console", "plan": "Free", "cost": "0", "currency": "USD", "billingCycle": "Free", "renewalDate": "N/A", "status": "Active", "notes": "Free — verified sc-domain:travito.ma", "icon": "🔍"}, {"id": "sub013", "software": "Google Analytics 4", "plan": "Free", "cost": "0", "currency": "USD", "billingCycle": "Free", "renewalDate": "N/A", "status": "Active", "notes": "Free — GA4 property connected to travito.ma", "icon": "📊"}]; });
  const [editSW, setEditSW]   = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [showPwd, setShowPwd] = useState({});
  const [jobStatus, setJobStatus] = useState({});
  const [enabled, setEnabled]   = useState(()=>load("it_jobs_enabled",{}));

  useEffect(()=>store("it_software",software),[software]);
  useEffect(()=>store("it_subs",subs),[subs]);
  useEffect(()=>store("it_jobs_enabled",enabled),[enabled]);

  const JOBS = [
    // ── X / CONTENT PIPELINE ─────────────────────────────────────
    { id:"cron_morning",   agent:"A1→A4 X Pipeline",    path:"/api/cron",                        type:"auto",   scheduleUTC:"0 8 * * 1-5",  scheduleMorocco:"09:00", zone:"UTC+1", days:"Lun-Ven",   description:"Tavily search + Article Claude + Blog WordPress + 3 tweets @TravitoMaroc" },
    { id:"cron_evening",   agent:"A1→A4 X Pipeline",    path:"/api/cron",                        type:"auto",   scheduleUTC:"0 21 * * 1-5", scheduleMorocco:"22:00", zone:"UTC+1", days:"Lun-Ven",   description:"Resumer soir uniquement — aucun post" },
    // ── ENGAGEMENT ───────────────────────────────────────────────
    { id:"engage_morning", agent:"Network Engager",     path:"/api/engage",                      type:"auto",   scheduleUTC:"0 9 * * 1-5",  scheduleMorocco:"10:00", zone:"UTC+1", days:"Lun-Ven",   description:"Likes, follows, reposts, replies — quotas journaliers" },
    { id:"engage_evening", agent:"Network Engager",     path:"/api/engage",                      type:"auto",   scheduleUTC:"0 18 * * 1-5", scheduleMorocco:"19:00", zone:"UTC+1", days:"Lun-Ven",   description:"Session soir — complete les quotas restants" },
    // ── SPECIAL EVENTS ───────────────────────────────────────────
    { id:"events_post",    agent:"Special Events",      path:"/api/events-post",                 type:"auto",   scheduleUTC:"30 7 * * *",   scheduleMorocco:"08:30", zone:"UTC+1", days:"Quotidien", description:"Post evenement special si programme aujourd'hui" },
    { id:"events_checker", agent:"Special Events",      path:"/api/events-checker",              type:"auto",   scheduleUTC:"0 9 1 * *",    scheduleMorocco:"10:00", zone:"UTC+1", days:"1er/mois",  description:"Mise a jour calendrier evenements mensuel" },
    // ── YOUTUBE ──────────────────────────────────────────────────
    { id:"yt_learn",       agent:"YouTube Manager",     path:"/api/youtube?action=weekly_learn", type:"auto",   scheduleUTC:"0 7 * * 1",    scheduleMorocco:"08:00", zone:"UTC+1", days:"Lundi",     description:"Apprentissage hebdomadaire — analyse performances YouTube" },
    { id:"yt_ideation",    agent:"YouTube Ideation",    path:"dashboard",                        type:"manual", scheduleUTC:"—",            scheduleMorocco:"Manuel", zone:"—",    days:"Manuel",    description:"Generation idees + QC + Bible — lance depuis le dashboard" },
    { id:"yt_video",       agent:"YouTube Video",       path:"dashboard",                        type:"manual", scheduleUTC:"—",            scheduleMorocco:"Manuel", zone:"—",    days:"Manuel",    description:"Production Pexels + ElevenLabs + Shotstack — lance depuis le dashboard" },
    { id:"yt_publish",     agent:"YouTube Publisher",   path:"/api/youtube",                     type:"manual", scheduleUTC:"—",            scheduleMorocco:"Manuel", zone:"—",    days:"Manuel",    description:"Publication YouTube — OAuth travito.snet@gmail.com requis" },
    // ── AUDIT & PERFORMANCE ──────────────────────────────────────
    { id:"audit",          agent:"Audit Director",      path:"dashboard",                        type:"manual", scheduleUTC:"—",            scheduleMorocco:"Manuel", zone:"—",    days:"Manuel",    description:"Audit posts X — score qualite AI, lecture travito:x_history KV" },
    { id:"perf",           agent:"Performance Analyst", path:"dashboard",                        type:"manual", scheduleUTC:"—",            scheduleMorocco:"Manuel", zone:"—",    days:"Manuel",    description:"Analyse performances — metriques engagement, qualite, tendances" },
    // ── SYSTEM ───────────────────────────────────────────────────
    { id:"self_improve",   agent:"Self-Improve Agent",  path:"/api/self-improve",                type:"auto",   scheduleUTC:"0 10 1 * *",   scheduleMorocco:"11:00", zone:"UTC+1", days:"1er/mois",  description:"Auto-amelioration prompts et strategies IA" },
    { id:"seo_daily",    agent:"SEO Director",     path:"/api/seo-data?force=true",     type:"auto",   scheduleUTC:"0 7 * * *",    scheduleMorocco:"08:00", zone:"UTC+1", days:"Quotidien",  description:"Fetch Search Console + GA4 data → cache KV 6h → AI insights" },
    { id:"seo_monitor",  agent:"SEO Monitoring",    path:"/api/seo-agent?action=monitoring", type:"auto", scheduleUTC:"30 7 * * 1", scheduleMorocco:"08:30", zone:"UTC+1", days:"Lundi",      description:"Rapport hebdo: drops, changes, alerts, next actions" },
  ];

  const loadJobStatus = () => {
    // cron morning/evening — from last_run
    fetch("/api/kv?key=travito:last_run").then(r=>r.json()).then(d=>{
      if(d.success&&d.config){
        setJobStatus(p=>({...p,
          cron_morning:{lastRun:d.config.ranAt, status:d.config.success?"success":"error", info:d.config.topic},
          cron_evening:{lastRun:d.config.ranAt, status:"pending", info:"Résumé seulement"},
        }));
      }
    }).catch(()=>{});
    // engage — from ne_quota
    fetch("/api/kv?key=travito:ne_quota").then(r=>r.json()).then(d=>{
      if(d.success&&d.config){
        const today=new Date().toISOString().split("T")[0];
        const ran=d.config.date===today;
        const ok=ran&&((d.config.likes||0)+(d.config.follows||0)>0);
        const info=ran?`Likes:${d.config.likes||0} Follows:${d.config.follows||0} Replies:${d.config.replies||0}`:"";
        setJobStatus(p=>({...p,
          engage_morning:{lastRun:ran?today:null, status:ok?"success":"pending", info},
          engage_evening:{lastRun:ran?today:null, status:ok?"success":"pending", info},
        }));
      }
    }).catch(()=>{});
    // cron ping — confirm cron actually fired
    fetch("/api/kv?key=travito:cron_last_ping").then(r=>r.json()).then(d=>{
      if(d.success&&d.config&&d.config.firedAt){
        const firedAt = d.config.firedAt;
        const today = new Date().toISOString().split("T")[0];
        const firedToday = firedAt.startsWith(today);
        setJobStatus(p=>({...p,
          cron_morning:{...p.cron_morning, lastRun:firedAt,
            status:firedToday?"success":"error",
            info:(p.cron_morning?.info||"")+(firedToday?"":" — pas de run aujourd'hui")},
        }));
      }
    }).catch(()=>{});
  };

  useEffect(()=>{
    loadJobStatus();
    // Auto-refresh every 30 seconds when jobs tab is active
    const interval = setInterval(()=>{ if(tab==="jobs") loadJobStatus(); }, 30000);
    return ()=>clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab]);

  

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Tabs */}
      <div style={{ display:"flex", gap:5, padding:"6px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {[["software","💾 Software Registry"],["subscriptions","📋 Subscriptions"],["jobs","⚙️ Jobs Scheduler"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ fontSize:9, padding:"4px 12px", borderRadius:7, cursor:"pointer",
              background:tab===id?`${C.blue}18`:"transparent",
              border:`1px solid ${tab===id?C.blue:C.border}`,
              color:tab===id?C.blue:C.muted }}>
            {label}
          </button>
        ))}
        {tab !== "jobs" && (
          <button onClick={()=>tab==="software"?setEditSW({}):setEditSub({})}
            style={{ marginLeft:"auto", fontSize:9, padding:"4px 12px", borderRadius:7, cursor:"pointer",
              background:`${C.green}18`, border:`1px solid ${C.green}`, color:C.green }}>
            + Ajouter
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>

        {/* ── SOFTWARE REGISTRY ── */}
        {tab==="software" && (
          <div>
            {software.length===0 && (
              <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💾</div>
                <div>Aucun logiciel enregistré</div>
              </div>
            )}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9 }}>
              {software.length>0 && (
                <thead>
                  <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    {["Nom","URL","Login","Mot de passe","Description","Statut","Actions"].map(h=>(
                      <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:8, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {software.map(sw=>(
                  <tr key={sw.id} style={{ borderBottom:`1px solid ${C.border}22`, opacity:sw.status==="Disabled"?0.5:1 }}>
                    <td style={{ padding:"7px 8px", color:C.text, fontWeight:700 }}>
                      {sw.icon && <span style={{ marginRight:4 }}>{sw.icon}</span>}{sw.name}
                    </td>
                    <td style={{ padding:"7px 8px" }}>
                      {sw.url && <a href={sw.url} target="_blank" rel="noopener" style={{ color:C.blue, fontSize:8 }}>{sw.url.replace(/^https?:\/\//,"")}</a>}
                    </td>
                    <td style={{ padding:"7px 8px", color:C.muted, fontFamily:"monospace", fontSize:8 }}>{sw.login}</td>
                    <td style={{ padding:"7px 8px", fontFamily:"monospace", fontSize:8, color:C.text }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span>{showPwd[sw.id] ? sw.password : "••••••••"}</span>
                        <button onClick={()=>setShowPwd(p=>({...p,[sw.id]:!p[sw.id]}))}
                          style={{ fontSize:7, padding:"1px 5px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:3, color:C.muted, cursor:"pointer" }}>
                          {showPwd[sw.id]?"🙈":"👁️"}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding:"7px 8px", color:C.muted, maxWidth:220 }}>
                      <div style={{ fontSize:8, marginBottom:2 }}>{sw.description}</div>
                      {sw.envVars?.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:2, marginTop:3 }}>
                          {sw.envVars.map((v,i)=>(
                            <span key={i} style={{ fontSize:6.5, padding:"1px 4px", borderRadius:3,
                              background:"rgba(16,185,129,0.1)", color:"#10b981",
                              border:"1px solid rgba(16,185,129,0.25)", fontFamily:"monospace" }}>{v}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:"7px 8px", textAlign:"center" }}>
                      <span style={{ fontSize:8, fontFamily:"monospace", fontWeight:700,
                        color:(!sw.cost||sw.cost==="Free"||sw.cost==="0")?"#10b981":"#D4AF37" }}>
                        {(!sw.cost||sw.cost==="Free"||sw.cost==="0") ? "Gratuit" : sw.cost}
                      </span>
                    </td>
                    <td style={{ padding:"7px 8px" }}>
                      <span style={{ fontSize:7, padding:"2px 7px", borderRadius:10,
                        background:sw.status==="Active"?`${C.green}18`:`${C.red}12`,
                        color:sw.status==="Active"?C.green:C.red,
                        border:`1px solid ${sw.status==="Active"?C.green:C.red}44` }}>
                        {sw.status}
                      </span>
                    </td>
                    <td style={{ padding:"7px 8px" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>setEditSW(sw)}
                          style={{ fontSize:7, padding:"2px 7px", background:`${C.blue}12`, border:`1px solid ${C.blue}44`, borderRadius:4, color:C.blue, cursor:"pointer" }}>
                          ✏️
                        </button>
                        <button onClick={()=>toggleStatus(sw.id)}
                          style={{ fontSize:7, padding:"2px 7px", background:`${C.amber}12`, border:`1px solid ${C.amber}44`, borderRadius:4, color:C.amber, cursor:"pointer" }}>
                          {sw.status==="Active"?"🚫":"✅"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SUBSCRIPTIONS ── */}
        {tab==="subscriptions" && (
          <div>
            {subs.length===0 && (
              <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
                <div>Aucun abonnement enregistré</div>
              </div>
            )}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9 }}>
              {subs.length>0 && (
                <thead>
                  <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    {["Logiciel","Plan","Coût","Cycle","Début","Renouvellement","Statut","Notes","Actions"].map(h=>(
                      <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:8, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {subs.map(s=>(
                  <tr key={s.id} style={{ borderBottom:`1px solid ${C.border}22`, opacity:s.status==="Expired"||s.status==="Disabled"?0.5:1 }}>
                    <td style={{ padding:"7px 8px", color:C.text, fontWeight:700 }}>{s.software}</td>
                    <td style={{ padding:"7px 8px", color:C.muted }}>{s.plan}</td>
                    <td style={{ padding:"7px 8px", color:C.green, fontFamily:"monospace" }}>{s.cost} {s.currency||"USD"}</td>
                    <td style={{ padding:"7px 8px", color:C.muted }}>{s.cycle}</td>
                    <td style={{ padding:"7px 8px", color:C.muted, fontSize:8 }}>{s.startDate}</td>
                    <td style={{ padding:"7px 8px", color:C.amber, fontSize:8 }}>{s.renewalDate}</td>
                    <td style={{ padding:"7px 8px" }}>
                      <span style={{ fontSize:7, padding:"2px 7px", borderRadius:10,
                        background:s.status==="Active"?`${C.green}18`:s.status==="Expired"?`${C.red}12`:`${C.amber}12`,
                        color:s.status==="Active"?C.green:s.status==="Expired"?C.red:C.amber,
                        border:`1px solid ${s.status==="Active"?C.green:s.status==="Expired"?C.red:C.amber}44` }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding:"7px 8px", color:C.muted, fontSize:8, maxWidth:160 }}>{s.notes}</td>
                    <td style={{ padding:"7px 8px" }}>
                      <button onClick={()=>setEditSub(s)}
                        style={{ fontSize:7, padding:"2px 7px", background:`${C.blue}12`, border:`1px solid ${C.blue}44`, borderRadius:4, color:C.blue, cursor:"pointer" }}>
                        ✏️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* ── JOBS SCHEDULER ── */}
        {tab==="jobs" && (
          <div>
            <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(29,161,242,0.06)",
              border:"1px solid rgba(29,161,242,0.2)",borderRadius:8,fontSize:8,color:"#6b6050",lineHeight:1.6}}>
              ⏰ Heures en <strong style={{color:"#e8dcc8"}}>heure Maroc (UTC+1)</strong> — hardcodées dans vercel.json.<br/>
              Pour changer l'heure : modifiez vercel.json + redéployez.<br/>
              ✅ Enable/Disable : instantané, sans redéploiement.
            </div>
            {JOBS.map(job => {
              const js = jobStatus[job.id] || {};
              const isOn = enabled[job.id] !== false;
              return (
                <div key={job.id} style={{marginBottom:8,padding:"10px 12px",borderRadius:8,
                  background:isOn?"rgba(0,0,0,0.2)":"rgba(0,0,0,0.08)",
                  border:`1px solid ${isOn?C.border:"rgba(107,96,80,0.15)"}`,
                  opacity:isOn?1:0.55}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:9,fontWeight:700,color:C.text}}>{job.agent}</span>
                        <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,
                          background:"rgba(29,161,242,0.1)",color:C.blue,
                          border:"1px solid rgba(29,161,242,0.2)",fontFamily:"monospace"}}>
                          {job.path}
                        </span>
                        {!isOn && <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,
                          background:"rgba(239,68,68,0.1)",color:C.red,
                          border:"1px solid rgba(239,68,68,0.2)"}}>DÉSACTIVÉ</span>}
                      </div>
                      <div style={{fontSize:7.5,color:C.muted,marginBottom:6,lineHeight:1.4}}>
                        {job.description}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        {/* Type badge */}
                        <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,fontWeight:700,
                          background:job.type==="auto"?"rgba(16,185,129,0.1)":"rgba(139,92,246,0.1)",
                          color:job.type==="auto"?C.green:"#8b5cf6",
                          border:`1px solid ${job.type==="auto"?"rgba(16,185,129,0.3)":"rgba(139,92,246,0.3)"}`}}>
                          {job.type==="auto"?"🤖 Auto":"👤 Manuel"}
                        </span>
                        {/* Schedule */}
                        {job.type==="auto" ? (
                          <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",
                            background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.2)",
                            borderRadius:5}}>
                            <span style={{fontSize:10,fontWeight:700,color:C.gold,fontFamily:"monospace"}}>
                              {job.scheduleMorocco}
                            </span>
                            <span style={{fontSize:7.5,color:C.muted}}>{job.zone}</span>
                            <span style={{fontSize:7,color:"#4a4030",fontFamily:"monospace"}}>
                              {"(UTC "+job.scheduleUTC.split(" ")[1].padStart(2,"0")+":"+job.scheduleUTC.split(" ")[0].padStart(2,"0")+")"}
                            </span>
                          </div>
                        ) : (
                          <span style={{fontSize:7.5,color:"#6b6050",fontStyle:"italic"}}>
                            Lancé depuis le dashboard
                          </span>
                        )}
                        <span style={{fontSize:7.5,color:C.muted,padding:"3px 8px",
                          background:"rgba(0,0,0,0.2)",borderRadius:5,border:`1px solid ${C.border}`}}>
                          {"📅 "+job.days}
                        </span>
                        {js.lastRun && (
                          <span style={{fontSize:7.5,color:C.muted}}>
                            {"Dernier: "}
                            <span style={{color:C.text}}>
                              {new Date(js.lastRun).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                            </span>
                          </span>
                        )}
                        {js.status && (
                          <span style={{fontSize:7,padding:"2px 7px",borderRadius:4,fontWeight:700,
                            background:js.status==="success"?"rgba(16,185,129,0.1)":js.status==="error"?"rgba(239,68,68,0.1)":"rgba(107,96,80,0.1)",
                            color:js.status==="success"?C.green:js.status==="error"?C.red:C.muted,
                            border:`1px solid ${js.status==="success"?"rgba(16,185,129,0.3)":js.status==="error"?"rgba(239,68,68,0.3)":"rgba(107,96,80,0.2)"}`}}>
                            {js.status==="success"?"✅ OK":js.status==="error"?"❌ Erreur":"⏳"}
                            {js.info?" — "+js.info.slice(0,25):""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <button onClick={()=>setEnabled(p=>({...p,[job.id]:!isOn}))}
                        style={{width:44,height:24,borderRadius:12,cursor:"pointer",
                          background:isOn?C.green:"rgba(107,96,80,0.3)",border:"none",position:"relative"}}>
                        <div style={{position:"absolute",top:3,left:isOn?22:3,width:18,height:18,
                          borderRadius:"50%",background:"white"}}/>
                      </button>
                      <span style={{fontSize:6.5,color:isOn?C.green:C.muted,fontWeight:700}}>
                        {isOn?"ON":"OFF"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:10,padding:"8px 12px",background:"rgba(0,0,0,0.15)",
              border:`1px solid ${C.border}`,borderRadius:8,fontSize:7.5,color:C.muted,lineHeight:1.6}}>
              {"💡 Pour modifier une heure : éditez vercel.json → poussez sur GitHub → Vercel redéploie."}<br/>
              {"Note: UTC+1 = heure Maroc standard (hiver) · UTC+0 = heure Maroc été"}
            </div>
          </div>
        )}

      </div>

      {/* ── SOFTWARE FORM MODAL ── */}
      {editSW && <SoftwareForm initial={editSW} onSave={saveSW} onClose={()=>setEditSW(null)} C={C}/>}
      {editSub && <SubForm initial={editSub} software={software} onSave={saveSub} onClose={()=>setEditSub(null)} C={C}/>}
    </div>
  );
}

function SoftwareForm({ initial, onSave, onClose, C }) {
  const [form, setForm] = useState({ name:"", url:"", login:"", password:"", description:"", icon:"", status:"Active", ...initial });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
      <div style={{ background:"rgba(15,22,40,0.98)", border:`1px solid ${C.gold}`, borderRadius:12, padding:24, width:480, maxHeight:"80vh", overflowY:"auto" }}>
        <div style={{ fontSize:11, color:C.gold, fontFamily:"monospace", marginBottom:16 }}>{form.id?"✏️ Modifier logiciel":"💾 Nouveau logiciel"}</div>
        {[
          ["name","Nom *","text"],["icon","Icône (emoji)","text"],
          ["url","URL (.com)","url"],["login","Login / Email","text"],
          ["password","Mot de passe","password"],["description","Description","textarea"],
        ].map(([key,label,type])=>(
          <div key={key} style={{ marginBottom:10 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{label}</div>
            {type==="textarea" ? (
              <textarea value={form[key]||""} onChange={e=>set(key,e.target.value)} rows={3}
                style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", resize:"vertical", boxSizing:"border-box" }}/>
            ) : (
              <input type={type} value={form[key]||""} onChange={e=>set(key,e.target.value)}
                style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", boxSizing:"border-box" }}/>
            )}
          </div>
        ))}
        {form.id && (
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Statut</div>
            <select value={form.status} onChange={e=>set("status",e.target.value)}
              style={{ padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none" }}>
              <option value="Active">Active</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>
        )}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
          <button onClick={onClose} style={{ padding:"6px 14px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", fontSize:9 }}>Annuler</button>
          <button onClick={()=>onSave(form)} disabled={!form.name}
            style={{ padding:"6px 14px", background:`${C.green}18`, border:`1px solid ${C.green}`, borderRadius:7, color:C.green, cursor:"pointer", fontSize:9, fontWeight:700 }}>
            💾 Enregistrer
          </button>
        </div>
        {/* ── JOBS SCHEDULER ── */}
        {tab==="jobs" && (
          <div>
            <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(29,161,242,0.06)",
              border:"1px solid rgba(29,161,242,0.2)",borderRadius:8,fontSize:8,color:"#6b6050",lineHeight:1.6}}>
              ⏰ Heures en <strong style={{color:"#e8dcc8"}}>heure Maroc (UTC+1)</strong> — hardcodées dans vercel.json.<br/>
              Pour changer l'heure : modifiez vercel.json + redéployez.<br/>
              ✅ Enable/Disable : instantané, sans redéploiement.
            </div>

            {JOBS.map(job => {
              const js = jobStatus[job.id] || {};
              const isOn = enabled[job.id] !== false;
              return (
                <div key={job.id} style={{marginBottom:8,padding:"10px 12px",borderRadius:8,
                  background:isOn?"rgba(0,0,0,0.2)":"rgba(0,0,0,0.08)",
                  border:`1px solid ${isOn?C.border:"rgba(107,96,80,0.15)"}`,
                  opacity:isOn?1:0.55}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:9,fontWeight:700,color:C.text}}>{job.agent}</span>
                        <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,
                          background:"rgba(29,161,242,0.1)",color:C.blue,
                          border:"1px solid rgba(29,161,242,0.2)",fontFamily:"monospace"}}>
                          {job.path}
                        </span>
                        {!isOn && <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,
                          background:"rgba(239,68,68,0.1)",color:C.red,
                          border:"1px solid rgba(239,68,68,0.2)"}}>DÉSACTIVÉ</span>}
                      </div>
                      <div style={{fontSize:7.5,color:C.muted,marginBottom:6,lineHeight:1.4}}>
                        {job.description}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        {/* Type badge */}
                        <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,fontWeight:700,
                          background:job.type==="auto"?"rgba(16,185,129,0.1)":"rgba(139,92,246,0.1)",
                          color:job.type==="auto"?C.green:"#8b5cf6",
                          border:`1px solid ${job.type==="auto"?"rgba(16,185,129,0.3)":"rgba(139,92,246,0.3)"}`}}>
                          {job.type==="auto"?"🤖 Auto":"👤 Manuel"}
                        </span>
                        {/* Schedule */}
                        {job.type==="auto" ? (
                          <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",
                            background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.2)",
                            borderRadius:5}}>
                            <span style={{fontSize:10,fontWeight:700,color:C.gold,fontFamily:"monospace"}}>
                              {job.scheduleMorocco}
                            </span>
                            <span style={{fontSize:7.5,color:C.muted}}>{job.zone}</span>
                            <span style={{fontSize:7,color:"#4a4030",fontFamily:"monospace"}}>
                              {"(UTC "+job.scheduleUTC.split(" ")[1].padStart(2,"0")+":"+job.scheduleUTC.split(" ")[0].padStart(2,"0")+")"}
                            </span>
                          </div>
                        ) : (
                          <span style={{fontSize:7.5,color:"#6b6050",fontStyle:"italic"}}>
                            Lancé depuis le dashboard
                          </span>
                        )}
                        <span style={{fontSize:7.5,color:C.muted,padding:"3px 8px",
                          background:"rgba(0,0,0,0.2)",borderRadius:5,border:`1px solid ${C.border}`}}>
                          {"📅 "+job.days}
                        </span>
                        {js.lastRun && (
                          <span style={{fontSize:7.5,color:C.muted}}>
                            {"Dernier: "}
                            <span style={{color:C.text}}>
                              {new Date(js.lastRun).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                            </span>
                          </span>
                        )}
                        {js.status && (
                          <span style={{fontSize:7,padding:"2px 7px",borderRadius:4,fontWeight:700,
                            background:js.status==="success"?"rgba(16,185,129,0.1)":js.status==="error"?"rgba(239,68,68,0.1)":"rgba(107,96,80,0.1)",
                            color:js.status==="success"?C.green:js.status==="error"?C.red:C.muted,
                            border:`1px solid ${js.status==="success"?"rgba(16,185,129,0.3)":js.status==="error"?"rgba(239,68,68,0.3)":"rgba(107,96,80,0.2)"}`}}>
                            {js.status==="success"?"✅ OK":js.status==="error"?"❌ Erreur":"⏳"}
                            {js.info?" — "+js.info.slice(0,25):""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <button onClick={()=>setEnabled(p=>({...p,[job.id]:!isOn}))}
                        style={{width:44,height:24,borderRadius:12,cursor:"pointer",
                          background:isOn?C.green:"rgba(107,96,80,0.3)",
                          border:"none",position:"relative"}}>
                        <div style={{position:"absolute",top:3,left:isOn?22:3,width:18,height:18,
                          borderRadius:"50%",background:"white"}}/>
                      </button>
                      <span style={{fontSize:6.5,color:isOn?C.green:C.muted,fontWeight:700}}>
                        {isOn?"ON":"OFF"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:10,padding:"8px 12px",background:"rgba(0,0,0,0.15)",
              border:`1px solid ${C.border}`,borderRadius:8,fontSize:7.5,color:C.muted,lineHeight:1.6}}>
              {"💡 Pour modifier une heure : éditez vercel.json dans votre repo → poussez sur GitHub."}<br/>
              {"Note: UTC+1 = heure Maroc standard (hiver) · UTC+0 = heure Maroc été"}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
// ================================================================
//  IT INTEGRATION — API Registry
// ================================================================
function ITIntegration() {
  const [apis, setApis]     = useState(()=>{ const s=load("it_apis",null); return (s&&s.length>0)?s:[{"id": "api001", "name": "Anthropic Claude API", "provider": "Anthropic", "baseUrl": "https://api.anthropic.com/v1/messages", "purpose": "Powers all AI agents - content writing, quality scoring, analysis, forecasting", "authMethod": "API Key", "keyValues": "Header: x-api-key: ANTHROPIC_API_KEY\nModel: claude-sonnet-4-6\nVersion header: anthropic-version: 2023-06-01", "accessInstructions": "1. Go to console.anthropic.com\n2. Account: travito.maroc@gmail.com\n3. Settings > API Keys > Create key\n4. Add to Vercel: ANTHROPIC_API_KEY\n5. Docs: docs.anthropic.com", "notes": "Pay-as-you-go ~$0.02/article. Used by: cron.js, youtube.js, CFO analyst, CEO chat"}, {"id": "api002", "name": "X / Twitter API v2", "provider": "X Corp", "baseUrl": "https://api.twitter.com/2", "purpose": "Post tweets @TravitoMaroc - A3 Poster Agent pipeline", "authMethod": "OAuth 1.0a", "keyValues": "X_API_KEY\nX_API_SECRET\nX_ACCESS_TOKEN\nX_ACCESS_TOKEN_SECRET\nAccount: @TravitoMaroc (travito.snet@gmail.com)", "accessInstructions": "1. Go to developer.twitter.com\n2. Account: travito.snet@gmail.com\n3. Project > App > Keys and Tokens\n4. Add all 4 keys to Vercel env vars\n5. Free Basic tier - $0.01/tweet", "notes": "tweet.js handles posting. Rate limit: 17 tweets/24h on Basic plan"}, {"id": "api003", "name": "ElevenLabs TTS API", "provider": "ElevenLabs", "baseUrl": "https://api.elevenlabs.io/v1", "purpose": "Text-to-speech voiceover generation for YouTube videos (AR/FR/EN)", "authMethod": "API Key", "keyValues": "Header: xi-api-key: ELEVENLABS_KEY\nVoice IDs: configure in youtube-tts.js", "accessInstructions": "1. Go to elevenlabs.io\n2. Account: travito.maroc@gmail.com\n3. Profile > API Key\n4. Add to Vercel: ELEVENLABS_KEY=sk_xxx\n5. Docs: docs.elevenlabs.io", "notes": "Starter plan $11/month. Used by youtube-tts.js"}, {"id": "api004", "name": "Shotstack Video API", "provider": "Shotstack", "baseUrl": "https://api.shotstack.io/edit/v1", "purpose": "Cloud video assembly - combine clips, audio, text overlays", "authMethod": "API Key", "keyValues": "Header: x-api-key: SHOTSTACK_KEY\nENV: SHOTSTACK_ENV=production\nBase URL changes per env: edit/stage vs edit/v1", "accessInstructions": "1. Go to dashboard.shotstack.io\n2. Account: travito.maroc@gmail.com\n3. API Keys section\n4. Vercel: SHOTSTACK_KEY + SHOTSTACK_ENV=production", "notes": "Production plan $19/month. 5.85 credits remaining. Used by shotstack.js"}, {"id": "api005", "name": "fal.ai API", "provider": "fal.ai", "baseUrl": "https://fal.run", "purpose": "Veo 3 Fast AI video generation from text prompts", "authMethod": "API Key", "keyValues": "Header: Authorization: Key FAL_KEY\nModel endpoint: fal-ai/veo3-fast\nCost: ~$0.64/video clip", "accessInstructions": "1. Go to fal.ai\n2. Account: travito.maroc@gmail.com\n3. Dashboard > API Keys\n4. Vercel: FAL_KEY=xxx\n5. Docs: fal.ai/docs", "notes": "$20 credits loaded. Pay-as-you-go. Used by youtube-veo.js"}, {"id": "api006", "name": "Pexels API", "provider": "Pexels", "baseUrl": "https://api.pexels.com/v1", "purpose": "Free stock photos for Special Events agent posts", "authMethod": "API Key", "keyValues": "Header: Authorization: PEXELS_KEY\nEndpoint: /search?query=...&per_page=1", "accessInstructions": "1. Go to pexels.com/api\n2. Account: travito.maroc@gmail.com\n3. Your API Key section\n4. Vercel: PEXELS_KEY=xxx", "notes": "Free tier - 200 req/hour, 20000/month. Used by pexels.js + events-checker.js"}, {"id": "api007", "name": "Tavily Search API", "provider": "Tavily", "baseUrl": "https://api.tavily.com/search", "purpose": "AI-powered web search for events checker + self-improve agents", "authMethod": "API Key", "keyValues": "Body param: api_key: TAVILY_KEY\nPOST JSON: {query, max_results, search_depth}", "accessInstructions": "1. Go to tavily.com\n2. Account: travito.maroc@gmail.com\n3. Dashboard > API Key\n4. Vercel: TAVILY_KEY=tvly-xxx", "notes": "Free tier. Used by events-checker.js + self-improve.js"}, {"id": "api008", "name": "Upstash Redis KV", "provider": "Upstash", "baseUrl": "KV_REST_API_URL", "purpose": "Agent memory storage - cron stats, last run data, tweet counts", "authMethod": "Bearer Token", "keyValues": "KV_REST_API_URL=https://xxx.upstash.io\nKV_REST_API_TOKEN=xxx\nOperations: GET/SET/DELETE via REST", "accessInstructions": "1. Go to console.upstash.com\n2. Account: travito.maroc@gmail.com\n3. Redis > Create Database\n4. REST API section - copy URL and Token\n5. Vercel: KV_REST_API_URL + KV_REST_API_TOKEN", "notes": "Free tier. Used by kv.js. Key: travito:stats"}, {"id": "api009", "name": "WordPress REST API (travito.ma)", "provider": "WordPress", "baseUrl": "https://travito.ma/wp-json/wp/v2", "purpose": "A4 Blogger publishes articles to travito.ma - category 9364 Actualites", "authMethod": "Basic Auth", "keyValues": "WP_URL=https://travito.ma\nWP_USER=Travito Agents\nWP_PASSWORD=6BNo j5r8 EXMf ZcSY GcuK sarX\nWP_CATEGORY=9364\nEndpoint: /posts", "accessInstructions": "1. WP Admin > Users > Add New > Application Passwords\n2. Username: Travito Agents\n3. Generate app password (spaces are normal)\n4. Vercel: WP_URL, WP_USER, WP_PASSWORD, WP_CATEGORY", "notes": "Used by wordpress.js. Posts in French + Arabic. Category 9364 = Actualites"}, {"id": "api010", "name": "YouTube Data API v3", "provider": "Google Cloud", "baseUrl": "https://www.googleapis.com/youtube/v3", "purpose": "YouTube video management - upload, metadata, publish (pending OAuth setup)", "authMethod": "OAuth 2.0", "keyValues": "YOUTUBE_CLIENT_ID=xxx (pending)\nYOUTUB_CLIENT_SECRET=xxx (pending)\nYOUTUBE_REFRESH_TOKEN=xxx (pending)\nYOUTUBE_API_KEY_PUBLIC=xxx (read-only public data)", "accessInstructions": "1. console.cloud.google.com\n2. Account: travito.maroc@gmail.com\n3. APIs > YouTube Data API v3 > Enable\n4. Credentials > OAuth 2.0 Client ID\n5. Run OAuth flow to get refresh token\n6. Vercel: add all 4 YouTube env vars", "notes": "OAuth setup PENDING. Public key works for read. Upload requires OAuth. Used by youtube.js"}, {"id": "api011", "name": "Supadata Transcript API", "provider": "Supadata", "baseUrl": "https://api.supadata.ai", "purpose": "Extract YouTube video transcripts for YouTube Manager bible generation", "authMethod": "API Key", "keyValues": "SUPADATA_KEY=xxx\nEndpoint: /youtube/transcript?videoId=xxx", "accessInstructions": "1. Go to supadata.ai\n2. Create account with travito.maroc@gmail.com\n3. Dashboard > API Keys\n4. Vercel: SUPADATA_KEY=xxx", "notes": "Used by youtube.js for transcript extraction in weekly_learn cron"}, {"id": "api012", "name": "Google Search Console API", "provider": "Google", "baseUrl": "https://searchconsole.googleapis.com/webmasters/v3", "purpose": "SEO: keyword rankings, clicks, impressions, CTR, page coverage, sitemap index status. Used by /api/seo-data daily.", "authMethod": "Service Account JWT", "status": "Active", "keyValues": "Scope: webmasters.readonly | Auth: JWT from service account", "envVars": ["GOOGLE_SC_CLIENT_EMAIL", "GOOGLE_SC_PRIVATE_KEY", "GOOGLE_SC_SITE_URL"], "cost": "Free", "plan": "Free Tier", "accessInstructions": "console.cloud.google.com → Search Console API → Enable → Service Account → Download JSON", "notes": "GOOGLE_SC_SITE_URL = sc-domain:travito.ma | Runs daily 07:00 UTC"}, {"id": "api013", "name": "Google Analytics Data API (GA4)", "provider": "Google", "baseUrl": "https://analyticsdata.googleapis.com/v1beta/properties", "purpose": "Traffic: sessions, users, pageviews, bounce rate, channel attribution, daily trends. Used by /api/seo-data daily.", "authMethod": "Service Account JWT", "status": "Active", "keyValues": "Scope: analytics.readonly | Property: GA4_PROPERTY_ID | Auth: same service account as SC", "envVars": ["GA4_PROPERTY_ID", "GOOGLE_SC_CLIENT_EMAIL", "GOOGLE_SC_PRIVATE_KEY"], "cost": "Free", "plan": "Free Tier", "accessInstructions": "analytics.google.com → Admin → GA4 Property → Access Management → Add service account as Viewer", "notes": "GA4_PROPERTY_ID = 9-digit number from GA4 Admin | Runs daily 07:00 UTC"}, {"id": "api014", "name": "SEO Agent API", "baseUrl": "/api/seo-agent", "purpose": "Internal agent: Strategist, Technical, OnPage, Monitoring, Schema, Programmatic", "authMethod": "Internal", "status": "Active", "notes": "7 specialized SEO agents — calls WP REST + SC + Claude"}, {"id": "api015", "name": "SEO Data API", "baseUrl": "/api/seo-data", "purpose": "Fetches SC keywords + GA4 traffic + AI insights daily — cached 6h in KV", "authMethod": "Internal", "status": "Active", "notes": "Cron daily 07:00 UTC — travito:seo_data in KV"}]; });
  const [editApi, setEditApi] = useState(null);
  const [search, setSearch]   = useState("");

  useEffect(()=>store("it_apis",apis),[apis]);

  const saveApi = (form) => {
    if(form.id) setApis(p=>p.map(a=>a.id===form.id?form:a));
    else setApis(p=>[...p,{...form,id:uid(),createdAt:new Date().toISOString()}]);
    setEditApi(null);
  };

  const filtered = apis.filter(a=>
    !search ||
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.provider?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ display:"flex", gap:8, padding:"6px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0, alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Rechercher API / intégration..."
          style={{ flex:1, padding:"5px 10px", background:"rgba(0,0,0,0.3)", border:`1px solid ${C.border}`, borderRadius:7, color:C.text, fontSize:9, outline:"none" }}/>
        <button onClick={()=>setEditApi({})}
          style={{ padding:"5px 12px", background:`${C.purple}18`, border:`1px solid ${C.purple}`, borderRadius:7, color:C.purple, cursor:"pointer", fontSize:9, fontWeight:700 }}>
          + Ajouter API
        </button>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
        {filtered.length===0 && (
          <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔌</div>
            <div>{search?"Aucun résultat":"Aucune API enregistrée"}</div>
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:10 }}>
          {filtered.map(api=>(
            <div key={api.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{api.name}</div>
                  <div style={{ fontSize:8, color:C.purple }}>{api.provider}</div>
                </div>
                <button onClick={()=>setEditApi(api)}
                  style={{ fontSize:7, padding:"2px 7px", background:`${C.blue}12`, border:`1px solid ${C.blue}44`, borderRadius:4, color:C.blue, cursor:"pointer" }}>
                  ✏️
                </button>
              </div>
              {api.baseUrl && <div style={{ fontSize:8, color:C.blue, marginBottom:6, fontFamily:"monospace" }}>{api.baseUrl}</div>}
              {api.purpose && <div style={{ fontSize:8, color:C.muted, marginBottom:6 }}>{api.purpose}</div>}
              {api.authMethod && (
                <div style={{ fontSize:7, padding:"2px 7px", borderRadius:4, display:"inline-block", background:`${C.amber}15`, color:C.amber, border:`1px solid ${C.amber}44`, marginBottom:6 }}>
                  🔐 {api.authMethod}
                </div>
              )}
              {api.accessInstructions && (
                <div style={{ fontSize:8, color:C.muted, background:"rgba(0,0,0,0.2)", borderRadius:5, padding:"6px 8px", marginBottom:6, lineHeight:1.5 }}>
                  <span style={{ color:C.gold, fontWeight:700 }}>Accès: </span>{api.accessInstructions}
                </div>
              )}
              {api.keyValues && (
                <div style={{ fontSize:8, color:C.green, fontFamily:"monospace", background:"rgba(0,0,0,0.2)", borderRadius:5, padding:"5px 8px", whiteSpace:"pre-wrap" }}>
                  {api.keyValues}
                </div>
              )}
              {api.envVars?.length > 0 && (
                <div style={{ marginTop:6, padding:"5px 8px", background:"rgba(16,185,129,0.06)",
                  border:"1px solid rgba(16,185,129,0.2)", borderRadius:5 }}>
                  <div style={{ fontSize:7, color:"#10b981", fontWeight:700, marginBottom:3 }}>ENV VARS VERCEL</div>
                  {api.envVars.map((v,i)=>(
                    <div key={i} style={{ fontSize:7.5, fontFamily:"monospace", color:"#10b981" }}>
                      {v}
                    </div>
                  ))}
                </div>
              )}
              {api.cost !== undefined && (
                <div style={{ fontSize:7, color:"#D4AF37", marginTop:4 }}>
                  💰 {api.cost === "Free" || api.cost === "0" ? "Gratuit" : api.cost}
                  {api.plan ? " — "+api.plan : ""}
                </div>
              )}
              {api.notes && <div style={{ fontSize:7, color:C.muted, marginTop:6, borderTop:`1px solid ${C.border}33`, paddingTop:5 }}>{api.notes}</div>}
            </div>
          ))}
        </div>
      </div>
      {editApi && <ApiForm initial={editApi} onSave={saveApi} onClose={()=>setEditApi(null)} C={C}/>}
    </div>
  );
}

function ApiForm({ initial, onSave, onClose, C }) {
  const [form, setForm] = useState({ name:"", provider:"", baseUrl:"", purpose:"", authMethod:"API Key", keyValues:"", accessInstructions:"", notes:"", ...initial });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
      <div style={{ background:"rgba(15,22,40,0.98)", border:`1px solid ${C.gold}`, borderRadius:12, padding:24, width:520, maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ fontSize:11, color:C.gold, fontFamily:"monospace", marginBottom:16 }}>{form.id?"✏️ Modifier API":"🔌 Nouvelle API / Intégration"}</div>
        {[
          ["name","Nom de l'intégration *","text"],
          ["provider","Provider / Plateforme","text"],
          ["baseUrl","Base URL / Endpoint","url"],
          ["purpose","Objet / Cas d'usage","text"],
        ].map(([k,l,t])=>(
          <div key={k} style={{ marginBottom:10 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
            <input type={t} value={form[k]||""} onChange={e=>set(k,e.target.value)}
              style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", boxSizing:"border-box" }}/>
          </div>
        ))}
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Méthode d'authentification</div>
          <select value={form.authMethod} onChange={e=>set("authMethod",e.target.value)}
            style={{ width:"100%", padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none" }}>
            {["API Key","OAuth 2.0","OAuth 1.0a","Bearer Token","Basic Auth","No Auth","Other"].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
        {[
          ["keyValues","Clés / Paramètres / Config importantes","Collez les valeurs importantes (clés, IDs, endpoints spécifiques)...",4],
          ["accessInstructions","Instructions d'accès","Où trouver la clé API, quel compte la possède, où est la doc, comment configurer...",4],
          ["notes","Notes","Dépendances, limites, remarques...",2],
        ].map(([k,l,ph,rows])=>(
          <div key={k} style={{ marginBottom:10 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
            <textarea value={form[k]||""} onChange={e=>set(k,e.target.value)} rows={rows} placeholder={ph}
              style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}/>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"6px 14px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", fontSize:9 }}>Annuler</button>
          <button onClick={()=>onSave(form)} disabled={!form.name}
            style={{ padding:"6px 14px", background:`${C.green}18`, border:`1px solid ${C.green}`, borderRadius:7, color:C.green, cursor:"pointer", fontSize:9, fontWeight:700 }}>
            💾 Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function ITOperator() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, color:C.muted }}>
      <div style={{ fontSize:48 }}>⚙️</div>
      <div style={{ fontSize:13, color:C.gold, fontWeight:700 }}>IT Operator</div>
      <div style={{ fontSize:10, maxWidth:300, textAlign:"center", lineHeight:1.6 }}>
        Rôle réservé pour les tâches opérationnelles IT futures.<br/>
        Les fonctionnalités détaillées seront définies dans le prochain sprint.
      </div>
      <div style={{ fontSize:8, color:C.muted, padding:"6px 12px", background:`${C.amber}10`, border:`1px solid ${C.amber}44`, borderRadius:6 }}>
        🔧 Disponible prochainement
      </div>
    </div>
  );
}

export default function CTO() {
  const [agent, setAgent] = useState("admin");

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Agent tabs */}
      <div style={{ display:"flex", gap:5, padding:"6px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {AGENTS.map(a=>(
          <button key={a.id} onClick={()=>a.id!=="operator"&&setAgent(a.id)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 12px", borderRadius:8, cursor:a.id==="operator"?"not-allowed":"pointer",
              background:agent===a.id?`${a.color}18`:"transparent",
              border:`1px solid ${agent===a.id?a.color:C.border}`,
              color:agent===a.id?a.color:C.muted, opacity:a.id==="operator"?0.5:1 }}>
            <span style={{ fontSize:10 }}>{a.icon}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:9, fontWeight:700 }}>{a.label}</div>
              <div style={{ fontSize:7 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:"hidden" }}>
        {agent==="admin"       && <ITAdmin/>}
        {agent==="integration" && <ITIntegration/>}
        {agent==="operator"    && <ITOperator/>}
      </div>
    </div>
  );
}
