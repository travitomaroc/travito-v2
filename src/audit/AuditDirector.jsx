// ================================================================
//  AUDIT DIRECTOR — Content Audit Dashboard
//  Review everything posted by platform agents
//  Track: Posted vs Audited per platform
// ================================================================
import { useState, useEffect } from "react";
import { callClaude } from "../config/agentConfig";

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(212,175,55,0.18)",
  gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  green:"#10b981", red:"#ef4444", blue:"#1DA1F2",
  amber:"#f59e0b", purple:"#8b5cf6", card:"rgba(20,28,48,0.9)",
};

const PLATFORMS = [
  { id:"x",       icon:"𝕏",  label:"X-Twitter", color:"#1DA1F2", active:true  },
  { id:"youtube", icon:"▶️", label:"YouTube",   color:"#FF0000", active:false },
  { id:"tiktok",  icon:"🎵", label:"TikTok",    color:"#ff0050", active:false },
];

export default function AuditDirector() {
  const [platform, setPlatform]   = useState("x");
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selectedDate, setDate]   = useState(new Date().toISOString().split("T")[0]);
  const [allPosts, setAllPosts]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("audit_posts") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("audit_posts", JSON.stringify(allPosts.slice(0,500)));
    fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:"travito:audit_posts",value:JSON.stringify(allPosts.slice(0,500))})}).catch(()=>{});
  }, [allPosts]);

  // Restore from KV on mount if localStorage empty
  useEffect(() => {
    if (!localStorage.getItem("audit_posts")) {
      fetch("/api/kv?key=travito:audit_posts").then(r=>r.json()).then(d=>{
        if (Array.isArray(d.config) && d.config.length > 0) setAllPosts(d.config);
      }).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [engageStats, setEngageStats] = useState(null);
  const [scoring, setScoring]         = useState({});  // postId -> "loading"|score object

  const scoreWithAI = async (post) => {
    if (scoring[post.id] && scoring[post.id] !== "loading") return; // already scored
    setScoring(p => ({ ...p, [post.id]: "loading" }));
    try {
      // Use xPost (tweet thread) when available — that's what was actually published
      const evalContent = (post.xPost && post.xPost.length > 20)
        ? post.xPost.substring(0, 600)
        : (post.content || post.topic || "").substring(0, 400);
      const srcLabel = (post.xPost && post.xPost.length > 20) ? "THREAD X PUBLIÉ" : "CONTENU ARTICLE";

      const prompt = "Tu es l Auditeur Qualite de Travito Maroc. Evalue ce contenu publie sur X (@TravitoMaroc).\n\n"
        + "SUJET: " + (post.topic || "") + "\n"
        + srcLabel + ": " + evalContent + "\n"
        + "URL TWEET: " + (post.tweetUrl || "non disponible") + "\n"
        + "URL ARTICLE: " + (post.blogUrl || "non disponible") + "\n\n"
        + "Evalue sur 5 criteres (0-10 chacun):\n"
        + "1. PERTINENCE MAROC: Le contenu est-il ancre dans la realite marocaine?\n"
        + "2. QUALITE REDACTION: Ton informatif, pas affirmatif, bien structure?\n"
        + "3. CTA PRESENT: travito.ma et @TravitoMaroc mentionnes?\n"
        + "4. LIEN ARTICLE: URL article blog inclus dans le post?\n"
        + "5. ENGAGEMENT POTENTIEL: Hook fort, hashtags pertinents?\n\n"
        + 'Reponds UNIQUEMENT en JSON: {"scores":{"pertinence":8,"qualite":7,"cta":10,"lien":10,"engagement":7},"total":42,"max":50,"pct":84,"verdict":"BON","note":"Observation en 1 phrase","flags":[]}'
;

      const raw = await callClaude(
        "Tu es l Auditeur Qualité de Travito Maroc. Réponds uniquement en JSON valide.",
        prompt
      );
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s === -1) throw new Error("No JSON");
      const result = JSON.parse(raw.substring(s, e+1));
      setScoring(p => ({ ...p, [post.id]: result }));
      // Save score to allPosts
      setAllPosts(prev => prev.map(x => x.id===post.id ? {...x, aiScore:result} : x));
      setPosts(prev => prev.map(x => x.id===post.id ? {...x, aiScore:result} : x));
    } catch(e) {
      setScoring(p => ({ ...p, [post.id]: { error: e.message } }));
    }
  };

  // Auto-score posts that don't have a score yet
  useEffect(() => {
    posts.forEach(post => {
      if (!post.aiScore && !scoring[post.id]) {
        setTimeout(() => scoreWithAI(post), 500);
      } else if (post.aiScore) {
        setScoring(p => ({ ...p, [post.id]: post.aiScore }));
      }
    });
  }, [posts]);

  // Load posts from KV
  const loadPosts = async (date = selectedDate) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/kv?action=list_posts&platform=${platform}&date=${date}`);
      const d = await r.json();
      if (d.success && d.posts?.length > 0) {
        setAllPosts(prev => {
          const existingIds = new Set(prev.map(p=>p.id));
          const newPosts = d.posts.filter(p=>!existingIds.has(p.id));
          return [...newPosts, ...prev];
        });
        setPosts(d.posts);
      } else {
        const filtered = allPosts.filter(p =>
          p.platform === platform &&
          (date ? p.postedAt?.startsWith(date) : true)
        );
        setPosts(filtered);
      }
    } catch(e) {
      const filtered = allPosts.filter(p =>
        p.platform === platform &&
        (selectedDate ? p.postedAt?.startsWith(selectedDate) : true)
      );
      setPosts(filtered);
    }
    // Load engagement stats from KV
    try {
      const er = await fetch("/api/kv?key=travito:stats");
      const ed = await er.json();
      if (ed.success && ed.config) setEngageStats(ed.config);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadPosts(selectedDate); }, [platform, selectedDate]);

  // Load engagement stats on mount independently
  useEffect(() => {
    fetch("/api/kv?key=travito:stats")
      .then(r=>r.json())
      .then(d=>{ if(d.success && d.config) setEngageStats(d.config); })
      .catch(()=>{});
    // Load ALL posts for this platform (no date filter) to populate allPosts
    fetch(`/api/kv?action=list_posts&platform=${platform}`)
      .then(r=>r.json())
      .then(d=>{
        if(d.success && d.posts?.length > 0) {
          setAllPosts(prev => {
            const existingIds = new Set(prev.map(p=>p.id));
            const newPosts = d.posts.filter(p=>!existingIds.has(p.id));
            return [...newPosts, ...prev];
          });
        }
      }).catch(()=>{});
  }, [platform]);

  // Mark as audited
  const markAudited = async (post) => {
    // Update localStorage immediately
    const updated = { ...post, audited: true, auditedAt: new Date().toISOString() };
    setAllPosts(prev => prev.map(p => p.id===post.id ? updated : p));
    setPosts(prev => prev.map(p => p.id===post.id ? updated : p));

    // Update KV if we have a key
    if (post.key) {
      try {
        await fetch("/api/kv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "audit_post", postKey: post.key }),
        });
      } catch(e) { /* non-critical */ }
    }
  };

  // Get all posts for this platform (all dates)
  const platformPosts   = allPosts.filter(p => p.platform === platform);
  const totalPosted     = platformPosts.length;
  const totalAudited    = platformPosts.filter(p => p.audited).length;
  const auditPct        = totalPosted > 0 ? Math.round((totalAudited/totalPosted)*100) : 0;
  const behind          = totalPosted - totalAudited;

  // Group by date
  const grouped = posts.reduce((acc, p) => {
    const date = p.postedAt?.split("T")[0] || "unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {});

  // Get unique dates from all posts
  const allDates = [...new Set(platformPosts.map(p=>p.postedAt?.split("T")[0]).filter(Boolean))].sort().reverse();

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:C.bg }}>

      {/* TOP BAR */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", borderBottom:`1px solid ${C.border}`, height:38, flexShrink:0 }}>
        <span style={{ fontSize:10, color:C.gold, fontFamily:"monospace", fontWeight:700 }}>🔎 AUDIT DIRECTOR</span>
        <div style={{ display:"flex", gap:4, marginLeft:10 }}>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={()=>p.active&&setPlatform(p.id)} disabled={!p.active}
              style={{ fontSize:8, padding:"3px 10px", borderRadius:8,
                background:platform===p.id?`${p.color}18`:"transparent",
                border:`1px solid ${platform===p.id?p.color:C.border}`,
                color:platform===p.id?p.color:C.muted,
                cursor:p.active?"pointer":"not-allowed", opacity:p.active?1:0.4 }}>
              {p.icon} {p.label} {!p.active&&<span style={{fontSize:6}}>(bientôt)</span>}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:"auto" }}>
          <button onClick={()=>loadPosts(selectedDate)} disabled={loading}
            style={{ fontSize:8, padding:"3px 10px", background:`${C.blue}12`, border:`1px solid ${C.blue}44`, borderRadius:6, color:C.blue, cursor:"pointer" }}>
            {loading?"⏳":"🔄"} Actualiser
          </button>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{ padding:"8px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:20, alignItems:"center", flexShrink:0, flexWrap:"wrap" }}>
        {/* Audit progress */}
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontSize:9, color:C.text, fontWeight:700 }}>
              Audité: {totalAudited} / {totalPosted} ({auditPct}%)
            </span>
            {behind > 0 && <span style={{ fontSize:9, color:C.amber, fontWeight:700 }}>⚠️ {behind} en retard</span>}
          </div>
          <div style={{ height:6, background:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${auditPct}%`, background:auditPct>=80?C.green:auditPct>=50?C.amber:C.red, borderRadius:3, transition:"width 0.5s" }}/>
          </div>
        </div>
        {/* Post stats */}
        {[["📬 Postés",totalPosted,C.blue],["✅ Audités",totalAudited,C.green],["⏳ Retard",behind,behind>0?C.amber:C.muted]].map(([l,v,c])=>(
          <div key={l} style={{ textAlign:"center", minWidth:50 }}>
            <div style={{ fontSize:14, fontWeight:700, color:c, fontFamily:"monospace" }}>{v}</div>
            <div style={{ fontSize:7, color:C.muted }}>{l}</div>
          </div>
        ))}
        {/* Engagement stats from KV */}
        {engageStats && (
          <>
            <div style={{ width:1, height:30, background:C.border }}/>
            <div style={{ fontSize:8, color:C.muted, fontFamily:"monospace" }}>ENGAGEMENT TOTAL</div>
            {[
              ["👍 Likes",     engageStats.totalLikes||0,     C.blue],
              ["👥 Follows",   engageStats.totalFollows||0,   C.green],
              ["🔁 Reposts",   engageStats.totalReposts||0,   C.purple],
              ["💬 Replies",   engageStats.totalReplies||0,   C.amber],
              ["↩️ Unfollow",  engageStats.totalUnfollows||0, C.muted],
              ["🗳️ Polls",     engageStats.totalPolls||0,     C.gold],
            ].map(([l,v,c])=>(
              <div key={l} style={{ textAlign:"center", minWidth:45 }}>
                <div style={{ fontSize:13, fontWeight:700, color:c, fontFamily:"monospace" }}>{v}</div>
                <div style={{ fontSize:7, color:C.muted }}>{l}</div>
              </div>
            ))}
            {engageStats.lastEngagement && (
              <div style={{ fontSize:7, color:C.muted }}>Dernier: {new Date(engageStats.lastEngagement).toLocaleString("fr-MA")}</div>
            )}
          </>
        )}
      </div>

      {/* MAIN */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* LEFT — Date selector */}
        <div style={{ width:140, flexShrink:0, borderRight:`1px solid ${C.border}`, padding:"8px 6px", overflowY:"auto" }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>DATES</div>

          {/* Today button */}
          <button onClick={()=>setDate(new Date().toISOString().split("T")[0])}
            style={{ width:"100%", padding:"5px 0", marginBottom:6, background:`${C.gold}18`, border:`1px solid ${C.gold}`, borderRadius:6, color:C.gold, cursor:"pointer", fontSize:8, fontWeight:700 }}>
            📅 Aujourd'hui
          </button>

          {/* Calendar date picker */}
          <input type="date" value={selectedDate} onChange={e=>setDate(e.target.value)}
            style={{ width:"100%", padding:"5px 6px", background:"rgba(20,28,48,0.95)",
              border:`1px solid ${C.gold}`, borderRadius:6, color:C.gold,
              fontSize:9, outline:"none", marginBottom:8, boxSizing:"border-box",
              colorScheme:"dark", cursor:"pointer" }}/>

          {/* Date history */}
          {allDates.slice(0,30).map(date => {
            const dayPosts   = platformPosts.filter(p=>p.postedAt?.startsWith(date));
            const dayAudited = dayPosts.filter(p=>p.audited).length;
            const isSelected = date === selectedDate;
            return (
              <div key={date} onClick={()=>setDate(date)}
                style={{ padding:"5px 6px", marginBottom:3, borderRadius:6, cursor:"pointer",
                  background:isSelected?`${C.blue}18`:"rgba(255,255,255,0.02)",
                  border:`1px solid ${isSelected?C.blue:C.border}` }}>
                <div style={{ fontSize:8, color:isSelected?C.blue:C.text }}>{date}</div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
                  <span style={{ fontSize:7, color:C.muted }}>{dayPosts.length} posts</span>
                  <span style={{ fontSize:7, color:dayAudited===dayPosts.length&&dayPosts.length>0?C.green:C.amber }}>
                    {dayAudited}/{dayPosts.length} ✅
                  </span>
                </div>
              </div>
            );
          })}

          {allDates.length === 0 && (
            <div style={{ fontSize:8, color:C.muted, textAlign:"center", paddingTop:10 }}>
              Aucun post encore
            </div>
          )}
        </div>

        {/* RIGHT — Posts list */}
        <div style={{ flex:1, overflowY:"auto", padding:"10px 14px" }}>

          {loading ? (
            <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
              <div style={{ fontSize:24, marginBottom:8 }}>⏳</div>
              Chargement...
            </div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <div style={{ fontSize:11, marginBottom:6 }}>Aucun post pour {selectedDate}</div>
              <div style={{ fontSize:9 }}>
                Les posts apparaissent ici automatiquement après chaque run du cron
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", marginBottom:10 }}>
                {posts.length} post{posts.length>1?"s":""} — {selectedDate}
              </div>

              {posts.map((post, i) => (
                <div key={post.id||i}
                  style={{ background:post.audited?`${C.green}06`:C.card,
                    border:`1px solid ${post.audited?C.green:C.border}`,
                    borderRadius:9, padding:"10px 12px", marginBottom:8 }}>

                  {/* Header */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:8, padding:"2px 7px", borderRadius:4, background:`${C.blue}15`, color:C.blue }}>{post.agent||"cron"}</span>
                        <span style={{ fontSize:8, color:C.muted }}>{post.postedAt ? new Date(post.postedAt).toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"}) : "—"}</span>
                        {post.audited && <span style={{ fontSize:8, color:C.green }}>✅ Audité {post.auditedAt?new Date(post.auditedAt).toLocaleDateString("fr-MA"):""}</span>}
                        {/* AI Score badge */}
                        {(() => {
                          const sc = scoring[post.id];
                          if (!sc) return null;
                          if (sc === "loading") return <span style={{ fontSize:8, color:C.amber }}>🤖 Analyse...</span>;
                          if (sc.error) return <span style={{ fontSize:8, color:C.red }}>⚠️ Score indispo</span>;
                          const pct = sc.pct || Math.round((sc.total/sc.max)*100);
                          const col = pct>=80?C.green:pct>=60?C.amber:C.red;
                          return (
                            <span style={{ fontSize:8, padding:"2px 8px", borderRadius:4, fontFamily:"monospace", fontWeight:700,
                              background:pct>=80?"rgba(16,185,129,0.12)":pct>=60?"rgba(245,158,11,0.12)":"rgba(239,68,68,0.12)",
                              color:col, border:"1px solid "+col+"44" }}>
                              🤖 {pct}% {sc.verdict||""}
                            </span>
                          );
                        })()}
                      </div>
                      {post.topic && (
                        <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:4 }}>{post.topic}</div>
                      )}
                      {/* Show tweet thread if available, else article excerpt */}
                      {(post.xPost || post.content) && (
                        <div style={{ fontSize:9, color:C.muted, lineHeight:1.5, marginBottom:4, fontStyle:post.xPost?"normal":"italic" }}>
                          {post.xPost
                            ? post.xPost.substring(0,250) + (post.xPost.length>250?"...":"")
                            : post.content?.substring(0,200) + (post.content?.length>200?"...":"")}
                        </div>
                      )}
                      {/* AI score breakdown */}
                      {(() => {
                        const sc = scoring[post.id];
                        if (!sc || sc==="loading" || sc.error) return null;
                        return (
                          <div style={{ marginTop:6 }}>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                              {Object.entries(sc.scores||{}).map(([k,v])=>(
                                <div key={k} style={{ display:"flex", alignItems:"center", gap:3 }}>
                                  <span style={{ fontSize:7, color:C.muted, textTransform:"capitalize" }}>{k}</span>
                                  <div style={{ width:24, height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
                                    <div style={{ height:"100%", width:(v/10*100)+"%", background:v>=8?C.green:v>=5?C.amber:C.red, borderRadius:2 }}/>
                                  </div>
                                  <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>{v}</span>
                                </div>
                              ))}
                            </div>
                            {sc.note && <div style={{ fontSize:8, color:C.muted, fontStyle:"italic" }}>💬 {sc.note}</div>}
                            {sc.flags?.length>0 && <div style={{ fontSize:7, color:C.red, marginTop:2 }}>⚠️ {sc.flags.join(" · ")}</div>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Links + Audit button */}
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:6 }}>
                    {post.tweetUrl && (
                      <a href={post.tweetUrl} target="_blank" rel="noopener"
                        style={{ fontSize:8, color:C.blue, textDecoration:"none" }}>
                        𝕏 Voir tweet
                      </a>
                    )}
                    {post.blogUrl && (
                      <a href={post.blogUrl} target="_blank" rel="noopener"
                        style={{ fontSize:8, color:C.purple, textDecoration:"none" }}>
                        📝 Voir article
                      </a>
                    )}
                    <div style={{ marginLeft:"auto" }}>
                      {!post.audited ? (
                        <button onClick={()=>markAudited(post)}
                          style={{ padding:"5px 16px", background:`${C.green}18`, border:`1px solid ${C.green}`, borderRadius:7, color:C.green, cursor:"pointer", fontSize:9, fontWeight:700 }}>
                          ✅ Marquer Audité
                        </button>
                      ) : (
                        <button onClick={()=>{
                          const updated={...post,audited:false,auditedAt:null};
                          setAllPosts(p=>p.map(x=>x.id===post.id?updated:x));
                          setPosts(p=>p.map(x=>x.id===post.id?updated:x));
                        }}
                          style={{ padding:"5px 12px", background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", fontSize:8 }}>
                          ↩️ Désauditer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
