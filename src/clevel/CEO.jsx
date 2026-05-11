import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentRotation, callClaude, getWeekOfMonth } from "../config/agentConfig";
import VPMarketing from "../marketing/VPMarketing";
import COO from "../operations/COO";

const CEO_PERSONA = `Tu es le CEO Agent de Travito Maroc (travito.ma). Commence par [CEO]. Français, stratégique.`;

const DEPARTMENTS = [
  { id: "marketing", label: "VP Marketing", icon: "📣", color: "#8b5cf6", status: "active" },
  { id: "coo",       label: "COO",          icon: "🏢", color: "#10b981", status: "active" },
  { id: "sales",     label: "VP Sales",     icon: "💰", color: "#6b6050", status: "soon" },
];

const QUICK_PROMPTS = ["Vue d'ensemble", "Stratégie", "Priorités", "KPIs"];

const C = {
  bg: "#080d1a", panel: "rgba(12,18,35,0.95)", panelSoft: "rgba(5,8,16,0.98)",
  border: "rgba(212,175,55,0.18)", gold: "#D4AF37", text: "#e8dcc8", muted: "#6b6050",
  green: "#10b981", red: "#ef4444", blue: "#1DA1F2", amber: "#f59e0b", purple: "#8b5cf6",
};

function loadKeys() {
  try { return JSON.parse(localStorage.getItem("travito_x_keys") || "{}"); }
  catch { return {}; }
}

function statusPalette(status) {
  switch(status) {
    case "active":  return { dot:C.green,  bg:"rgba(16,185,129,0.06)",  border:"rgba(16,185,129,0.22)" };
    case "warning": return { dot:C.amber,  bg:"rgba(245,158,11,0.06)",  border:"rgba(245,158,11,0.28)" };
    case "error":   return { dot:C.red,    bg:"rgba(239,68,68,0.06)",   border:"rgba(239,68,68,0.28)"  };
    case "soon":    return { dot:C.muted,  bg:"rgba(107,96,80,0.04)",   border:"rgba(107,96,80,0.18)"  };
    default:        return { dot:C.muted,  bg:"rgba(107,96,80,0.06)",   border:"rgba(107,96,80,0.2)"   };
  }
}

function AgentBox({ node }) {
  const pal = statusPalette(node.status);
  return (
    <div style={{ position:"relative", width:node.wide?"100%":"auto",
      minWidth:node.minWidth||190, maxWidth:node.wide?"100%":node.maxWidth||230,
      flexShrink:0, background:pal.bg, border:`1px solid ${pal.border}`,
      borderRadius:12, padding:"10px 13px" }}>
      <div style={{ position:"absolute", top:8, right:8, width:6, height:6,
        borderRadius:"50%", background:pal.dot,
        animation:node.status==="active"?"pulse 2s infinite":"none" }}/>

      <div style={{ display:"flex", gap:7, alignItems:"center", marginBottom:5 }}>
        <div style={{ width:24, height:24, borderRadius:6, display:"flex", alignItems:"center",
          justifyContent:"center", flexShrink:0, fontSize:12,
          background:`${node.color}22`, border:`1px solid ${node.color}55` }}>
          {node.icon}
        </div>
        <div>
          <div style={{ fontSize:9.5, fontWeight:700, color:node.color }}>{node.label}</div>
          <div style={{ fontSize:6.5, color:C.muted, lineHeight:1.35 }}>{node.role}</div>
        </div>
      </div>

      {node.stats.map((item, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:8,
          padding:"2px 0", borderTop:i===0?"1px solid rgba(255,255,255,0.05)":"none" }}>
          <span style={{ fontSize:7, color:C.muted }}>{item.l}</span>
          <span style={{ fontSize:7, fontWeight:700, color:C.text, fontFamily:"monospace" }}>{item.v}</span>
        </div>
      ))}

      {node.cron && (
        <div style={{ marginTop:5, fontSize:6.5, color:C.muted, fontFamily:"monospace",
          borderTop:"1px solid rgba(255,255,255,0.04)", paddingTop:3 }}>
          🕐 {node.cron}
        </div>
      )}

      {node.agentId && (
        <div style={{ marginTop:5, display:"inline-block", fontSize:7, padding:"2px 5px",
          borderRadius:4, background:`${node.color}22`, color:node.color,
          fontFamily:"monospace", fontWeight:700, border:`1px solid ${node.color}44` }}>
          {node.agentId}
        </div>
      )}

      {node.status==="soon" && (
        <div style={{ marginTop:4, fontSize:6.5, color:C.muted, fontStyle:"italic" }}>⏳ Prochain sprint</div>
      )}
      {node.status==="warning" && (
        <div style={{ marginTop:4, fontSize:6.5, color:C.amber, fontStyle:"italic" }}>⚠️ Config requise</div>
      )}
    </div>
  );
}

function VLine({ height=20 }) {
  return <div style={{ width:2, height, background:C.border, margin:"0 auto" }}/>;
}

function TreeRow({ children, gap=20 }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  const showLine = items.length > 1;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:"max-content" }}>
      {showLine && (
        <div style={{ position:"relative", width:"100%", height:18, marginBottom:2 }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:C.border }}/>
          {items.map((_, i) => (
            <div key={i} style={{ position:"absolute", top:0,
              left:`${items.length===1?50:(i*100)/(items.length-1)}%`,
              transform:"translateX(-1px)", width:2, height:18, background:C.border }}/>
          ))}
        </div>
      )}
      <div style={{ display:"flex", flexWrap:"nowrap", alignItems:"flex-start",
        justifyContent:"flex-start", gap, width:"max-content" }}>
        {items}
      </div>
    </div>
  );
}

function TreeGroup({ head, children, gap=20, childTop=18 }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      flexShrink:0, width:"max-content" }}>
      <AgentBox node={head}/>
      {items.length > 0 && (
        <>
          <VLine height={childTop}/>
          <TreeRow gap={gap}>{items}</TreeRow>
        </>
      )}
    </div>
  );
}

function FlatLane({ nodes, gap=16 }) {
  return (
    <div style={{ display:"flex", flexWrap:"nowrap", alignItems:"flex-start",
      justifyContent:"flex-start", gap, width:"max-content" }}>
      {nodes.map(node => <AgentBox key={node.id} node={node}/>)}
    </div>
  );
}

// ── Matrix Rain ────────────────────────────────────────────────
function MatrixRain() {
  const columns = useMemo(() =>
    Array.from({ length:36 }, (_, i) => ({
      id:i, left:`${1+i*2.7}%`, speed:10+(i%6)*2, delay:-(i%10)*1.2,
      opacity:i%5===0?0.28:0.12, chars:["x","o","1","0","+"],
    })), []);

  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
      <div style={{ position:"absolute", inset:0,
        background:"linear-gradient(180deg,rgba(0,0,0,0.03) 0%,rgba(0,0,0,0.10) 55%,rgba(0,0,0,0.22) 100%)" }}/>
      {columns.map(col => <MatrixColumn key={col.id} {...col}/>)}
    </div>
  );
}

function MatrixColumn({ left, speed, delay, opacity, chars }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const gen = () => Array.from({length:20},()=>chars[Math.floor(Math.random()*chars.length)]).join(" ");
    setText(gen());
    const iv = setInterval(() => setText(gen()), 220+Math.random()*260);
    return () => clearInterval(iv);
  }, [chars]);
  return (
    <div style={{ position:"absolute", top:"-50%", left, width:20, height:"200%",
      display:"flex", justifyContent:"center", borderLeft:"1px solid rgba(16,185,129,0.08)",
      animation:`matrixFall ${speed}s linear infinite`, animationDelay:`${delay}s`, opacity }}>
      <div style={{ writingMode:"vertical-rl", textOrientation:"mixed", fontFamily:"monospace",
        fontSize:10, lineHeight:1.08, letterSpacing:1, color:"rgba(120,255,180,0.84)",
        textShadow:"0 0 6px rgba(0,255,150,0.35)", whiteSpace:"pre" }}>
        {text}
      </div>
    </div>
  );
}

// ── Org Chart ─────────────────────────────────────────────────
function buildNodes({ rotation, hasKeys, kvStats }) {
  const totalArticles = kvStats?.totalArticles || 0;
  const totalTweets   = kvStats?.totalTweets   || 0;
  const totalBlogs    = kvStats?.totalBlogs     || 0;
  const totalLikes    = kvStats?.totalLikes     || 0;
  const totalFollows  = kvStats?.totalFollows   || 0;

  return {
    // ── C-SUITE ──────────────────────────────────────────────
    ceo: {
      id:"ceo", icon:"👑", label:"CEO Agent", role:"Vision & Stratégie",
      color:C.gold, status:"active",
      stats:[{l:"Scope",v:"Tous depts"},{l:"Mode",v:"Stratégique"}],
    },
    vpMarketing: {
      id:"vp", icon:"📣", label:"VP Marketing", role:"Stratégie Marketing",
      color:C.purple, status:"active",
      stats:[{l:"Équipe",v:"3 Directors"},{l:"Cibles",v:"Maroc + Diaspora"}],
    },

    // ── SOCIAL MEDIA ─────────────────────────────────────────
    socialDirector: {
      id:"dir", icon:"🎯", label:"Social Media Director", role:"Gestion Plateformes",
      color:C.green, status:"active",
      stats:[{l:"Actifs",v:"X + YouTube"},{l:"Bientôt",v:"TikTok"}],
    },
    xManager: {
      id:"xmgr", icon:"𝕏", label:"X-Twitter Manager", role:"Pipeline A1→A4 + Engagement",
      color:C.blue, status:"active", minWidth:210,
      stats:[{l:"Compte",v:"@TravitoMaroc"},{l:"Posts totaux",v:totalTweets||"—"}],
    },
    writer: {
      id:"a1", icon:"✍️", label:"Article Writer", role:"Rédaction Articles",
      color:C.amber, status:"active", agentId:"A1",
      cron:"08:00 + 21:00 UTC (lun-ven)",
      stats:[{l:"Articles",v:totalArticles},{l:"Thème",v:rotation.theme},{l:"Blog",v:totalBlogs}],
    },
    controller: {
      id:"a2", icon:"🔍", label:"Content Controller", role:"QC & Score qualité",
      color:"#06b6d4", status:"active", agentId:"A2",
      stats:[{l:"Mode",v:"Auto (cron)"},{l:"Seuil",v:"≥80%"}],
    },
    poster: {
      id:"a3", icon:"🚀", label:"Poster Assistant", role:"Publication X + Blog",
      color:C.blue, status:hasKeys?"active":"warning", agentId:"A3",
      stats:[{l:"Postés",v:totalTweets},{l:"Blogs",v:totalBlogs},{l:"Clés X",v:hasKeys?"✅ OK":"⚠️"}],
    },
    blogger: {
      id:"a4", icon:"📝", label:"Blogger", role:"Publication travito.ma/blog",
      color:"#f97316", status:"active", agentId:"A4",
      stats:[{l:"Site",v:"travito.ma"},{l:"Catégorie",v:"Actualités"}],
    },
    engager: {
      id:"eng", icon:"🤝", label:"Network Engager", role:"Likes · Follows · Polls · Replies",
      color:C.blue, status:"active", agentId:"NE",
      cron:"09:00 + 18:00 UTC (lun-ven)",
      stats:[
        {l:"Likes donnés",v:totalLikes||0},{l:"Follows faits",v:totalFollows||0},
        {l:"Limites/j",v:"4L·1F·3R·1Re"},{l:"Mode",v:"Live ✅"},
      ],
    },
    events: {
      id:"evts", icon:"🎉", label:"Special Events", role:"Événements 2026",
      color:"#f97316", status:"active", agentId:"SE",
      cron:"07:30 UTC quotidien",
      stats:[{l:"Événements",v:"17"},{l:"Vérif",v:"max 2/run"},{l:"Images",v:"Pexels"}],
    },
    youtube: {
      id:"yt", icon:"▶️", label:"YouTube Manager", role:"Ideation → QC → Video → Publish",
      color:"#FF0000", status:"active", agentId:"YT",
      stats:[{l:"Agents",v:"3 actifs"},{l:"Langues",v:"FR/EN/AR"},{l:"OAuth",v:"⚠️ Requis"}],
    },
    ytIdeation: {
      id:"yt1", icon:"🧠", label:"YT Ideation Agent", role:"Idées · Scoring · Bible · Planning",
      color:C.purple, status:"active", agentId:"YT1",
      cron:"Lundi 07:00 UTC",
      stats:[{l:"Output",v:"Top score + Bible"},{l:"Scope",v:"Semaine"}],
    },
    ytQC: {
      id:"ytqc", icon:"✅", label:"QC Agent", role:"Validation Bible · Cohérence",
      color:"#14b8a6", status:"active", agentId:"YTQC",
      stats:[{l:"Checks",v:"Bible+Voice+Topic"},{l:"Gate",v:"Avant rendu"}],
    },
    ytVideo: {
      id:"yt2", icon:"🎬", label:"YT Video Agent", role:"Voice · Render · Publish",
      color:"#FF0000", status:"active", agentId:"YT2",
      stats:[{l:"Input",v:"Bible validée"},{l:"Output",v:"YouTube post"}],
    },
    tiktok: {
      id:"tt", icon:"🎵", label:"TikTok Manager", role:"Pipeline TikTok",
      color:"#ff0050", status:"soon",
      stats:[{l:"Status",v:"Prochain sprint"}],
    },

    // ── PERFORMANCE DIRECTOR ─────────────────────────────────
    perfDirector: {
      id:"pd", icon:"📈", label:"Performance & Analytics Director", role:"Mesure · Cross-canal · Trends",
      color:C.green, status:"active",
      cron:"Lundi 07:00 UTC",
      stats:[{l:"Scope",v:"X+SEO+YT+Content"},{l:"Cache",v:"7j KV"},{l:"Historique",v:"Permanent"}],
    },

    // ── SEO DIRECTOR ─────────────────────────────────────────
    seoDirector: {
      id:"sd", icon:"🔍", label:"SEO & Discoverability Director", role:"Visibilité · Recherche · Index",
      color:C.purple, status:"active",
      cron:"Daily 07:00 UTC (data) · Mon 07:30 (monitoring)",
      stats:[{l:"Sources",v:"SC + GA4 + WP"},{l:"Site",v:"sc-domain:travito.ma"},{l:"Plugin",v:"RankMath"}],
    },

    // ── COO ──────────────────────────────────────────────────
    coo: {
      id:"coo", icon:"🏢", label:"COO", role:"Opérations & Contrôle",
      color:C.green, status:"active",
      stats:[{l:"Scope",v:"Finance · IT · Audit"}],
    },
    cfo: {
      id:"cfo", icon:"💰", label:"CFO", role:"Finance & Comptabilité",
      color:C.green, status:"active",
      stats:[{l:"Agents",v:"3 Finance"},{l:"Devises",v:"MAD/USD/EUR"}],
    },
    cto: {
      id:"cto", icon:"⚙️", label:"CTO", role:"IT & Intégrations",
      color:C.blue, status:"active",
      stats:[{l:"Software",v:"15 entrées"},{l:"APIs",v:"15 intégrations"},{l:"Jobs",v:"13 crons"}],
    },
    auditOps: {
      id:"aud", icon:"🔎", label:"Audit Director", role:"Qualité · Conformité · COO",
      color:C.amber, status:"active",
      stats:[{l:"Scope",v:"X · Blog · Qualité"},{l:"Mode",v:"Manuel + KV"}],
    },
    finAccount: {
      id:"fa1", icon:"📒", label:"Finance Account", role:"Ledgers · Charges · Revenus",
      color:C.green, status:"active",
      stats:[{l:"Ledgers",v:"Charges+Revenus"},{l:"Approbations",v:"Draft→Approved"}],
    },
    finAnalyst: {
      id:"fa2", icon:"📊", label:"Finance Analyst", role:"Q&A · Analyses · Insights",
      color:C.blue, status:"active",
      stats:[{l:"Mode",v:"Prompt Q&A"},{l:"Claude",v:"Sonnet 4.6"}],
    },
    finPlanner: {
      id:"fa3", icon:"📈", label:"Finance Planner", role:"P&L · Prévisions · YTD",
      color:C.purple, status:"active",
      stats:[{l:"Output",v:"P&L · Forecast"},{l:"Cycle",v:"Mensuel"}],
    },
    itAdmin: {
      id:"it1", icon:"🖥️", label:"IT Admin", role:"Software · Abonnements · Jobs",
      color:C.blue, status:"active",
      stats:[{l:"Registry",v:"15 softwares"},{l:"Subs",v:"13 abonnements"},{l:"Jobs",v:"13 crons"}],
    },
    itIntegration: {
      id:"it2", icon:"🔌", label:"IT Integration", role:"APIs · Env Vars · Status",
      color:C.purple, status:"active",
      stats:[{l:"APIs",v:"15 intégrations"},{l:"Env Vars",v:"Vercel config"}],
    },
    itOps: {
      id:"it3", icon:"⚙️", label:"IT Operator", role:"Opérations IT · Monitoring",
      color:C.muted, status:"soon",
      stats:[{l:"Status",v:"Prochain sprint"}],
    },
    auditPost: {
      id:"aud1", icon:"📬", label:"Post Audit", role:"X posts · Qualité · Historique",
      color:C.amber, status:"active",
      stats:[{l:"Source",v:"x_history KV"},{l:"Score",v:"IA 5 critères"}],
    },
    auditCOO: {
      id:"aud2", icon:"🏢", label:"COO Audit", role:"Finance · IT · Ops",
      color:C.amber, status:"active",
      stats:[{l:"Scope",v:"CFO+CTO review"},{l:"Mode",v:"Dashboard"}],
    },
  };
}

// ── Sub-agent arrays ───────────────────────────────────────────
function buildSubAgents() {
  const seoAgents = [
    { id:"seo0", icon:"📊", label:"Vue d'ensemble", role:"SC + GA4 · KPIs · Coverage",
      color:C.purple, status:"active", stats:[{l:"Cache",v:"6h KV"}] },
    { id:"seo1", icon:"🎯", label:"SEO Strategist", role:"Keyword map · Priorities · Roadmap",
      color:C.purple, status:"active", stats:[{l:"KV",v:"seo_strategy"},{l:"Freq",v:"weekly"}] },
    { id:"seo2", icon:"⚙️", label:"Technical SEO", role:"Sitemap · Robots · Listivo · RankMath",
      color:C.purple, status:"active", stats:[{l:"KV",v:"seo_technical"},{l:"Freq",v:"weekly"}] },
    { id:"seo3", icon:"✍️", label:"On-Page Content", role:"Titres · Metas · Intros · FAQ · Bulk+WP",
      color:C.purple, status:"active", stats:[{l:"Mode",v:"single+bulk"},{l:"Push WP",v:"✅"}] },
    { id:"seo4", icon:"📡", label:"Monitoring", role:"Drops · Changes · Alerts hebdo",
      color:C.purple, status:"active", cron:"Lundi 07:30 UTC",
      stats:[{l:"KV",v:"seo_monitoring"},{l:"Cycle",v:"Monday"}] },
    { id:"seo5", icon:"🏷️", label:"Schema Agent", role:"JSON-LD · Rich snippets · RankMath",
      color:C.purple, status:"active", stats:[{l:"KV",v:"seo_schema"},{l:"Freq",v:"weekly"}] },
    { id:"seo6", icon:"⚡", label:"Programmatic", role:"City+Category · Term pages · Templates",
      color:C.purple, status:"active", stats:[{l:"KV",v:"seo_programmatic"},{l:"Cycle",v:"monthly"}] },
  ];

  const perfAgents = [
    { id:"perf0", icon:"📊", label:"Vue d'ensemble", role:"Tous canaux · KPIs unifiés",
      color:C.green, status:"active", stats:[{l:"Source",v:"analytics_data KV"}] },
    { id:"perf1", icon:"🐦", label:"X / Twitter", role:"Followers · Impressions · Engagement",
      color:C.green, status:"active", stats:[{l:"API calls",v:"2 max"},{l:"Posts",v:"last 100"}] },
    { id:"perf2", icon:"🔍", label:"SEO & Trafic", role:"SC + GA4 · Summary",
      color:C.green, status:"active", stats:[{l:"Source",v:"seo_data KV"},{l:"Lien",v:"SEO Dir."}] },
    { id:"perf3", icon:"📹", label:"YouTube", role:"Vidéos · Publiées · En attente",
      color:C.green, status:"active", stats:[{l:"Source",v:"yt_uploads KV"}] },
    { id:"perf4", icon:"📝", label:"Qualité Contenu", role:"Scores · Thèmes · Derniers articles",
      color:C.green, status:"active", stats:[{l:"Source",v:"x_history + stats KV"}] },
    { id:"perf5", icon:"🤖", label:"Insights IA", role:"Analyse cross-canal · Claude",
      color:C.green, status:"active", stats:[{l:"Model",v:"Sonnet 4.6"}] },
    { id:"perf6", icon:"📈", label:"Historique", role:"Trends · Charts · Croissance hebdo",
      color:C.green, status:"active", stats:[{l:"Mode",v:"Permanent KV"},{l:"Métriques",v:"13"}] },
  ];

  return { seoAgents, perfAgents };
}

function OrgChart({ rotation, hasKeys, kvStats }) {
  const nodes = buildNodes({ rotation, hasKeys, kvStats });
  const { seoAgents, perfAgents } = buildSubAgents();

  const marketingManagers = [
    <TreeGroup key="x" head={nodes.xManager} gap={14} childTop={16}>
      <FlatLane nodes={[nodes.writer, nodes.controller, nodes.poster, nodes.blogger, nodes.engager, nodes.events]} gap={14}/>
    </TreeGroup>,
    <TreeGroup key="yt" head={nodes.youtube} gap={14} childTop={16}>
      <FlatLane nodes={[nodes.ytIdeation, nodes.ytQC, nodes.ytVideo]} gap={14}/>
    </TreeGroup>,
    <TreeGroup key="tt" head={nodes.tiktok}/>,
  ];

  const marketingDirectors = [
    <TreeGroup key="social" head={nodes.socialDirector} gap={22} childTop={18}>
      {marketingManagers}
    </TreeGroup>,
    <TreeGroup key="perf" head={nodes.perfDirector} gap={12} childTop={18}>
      <FlatLane nodes={perfAgents} gap={12}/>
    </TreeGroup>,
    <TreeGroup key="seo" head={nodes.seoDirector} gap={12} childTop={18}>
      <FlatLane nodes={seoAgents} gap={12}/>
    </TreeGroup>,
  ];

  const opsDirectors = [
    <TreeGroup key="cfo" head={nodes.cfo} gap={14} childTop={18}>
      <FlatLane nodes={[nodes.finAccount, nodes.finAnalyst, nodes.finPlanner]} gap={14}/>
    </TreeGroup>,
    <TreeGroup key="cto" head={nodes.cto} gap={14} childTop={18}>
      <FlatLane nodes={[nodes.itAdmin, nodes.itIntegration, nodes.itOps]} gap={14}/>
    </TreeGroup>,
    <TreeGroup key="audit" head={nodes.auditOps} gap={14} childTop={18}>
      <FlatLane nodes={[nodes.auditPost, nodes.auditCOO]} gap={14}/>
    </TreeGroup>,
  ];

  const mainScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const bottomInnerRef = useRef(null);

  useEffect(() => {
    const main = mainScrollRef.current;
    const bottom = bottomScrollRef.current;
    const inner = bottomInnerRef.current;
    if (!main || !bottom || !inner) return;
    const syncWidth = () => { inner.style.width = `${main.scrollWidth}px`; };
    let syncingFromMain = false, syncingFromBottom = false;
    const onMain   = () => { if(syncingFromBottom) return; syncingFromMain=true; bottom.scrollLeft=main.scrollLeft; syncingFromMain=false; };
    const onBottom = () => { if(syncingFromMain) return; syncingFromBottom=true; main.scrollLeft=bottom.scrollLeft; syncingFromBottom=false; };
    syncWidth();
    main.addEventListener("scroll", onMain);
    bottom.addEventListener("scroll", onBottom);
    window.addEventListener("resize", syncWidth);
    return () => { main.removeEventListener("scroll",onMain); bottom.removeEventListener("scroll",onBottom); window.removeEventListener("resize",syncWidth); };
  }, []);

  return (
    <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div ref={mainScrollRef} style={{ flex:1, minHeight:0, overflowX:"auto", overflowY:"auto", padding:"20px 16px 8px 16px" }}>
        <div style={{ minWidth:"max-content", display:"flex", flexDirection:"column",
          alignItems:"flex-start", gap:22, padding:"0 24px 12px 24px" }}>
          <div style={{ width:"100%", display:"flex", justifyContent:"center", minWidth:5400 }}>
            <TreeGroup head={nodes.ceo} gap={160} childTop={22}>
              {[
                <TreeGroup key="marketing" head={nodes.vpMarketing} gap={28} childTop={22}>
                  {marketingDirectors}
                </TreeGroup>,
                <TreeGroup key="coo" head={nodes.coo} gap={28} childTop={22}>
                  {opsDirectors}
                </TreeGroup>,
              ]}
            </TreeGroup>
          </div>
        </div>
      </div>

      {/* Persistent scrollbar at bottom */}
      <div ref={bottomScrollRef}
        style={{ height:16, overflowX:"auto", overflowY:"hidden",
          borderTop:`1px solid ${C.border}`, background:"rgba(4,8,16,0.98)", flexShrink:0 }}>
        <div ref={bottomInnerRef} style={{ height:1 }}/>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────
function Header({ view, setView, dept, setDept, hasKeys, onOpenKeys, showChat, onToggleChat }) {
  return (
    <div style={{ height:52, minHeight:52, flexShrink:0, display:"flex", alignItems:"center",
      gap:8, padding:"0 12px",
      background:"linear-gradient(135deg,#080d1a,#130f00)",
      borderBottom:`1px solid ${C.border}` }}>
      <div style={{ width:28, height:28, borderRadius:7, display:"flex", alignItems:"center",
        justifyContent:"center", flexShrink:0, fontSize:14,
        background:`linear-gradient(135deg,${C.gold},#8B6914)` }}>
        🏡
      </div>
      <div style={{ flexShrink:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.gold }}>Travito Maroc</div>
        <div style={{ fontSize:7, color:C.muted, letterSpacing:1, textTransform:"uppercase", fontFamily:"monospace" }}>
          AI Agents · travito.ma
        </div>
      </div>

      {/* View switcher */}
      <div style={{ display:"flex", gap:3, marginLeft:10, flexShrink:0 }}>
        {[["agents","🤖 Agents"],["orgchart","🏢 Org Chart"]].map(([id,label]) => (
          <button key={id} onClick={()=>setView(id)}
            style={{ fontSize:8, padding:"3px 9px", borderRadius:8,
              background:view===id?`${C.gold}18`:"transparent",
              border:`1px solid ${view===id?C.gold:"rgba(255,255,255,0.08)"}`,
              color:view===id?C.gold:C.muted, cursor:"pointer", fontWeight:view===id?700:400 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Dept tabs (agents view only) */}
      {view==="agents" && (
        <div style={{ flex:1, display:"flex", gap:4, justifyContent:"center" }}>
          {DEPARTMENTS.map(item => (
            <button key={item.id} onClick={()=>{ if(item.status==="active") setDept(item.id); }}
              style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 9px",
                borderRadius:12, background:dept===item.id?`${item.color}18`:"transparent",
                border:`1px solid ${dept===item.id?item.color:"rgba(255,255,255,0.06)"}`,
                cursor:item.status==="active"?"pointer":"default" }}>
              <span style={{ fontSize:10 }}>{item.icon}</span>
              <span style={{ fontSize:8, color:dept===item.id?item.color:C.muted, fontFamily:"monospace" }}>
                {item.label}
              </span>
              {item.status==="active"
                ? <div style={{ width:4, height:4, borderRadius:"50%", background:C.green, animation:"pulse 2s infinite" }}/>
                : <span style={{ fontSize:7, color:C.muted }}>SOON</span>}
            </button>
          ))}
        </div>
      )}
      {view!=="agents" && <div style={{ flex:1 }}/>}

      <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
        <button onClick={onOpenKeys}
          style={{ padding:"4px 8px", borderRadius:7,
            border:`1px solid ${hasKeys?C.green:C.red}`,
            background:hasKeys?`${C.green}12`:`${C.red}12`,
            color:hasKeys?C.green:C.red, cursor:"pointer", fontSize:8, fontWeight:700 }}>
          {hasKeys?"🔐 Clés OK":"⚠️ Clés X"}
        </button>
        <button onClick={onToggleChat}
          style={{ padding:"4px 8px", borderRadius:7, background:`${C.gold}10`,
            border:`1px solid ${C.border}`, color:C.gold, cursor:"pointer", fontSize:8 }}>
          {showChat?"🙈":"👑"}
        </button>
      </div>
    </div>
  );
}

// ── Keys Modal ────────────────────────────────────────────────
function KeysModal({ open, form, setForm, onSave, onClose, hasKeys, onClear, saved }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center",
      justifyContent:"center", padding:16, background:"rgba(0,0,0,0.9)" }}>
      <div style={{ width:440, maxWidth:"95vw", background:"#0d1525",
        border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.gold }}>🔐 Clés API X — @TravitoMaroc</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        {[["API Key","apiKey"],["API Secret","apiSecret"],["Access Token","accessToken"],
          ["Access Token Secret","accessTokenSecret"],["Bearer Token","bearerToken"]].map(([label,field]) => (
          <div key={field} style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, color:C.muted, marginBottom:3, fontFamily:"monospace" }}>{label}</div>
            <input type="password" value={form[field]||""}
              onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}
              style={{ width:"100%", padding:"8px 10px", background:"rgba(0,0,0,0.4)",
                border:`1px solid ${C.border}`, borderRadius:7, color:C.text,
                fontSize:11, fontFamily:"monospace", outline:"none" }}/>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button onClick={onSave}
            style={{ flex:1, padding:"10px 0", background:`${C.green}18`,
              border:`1px solid ${C.green}`, borderRadius:8, color:C.green,
              cursor:"pointer", fontSize:12, fontWeight:700 }}>
            {saved?"✅ Sauvegardé!":"💾 Sauvegarder"}
          </button>
          {hasKeys && (
            <button onClick={onClear}
              style={{ padding:"10px 12px", background:`${C.red}12`,
                border:`1px solid ${C.red}`, borderRadius:8, color:C.red, cursor:"pointer", fontSize:10 }}>
              Effacer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat Sidebar ──────────────────────────────────────────────
function ChatSidebar({ visible, messages, loading, input, setInput, onSend, bottomRef, log }) {
  if (!visible) return null;
  return (
    <div style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column",
      overflow:"hidden", background:C.panelSoft, borderLeft:`1px solid ${C.border}` }}>
      <div style={{ padding:"8px 10px", borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
        <div style={{ width:22, height:22, borderRadius:5, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:11,
          background:`linear-gradient(135deg,${C.gold},#8B6914)` }}>👑</div>
        <div style={{ fontSize:10, fontWeight:700, color:C.gold }}>CEO Agent</div>
        <div style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%",
          background:C.green, animation:"pulse 2s infinite" }}/>
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:8,
        display:"flex", flexDirection:"column", gap:5 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", gap:4,
            flexDirection:m.role==="user"?"row-reverse":"row",
            alignSelf:m.role==="user"?"flex-end":"flex-start", maxWidth:"96%" }}>
            <div style={{ width:18, height:18, borderRadius:4, display:"flex",
              alignItems:"center", justifyContent:"center", fontSize:8, flexShrink:0,
              background:m.role==="assistant"?`linear-gradient(135deg,${C.gold},#8B6914)`:"rgba(212,175,55,0.1)",
              color:m.role==="assistant"?"#000":C.gold }}>
              {m.role==="assistant"?"👑":"👤"}
            </div>
            <div style={{ padding:"5px 8px", borderRadius:6, fontSize:9, lineHeight:1.6,
              background:m.role==="assistant"?C.panel:"rgba(212,175,55,0.06)",
              border:`1px solid ${m.role==="assistant"?C.border:`${C.gold}22`}`,
              whiteSpace:"pre-wrap", fontFamily:"monospace", color:C.text }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:4 }}>
            <div style={{ width:18, height:18, borderRadius:4, display:"flex",
              alignItems:"center", justifyContent:"center", fontSize:8,
              background:`linear-gradient(135deg,${C.gold},#8B6914)` }}>👑</div>
            <div style={{ padding:"5px 8px", borderRadius:6, background:C.panel,
              border:`1px solid ${C.border}`, display:"flex", gap:3, alignItems:"center" }}>
              {[0,1,2].map(i=>(
                <span key={i} style={{ width:3, height:3, borderRadius:"50%",
                  background:C.gold, display:"inline-block",
                  animation:`bounce 1.2s ${i*0.2}s infinite` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div style={{ padding:"4px 6px", borderTop:`1px solid ${C.border}`,
        display:"flex", gap:3, flexWrap:"wrap", flexShrink:0 }}>
        {QUICK_PROMPTS.map(p => (
          <button key={p} onClick={()=>setInput(p)}
            style={{ fontSize:7, padding:"2px 5px", background:`${C.gold}0a`,
              border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, cursor:"pointer" }}>
            {p}
          </button>
        ))}
      </div>

      <div style={{ padding:"6px 8px", borderTop:`1px solid ${C.border}`,
        display:"flex", gap:5, flexShrink:0 }}>
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();onSend();} }}
          placeholder="Directive CEO..." rows={2}
          style={{ flex:1, padding:"6px 8px", background:"rgba(0,0,0,0.5)",
            border:`1px solid ${C.border}`, borderRadius:6, color:C.text,
            fontFamily:"Georgia,serif", fontSize:9, resize:"none", outline:"none" }}/>
        <button onClick={onSend} disabled={!input.trim()||loading}
          style={{ width:30, height:30, border:"none", borderRadius:6, cursor:"pointer",
            fontSize:12, flexShrink:0, color:"#000",
            background:`linear-gradient(135deg,${C.gold},#8B6914)` }}>→</button>
      </div>

      {log.length > 0 && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:"4px 8px",
          maxHeight:60, overflowY:"auto", flexShrink:0 }}>
          {log.map((entry, i) => (
            <div key={i} style={{ fontSize:7, fontFamily:"monospace",
              color:entry.status==="posted"?C.blue:entry.status==="failed"?C.red:C.muted,
              marginBottom:1 }}>
              <span style={{ opacity:0.5 }}>{entry.time} </span>{entry.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
export default function CEO() {
  const [dept, setDept]               = useState("marketing");
  const [view, setView]               = useState("agents");
  const [articles, setArticles]       = useState([]);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [history, setHistory]         = useState([]);
  const [ceoInstruction, setCeoInstruction] = useState(null);
  const [showChat, setShowChat]       = useState(true);
  const [showKeys, setShowKeys]       = useState(false);
  const [keys, setKeys]               = useState(loadKeys);
  const [keyForm, setKeyForm]         = useState({apiKey:"",apiSecret:"",accessToken:"",accessTokenSecret:"",bearerToken:""});
  const [keySaved, setKeySaved]       = useState(false);
  const [log, setLog]                 = useState([]);
  const [kvStats, setKvStats]         = useState(null);

  const bottomRef  = useRef(null);
  const rotation   = getCurrentRotation();
  const weekNum    = getWeekOfMonth();
  const hasKeys    = Boolean(keys.apiKey && keys.apiSecret && keys.accessToken && keys.accessTokenSecret);

  // Load live stats from KV for org chart
  useEffect(() => {
    fetch("/api/kv?key=travito:stats")
      .then(r => r.json())
      .then(d => { if (d.success && d.config) setKvStats(d.config); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading]);

  useEffect(() => {
    setMessages([{ role:"assistant", content:
      `[CEO] Bonjour! Travito Maroc.\n\n• 📣 VP Marketing — Actif\n• 🏢 COO — Actif\n• 💰 VP Sales — Bientôt\n\nThème: ${rotation.icon} ${rotation.theme} S${weekNum}` }]);
  }, [rotation.icon, rotation.theme, weekNum]);

  const handleArticleReady = (article) => {
    setArticles(prev => [...prev.filter(a=>!(a.day===article.day&&a.weekKey===article.weekKey)), article]);
    setLog(prev => [{
      time: new Date().toLocaleTimeString("fr-MA"),
      msg: `${article.status==="posted"?"✅":"📝"} ${article.day} — ${article.topic}${article.qualityPercent?` (${article.qualityPercent}%)`:""}`,
      status: article.status,
    }, ...prev.slice(0,49)]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const u = { role:"user", content:text };
    const nextHistory = [...history, u];
    setInput(""); setMessages(p=>[...p,u]); setHistory(nextHistory); setLoading(true);
    if (/marketing|social|article|post/i.test(text)) { setDept("marketing"); setCeoInstruction(text); }
    try {
      const reply = await callClaude(CEO_PERSONA, text, nextHistory);
      const a = { role:"assistant", content:reply };
      setMessages(p=>[...p,a]); setHistory(p=>[...p,a]);
    } catch {
      setMessages(p=>[...p,{ role:"assistant", content:"[CEO] ⚠️ Erreur." }]);
    }
    setLoading(false);
  };

  const saveKeys = () => {
    localStorage.setItem("travito_x_keys", JSON.stringify(keyForm));
    setKeys(keyForm); setKeySaved(true);
    setTimeout(() => { setKeySaved(false); setShowKeys(false); }, 1500);
  };
  const clearKeys = () => {
    localStorage.removeItem("travito_x_keys");
    setKeys({}); setShowKeys(false);
  };

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{height:100%;overflow:hidden;}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes matrixFall{0%{transform:translateY(-20%)}100%{transform:translateY(120%)}}
        ::-webkit-scrollbar{width:8px;height:10px}
        ::-webkit-scrollbar-thumb{background:rgba(212,175,55,0.35);border-radius:8px}
        ::-webkit-scrollbar-track{background:rgba(255,255,255,0.04)}
      `}</style>

      <div style={{ position:"relative", width:"100vw", height:"100vh", background:C.bg,
        color:C.text, display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"Georgia,serif" }}>
        <MatrixRain/>
        <KeysModal open={showKeys} form={keyForm} setForm={setKeyForm} onSave={saveKeys}
          onClose={()=>setShowKeys(false)} hasKeys={hasKeys} onClear={clearKeys} saved={keySaved}/>

        <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>
          <Header view={view} setView={setView} dept={dept} setDept={setDept}
            hasKeys={hasKeys} onOpenKeys={()=>{ setKeyForm(keys); setShowKeys(true); }}
            showChat={showChat} onToggleChat={()=>setShowChat(p=>!p)}/>

          <div style={{ flex:1, minHeight:0, display:"flex", overflow:"hidden" }}>
            <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", overflow:"hidden" }}>


{view==="orgchart" && <OrgChart rotation={rotation} hasKeys={hasKeys} kvStats={kvStats}/>}
              <div style={{display:view==="agents"?"flex":"none",flex:1,minHeight:0,flexDirection:"column",overflow:"hidden"}}>
                <div style={{display:dept==="marketing"?"flex":"none",flex:1,minHeight:0,flexDirection:"column",overflow:"hidden"}}>
                  <VPMarketing articles={articles} onArticleReady={handleArticleReady}
                    ceoInstruction={ceoInstruction} xKeys={keys}/>
                </div>
                <div style={{display:dept==="coo"?"flex":"none",flex:1,minHeight:0,flexDirection:"column",overflow:"hidden"}}>
                  <COO/>
                </div>
                <div style={{display:dept!=="marketing"&&dept!=="coo"?"flex":"none",flex:1,alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:36}}>{DEPARTMENTS.find(d=>d.id===dept)?.icon}</div>
                  <div style={{fontSize:12,color:C.gold}}>{DEPARTMENTS.find(d=>d.id===dept)?.label} — Prochain sprint</div>
                </div>
              </div>

            </div>
            <ChatSidebar visible={showChat} messages={messages} loading={loading}
              input={input} setInput={setInput} onSend={handleSend}
              bottomRef={bottomRef} log={log}/>
          </div>
        </div>
      </div>
    </>
  );
}
