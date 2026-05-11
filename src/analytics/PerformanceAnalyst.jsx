// ================================================================
//  Performance & Analytics Director
//  Unified: X/Twitter + SEO + YouTube + Content Quality
//  Auto-loads from KV | Weekly refresh via cron
// ================================================================
import { useState, useEffect } from "react";

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(16,185,129,0.18)",
  green:"#10b981", gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  red:"#ef4444", blue:"#1DA1F2", amber:"#f59e0b", purple:"#8b5cf6",
  teal:"#14b8a6", orange:"#f97316", card:"rgba(20,28,48,0.9)",
};

const AGENTS = [
  { id:"overview",  icon:"📊", label:"Vue d'ensemble",   color:C.green,  desc:"Tous canaux · KPIs",       freq:"weekly" },
  { id:"twitter",   icon:"🐦", label:"X / Twitter",      color:C.blue,   desc:"Followers · Posts · Reach", freq:"weekly" },
  { id:"seo",       icon:"🔍", label:"SEO & Trafic",     color:C.purple, desc:"SC + GA4 · Keywords",       freq:"daily"  },
  { id:"youtube",   icon:"📹", label:"YouTube",          color:C.red,    desc:"Vidéos · Vues · Chaîne",    freq:"weekly" },
  { id:"content",   icon:"📝", label:"Qualité Contenu",  color:C.amber,  desc:"Scores · Thèmes · Tendances",freq:"weekly" },
  { id:"insights",  icon:"🤖", label:"Insights IA",      color:C.teal,   desc:"Analyse cross-canal",        freq:"weekly" },
  { id:"history",   icon:"📈", label:"Historique",       color:"#6366f1", desc:"Trends · Croissance · Charts", freq:"permanent" },
];

function Chip({ label, color, small }) {
  return (
    <span style={{ fontSize:small?6:7, padding:small?"1px 4px":"1px 6px", borderRadius:4,
      background:(color||C.green)+"18", color:color||C.green,
      border:"1px solid "+(color||C.green)+"33", whiteSpace:"nowrap" }}>{label}</span>
  );
}

function StatCard({ label, value, sub, color, delta }) {
  return (
    <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.05)",
      borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
      <div style={{ fontSize:18, fontWeight:700, color:color||C.green, fontFamily:"monospace" }}>
        {value ?? "—"}
      </div>
      {delta !== undefined && delta !== 0 && (
        <div style={{ fontSize:8, color:delta>0?C.green:C.red, fontWeight:700 }}>
          {delta>0?"+":""}{delta} cette semaine
        </div>
      )}
      <div style={{ fontSize:8, color:C.text, fontWeight:600, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:7, color:C.muted, marginTop:1 }}>{sub}</div>}
    </div>
  );
}

function Bar({ value, max, color, height=5 }) {
  const pct = max > 0 ? Math.min(100, Math.round((value/max)*100)) : 0;
  return (
    <div style={{ flex:1, background:"rgba(0,0,0,0.3)", borderRadius:3, height }}>
      <div style={{ width:pct+"%", height:"100%", borderRadius:3, background:color||C.green }}/>
    </div>
  );
}

function EmptyState({ icon, title, sub, onAction, actionLabel }) {
  return (
    <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
      <div style={{ fontSize:36, marginBottom:10 }}>{icon}</div>
      <div style={{ fontSize:10, color:C.text, marginBottom:4 }}>{title}</div>
      {sub && <div style={{ fontSize:8, marginBottom:12, lineHeight:1.5 }}>{sub}</div>}
      {onAction && (
        <button onClick={onAction}
          style={{ fontSize:9, padding:"6px 16px", background:`${C.green}18`,
            border:`1px solid ${C.green}44`, borderRadius:6, color:C.green,
            cursor:"pointer", fontWeight:700 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── PANELS ────────────────────────────────────────────────────

function OverviewPanel({ data, onRefresh }) {
  if (!data) return <EmptyState icon="📊" title="Données non chargées"
    sub="Cliquez Actualiser pour charger toutes les métriques" onAction={onRefresh} actionLabel="🔄 Charger"/>;

  const x  = data.x;
  const s  = data.seo;
  const c  = data.content;
  const yt = data.youtube;
  const ins = data.insights || [];

  return (
    <div>
      {data.cached && (
        <div style={{ marginBottom:10, padding:"4px 10px", background:"rgba(0,0,0,0.2)",
          borderRadius:5, fontSize:7.5, color:C.muted, display:"flex", justifyContent:"space-between" }}>
          <span>Données du {new Date(data.fetchedAt).toLocaleString("fr-MA")} {data.stale?"— ⚠️ données périmées":""}</span>
          <span style={{ color:C.green, cursor:"pointer" }} onClick={onRefresh}>🔄 Forcer refresh</span>
        </div>
      )}

      {/* X Twitter */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        🐦 X / TWITTER — @TravitoMaroc
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Followers" value={x?.followers?.toLocaleString()} color={C.blue} delta={x?.followerDelta}/>
        <StatCard label="Impressions" value={x?.totals?.impressions?.toLocaleString()} color={C.blue} sub="30 derniers posts"/>
        <StatCard label="Engagement" value={x?.engagementRate+"%"} color={x?.engagementRate>=2?C.green:C.amber}/>
        <StatCard label="Posts analysés" value={x?.postsAnalyzed} color={C.muted}/>
      </div>

      {/* SEO */}
      {s && (
        <>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
            🔍 SEO — travito.ma · {s.period}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
            <StatCard label="Clics SC" value={s.clicks?.toLocaleString()} color={C.purple}/>
            <StatCard label="Sessions GA4" value={s.sessions?.toLocaleString()} color={C.purple}/>
            <StatCard label="Pages indexées" value={s.indexed} color={s.coverageRate>=80?C.green:C.amber} sub={`/${s.submitted} soumises`}/>
            <StatCard label="Top keyword" value={`pos ${s.topKeywordPos}`} color={C.purple} sub={s.topKeyword?.slice(0,20)}/>
          </div>
        </>
      )}

      {/* Content */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        📝 CONTENU — Qualité & Volume
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Articles publiés" value={c?.totalArticles} color={C.amber}/>
        <StatCard label="Qualité moyenne" value={c?.avgQuality ? c.avgQuality+"%" : "—"} color={c?.avgQuality>=80?C.green:C.amber}/>
        <StatCard label="Tweets total" value={c?.totalTweets} color={C.blue}/>
        <StatCard label="Blogs publiés" value={c?.totalBlogs} color={C.orange}/>
      </div>

      {/* YouTube */}
      {yt && (
        <>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
            📹 YOUTUBE
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
            <StatCard label="Vidéos produites" value={yt.totalVideos} color={C.red}/>
            <StatCard label="Publiées" value={yt.published} color={yt.published>0?C.green:C.muted}/>
            <StatCard label="En attente" value={yt.pending} color={yt.pending>0?C.amber:C.muted}/>
          </div>
        </>
      )}

      {/* AI Insights preview */}
      {ins.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
            🤖 INSIGHTS IA (top 2)
          </div>
          {ins.slice(0,2).map((ins2, i) => {
            const col = ins2.type==="win"?C.green:ins2.type==="warning"?C.amber:C.teal;
            return (
              <div key={i} style={{ padding:"8px 10px", marginBottom:5, borderRadius:7,
                background:"rgba(0,0,0,0.2)", border:`1px solid ${col}33` }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                  <Chip label={ins2.channel} color={col} small/>
                  <span style={{ fontSize:9, fontWeight:700, color:col }}>{ins2.title}</span>
                </div>
                <div style={{ fontSize:8, color:C.muted }}>{ins2.action}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TwitterPanel({ data }) {
  const x = data?.x;
  const [sortBy, setSortBy] = useState("impressions");
  if (!x) return <EmptyState icon="🐦" title="Données X non disponibles" sub="Actualisez pour charger"/>;

  const sortedPosts = x.recentPosts ? [...x.recentPosts].sort((a,b) => {
    if (sortBy === "impressions") return b.impressions - a.impressions;
    if (sortBy === "likes") return b.likes - a.likes;
    if (sortBy === "reposts") return b.reposts - a.reposts;
    return new Date(b.createdAt) - new Date(a.createdAt);
  }) : [];

  return (
    <div>
      {/* API calls note */}
      <div style={{ marginBottom:12, padding:"4px 10px", background:"rgba(16,185,129,0.06)",
        border:"1px solid rgba(16,185,129,0.15)", borderRadius:5, fontSize:7.5,
        color:"#10b981", display:"flex", justifyContent:"space-between" }}>
        <span>✅ {x.apiCallsUsed || 2} appels X API utilisés (me + userTimeline bulk)</span>
        <span>{x.postsAnalyzed} posts analysés · {x.posts30d} dans les 30 derniers jours</span>
      </div>

      {/* ACCOUNT — User */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        👤 COMPTE @TravitoMaroc — User
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Followers" value={x.followers?.toLocaleString()} color={C.blue}
          delta={x.followerDelta} sub="compte actuel"/>
        <StatCard label="Following" value={x.following?.toLocaleString()} color={C.muted}/>
        <StatCard label="Total tweets" value={x.tweetCount?.toLocaleString()} color={C.blue}/>
        <StatCard label="Listes" value={x.listedCount} color={C.muted}/>
      </div>

      {/* RECEIVED — Post metrics (what others did to our posts) */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        📬 REÇUS — Ce que les autres font à nos posts (Post)
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:6 }}>
        <StatCard label="Impressions" value={x.received?.impressions?.toLocaleString()} color={C.blue} sub={`${x.posts30d} posts 30j`}/>
        <StatCard label="Likes reçus" value={x.received?.likes?.toLocaleString()} color="#e11d48" sub="de nos posts"/>
        <StatCard label="Reposts reçus" value={x.received?.reposts?.toLocaleString()} color={C.green} sub="de nos posts"/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Réponses reçues" value={x.received?.replies?.toLocaleString()} color={C.amber}/>
        <StatCard label="Quotes" value={x.received?.quotes?.toLocaleString()} color={C.purple}/>
        <StatCard label="Bookmarks" value={x.received?.bookmarks?.toLocaleString()} color={C.teal}/>
      </div>

      {/* ENGAGEMENT RATE */}
      <div style={{ padding:"8px 14px", background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}`,
        borderRadius:8, marginBottom:14, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace",
            color:x.engagementRate>=2?C.green:x.engagementRate>=1?C.amber:C.red }}>
            {x.engagementRate}%
          </div>
          <div style={{ fontSize:7.5, color:C.muted }}>Engagement Rate</div>
        </div>
        <div style={{ flex:1, fontSize:8, color:C.muted, lineHeight:1.6 }}>
          <div style={{ color:C.text, marginBottom:3 }}>
            = (likes + reposts + réponses + quotes) / impressions × 100
          </div>
          <div>Objectif: <span style={{color:C.green}}>≥2%</span> = excellent &nbsp;|&nbsp;
            <span style={{color:C.amber}}>1-2%</span> = bon &nbsp;|&nbsp;
            <span style={{color:C.red}}>&lt;1%</span> = à améliorer</div>
        </div>
      </div>

      {/* ACTIVITY — what WE did (Like, Follow, DM, Repost) */}
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        🤝 NOTRE ACTIVITÉ — Ce que nous avons fait (Like · Follow · Reply)
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Likes donnés" value={x.activity?.likesGiven?.toLocaleString()}
          color="#e11d48" sub="engage.js cumul"/>
        <StatCard label="Follows faits" value={x.activity?.followsGiven?.toLocaleString()}
          color={C.green} sub="engage.js cumul"/>
        <StatCard label="Reposts faits" value={x.activity?.repostsGiven?.toLocaleString()}
          color={C.blue} sub="engage.js cumul"/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Replies écrits" value={x.activity?.repliesGiven?.toLocaleString()}
          color={C.amber} sub="engage.js cumul"/>
        <StatCard label="Unfollows" value={x.activity?.unfollowsDone?.toLocaleString()}
          color={C.muted} sub="nettoyage auto"/>
        <StatCard label="Polls créés" value={x.activity?.pollsCreated?.toLocaleString()}
          color={C.purple} sub="sondages"/>
      </div>
      {x.activity?.lastEngagement && (
        <div style={{ fontSize:7.5, color:C.muted, marginBottom:14 }}>
          Dernier engagement: {new Date(x.activity.lastEngagement).toLocaleString("fr-MA")}
        </div>
      )}

      {/* TOP POSTS */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace" }}>
          TOP POSTS — {x.recentPosts?.length} analysés
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[["impressions","👁️ Impr."],["likes","❤️ Likes"],["reposts","🔄 RT"],["date","📅 Date"]].map(([k,l]) => (
            <button key={k} onClick={()=>setSortBy(k)}
              style={{ fontSize:7, padding:"2px 6px", borderRadius:4, cursor:"pointer",
                background:sortBy===k?`${C.blue}18`:"transparent",
                border:`1px solid ${sortBy===k?C.blue:C.border}`,
                color:sortBy===k?C.blue:C.muted }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {sortedPosts.map((post, i) => (
        <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
          background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, flexWrap:"wrap", gap:3 }}>
            <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>
              {new Date(post.createdAt).toLocaleDateString("fr-MA",{day:"2-digit",month:"2-digit",year:"2-digit"})}
            </span>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              <Chip label={`${post.impressions?.toLocaleString()} 👁️`} color={C.blue} small/>
              <Chip label={`${post.likes} ❤️`} color="#e11d48" small/>
              <Chip label={`${post.reposts} 🔄`} color={C.green} small/>
              {post.replies > 0 && <Chip label={`${post.replies} 💬`} color={C.amber} small/>}
              {post.bookmarks > 0 && <Chip label={`${post.bookmarks} 🔖`} color={C.teal} small/>}
              {post.hasMedia && <Chip label="📸" color={C.purple} small/>}
              {post.hasLink && <Chip label="🔗" color={C.muted} small/>}
            </div>
          </div>
          <div style={{ fontSize:8, color:C.text, lineHeight:1.4, marginBottom:3 }}>
            {post.text}
          </div>
          {post.url && (
            <a href={post.url} target="_blank" rel="noopener"
              style={{ fontSize:7, color:C.blue, textDecoration:"none" }}>
              🔗 Voir sur X
            </a>
          )}
        </div>
      ))}
    </div>
  );
}


function SEOPanel({ data }) {
  const s = data?.seo;
  const fullSeo = data?._seoFull; // we'll try to load full SEO data

  if (!s) return <EmptyState icon="🔍" title="Données SEO non disponibles"
    sub="Actualisez pour charger (nécessite GOOGLE_SC_CLIENT_EMAIL + GA4_PROPERTY_ID)"/>;

  return (
    <div>
      <div style={{ padding:"8px 12px", background:"rgba(139,92,246,0.06)",
        border:"1px solid rgba(139,92,246,0.2)", borderRadius:7, marginBottom:12,
        fontSize:8, color:C.muted }}>
        ℹ️ Données SEO synthétiques — Pour l'analyse détaillée (mots-clés, pages, agents),
        allez dans <strong style={{color:C.purple}}>VP Marketing → SEO Director</strong>
      </div>

      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        SEARCH CONSOLE — {s.period}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Clics" value={s.clicks?.toLocaleString()} color={C.purple}/>
        <StatCard label="Impressions" value={s.impressions?.toLocaleString()} color={C.purple}/>
        <StatCard label="CTR" value={s.clicks && s.impressions ? Math.round(s.clicks/s.impressions*1000)/10+"%" : "—"} color={C.green}/>
      </div>

      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        GA4 TRAFIC
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Sessions" value={s.sessions?.toLocaleString()} color={C.teal}/>
        <StatCard label="Utilisateurs" value={s.users?.toLocaleString()} color={C.teal}/>
        <StatCard label="Pages indexées" value={s.indexed}
          color={s.coverageRate>=80?C.green:C.amber}
          sub={`${s.coverageRate}% de ${s.submitted} soumises`}/>
      </div>

      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        TOP KEYWORD
      </div>
      <div style={{ padding:"10px 12px", background:"rgba(0,0,0,0.2)",
        border:`1px solid ${C.border}`, borderRadius:7 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.purple, marginBottom:3 }}>
          {s.topKeyword || "—"}
        </div>
        <div style={{ fontSize:8, color:C.muted }}>Position moyenne: {s.topKeywordPos}</div>
      </div>
    </div>
  );
}

function YouTubePanel({ data }) {
  const yt = data?.youtube;
  if (!yt) return <EmptyState icon="📹" title="Données YouTube non disponibles"/>;

  return (
    <div>
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        YOUTUBE — travito.snet@gmail.com
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Vidéos produites" value={yt.totalVideos} color={C.red}/>
        <StatCard label="Publiées YT" value={yt.published} color={yt.published>0?C.green:C.muted}
          sub={yt.published===0?"OAuth requis":""}/>
        <StatCard label="En attente" value={yt.pending} color={yt.pending>0?C.amber:C.muted}/>
      </div>

      {yt.published === 0 && (
        <div style={{ padding:"10px 14px", background:"rgba(239,68,68,0.06)",
          border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, marginBottom:12,
          fontSize:8.5, color:C.text, lineHeight:1.6 }}>
          ⚠️ <strong>YouTube OAuth non configuré</strong> — les vidéos sont produites mais pas encore publiées.<br/>
          Ajoutez dans Vercel: <span style={{ fontFamily:"monospace", color:C.red }}>YOUTUBE_CLIENT_ID · YOUTUBE_CLIENT_SECRET · YOUTUBE_REFRESH_TOKEN</span><br/>
          Compte: travito.snet@gmail.com
        </div>
      )}

      {yt.recentUploads?.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>
            VIDÉOS RÉCENTES
          </div>
          {yt.recentUploads.map((v, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:4, borderRadius:6,
              background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:8.5, color:C.text, flex:1, marginRight:8 }}>
                  {v.title}
                </span>
                <Chip label={v.status} color={v.status==="published"?C.green:v.status==="rendered"?C.amber:C.muted}/>
              </div>
              <div style={{ display:"flex", gap:6, marginTop:4 }}>
                <span style={{ fontSize:7, color:C.muted }}>
                  {v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-MA") : "—"}
                </span>
                {v.url && (
                  <a href={v.url} target="_blank" rel="noopener"
                    style={{ fontSize:7, color:C.red, textDecoration:"none" }}>
                    ▶ Voir
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentPanel({ data }) {
  const c = data?.content;
  if (!c) return <EmptyState icon="📝" title="Données contenu non disponibles"/>;

  return (
    <div>
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        VOLUME DE CONTENU
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
        <StatCard label="Articles" value={c.totalArticles} color={C.amber}/>
        <StatCard label="Tweets" value={c.totalTweets} color={C.blue}/>
        <StatCard label="Blogs" value={c.totalBlogs} color={C.orange}/>
        <StatCard label="Qualité moy." value={c.avgQuality ? c.avgQuality+"%" : "—"}
          color={c.avgQuality>=80?C.green:c.avgQuality>=60?C.amber:C.red}/>
      </div>

      {/* Last run */}
      {c.lastRun && (
        <div style={{ padding:"8px 12px", background:"rgba(0,0,0,0.2)",
          border:`1px solid ${C.border}`, borderRadius:7, marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontWeight:700, marginBottom:5 }}>
            DERNIER RUN CRON
          </div>
          <div style={{ fontSize:9, color:C.text, marginBottom:2 }}>{c.lastRun.topic}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <Chip label={`Qualité: ${c.lastRun.quality}%`}
              color={c.lastRun.quality>=80?C.green:C.amber}/>
            <Chip label={c.lastRun.success ? "✅ Succès" : "❌ Erreur"}
              color={c.lastRun.success ? C.green : C.red}/>
            <Chip label={new Date(c.lastRun.ranAt).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
              color={C.muted} small/>
          </div>
        </div>
      )}

      {/* Quality by theme */}
      {c.themeStats?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>
            QUALITÉ PAR THÈME
          </div>
          {c.themeStats.map((t, i) => {
            const maxCount = c.themeStats[0]?.count || 1;
            return (
              <div key={i} style={{ padding:"6px 10px", marginBottom:3, borderRadius:5,
                background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:9, color:C.text, fontWeight:600 }}>{t.theme}</span>
                  <div style={{ display:"flex", gap:5 }}>
                    <Chip label={`${t.count} articles`} color={C.muted} small/>
                    {t.avgQuality && <Chip label={`${t.avgQuality}%`}
                      color={t.avgQuality>=80?C.green:t.avgQuality>=60?C.amber:C.red} small/>}
                  </div>
                </div>
                <Bar value={t.count} max={maxCount} color={C.amber}/>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent articles */}
      {c.recentArticles?.length > 0 && (
        <div>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>
            ARTICLES RÉCENTS
          </div>
          {c.recentArticles.map((a, i) => (
            <div key={i} style={{ padding:"7px 10px", marginBottom:3, borderRadius:5,
              background:"rgba(0,0,0,0.15)", border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                <span style={{ fontSize:8.5, color:C.text, flex:1, marginRight:8 }}>{a.topic}</span>
                {a.quality && <Chip label={a.quality+"%"}
                  color={a.quality>=80?C.green:a.quality>=60?C.amber:C.red} small/>}
              </div>
              <div style={{ display:"flex", gap:5 }}>
                <Chip label={a.theme} color={C.amber} small/>
                {a.blogUrl && <a href={a.blogUrl} target="_blank" rel="noopener"
                  style={{ fontSize:7, color:C.orange, textDecoration:"none" }}>📖 Blog</a>}
                {a.tweetUrl && <a href={a.tweetUrl} target="_blank" rel="noopener"
                  style={{ fontSize:7, color:C.blue, textDecoration:"none" }}>🐦 X</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightsPanel({ data, onRefresh }) {
  const ins = data?.insights || [];
  if (!data) return <EmptyState icon="🤖" title="Insights non disponibles" onAction={onRefresh} actionLabel="🔄 Générer"/>;

  const typeColor = t => t==="win"?C.green:t==="warning"?C.amber:C.teal;
  const typeIcon  = t => t==="win"?"✅":t==="warning"?"⚠️":"💡";
  const chanColor = ch =>
    ch==="X"?C.blue:ch==="SEO"?C.purple:ch==="Content"?C.amber:ch==="YouTube"?C.red:C.teal;

  if (ins.length === 0) return (
    <EmptyState icon="🤖" title="Aucun insight généré"
      sub="Les insights sont générés lors du refresh hebdomadaire"
      onAction={onRefresh} actionLabel="🔄 Générer maintenant"/>
  );

  return (
    <div>
      <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
        ANALYSE IA CROSS-CANAL — {data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString("fr-MA") : ""}
      </div>

      {ins.map((ins2, i) => (
        <div key={i} style={{ padding:"12px 14px", marginBottom:8, borderRadius:8,
          background:"rgba(0,0,0,0.2)", border:`1px solid ${typeColor(ins2.type)}44` }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <span style={{ fontSize:14 }}>{typeIcon(ins2.type)}</span>
            <span style={{ fontSize:10, fontWeight:700, color:typeColor(ins2.type), flex:1 }}>
              {ins2.title}
            </span>
            <Chip label={ins2.channel} color={chanColor(ins2.channel)} small/>
            {ins2.priority && <Chip label={ins2.priority} color={ins2.priority==="high"?C.red:C.amber} small/>}
          </div>
          {ins2.metric && (
            <div style={{ fontSize:8, color:C.muted, marginBottom:5 }}>
              📊 {ins2.metric}
            </div>
          )}
          <div style={{ padding:"6px 10px", background:"rgba(0,0,0,0.2)", borderRadius:5,
            fontSize:8.5, color:C.text, borderLeft:`3px solid ${typeColor(ins2.type)}` }}>
            🎯 {ins2.action}
          </div>
        </div>
      ))}

      <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(0,0,0,0.15)",
        border:`1px solid ${C.border}`, borderRadius:7, fontSize:7.5, color:C.muted, lineHeight:1.6 }}>
        🤖 Insights générés par Claude Sonnet à partir des données réelles X+SEO+Content.<br/>
        Rafraîchi automatiquement chaque lundi à 08:00 Maroc.
      </div>
    </div>
  );
}


// ── HISTORY PANEL ─────────────────────────────────────────────
function HistoryPanel() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric]   = useState("followers");

  const METRICS = [
    { key:"followers",    label:"Followers",         color:C.blue    },
    { key:"impressions",  label:"Impressions reçues",color:"#1DA1F2" },
    { key:"likes",        label:"Likes reçus",       color:"#e11d48" },
    { key:"reposts",      label:"Reposts reçus",     color:C.green   },
    { key:"engRate",      label:"Eng. Rate %",       color:C.teal    },
    { key:"likesGiven",   label:"Likes donnés",      color:"#f43f5e" },
    { key:"followsGiven", label:"Follows faits",     color:C.green   },
    { key:"repliesGiven", label:"Replies écrits",    color:C.amber   },
    { key:"scClicks",     label:"Clics SC",          color:C.purple  },
    { key:"ga4Sessions",  label:"Sessions GA4",      color:C.teal    },
    { key:"avgQuality",   label:"Qualité contenu %", color:C.amber   },
    { key:"indexed",      label:"Pages indexées",    color:"#8b5cf6" },
    { key:"posts30d",     label:"Posts/30j",         color:C.blue    },
  ];

  useEffect(() => {
    setLoading(true);
    fetch("/api/analytics?action=history")
      .then(r => r.json())
      .then(d => { if (d.success) setHistory(d.history || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeMetric = METRICS.find(m => m.key === metric);
  const values = history.map(h => ({ week: h.week, value: h[metric] || 0 }));
  const maxVal  = Math.max(...values.map(v => v.value), 1);
  const minVal  = Math.min(...values.map(v => v.value));

  // Week over week delta (latest vs previous)
  const latest = values[values.length-1];
  const prev   = values[values.length-2];
  const delta  = latest && prev ? latest.value - prev.value : null;
  const deltaP = prev?.value > 0 ? Math.round((delta / prev.value) * 100 * 10) / 10 : null;

  return (
    <div>
      {/* Metric selector */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
        {METRICS.map(m => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            style={{ fontSize:7.5, padding:"3px 9px", borderRadius:5, cursor:"pointer",
              background:metric===m.key?`${m.color}18`:"transparent",
              border:`1px solid ${metric===m.key?m.color:C.border}`,
              color:metric===m.key?m.color:C.muted, fontWeight:metric===m.key?700:400 }}>
            {m.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign:"center", paddingTop:20, color:C.muted, fontSize:9 }}>⏳ Chargement historique...</div>}

      {!loading && history.length === 0 && (
        <div style={{ textAlign:"center", paddingTop:30, color:C.muted }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📈</div>
          <div style={{ fontSize:10, color:C.text, marginBottom:4 }}>Aucun historique encore</div>
          <div style={{ fontSize:8, lineHeight:1.6 }}>
            L'historique se construit automatiquement chaque lundi.<br/>
            Après le premier run automatique, les tendances s'afficheront ici.
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          {/* Current value + delta */}
          <div style={{ display:"flex", gap:12, marginBottom:14, alignItems:"flex-end" }}>
            <div style={{ padding:"10px 16px", background:"rgba(0,0,0,0.25)",
              border:`1px solid ${activeMetric?.color}33`, borderRadius:8 }}>
              <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>{activeMetric?.label} — dernier</div>
              <div style={{ fontSize:22, fontWeight:700, color:activeMetric?.color,
                fontFamily:"monospace" }}>
                {latest?.value?.toLocaleString() ?? "—"}
                {metric === "engRate" || metric === "avgQuality" ? "%" : ""}
              </div>
            </div>
            {delta !== null && (
              <div style={{ padding:"10px 16px", background:"rgba(0,0,0,0.2)",
                border:`1px solid ${delta>=0?C.green:C.red}33`, borderRadius:8 }}>
                <div style={{ fontSize:7.5, color:C.muted, marginBottom:3 }}>vs semaine précédente</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace",
                  color:delta>=0?C.green:C.red }}>
                  {delta>=0?"+":""}{delta?.toLocaleString()}
                  {metric === "engRate" || metric === "avgQuality" ? "%" : ""}
                </div>
                {deltaP !== null && (
                  <div style={{ fontSize:8, color:C.muted }}>
                    {deltaP>=0?"+":""}{deltaP}%
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize:7.5, color:C.muted, paddingBottom:14 }}>
              {history.length} semaine{history.length>1?"s":""} d'historique
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>
              TENDANCE — {activeMetric?.label}
            </div>
            <div style={{ background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}`,
              borderRadius:8, padding:"12px 10px", display:"flex",
              alignItems:"flex-end", gap:3, height:100, position:"relative" }}>
              {/* Y axis max label */}
              <div style={{ position:"absolute", top:6, left:10, fontSize:7, color:C.muted,
                fontFamily:"monospace" }}>{maxVal.toLocaleString()}</div>
              {values.map((v, i) => {
                const h = maxVal > 0 ? Math.max(4, Math.round(((v.value - minVal) / (maxVal - minVal || 1)) * 72) + 4) : 4;
                const isLatest = i === values.length - 1;
                return (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column",
                    alignItems:"center", gap:2 }}>
                    <div title={`${v.week}: ${v.value?.toLocaleString()}`}
                      style={{ width:"100%", height:h, borderRadius:"2px 2px 0 0",
                        background:isLatest ? activeMetric?.color : activeMetric?.color+"66",
                        border:isLatest?`1px solid ${activeMetric?.color}`:"none",
                        cursor:"help" }}/>
                    {(i === 0 || i === values.length-1 || i % 4 === 0) && (
                      <div style={{ fontSize:6, color:C.muted, textAlign:"center",
                        whiteSpace:"nowrap", overflow:"hidden",
                        width:"100%", transform:"rotate(-45deg)", transformOrigin:"top left",
                        marginLeft:4, marginTop:2 }}>
                        {v.week?.replace(/^\d{4}-/, "")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly table */}
          <div>
            <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:6 }}>
              HISTORIQUE DÉTAILLÉ
            </div>
            <div style={{ background:"rgba(0,0,0,0.2)", border:`1px solid ${C.border}`,
              borderRadius:8, overflow:"hidden" }}>
              {/* Header */}
              <div style={{ display:"grid", gridTemplateColumns:"70px 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
                padding:"5px 10px", borderBottom:`1px solid ${C.border}`,
                background:"rgba(0,0,0,0.3)" }}>
                {["Semaine","Followers Δ","Impr. reçues","❤️ Likes","Eng.%","Likes donnés","Follows faits","SC Clics"].map((h,i) => (
                  <div key={i} style={{ fontSize:6.5, color:C.gold, fontWeight:700 }}>{h}</div>
                ))}
              </div>
              {[...history].reverse().slice(0,12).map((snap, i) => {
                const prevSnap = [...history].reverse()[i+1];
                const fDelta = prevSnap ? snap.followers - prevSnap.followers : null;
                return (
                  <div key={i} style={{ display:"grid",
                    gridTemplateColumns:"70px 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
                    padding:"5px 10px", borderBottom:`1px solid ${C.border}22`,
                    background:i===0?"rgba(99,102,241,0.06)":"transparent" }}>
                    <div style={{ fontSize:7.5, fontFamily:"monospace", color:i===0?"#6366f1":C.muted }}>
                      {snap.week}
                    </div>
                    <div style={{ fontSize:7, color:C.blue, fontFamily:"monospace" }}>
                      {snap.followers?.toLocaleString()}
                      {fDelta !== null && fDelta !== 0 && (
                        <span style={{ fontSize:6.5, color:fDelta>=0?C.green:C.red, marginLeft:3 }}>
                          {fDelta>=0?"+":""}{fDelta}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:7, color:C.blue, fontFamily:"monospace" }}>
                      {snap.impressions?.toLocaleString() || "—"}
                    </div>
                    <div style={{ fontSize:7, color:"#e11d48", fontFamily:"monospace" }}>
                      {snap.likes?.toLocaleString() || "—"}
                    </div>
                    <div style={{ fontSize:7,
                      color:snap.engRate>=2?C.green:snap.engRate>=1?C.amber:C.muted,
                      fontFamily:"monospace" }}>
                      {snap.engRate ?? "—"}%
                    </div>
                    <div style={{ fontSize:7, color:"#f43f5e", fontFamily:"monospace" }}>
                      {snap.likesGiven?.toLocaleString() || "—"}
                    </div>
                    <div style={{ fontSize:7, color:C.green, fontFamily:"monospace" }}>
                      {snap.followsGiven?.toLocaleString() || "—"}
                    </div>
                    <div style={{ fontSize:7, color:C.purple, fontFamily:"monospace" }}>
                      {snap.scClicks?.toLocaleString() || "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function PerformanceAnalyst() {
  const [activeAgent, setActiveAgent] = useState("overview");
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [lastFetch, setLastFetch]     = useState(null);

  const fetchData = async (force = false) => {
    setLoading(true);
    try {
      const r = await fetch("/api/analytics" + (force ? "?force=true" : ""));
      const d = await r.json();
      if (d.success) { setData(d); setLastFetch(new Date()); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const active = AGENTS.find(a => a.id === activeAgent);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── HEADER ────────────────────────────────────────────── */}
      <div style={{ background:"rgba(8,18,8,0.98)", borderBottom:`1px solid ${C.border}`,
        padding:"7px 12px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <div style={{ width:28, height:28, background:"linear-gradient(135deg,#10b981,#065f46)",
          borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:15, flexShrink:0 }}>📊</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.green }}>Performance & Analytics Director</div>
          <div style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>
            X + SEO + YouTube + Content · travito.ma & @TravitoMaroc
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {data && (
            <div style={{ fontSize:7, color:C.muted, textAlign:"right", lineHeight:1.4 }}>
              {data.cached
                ? `Cache ${Math.round(data.ageHours)}h${data.stale?" ⚠️":""}`
                : "Fraîches"}
              {lastFetch && <div>{lastFetch.toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"})}</div>}
            </div>
          )}
          <button onClick={()=>fetchData(true)} disabled={loading}
            style={{ fontSize:7.5, padding:"3px 9px", borderRadius:5,
              background:`${C.green}18`, border:`1px solid ${C.green}33`,
              color:C.green, cursor:loading?"not-allowed":"pointer" }}>
            {loading?"⏳":"🔄"} Actualiser
          </button>
        </div>
      </div>

      {/* ── AGENT CARDS ────────────────────────────────────────── */}
      <div style={{ background:"rgba(4,10,4,0.95)", borderBottom:`1px solid ${C.border}`,
        padding:"7px 10px", display:"flex", gap:6, flexShrink:0, overflowX:"auto" }}>
        {AGENTS.map(agent => {
          const isActive = activeAgent === agent.id;
          // Quick KPI for card
          let kpi = null;
          if (agent.id === "twitter" && data?.x) kpi = data.x.followers?.toLocaleString()+" followers";
          if (agent.id === "seo" && data?.seo) kpi = data.seo.clicks?.toLocaleString()+" clics SC";
          if (agent.id === "youtube" && data?.youtube) kpi = data.youtube.totalVideos+" vidéos";
          if (agent.id === "content" && data?.content) kpi = data.content.totalArticles+" articles";
          if (agent.id === "insights") kpi = (data?.insights?.length||0)+" insights";
          return (
            <button key={agent.id} onClick={()=>setActiveAgent(agent.id)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
                borderRadius:10, flexShrink:0, cursor:"pointer",
                background:isActive?`${agent.color}15`:"rgba(0,0,0,0.2)",
                border:`1px solid ${isActive?agent.color:C.border}` }}>
              <span style={{ fontSize:13 }}>{agent.icon}</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:8.5, color:isActive?agent.color:C.muted,
                  fontFamily:"monospace", fontWeight:isActive?700:400, whiteSpace:"nowrap" }}>
                  {agent.label}
                </div>
                <div style={{ fontSize:6.5, color:C.muted, marginTop:1 }}>
                  {kpi || agent.desc}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:2, alignItems:"flex-end" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:agent.color,
                  opacity:isActive?1:0.3, animation:isActive?"pulse 2s infinite":"none" }}/>
                <Chip label={agent.freq} color={agent.color} small/>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── PANEL ─────────────────────────────────────────────── */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"10px 12px" }}>

          {/* Panel header */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12,
            paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:16 }}>{active?.icon}</span>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:active?.color }}>{active?.label}</div>
              <div style={{ fontSize:8, color:C.muted }}>{active?.desc}</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
              <Chip label={`🔄 ${active?.freq}`} color={active?.color}/>
            </div>
          </div>

          {loading && !data && (
            <div style={{ textAlign:"center", paddingTop:40, color:C.green, fontSize:10 }}>
              ⏳ Chargement des données analytics...
            </div>
          )}

          {activeAgent === "overview"  && <OverviewPanel data={data} onRefresh={()=>fetchData(true)}/>}
          {activeAgent === "twitter"   && <TwitterPanel data={data}/>}
          {activeAgent === "seo"       && <SEOPanel data={data}/>}
          {activeAgent === "youtube"   && <YouTubePanel data={data}/>}
          {activeAgent === "content"   && <ContentPanel data={data}/>}
          {activeAgent === "insights"  && <InsightsPanel data={data} onRefresh={()=>fetchData(true)}/>}
          {activeAgent === "history"   && <HistoryPanel/>}
        </div>
      </div>
    </div>
  );
}
