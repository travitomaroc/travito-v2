// ================================================================
//  SEO & Discoverability Director
//  Twitter-style agent cards → click to navigate
//  Agents: Overview | Strategist | Technical | OnPage | Monitoring | Schema | Programmatic
// ================================================================
import { useState, useEffect } from "react";

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(139,92,246,0.18)",
  purple:"#8b5cf6", gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  green:"#10b981", red:"#ef4444", amber:"#f59e0b", blue:"#1DA1F2",
  teal:"#14b8a6", orange:"#f97316", card:"rgba(20,28,48,0.9)",
};

const AGENTS = [
  { id:"overview",     icon:"📊", label:"Vue d'ensemble",  color:C.purple, desc:"SC + GA4 · KPIs",          tag:"auto",   freq:"6h" },
  { id:"strategist",   icon:"🎯", label:"SEO Strategist",  color:C.gold,   desc:"Keyword map · Priorities",  tag:"manual", freq:"weekly" },
  { id:"technical",    icon:"⚙️", label:"Technical SEO",   color:C.amber,  desc:"Sitemap · Robots · Issues", tag:"manual", freq:"weekly" },
  { id:"onpage",       icon:"✍️", label:"On-Page Content", color:C.teal,   desc:"Titres · Metas · Intros",   tag:"manual", freq:"on-demand" },
  { id:"monitoring",   icon:"📡", label:"Monitoring",      color:C.green,  desc:"Drops · Changes · Alerts",  tag:"auto",   freq:"Monday" },
  { id:"schema",       icon:"🏷️", label:"Schema Agent",    color:C.orange, desc:"JSON-LD · Rich snippets",   tag:"manual", freq:"weekly" },
  { id:"programmatic", icon:"⚡", label:"Programmatic",    color:C.blue,   desc:"City pages · Templates",    tag:"manual", freq:"monthly" },
];

// ── Helpers ───────────────────────────────────────────────────
function Chip({ label, color, small }) {
  return (
    <span style={{ fontSize: small?6:7, padding: small?"1px 4px":"1px 6px", borderRadius:4,
      background:(color||C.purple)+"18", color:color||C.purple,
      border:"1px solid "+(color||C.purple)+"33", whiteSpace:"nowrap" }}>{label}</span>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:"rgba(0,0,0,0.25)", border:`1px solid rgba(255,255,255,0.05)`,
      borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
      <div style={{ fontSize:18, fontWeight:700, color:color||C.purple, fontFamily:"monospace" }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize:8, color:C.text, fontWeight:600, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:7, color:C.muted, marginTop:1 }}>{sub}</div>}
    </div>
  );
}

function Bar({ value, max, color, height=5 }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ flex:1, background:"rgba(0,0,0,0.3)", borderRadius:3, height }}>
      <div style={{ width:pct+"%", height:"100%", borderRadius:3, background:color||C.purple, transition:"width 0.3s" }}/>
    </div>
  );
}

function Severity({ s }) {
  const map = { critical:C.red, high:"#f97316", medium:C.amber, low:C.muted, warning:C.amber, info:C.blue };
  return <Chip label={s} color={map[s]||C.muted}/>;
}

function EmptyState({ icon, title, sub, onAction, actionLabel }) {
  return (
    <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
      <div style={{ fontSize:36, marginBottom:10 }}>{icon}</div>
      <div style={{ fontSize:10, color:C.text, marginBottom:4 }}>{title}</div>
      {sub && <div style={{ fontSize:8, marginBottom:12 }}>{sub}</div>}
      {onAction && (
        <button onClick={onAction}
          style={{ fontSize:9, padding:"6px 16px", background:`${C.purple}18`,
            border:`1px solid ${C.purple}44`, borderRadius:6,
            color:C.purple, cursor:"pointer", fontWeight:700 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function RunButton({ label, onClick, loading, color }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ fontSize:9, padding:"5px 14px", borderRadius:6, cursor:loading?"not-allowed":"pointer",
        background:`${color||C.purple}18`, border:`1px solid ${color||C.purple}44`,
        color:color||C.purple, fontWeight:700, flexShrink:0 }}>
      {loading ? "⏳ En cours..." : label}
    </button>
  );
}

// ── useAgent hook ─────────────────────────────────────────────
function useAgent(agentId, kvKey) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const loadCache = async () => {
    if (!kvKey) return;
    try {
      const r = await fetch(`/api/seo-agent?action=get_cache&key=${kvKey}`);
      const d = await r.json();
      if (d.success && d.data) setData(d.data);
    } catch {}
  };

  const run = async (body = {}) => {
    setLoading(true); setError(null);
    try {
      const r    = await fetch(`/api/seo-agent?action=${agentId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let d;
      try { d = JSON.parse(text); }
      catch { throw new Error("Non-JSON: " + text.slice(0, 100).replace(/<[^>]+>/g, "")); }
      if (!d.success) throw new Error(d.error || "Erreur agent");
      setData(d);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { loadCache(); }, []);

  return { data, loading, error, run, setData };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT PANELS
// ═══════════════════════════════════════════════════════════════

function OverviewPanel({ seoData, loading, onRefresh }) {
  const sc  = seoData?.searchConsole;
  const ga  = seoData?.ga4;
  const cov = seoData?.coverage;
  const ins = seoData?.insights || [];

  if (loading && !seoData) return (
    <div style={{ textAlign:"center", paddingTop:40, color:C.purple, fontSize:10 }}>⏳ Connexion Google APIs...</div>
  );

  if (!seoData) return (
    <EmptyState icon="🔍" title="Données SEO non chargées"
      sub="Configurez: GOOGLE_SC_CLIENT_EMAIL · GOOGLE_SC_PRIVATE_KEY · GA4_PROPERTY_ID"
      onAction={onRefresh} actionLabel="🔄 Charger maintenant"/>
  );

  const totalClicks  = sc?.totals?.clicks || 0;
  const totalImpr    = sc?.totals?.impressions || 0;
  const avgPos       = sc?.keywords?.length ? Math.round(sc.keywords.reduce((s,k)=>s+k.position,0)/sc.keywords.length*10)/10 : null;
  const avgCtr       = totalImpr > 0 ? Math.round((totalClicks/totalImpr)*100*10)/10 : 0;

  const insightColor = t => t==="win"?C.green:t==="warning"?C.amber:C.purple;
  const insightIcon  = t => t==="win"?"✅":t==="warning"?"⚠️":"💡";

  return (
    <div>
      {seoData.cached && (
        <div style={{ marginBottom:10, padding:"4px 10px", background:"rgba(0,0,0,0.2)",
          borderRadius:5, fontSize:7.5, color:C.muted, display:"flex", justifyContent:"space-between" }}>
          <span>{seoData.stale ? "⚠️ Cache périmé" : `Cache ${seoData.age}h`} — {seoData.fetchedAt ? new Date(seoData.fetchedAt).toLocaleString("fr-MA") : ""}</span>
          <span style={{ color:C.purple, cursor:"pointer" }} onClick={onRefresh}>🔄 Forcer refresh</span>
        </div>
      )}

      {/* Search Console */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        SEARCH CONSOLE — {sc?.period}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:14 }}>
        <StatCard label="Clics" value={totalClicks.toLocaleString()} color={C.blue} sub="28 jours"/>
        <StatCard label="Impressions" value={totalImpr.toLocaleString()} color={C.purple} sub="28 jours"/>
        <StatCard label="CTR moyen" value={avgCtr+"%"} color={C.green} sub="taux de clic"/>
        <StatCard label="Position moy." value={avgPos} color={C.amber} sub="ranking"/>
      </div>

      {/* Coverage */}
      {cov && (
        <>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
            COUVERTURE INDEX
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
            <StatCard label="Soumises" value={cov.totalSubmitted} color={C.muted} sub="dans sitemap"/>
            <StatCard label="Indexées" value={cov.totalIndexed} color={cov.coverageRate>=80?C.green:C.amber} sub="par Google"/>
            <StatCard label="Taux index" value={cov.coverageRate+"%"} color={cov.coverageRate>=80?C.green:cov.coverageRate>=50?C.amber:C.red} sub="objectif >80%"/>
          </div>
        </>
      )}

      {/* GA4 */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        GA4 TRAFIC — {ga?.period}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
        <StatCard label="Sessions" value={ga?.total?.sessions?.toLocaleString()} color={C.blue}/>
        <StatCard label="Utilisateurs" value={ga?.total?.users?.toLocaleString()} color={C.teal}/>
        <StatCard label="Pages vues" value={ga?.total?.pageviews?.toLocaleString()} color={C.purple}/>
      </div>

      {/* Channels */}
      {ga?.channels?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>CANAUX</div>
          {ga.channels.slice(0,5).map((ch, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
              padding:"4px 8px", marginBottom:3, borderRadius:5,
              background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}` }}>
              <span style={{ fontSize:8, color:C.text, width:130, flexShrink:0 }}>{ch.channel}</span>
              <Bar value={ch.sessions} max={ga.channels[0]?.sessions||1} color={C.teal}/>
              <span style={{ fontSize:8, color:C.teal, fontFamily:"monospace", flexShrink:0 }}>{ch.sessions}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Insights */}
      {ins.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>INSIGHTS IA</div>
          {ins.map((ins2, i) => (
            <div key={i} style={{ padding:"8px 10px", marginBottom:6, borderRadius:7,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${insightColor(ins2.type)}33` }}>
              <div style={{ fontSize:9, fontWeight:700, color:insightColor(ins2.type), marginBottom:3 }}>
                {insightIcon(ins2.type)} {ins2.title}
                {ins2.priority && <Chip label={ins2.priority} color={ins2.priority==="high"?C.red:C.amber} small/>}
              </div>
              <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{ins2.detail}</div>
              <div style={{ fontSize:8, color:C.text, borderLeft:`2px solid ${insightColor(ins2.type)}`,
                paddingLeft:7 }}>🎯 {ins2.action}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategistPanel({ seoData }) {
  const { data, loading, error, run } = useAgent("strategist", "travito:seo_strategy");
  const [input, setInput] = useState("");

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          placeholder="Instruction spécifique (optionnel)..."
          style={{ flex:1, fontSize:9, padding:"5px 10px", background:"rgba(0,0,0,0.3)",
            border:`1px solid ${C.border}`, borderRadius:6, color:C.text, outline:"none" }}/>
        <RunButton label="🎯 Analyser" onClick={()=>run({input})} loading={loading} color={C.gold}/>
      </div>

      {error && <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:8.5, color:C.red, marginBottom:10 }}>❌ {error}</div>}

      {data?.updatedAt && <div style={{ fontSize:7, color:C.muted, marginBottom:8 }}>Dernière analyse: {new Date(data.updatedAt).toLocaleString("fr-MA")}</div>}

      {data?.summary && (
        <div style={{ padding:"8px 12px", background:`${C.gold}08`, border:`1px solid ${C.gold}22`,
          borderRadius:7, fontSize:9, color:C.text, lineHeight:1.5, marginBottom:12 }}>{data.summary}</div>
      )}

      {/* Filter pages policy — Travito specific */}
      {data?.filterPagesPolicy && (
        <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)",
          borderRadius:7, marginBottom:12 }}>
          <div style={{ fontSize:8, fontWeight:700, color:C.red, marginBottom:3 }}>🚫 Politique pages filtre/search</div>
          <div style={{ fontSize:8.5, color:C.text }}>{data.filterPagesPolicy}</div>
        </div>
      )}

      {/* Priority pages */}
      {data?.priorityPages?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>PAGES PRIORITAIRES</div>
          {data.priorityPages.map((p, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom:3, flexWrap:"wrap" }}>
                <span style={{ fontSize:8, fontFamily:"monospace", color:C.teal }}>{p.url}</span>
                <Chip label={p.priority} color={p.priority==="high"?C.red:p.priority==="medium"?C.amber:C.muted}/>
                <Chip label={p.action} color={p.action==="optimize"?C.green:p.action==="noindex"?C.red:C.blue}/>
                {p.estimatedTraffic && <Chip label={"trafic "+p.estimatedTraffic} color={C.muted} small/>}
              </div>
              <div style={{ fontSize:8, color:C.muted }}>{p.reason}</div>
              {p.targetKeyword && <div style={{ fontSize:7.5, color:C.purple, marginTop:2 }}>🎯 {p.targetKeyword}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Keyword map */}
      {data?.keywordMap?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>KEYWORD MAP</div>
          {data.keywordMap.map((k, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom:3 }}>
                <span style={{ fontSize:9, fontWeight:700, color:C.text }}>{k.category}</span>
                <Chip label={k.intent} color={k.intent==="commercial"?C.green:C.blue}/>
                <Chip label={"vol. "+k.volume} color={C.muted} small/>
              </div>
              <div style={{ fontSize:8.5, color:C.purple, marginBottom:2 }}>Primary: {k.primary}</div>
              {k.secondary?.length > 0 && <div style={{ fontSize:7.5, color:C.muted }}>{k.secondary.join(" · ")}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Index policy */}
      {data?.indexPolicy && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>POLITIQUE INDEX/NOINDEX</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div style={{ padding:"8px 10px", background:"rgba(239,68,68,0.06)", borderRadius:7, border:"1px solid rgba(239,68,68,0.2)" }}>
              <div style={{ fontSize:8, fontWeight:700, color:C.red, marginBottom:5 }}>🚫 NOINDEX</div>
              {data.indexPolicy.noindex?.map((rule, i) => <div key={i} style={{ fontSize:7.5, color:C.muted, marginBottom:2 }}>• {rule}</div>)}
            </div>
            <div style={{ padding:"8px 10px", background:"rgba(16,185,129,0.06)", borderRadius:7, border:"1px solid rgba(16,185,129,0.2)" }}>
              <div style={{ fontSize:8, fontWeight:700, color:C.green, marginBottom:5 }}>✅ INDEX</div>
              {data.indexPolicy.index?.map((rule, i) => <div key={i} style={{ fontSize:7.5, color:C.muted, marginBottom:2 }}>• {rule}</div>)}
            </div>
          </div>
        </div>
      )}

      {/* Roadmap */}
      {data?.roadmap?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>ROADMAP 4 SEMAINES</div>
          {data.roadmap.map((r, i) => (
            <div key={i} style={{ display:"flex", gap:8, padding:"5px 10px", marginBottom:3,
              borderRadius:5, background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}`, alignItems:"center" }}>
              <span style={{ fontSize:8, fontWeight:700, color:C.gold, fontFamily:"monospace", flexShrink:0 }}>S{r.week}</span>
              <span style={{ fontSize:8, color:C.text, flex:1 }}>{r.task}</span>
              {r.agent && <Chip label={r.agent} color={C.purple} small/>}
              <Chip label={r.impact} color={r.impact==="high"?C.green:C.amber} small/>
            </div>
          ))}
        </div>
      )}

      {/* Quick wins */}
      {data?.quickWins?.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>QUICK WINS</div>
          {data.quickWins.map((w, i) => (
            <div key={i} style={{ padding:"5px 10px", marginBottom:3, borderRadius:5,
              background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.15)",
              fontSize:8.5, color:C.text }}>⚡ {w}</div>
          ))}
        </div>
      )}

      {!data && !loading && <EmptyState icon="🎯" title="Stratégie SEO non générée" sub="Cliquez Analyser pour démarrer"/>}
    </div>
  );
}

function TechnicalPanel() {
  const { data, loading, error, run } = useAgent("technical", "travito:seo_technical");

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ fontSize:7.5, color:C.muted }}>
          {data?.updatedAt ? "Audit: "+new Date(data.updatedAt).toLocaleString("fr-MA") : "Aucun audit"}
        </div>
        <RunButton label="⚙️ Lancer Audit" onClick={()=>run()} loading={loading} color={C.amber}/>
      </div>

      {error && <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:8.5, color:C.red, marginBottom:10 }}>❌ {error}</div>}

      {data?.summary && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12,
          padding:"10px 14px", background:"rgba(0,0,0,0.2)", borderRadius:8, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:24, fontWeight:700, color:data.overallScore>=70?C.green:data.overallScore>=40?C.amber:C.red,
            fontFamily:"monospace" }}>{data.overallScore}</div>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.text }}>Score technique SEO</div>
            <div style={{ fontSize:8, color:C.muted }}>{data.summary}</div>
          </div>
        </div>
      )}

      {/* Sitemap + Robots status */}
      {(data?.sitemapAnalysis || data?.robotsAnalysis) && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          {data.sitemapAnalysis && (
            <div style={{ padding:"8px 10px", borderRadius:7,
              background:data.sitemapAnalysis.status==="ok"?"rgba(16,185,129,0.08)":"rgba(245,158,11,0.08)",
              border:`1px solid ${data.sitemapAnalysis.status==="ok"?C.green:C.amber}33` }}>
              <div style={{ fontSize:8, fontWeight:700, color:data.sitemapAnalysis.status==="ok"?C.green:C.amber, marginBottom:3 }}>
                {data.sitemapAnalysis.status==="ok"?"✅":"⚠️"} Sitemap ({data.sitemapAnalysis.totalUrls||"?"} URLs)
              </div>
              {data.sitemapAnalysis.issues?.map((iss, i) => <div key={i} style={{ fontSize:7.5, color:C.muted }}>• {iss}</div>)}
              {data.sitemapAnalysis.recommendations?.slice(0,2).map((r, i) => <div key={i} style={{ fontSize:7.5, color:C.teal, marginTop:2 }}>→ {r}</div>)}
            </div>
          )}
          {data.robotsAnalysis && (
            <div style={{ padding:"8px 10px", borderRadius:7,
              background:data.robotsAnalysis.status==="ok"?"rgba(16,185,129,0.08)":"rgba(245,158,11,0.08)",
              border:`1px solid ${data.robotsAnalysis.status==="ok"?C.green:C.amber}33` }}>
              <div style={{ fontSize:8, fontWeight:700, color:data.robotsAnalysis.status==="ok"?C.green:C.amber, marginBottom:3 }}>
                {data.robotsAnalysis.status==="ok"?"✅":"⚠️"} Robots.txt
              </div>
              {data.robotsAnalysis.issues?.map((iss, i) => <div key={i} style={{ fontSize:7.5, color:C.muted }}>• {iss}</div>)}
              {data.robotsAnalysis.recommendations?.slice(0,2).map((r, i) => <div key={i} style={{ fontSize:7.5, color:C.teal, marginTop:2 }}>→ {r}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Coverage analysis */}
      {data?.coverageAnalysis && (
        <div style={{ padding:"8px 12px", background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}`,
          borderRadius:7, marginBottom:12 }}>
          <div style={{ fontSize:8, fontWeight:700, color:C.gold, marginBottom:5 }}>📊 Analyse couverture index</div>
          <div style={{ fontSize:8.5, color:C.text, marginBottom:4 }}>{data.coverageAnalysis.indexedRatio}</div>
          {data.coverageAnalysis.gaps?.map((g, i) => <div key={i} style={{ fontSize:7.5, color:C.muted }}>• {g}</div>)}
        </div>
      )}

      {/* Listivo critical */}
      {data?.listivoCritical?.length > 0 && (
        <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)",
          borderRadius:7, marginBottom:12 }}>
          <div style={{ fontSize:8, fontWeight:700, color:C.red, marginBottom:5 }}>🔴 Listivo — Problèmes critiques</div>
          {data.listivoCritical.map((p, i) => <div key={i} style={{ fontSize:8, color:C.text, marginBottom:2 }}>• {p}</div>)}
        </div>
      )}

      {/* Issues */}
      {data?.issues?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>PROBLÈMES DÉTECTÉS</div>
          {data.issues.map((iss, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom:3, flexWrap:"wrap" }}>
                <Severity s={iss.severity}/><Chip label={iss.type} color={C.purple}/>
                {iss.affected && <span style={{ fontSize:7.5, color:C.teal, fontFamily:"monospace" }}>{iss.affected}</span>}
              </div>
              <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{iss.description}</div>
              <div style={{ fontSize:8, color:C.green, borderLeft:`2px solid ${C.green}`, paddingLeft:6 }}>🔧 {iss.fix}</div>
              {iss.rankMathSetting && <div style={{ fontSize:7.5, color:C.purple, marginTop:2 }}>⚙️ RankMath: {iss.rankMathSetting}</div>}
            </div>
          ))}
        </div>
      )}

      {/* RankMath config */}
      {data?.rankMathConfig?.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>⚙️ RANKMATH À CONFIGURER</div>
          {data.rankMathConfig.map((r, i) => (
            <div key={i} style={{ padding:"5px 10px", marginBottom:3, borderRadius:5,
              background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.15)", fontSize:8, color:C.text }}>
              • {r}
            </div>
          ))}
        </div>
      )}

      {!data && !loading && <EmptyState icon="⚙️" title="Audit technique non lancé" onAction={()=>run()} actionLabel="⚙️ Lancer Audit"/>}
    </div>
  );
}

function OnPagePanel() {
  const { data, loading, error, run, setData } = useAgent("onpage", null);
  const [bulkData, setBulkData] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [mode, setMode] = useState("single"); // single | bulk
  const [form, setForm] = useState({ pageType:"category", slug:"", category:"", currentTitle:"" });
  const [pushToWP, setPushToWP] = useState(false);

  const runBulk = async () => {
    setBulkLoading(true);
    try {
      const r = await fetch("/api/seo-agent?action=onpage_bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushToWP }),
      });
      const d = await r.json();
      if (d.success) setBulkData(d);
    } catch {}
    setBulkLoading(false);
  };

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display:"flex", gap:5, marginBottom:12 }}>
        {[["single","✍️ Page unique"],["bulk","📦 Bulk toutes catégories"]].map(([id,lbl]) => (
          <button key={id} onClick={()=>setMode(id)}
            style={{ fontSize:8, padding:"4px 12px", borderRadius:6, cursor:"pointer",
              background:mode===id?`${C.teal}18`:"transparent",
              border:`1px solid ${mode===id?C.teal:C.border}`,
              color:mode===id?C.teal:C.muted, fontWeight:mode===id?700:400 }}>
            {lbl}
          </button>
        ))}
      </div>

      {mode === "single" && (
        <>
          <div style={{ padding:"10px 12px", background:"rgba(0,0,0,0.2)",
            border:`1px solid ${C.border}`, borderRadius:8, marginBottom:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
              <div>
                <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>Type de page</div>
                <select value={form.pageType} onChange={e=>setForm(p=>({...p,pageType:e.target.value}))}
                  style={{ width:"100%", fontSize:9, padding:"4px 8px", background:"rgba(0,0,0,0.4)",
                    border:`1px solid ${C.border}`, borderRadius:5, color:C.text, outline:"none" }}>
                  <option value="homepage">Page d'accueil</option>
                  <option value="category">Catégorie principale</option>
                  <option value="term">Sous-terme / filtres</option>
                  <option value="city">Ville + catégorie</option>
                  <option value="listing">Page annonce</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>Catégorie / Contexte</div>
                <input value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}
                  placeholder="immobilier, automobile..."
                  style={{ width:"100%", fontSize:9, padding:"4px 8px", background:"rgba(0,0,0,0.4)",
                    border:`1px solid ${C.border}`, borderRadius:5, color:C.text, outline:"none", boxSizing:"border-box" }}/>
              </div>
              <div>
                <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>Slug / URL</div>
                <input value={form.slug} onChange={e=>setForm(p=>({...p,slug:e.target.value}))}
                  placeholder="/immobilier-casablanca"
                  style={{ width:"100%", fontSize:9, padding:"4px 8px", background:"rgba(0,0,0,0.4)",
                    border:`1px solid ${C.border}`, borderRadius:5, color:C.text, outline:"none", boxSizing:"border-box" }}/>
              </div>
              <div>
                <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>Titre actuel</div>
                <input value={form.currentTitle} onChange={e=>setForm(p=>({...p,currentTitle:e.target.value}))}
                  placeholder="Titre actuel de la page"
                  style={{ width:"100%", fontSize:9, padding:"4px 8px", background:"rgba(0,0,0,0.4)",
                    border:`1px solid ${C.border}`, borderRadius:5, color:C.text, outline:"none", boxSizing:"border-box" }}/>
              </div>
            </div>
            <RunButton label="✍️ Générer contenu SEO" onClick={()=>run({target:form})} loading={loading} color={C.teal}/>
          </div>

          {error && <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:8.5, color:C.red, marginBottom:10 }}>❌ {error}</div>}

          {data?.seoTitle && (
            <div>
              {[
                ["SEO Title (max 60)", data.seoTitle, 60, C.blue],
                ["Meta Description (max 155)", data.metaDescription, 155, C.purple],
                ["H1", data.h1, null, C.teal],
                ["OG Title", data.ogTitle, null, C.muted],
              ].map(([lbl, val, max, col]) => val ? (
                <div key={lbl} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                    <span style={{ fontSize:7.5, color:C.muted }}>{lbl}</span>
                    {max && <span style={{ fontSize:7, color:val?.length>max?C.red:C.green }}>{val?.length}/{max}</span>}
                  </div>
                  <div style={{ padding:"6px 10px", background:"rgba(0,0,0,0.2)",
                    border:`1px solid ${col}33`, borderRadius:5, fontSize:9, color:C.text }}>{val}</div>
                </div>
              ) : null)}

              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:7.5, color:C.muted, marginBottom:2 }}>Texte Intro</div>
                <div style={{ padding:"8px 10px", background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}`,
                  borderRadius:5, fontSize:8.5, color:C.text, lineHeight:1.6 }}>{data.introText}</div>
              </div>

              {data.faqSchema?.length > 0 && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:7.5, color:C.muted, marginBottom:4 }}>FAQ Schema ({data.faqSchema.length})</div>
                  {data.faqSchema.map((faq, i) => (
                    <div key={i} style={{ padding:"6px 10px", marginBottom:3, background:"rgba(0,0,0,0.15)",
                      border:`1px solid ${C.border}`, borderRadius:5 }}>
                      <div style={{ fontSize:8.5, fontWeight:700, color:C.text }}>Q: {faq.question}</div>
                      <div style={{ fontSize:8, color:C.muted, marginTop:2 }}>A: {faq.answer}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                {data.targetKeyword && <Chip label={"🎯 "+data.targetKeyword} color={C.purple}/>}
                {data.secondaryKeywords?.map((k,i) => <Chip key={i} label={k} color={C.muted}/>)}
              </div>

              {data.rankMathInstructions && (
                <div style={{ padding:"7px 10px", background:"rgba(139,92,246,0.06)",
                  border:"1px solid rgba(139,92,246,0.2)", borderRadius:6, fontSize:8, color:C.text }}>
                  ⚙️ RankMath: {data.rankMathInstructions}
                </div>
              )}
            </div>
          )}

          {!data && !loading && <EmptyState icon="✍️" title="Remplissez les paramètres" sub="Sélectionnez type + catégorie + slug"/>}
        </>
      )}

      {mode === "bulk" && (
        <>
          <div style={{ padding:"10px 12px", background:"rgba(0,0,0,0.2)",
            border:`1px solid ${C.border}`, borderRadius:8, marginBottom:12 }}>
            <div style={{ fontSize:8.5, color:C.text, marginBottom:8 }}>
              Génère titre/meta/intro pour toutes les catégories principales de votre site WordPress.
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <input type="checkbox" id="pushwp" checked={pushToWP} onChange={e=>setPushToWP(e.target.checked)}
                style={{ cursor:"pointer" }}/>
              <label htmlFor="pushwp" style={{ fontSize:8.5, color:C.text, cursor:"pointer" }}>
                Pousser automatiquement vers WordPress (met à jour RankMath title/description)
              </label>
            </div>
            <RunButton label={`📦 Générer pour toutes catégories${pushToWP?" + push WP":""}`}
              onClick={runBulk} loading={bulkLoading} color={C.teal}/>
          </div>

          {bulkData?.results?.length > 0 && (
            <div>
              <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>
                RÉSULTATS ({bulkData.total} catégories) {bulkData.pushed ? "— Poussé vers WP ✅" : ""}
              </div>
              {bulkData.results.map((r, i) => (
                <div key={i} style={{ padding:"8px 10px", marginBottom:4, borderRadius:6,
                  background:"rgba(0,0,0,0.2)", border:`1px solid ${r.error?C.red:C.border}` }}>
                  {r.error ? (
                    <div style={{ fontSize:8, color:C.red }}>❌ {r.category}: {r.error}</div>
                  ) : (
                    <>
                      <div style={{ fontSize:8.5, fontWeight:700, color:C.text, marginBottom:3 }}>
                        {r.category}
                        {r.wpError && <span style={{ fontSize:7, color:C.red, marginLeft:6 }}>WP error: {r.wpError}</span>}
                      </div>
                      <div style={{ fontSize:8, color:C.purple, marginBottom:2 }}>{r.seoTitle}</div>
                      <div style={{ fontSize:7.5, color:C.muted }}>{r.metaDescription}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {!bulkData && !bulkLoading && (
            <EmptyState icon="📦" title="Génération bulk non lancée" sub="Génère titre/meta/intro pour toutes les catégories"/>
          )}
        </>
      )}
    </div>
  );
}

function MonitoringPanel({ seoData }) {
  const { data, loading, error, run } = useAgent("monitoring", "travito:seo_monitoring");

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ fontSize:7.5, color:C.muted }}>
          {data?.updatedAt ? "Rapport: "+new Date(data.updatedAt).toLocaleString("fr-MA") : "Aucun rapport"}
        </div>
        <RunButton label="📡 Rapport hebdo" onClick={()=>run()} loading={loading} color={C.green}/>
      </div>

      {error && <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:8.5, color:C.red, marginBottom:10 }}>❌ {error}</div>}

      {data?.weeklyScore !== undefined && (
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12,
          padding:"10px 14px", background:"rgba(0,0,0,0.2)", borderRadius:8, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:28, fontWeight:700, fontFamily:"monospace",
            color:data.weeklyScore>=70?C.green:data.weeklyScore>=40?C.amber:C.red }}>{data.weeklyScore}</div>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.text }}>Score SEO semaine</div>
            <div style={{ fontSize:8, color:C.muted }}>{data.summary}</div>
          </div>
          {data.coverageDelta !== undefined && (
            <div style={{ marginLeft:"auto", textAlign:"center" }}>
              <div style={{ fontSize:13, color:data.coverageDelta>=0?C.green:C.red, fontWeight:700 }}>
                {data.coverageDelta>=0?"+":""}{data.coverageDelta}
              </div>
              <div style={{ fontSize:7, color:C.muted }}>pages indexées</div>
            </div>
          )}
        </div>
      )}

      {data?.alerts?.filter(a=>a.severity==="critical"||a.severity==="warning").length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.red, fontFamily:"monospace", marginBottom:6 }}>ALERTES</div>
          {data.alerts.filter(a=>a.severity==="critical"||a.severity==="warning").map((alert, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:alert.severity==="critical"?"rgba(239,68,68,0.08)":"rgba(245,158,11,0.08)",
              border:`1px solid ${alert.severity==="critical"?C.red:C.amber}33` }}>
              <div style={{ display:"flex", gap:6, marginBottom:2 }}>
                <Severity s={alert.severity}/><span style={{ fontSize:8, color:C.text }}>{alert.message}</span>
              </div>
              <div style={{ fontSize:7.5, color:C.green }}>🔧 {alert.fix}</div>
            </div>
          ))}
        </div>
      )}

      {data?.kwMovements?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>MOUVEMENTS KEYWORDS</div>
          {data.kwMovements.map((kw, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 10px",
              marginBottom:3, borderRadius:5, background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}` }}>
              <span style={{ fontSize:14, flexShrink:0 }}>
                {kw.direction==="up"?"📈":kw.direction==="down"?"📉":kw.direction==="new"?"🆕":"➡️"}
              </span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:8.5, color:C.text, fontWeight:600 }}>{kw.keyword}</div>
                <div style={{ fontSize:7.5, color:C.muted }}>{kw.detail}</div>
              </div>
              <div style={{ fontSize:7.5, color:kw.direction==="up"?C.green:kw.direction==="down"?C.red:C.muted,
                fontFamily:"monospace", flexShrink:0 }}>{kw.action}</div>
            </div>
          ))}
        </div>
      )}

      {data?.nextActions?.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>ACTIONS PRIORITAIRES</div>
          {data.nextActions.map((act, i) => (
            <div key={i} style={{ display:"flex", gap:6, padding:"6px 10px", marginBottom:3,
              borderRadius:5, background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.15)",
              alignItems:"center" }}>
              <span style={{ fontSize:8, fontWeight:700, color:C.purple, flexShrink:0 }}>#{act.priority||i+1}</span>
              <span style={{ fontSize:8, color:C.text, flex:1 }}>{act.action||act}</span>
              {act.agent && <Chip label={act.agent} color={C.purple} small/>}
              {act.effort && <Chip label={act.effort} color={C.muted} small/>}
            </div>
          ))}
        </div>
      )}

      {!data && !loading && <EmptyState icon="📡" title="Rapport hebdo non généré" onAction={()=>run()} actionLabel="📡 Générer rapport"/>}
    </div>
  );
}

function SchemaPanel() {
  const { data, loading, error, run } = useAgent("schema", "travito:seo_schema");

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ fontSize:7.5, color:C.muted }}>
          {data?.updatedAt ? "Audit: "+new Date(data.updatedAt).toLocaleString("fr-MA") : "Aucun audit"}
        </div>
        <RunButton label="🏷️ Auditer Schema" onClick={()=>run()} loading={loading} color={C.orange}/>
      </div>

      {error && <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:8.5, color:C.red, marginBottom:10 }}>❌ {error}</div>}

      {data?.summary && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12,
          padding:"10px 14px", background:"rgba(0,0,0,0.2)", borderRadius:8, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:24, fontWeight:700, fontFamily:"monospace",
            color:data.overallScore>=70?C.green:data.overallScore>=40?C.amber:C.red }}>{data.overallScore}</div>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.text }}>Score Schema Markup</div>
            <div style={{ fontSize:8, color:C.muted }}>{data.summary}</div>
          </div>
        </div>
      )}

      {/* Schema checks per page */}
      {data?.schemaChecks?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>PAGES VÉRIFIÉES</div>
          {data.schemaChecks.map((check, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:8, fontFamily:"monospace", color:C.teal }}>{check.url?.replace("https://travito.ma","")}</span>
                {check.error
                  ? <Chip label="erreur" color={C.red}/>
                  : <div style={{ display:"flex", gap:3 }}>
                      {check.schemasFound?.map((s, j) => <Chip key={j} label={s} color={C.green} small/>)}
                    </div>
                }
              </div>
              {check.missing?.length > 0 && (
                <div style={{ fontSize:7.5, color:C.red }}>
                  Manquant: {check.missing.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {data?.issues?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>PROBLÈMES SCHEMA</div>
          {data.issues.map((iss, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:5, marginBottom:3 }}>
                <Severity s={iss.severity}/>
                <span style={{ fontSize:8, color:C.text }}>{iss.page}</span>
              </div>
              <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>
                Manquant: {iss.missing?.join(", ")}
              </div>
              <div style={{ fontSize:7.5, color:C.green }}>🔧 {iss.fix}</div>
              {iss.rankMathStep && <div style={{ fontSize:7.5, color:C.purple, marginTop:2 }}>⚙️ {iss.rankMathStep}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Schema templates */}
      {data?.schemaTemplates && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>TEMPLATES JSON-LD</div>
          {Object.entries(data.schemaTemplates).map(([key, template]) => (
            <div key={key} style={{ marginBottom:8 }}>
              <div style={{ fontSize:8, fontWeight:700, color:C.orange, marginBottom:3 }}>{key}</div>
              <div style={{ padding:"8px 10px", background:"rgba(0,0,0,0.3)", borderRadius:5,
                fontFamily:"monospace", fontSize:7.5, color:C.text, whiteSpace:"pre-wrap",
                wordBreak:"break-word", maxHeight:120, overflowY:"auto" }}>
                {template}
              </div>
            </div>
          ))}
        </div>
      )}

      {!data && !loading && <EmptyState icon="🏷️" title="Audit schema non lancé" onAction={()=>run()} actionLabel="🏷️ Auditer Schema"/>}
    </div>
  );
}

function ProgrammaticPanel() {
  const { data, loading, error, run } = useAgent("programmatic", "travito:seo_programmatic");

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ fontSize:7.5, color:C.muted }}>
          {data?.updatedAt ? "Analyse: "+new Date(data.updatedAt).toLocaleString("fr-MA") : "Aucune analyse"}
        </div>
        <RunButton label="⚡ Analyser opportunités" onClick={()=>run()} loading={loading} color={C.blue}/>
      </div>

      {error && <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:8.5, color:C.red, marginBottom:10 }}>❌ {error}</div>}

      {data?.summary && (
        <div style={{ padding:"8px 12px", background:`${C.blue}08`, border:`1px solid ${C.blue}22`,
          borderRadius:7, fontSize:9, color:C.text, lineHeight:1.5, marginBottom:12 }}>{data.summary}</div>
      )}

      {/* Filter pages rule */}
      {data?.filterPagesRule && (
        <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)",
          borderRadius:7, marginBottom:12 }}>
          <div style={{ fontSize:8, fontWeight:700, color:C.red, marginBottom:3 }}>🚫 Règle pages search/filter Listivo</div>
          <div style={{ fontSize:8.5, color:C.text }}>{data.filterPagesRule}</div>
        </div>
      )}

      {/* Priority matrix */}
      {data?.priorityMatrix?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>MATRICE PRIORITÉ</div>
          {data.priorityMatrix.map((m, i) => (
            <div key={i} style={{ padding:"8px 10px", marginBottom:5, borderRadius:7,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom:5 }}>
                <Chip label={m.type} color={C.blue}/>
                <Chip label={"trafic: "+m.monthlyEstimatedTraffic} color={C.green} small/>
                <Chip label={"effort: "+m.effort} color={m.effort==="low"?C.green:m.effort==="high"?C.red:C.amber} small/>
              </div>
              {m.pages?.slice(0,4).map((p, j) => (
                <div key={j} style={{ fontSize:7.5, color:C.muted, marginBottom:1 }}>• {p}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* City pages */}
      {data?.cityPages?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>PAGES VILLE + CATÉGORIE</div>
          {data.cityPages.map((cp, i) => (
            <div key={i} style={{ padding:"6px 10px", marginBottom:3, borderRadius:5,
              background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}`,
              display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:8.5, color:C.text, flex:1 }}>{cp.template}</span>
              <Chip label={cp.priority} color={cp.priority==="high"?C.red:C.amber} small/>
              <Chip label={cp.estimatedPages+" pages"} color={C.muted} small/>
              <Chip label={cp.action} color={cp.action==="create"?C.green:C.blue} small/>
            </div>
          ))}
        </div>
      )}

      {/* Templates */}
      {data?.templates && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>TEMPLATES</div>
          {Object.entries(data.templates).map(([key, tmpl]) => (
            <div key={key} style={{ marginBottom:8, padding:"8px 10px", background:"rgba(0,0,0,0.2)",
              border:`1px solid ${C.border}`, borderRadius:6 }}>
              <div style={{ fontSize:8, fontWeight:700, color:C.blue, marginBottom:5 }}>{key}</div>
              {Object.entries(tmpl).map(([field, val]) => (
                <div key={field} style={{ marginBottom:3 }}>
                  <span style={{ fontSize:7.5, color:C.muted }}>{field}: </span>
                  <span style={{ fontSize:8, color:C.text }}>{val}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Implementation plan */}
      {data?.implementationPlan?.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>PLAN D'IMPLÉMENTATION</div>
          {data.implementationPlan.map((phase, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
                <span style={{ fontSize:8, fontWeight:700, color:C.blue }}>Phase {phase.phase}</span>
                <Chip label={`${phase.pages} pages`} color={C.muted} small/>
                <Chip label={phase.effort} color={C.amber} small/>
              </div>
              <div style={{ fontSize:8, color:C.text }}>{phase.description}</div>
            </div>
          ))}
        </div>
      )}

      {!data && !loading && (
        <EmptyState icon="⚡" title="Analyse programmatique non lancée"
          sub="Identifie les opportunités de pages ville+catégorie et termes" onAction={()=>run()} actionLabel="⚡ Analyser"/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN SEO DIRECTOR
// ═══════════════════════════════════════════════════════════════
export default function SEODirector() {
  const [activeAgent, setActiveAgent] = useState("overview");
  const [seoData, setSeoData]         = useState(null);
  const [seoLoading, setSeoLoading]   = useState(false);
  const [lastFetch, setLastFetch]     = useState(null);

  const fetchSeoData = async (force = false) => {
    setSeoLoading(true);
    try {
      const r = await fetch("/api/seo-agent?action=fetch_data" + (force ? "?force=true" : ""));
      const d = await r.json();
      if (d.success) { setSeoData(d); setLastFetch(new Date()); }
    } catch {}
    setSeoLoading(false);
  };

  useEffect(() => {
    fetchSeoData();
    const iv = setInterval(() => fetchSeoData(), 6 * 3600 * 1000);
    return () => clearInterval(iv);
  }, []);

  const sc  = seoData?.searchConsole;
  const cov = seoData?.coverage;
  const ga  = seoData?.ga4;

  // Agent status summary for cards
  const agentStatus = {
    overview:     seoData ? "✅" : seoLoading ? "⏳" : "—",
    strategist:   "—",
    technical:    "—",
    onpage:       "—",
    monitoring:   "—",
    schema:       "—",
    programmatic: "—",
  };

  const active = AGENTS.find(a => a.id === activeAgent);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── MANAGER HEADER ────────────────────────────────────── */}
      <div style={{ background:"rgba(12,8,28,0.98)", borderBottom:`1px solid ${C.border}`,
        padding:"7px 12px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <div style={{ width:28, height:28, background:"linear-gradient(135deg,#8b5cf6,#4f1d91)",
          borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:15, flexShrink:0 }}>🔍</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.purple }}>SEO & Discoverability Director</div>
          <div style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>
            travito.ma · SearchConsole + GA4 + RankMath + WordPress
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          {seoData && (
            <div style={{ fontSize:7, color:C.muted, textAlign:"right", lineHeight:1.4 }}>
              <div>{seoData.cached ? `Cache ${seoData.age}h` : "Données fraîches"}</div>
              {lastFetch && <div>{lastFetch.toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"})}</div>}
            </div>
          )}
          <button onClick={()=>fetchSeoData(true)} disabled={seoLoading}
            style={{ fontSize:7.5, padding:"3px 9px", borderRadius:5,
              background:`${C.purple}18`, border:`1px solid ${C.purple}33`,
              color:C.purple, cursor:seoLoading?"not-allowed":"pointer" }}>
            {seoLoading?"⏳":"🔄"} SC+GA4
          </button>
        </div>
      </div>

      {/* ── AGENT CARDS (Twitter-style) ───────────────────────── */}
      <div style={{ background:"rgba(8,5,20,0.95)", borderBottom:`1px solid ${C.border}`,
        padding:"7px 10px", display:"flex", gap:6, flexShrink:0, overflowX:"auto" }}>
        {AGENTS.map(agent => {
          const isActive = activeAgent === agent.id;
          // Quick stats for card
          let kpi = null;
          if (agent.id === "overview" && sc) kpi = sc.totals?.clicks + " clics";
          if (agent.id === "overview" && cov) kpi = cov.coverageRate + "% indexé";
          return (
            <button key={agent.id} onClick={()=>setActiveAgent(agent.id)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
                borderRadius:10, flexShrink:0, cursor:"pointer",
                background:isActive?`${agent.color}15`:"rgba(0,0,0,0.2)",
                border:`1px solid ${isActive?agent.color:C.border}`,
                transition:"all 0.15s" }}>
              <span style={{ fontSize:13 }}>{agent.icon}</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:8.5, color:isActive?agent.color:C.muted,
                  fontFamily:"monospace", fontWeight:isActive?700:400, whiteSpace:"nowrap" }}>
                  {agent.label}
                </div>
                <div style={{ fontSize:6.5, color:C.muted, marginTop:1 }}>{kpi || agent.desc}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:2, alignItems:"flex-end" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:agent.color,
                  opacity:isActive?1:0.3,
                  animation:isActive&&(agent.tag==="auto")?"pulse 2s infinite":"none" }}/>
                <Chip label={agent.freq} color={agent.color} small/>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── ACTIVE AGENT PANEL ────────────────────────────────── */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"10px 12px" }}>

          {/* Panel sub-header */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12,
            paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:16 }}>{active?.icon}</span>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:active?.color }}>{active?.label}</div>
              <div style={{ fontSize:8, color:C.muted }}>{active?.desc}</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
              <Chip label={active?.tag === "auto" ? "🤖 Auto" : "👤 Manuel"} color={active?.color}/>
              <Chip label={active?.freq} color={C.muted}/>
            </div>
          </div>

          {activeAgent === "overview"     && <OverviewPanel seoData={seoData} loading={seoLoading} onRefresh={()=>fetchSeoData(true)}/>}
          {activeAgent === "strategist"   && <StrategistPanel seoData={seoData}/>}
          {activeAgent === "technical"    && <TechnicalPanel/>}
          {activeAgent === "onpage"       && <OnPagePanel/>}
          {activeAgent === "monitoring"   && <MonitoringPanel seoData={seoData}/>}
          {activeAgent === "schema"       && <SchemaPanel/>}
          {activeAgent === "programmatic" && <ProgrammaticPanel/>}
        </div>
      </div>
    </div>
  );
}
