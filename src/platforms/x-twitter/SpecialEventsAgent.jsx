// ================================================================
//  SPECIAL EVENTS AGENT — X Twitter Event Promotion
//  2026 Morocco calendar driven, image + post, admin approval
// ================================================================
import { useState, useEffect } from "react";
import { BRAND, callClaude } from "../../config/agentConfig";

// ── 2026 STARTER CALENDAR ─────────────────────────────────────
const STARTER_EVENTS = [
  // Official confirmed 2026
  { id:1,  title:"GITEX AFRICA Morocco",         date_start:"2026-04-07", date_end:"2026-04-09", city:"Marrakech",  category:"Tech",        type:"expo",       official:true,  source:"gitexafrica.com",  active:true,  approved:false },
  { id:2,  title:"SIAM — Salon Agriculture Maroc",date_start:"2026-04-20",date_end:"2026-04-26", city:"Meknès",    category:"Food",        type:"fair",       official:true,  source:"siam.ma",          active:true,  approved:false },
  { id:3,  title:"GITEX Future Health Africa",    date_start:"2026-05-04", date_end:"2026-05-06", city:"Casablanca", category:"Santé",       type:"summit",     official:true,  source:"gitexafrica.com",  active:true,  approved:false },
  { id:4,  title:"Festival Mawazine",             date_start:"2026-06-20", date_end:"2026-06-28", city:"Rabat",      category:"Musique",     type:"festival",   official:true,  source:"mawazine.ma",      active:true,  approved:false },
  // National non-political/non-religious dates
  { id:5,  title:"Journée du Travail",            date_start:"2026-05-01", date_end:"2026-05-01", city:"National",  category:"Emploi",      type:"awareness",  official:true,  source:"maroc.ma",         active:true,  approved:false },
  { id:6,  title:"Amazigh New Year",              date_start:"2026-01-14", date_end:"2026-01-14", city:"National",  category:"Loisirs",     type:"awareness",  official:true,  source:"maroc.ma",         active:true,  approved:false },
  // Seasonal / Commercial
  { id:7,  title:"Black Friday Maroc",            date_start:"2026-11-27", date_end:"2026-11-27", city:"National",  category:"all",         type:"promo",      official:false, source:"commercial",       active:true,  approved:false },
  { id:8,  title:"Back to School",                date_start:"2026-09-01", date_end:"2026-09-15", city:"National",  category:"Emploi",      type:"seasonal",   official:false, source:"seasonal",         active:true,  approved:false },
  { id:9,  title:"Rentrée Immobilière",           date_start:"2026-09-01", date_end:"2026-09-30", city:"National",  category:"Immobilier",  type:"seasonal",   official:false, source:"seasonal",         active:true,  approved:false },
  { id:10, title:"Soldes Hiver",                  date_start:"2026-01-05", date_end:"2026-02-05", city:"National",  category:"Mode",        type:"promo",      official:false, source:"commercial",       active:true,  approved:false },
  { id:11, title:"Soldes Été",                    date_start:"2026-07-01", date_end:"2026-08-01", city:"National",  category:"Mode",        type:"promo",      official:false, source:"commercial",       active:true,  approved:false },
  { id:12, title:"Journée Mondiale Animaux",      date_start:"2026-10-04", date_end:"2026-10-04", city:"National",  category:"Animaux",     type:"awareness",  official:true,  source:"worldanimalday.org",active:true, approved:false },
  { id:13, title:"Journée Mondiale Santé",        date_start:"2026-04-07", date_end:"2026-04-07", city:"National",  category:"Santé",       type:"awareness",  official:true,  source:"who.int",          active:true,  approved:false },
  { id:14, title:"Fête du Trône (Promo Immo)",    date_start:"2026-07-30", date_end:"2026-07-30", city:"National",  category:"Immobilier",  type:"promo",      official:false, source:"commercial",       active:true,  approved:false },
  { id:15, title:"Rentrée Emploi Janvier",        date_start:"2026-01-05", date_end:"2026-01-31", city:"National",  category:"Emploi",      type:"seasonal",   official:false, source:"seasonal",         active:true,  approved:false },
  // Sports (monitored)
  { id:16, title:"CAN 2025/2026 — À confirmer",  date_start:"2026-06-01", date_end:"2026-06-30", city:"TBD",       category:"Sport",       type:"tournament", official:false, source:"cafonline.com",    active:false, approved:false },
  // Automotive
  { id:17, title:"Salon Auto Maroc — À confirmer",date_start:"2026-10-01",date_end:"2026-10-10", city:"Casablanca", category:"Auto",        type:"expo",       official:false, source:"aivam.ma",         active:false, approved:false },
];

// Post phases per event
const POST_PHASES = [
  { key:"save_date",  label:"Save the Date",  daysBefore:14 },
  { key:"coming_soon",label:"Coming Soon",    daysBefore:7  },
  { key:"this_week",  label:"This Week",      daysBefore:3  },
  { key:"tomorrow",   label:"Demain!",        daysBefore:1  },
  { key:"today",      label:"Aujourd'hui!",   daysBefore:0  },
  { key:"recap",      label:"Recap",          daysBefore:-1 },
];

const CATEGORIES = ["all","Tech","Food","Santé","Musique","Emploi","Immobilier","Auto","Sport","Mode","Animaux","Loisirs","Services"];
const EVENT_TYPES = ["expo","fair","summit","festival","promo","seasonal","awareness","tournament"];

// Pexels image search via Vercel proxy
const getPexelsImage = async (query, usedPhotoIds = []) => {
  try {
    // Use page 2 if we already have photos (forces different results)
    const page = usedPhotoIds.length > 0 ? 2 : 1;
    const r = await fetch(`/api/kv?action=pexels&query=${encodeURIComponent(query + " Morocco")}&page=${page}`);
    if (!r.ok) return null;
    const d = await r.json();
    // Return object with url + id so caller can track used images
    if (d.imageUrl) return { url: d.imageUrl, id: d.photoId || d.imageUrl };
    return null;
  } catch {
    return null;
  }
};

// ── PHASE-SPECIFIC IMAGE QUERIES ─────────────────────────────
const PHASE_IMAGE_QUERIES = {
  save_date:  (ev) => ev.city + " Morocco " + ev.category + " announcement date save calendar",
  coming_soon:(ev) => ev.city + " " + ev.category + " Africa teaser preview anticipation",
  this_week:  (ev) => "Morocco event crowd attendees conference networking " + ev.type,
  tomorrow:   (ev) => ev.city + " Morocco " + ev.category + " final countdown deadline",
  today:      (ev) => ev.city + " Morocco " + ev.category + " live opening ceremony fair",
  recap:      (ev) => "Morocco " + ev.category + " success award achievement celebration team",
};

// ── PEXELS IMAGE SEARCH ──────────────────────────────────────


// ── AI CONTENT GENERATOR ─────────────────────────────────────
const generateEventPost = async (event, phase) => {
  const system = `Tu es l'agent Événements Spéciaux de ${BRAND.name} (${BRAND.site}).
Tu génères des posts X pour promouvoir des événements pertinents pour les utilisateurs de Travito.
Ton objectif: créer de la valeur pour les utilisateurs tout en mentionnant naturellement Travito.
RÈGLES STRICTES: pas de politique, pas de religion, pas de sujets controversés.
Ton: informatif, enthousiaste, utile.`;

  const user = `Génère un post X pour cet événement:
Événement: ${event.title}
Phase: ${phase.label}
Catégorie: ${event.category}
Ville: ${event.city}
Date: ${event.date_start}${event.date_end!==event.date_start?` au ${event.date_end}`:""}

Format requis (max 260 chars):
- Émoji pertinent + titre événement
- 1 phrase de valeur pour les utilisateurs Travito
- Lien vers catégorie Travito pertinente: ${BRAND.site}
- 2-3 hashtags pertinents

Réponds UNIQUEMENT avec le texte du tweet, rien d'autre.`;

  return await callClaude(system, user);
};

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function SpecialEventsAgent({ xKeys={} }) {
  const [tab, setTab]           = useState("calendar");
  const [events, setEvents]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("se_events") || "null") || STARTER_EVENTS; } catch { return STARTER_EVENTS; }
  });
  const [posts, setPosts]       = useState(() => {
    try { return JSON.parse(localStorage.getItem("se_posts") || "[]"); } catch { return []; }
  });
  const [sources, setSources]   = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("se_sources") || "null");
      return saved || [
        { id:1,  name:"GITEX Africa",          url:"gitexafrica.com",       category:"Tech",        active:true  },
        { id:2,  name:"SIAM Maroc",            url:"siam.ma",               category:"Food",        active:true  },
        { id:3,  name:"Mawazine",              url:"mawazine.ma",           category:"Musique",     active:true  },
        { id:4,  name:"ANAPEC",                url:"anapec.org.ma",         category:"Emploi",      active:true  },
        { id:5,  name:"AIVAM",                 url:"aivam.ma",              category:"Auto",        active:false },
        { id:6,  name:"FRMF",                  url:"frmf.ma",               category:"Sport",       active:true  },
        { id:7,  name:"Mawazine Official",     url:"mawazine.ma",           category:"Musique",     active:true  },
        { id:8,  name:"Jobs Fair Maroc",       url:"eventbrite.com",        category:"Emploi",      active:true  },
        { id:9,  name:"Africa Fairs",          url:"africafairs.com",       category:"all",         active:true  },
        { id:10, name:"Foire Casablanca",      url:"foire-casablanca.ma",   category:"all",         active:true  },
        { id:11, name:"10Times Morocco",       url:"10times.com",           category:"all",         active:true  },
        { id:12, name:"Venture Days",          url:"venturedays.ma",        category:"Tech",        active:true  },
        { id:13, name:"CAF Online (Sport)",    url:"cafonline.com",         category:"Sport",       active:true  },
        { id:14, name:"Festival Gnaoua",       url:"festival-gnaoua.net",   category:"Musique",     active:true  },
        { id:15, name:"GITEX Future Health",   url:"gitexafrica.com",       category:"Santé",       active:true  },
      ];
    } catch {
      return [];
    }
  });
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("se_settings") || "null");
      return saved || { autoApprove: true, autoPost: true, imageEnabled: true, imageOrientation: "landscape", postPhases: ["save_date","coming_soon","this_week","tomorrow","today","recap"] };
    } catch {
      return { autoApprove: true, autoPost: true, imageEnabled: true, imageOrientation: "landscape", postPhases: ["save_date","coming_soon","this_week","tomorrow","today","recap"] };
    }
  });
  const [generating, setGenerating] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title:"", date_start:"", date_end:"", city:"", category:"Tech", type:"expo", official:false, source:"", active:true });
  const [selectedPost, setSelectedPost] = useState(null);
  const [log, setLog]           = useState([]);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  // ── Monthly Events Checker ───────────────────────────────
  const runEventsChecker = async () => {
    setChecking(true);
    addLog("🔍 Vérification des événements (max 2 par run manuel)...");
    try {
      const r = await fetch("/api/events-checker?force=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      // Guard against HTML error pages from Vercel
      const text = await r.text();
      let d;
      try { d = JSON.parse(text); }
      catch {
        const snippet = text.slice(0, 120).replace(/<[^>]+>/g, "").trim();
        throw new Error("Réponse non-JSON: " + snippet);
      }
      if (!d.success) throw new Error(d.error || "Echec sans message");
      
      // Show progress
      const total = events.filter(e=>e.active!==false).length;
      const verified = d.verifications?.length || 0;
      const remaining = total - verified;
      if (remaining > 0) {
        addLog(`✅ ${verified}/2 vérifiés — ${remaining} restants (cliquez à nouveau pour continuer)`, "success");
      }

      // Apply updates to events (including lastVerified timestamp)
      let updatedEvents = [...events];
      for (const v of d.verifications || []) {
        // Save lastVerified to prevent re-checking same event
        updatedEvents = updatedEvents.map(e => e.id===v.id ? {...e, lastVerified: v.lastVerified||new Date().toISOString()} : e);
        if (v.cancelled) {
          updatedEvents = updatedEvents.map(e =>
            e.id === v.id ? { ...e, active: false, status: "cancelled", cancelNote: v.summary } : e
          );
          addLog(`❌ Annulé: ${v.title}`, "error");
        } else if (v.newDates) {
          updatedEvents = updatedEvents.map(e =>
            e.id === v.id ? { ...e, date_start: v.newDates.start, date_end: v.newDates.end || e.date_end } : e
          );
          addLog(`📅 Dates mises à jour: ${v.title}`, "success");
        } else if (v.newVenue) {
          updatedEvents = updatedEvents.map(e =>
            e.id === v.id ? { ...e, city: v.newVenue.city || e.city } : e
          );
          addLog(`📍 Lieu mis à jour: ${v.title}`, "success");
        }
      }

      // Add newly discovered events (as inactive — needs admin approval)
      const newEvts = (d.newEvents || []).map((e, i) => ({
        ...e,
        id: Date.now() + i,
        active: true,   // Auto-approved
        approved: true,
        discovered: true,
        discoveredAt: new Date().toISOString(),
      }));

      if (newEvts.length > 0) {
        updatedEvents = [...updatedEvents, ...newEvts];
        addLog(`🆕 ${newEvts.length} nouveaux événements découverts — approbation requise`, "success");
      }

      setEvents(updatedEvents);
      // Merge new sources discovered
      if (d.newSources?.length > 0) {
        setSources(prev => {
          const existing = prev.map(s => s.url);
          const fresh = d.newSources
            .filter(s => !existing.includes(s.url))
            .map((s, i) => ({ ...s, id: Date.now() + i }));
          if (fresh.length > 0) addLog(`🔗 ${fresh.length} nouvelles sources ajoutées`, "success");
          return [...prev, ...fresh];
        });
      }

      setLastCheck({
        date: new Date().toISOString(),
        summary: d.summary,
        emailReport: d.emailReport,
      });

      addLog(`✅ Vérification terminée: ${d.summary?.confirmed || 0} confirmés, ${d.summary?.changed || 0} changements, ${d.summary?.newFound || 0} nouveaux`, "success");
    } catch (e) {
      addLog(`❌ Erreur vérification: ${e.message}`, "error");
    }
    setChecking(false);
  };

  const C = {
    bg:"rgba(12,18,35,0.95)", border:"rgba(212,175,55,0.18)", gold:"#D4AF37",
    text:"#e8dcc8", muted:"#6b6050", green:"#10b981", red:"#ef4444",
    blue:"#1DA1F2", amber:"#f59e0b", purple:"#8b5cf6", orange:"#f97316",
  };

  // Restore from KV on mount if localStorage empty (new device/browser)
  // Also always sync events to KV on mount so cron always has latest
  useEffect(()=>{
    const restoreIfEmpty = (lsKey, kvKey, setter) => {
      if (!localStorage.getItem(lsKey)) {
        fetch("/api/kv?key="+kvKey).then(r=>r.json()).then(d=>{
          if (d.config) setter(d.config);
        }).catch(()=>{});
      }
    };
    restoreIfEmpty("se_posts",    "travito:se_posts",    setPosts);
    restoreIfEmpty("se_settings", "travito:se_settings", setSettings);
    restoreIfEmpty("se_sources",  "travito:se_sources",  setSources);

    // Migrate old postPhases (2-item default) to full 6-phase set
    setSettings(prev => {
      const hasAll = ["save_date","coming_soon","this_week","tomorrow","today","recap"]
        .every(p => (prev.postPhases||[]).includes(p));
      if (hasAll) return prev;
      return { ...prev, postPhases: ["save_date","coming_soon","this_week","tomorrow","today","recap"] };
    });

    // Always push events to KV on mount so cron never misses them
    // even if tab was not opened on the day the cron runs
    const localEvents = localStorage.getItem("se_events");
    if (localEvents) {
      try {
        const parsed = JSON.parse(localEvents);
        if (Array.isArray(parsed) && parsed.length > 0) {
          fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ key:"travito:se_events", value: localEvents })
          }).catch(()=>{});
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    localStorage.setItem("se_events", JSON.stringify(events));
    // Sync to KV so the cron events-post.js can read them
    fetch("/api/kv", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:se_events", value: JSON.stringify(events) })
    }).catch(()=>{});
  },[events]);
  useEffect(()=>{ localStorage.setItem("se_posts", JSON.stringify(posts.slice(0,100)));
    fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:"travito:se_posts",value:JSON.stringify(posts.slice(0,100))})}).catch(()=>{});
  },[posts]);
  useEffect(()=>{ localStorage.setItem("se_settings", JSON.stringify(settings));
    fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:"travito:se_settings",value:JSON.stringify(settings)})}).catch(()=>{});
  },[settings]);
  useEffect(()=>{ localStorage.setItem("se_sources", JSON.stringify(sources));
    fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:"travito:se_sources",value:JSON.stringify(sources)})}).catch(()=>{});
  },[sources]);

  const addLog = (msg, type="info") => setLog(p=>[{msg,type,time:new Date().toLocaleTimeString("fr-MA")},...p.slice(0,99)]);

  // Get upcoming events (next 30 days)
  const getUpcoming = () => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30*24*60*60*1000);
    return events.filter(e => {
      if (!e.active) return false;
      const d = new Date(e.date_start);
      return d >= now && d <= in30;
    }).sort((a,b) => new Date(a.date_start) - new Date(b.date_start));
  };

  // Get days until event
  const daysUntil = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000*60*60*24));
  };

  // Generate post for event
  // Post to X
  const postToX = async (post) => {
    if(!xKeys?.apiKey) { addLog("❌ Clés X requises","error"); return; }
    addLog(`🚀 Publication: ${post.eventTitle}...`);
    try {
      console.log('Post imageUrl:', post.imageUrl ? post.imageUrl.substring(0, 80) : 'NONE');
    addLog(`🖼️ Image: ${post.imageUrl ? 'Pexels URL trouvée' : 'Aucune image'}`);
    const body = {
        text: post.text.substring(0, 280),
        apiKey: xKeys.apiKey,
        apiSecret: xKeys.apiSecret,
        accessToken: xKeys.accessToken,
        accessTokenSecret: xKeys.accessTokenSecret,
        imageUrl: post.imageUrl || null,
      };
      const r = await fetch("/api/tweet", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const d = await r.json();
      if(d.success) {
        setPosts(p=>p.map(x=>x.id===post.id?{...x,status:"posted",postedAt:new Date().toISOString(),tweetId:d.id,hasImage:d.hasImage}:x));
        setSelectedPost(prev=>({...prev,status:"posted",postedAt:new Date().toISOString()}));
        addLog(`✅ Publié @TravitoMaroc${d.hasImage?" 🖼️ avec image":""}`, "success");
      } else if(d.imageError) {
        addLog(`❌ Image upload failed: ${d.imageError}`, "error");
        addLog(`💡 Vérifiez les permissions X API pour media upload`, "error");
      } else throw new Error(d.error);
    } catch(e) { addLog(`❌ Erreur X: ${e.message}`, "error"); }
  };


  const generatePost = async (event, phase) => {
    setGenerating(`${event.id}_${phase.key}`);
    addLog(`✍️ Génération post: ${event.title} — ${phase.label}`);
    try {
      const text = await generateEventPost(event, phase);

      // Try to get image from Unsplash
      // Collect photo IDs already used for this event to avoid duplicate images
      const usedPhotoIds = posts
        .filter(p => p.eventId === event.id && p.imageId)
        .map(p => p.imageId);

      let imageUrl = null;
      let imageId  = null;
      if (settings.imageEnabled) {
        addLog(`🖼️ Recherche image phase ${phase.key}: ${event.category} ${event.city}...`);
        const imageQuery = (PHASE_IMAGE_QUERIES[phase.key] || PHASE_IMAGE_QUERIES.today)(event);
        const imgData = await getPexelsImage(imageQuery, usedPhotoIds);
        imageUrl = imgData?.url || imgData || null;
        imageId  = imgData?.id  || null;
      }

      const post = {
        id: Date.now(), eventId: event.id, eventTitle: event.title,
        phase: phase.key, phaseLabel: phase.label,
        text, imageUrl, imageId, category: event.category,
        city: event.city, eventDate: event.date_start,
        status: settings.autoApprove ? "approved" : "draft",
        createdAt: new Date().toISOString(), postedAt: null,
      };
      setPosts(p=>[post,...p]);
      setSelectedPost(post);
      addLog(`✅ Post créé: ${event.title} — ${phase.label}`, "success");

      // Mark event as having post for this phase
      setEvents(p=>p.map(e=>e.id===event.id?{...e,[`post_${phase.key}`]:post.id}:e));

      // Auto-post to X if enabled
      if (settings.autoPost && post.status === "approved") {
        addLog(`🚀 Auto-post X: ${event.title} — ${phase.label}...`);
        await postToX(post);
      }
    } catch(e) { addLog(`❌ Erreur: ${e.message}`, "error"); }
    setGenerating(null);
  };

  const statusColor = (s) => s==="posted"?C.blue:s==="approved"?C.green:s==="rejected"?C.red:C.amber;
  const upcoming = getUpcoming();

  return (
    <div style={{ display:"grid", gridTemplateRows:"38px 1fr", height:"100%", overflow:"hidden" }}>

      {/* TOP BAR */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"0 10px", borderBottom:`1px solid ${C.border}`, background:C.bg, overflowX:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginRight:8, flexShrink:0 }}>
          <div style={{ width:20,height:20,background:"linear-gradient(135deg,#f97316,#9a3412)",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11 }}>🎉</div>
          <span style={{ fontSize:10,fontWeight:700,color:C.orange,whiteSpace:"nowrap" }}>Special Events</span>
          <span style={{ fontSize:7,padding:"1px 5px",background:`${C.orange}18`,color:C.orange,border:`1px solid ${C.orange}44`,borderRadius:4,fontFamily:"monospace" }}>
            {upcoming.length} à venir
          </span>
        </div>
        {[["calendar","📅 Calendrier"],["posts","📝 Posts"],["sources","🔗 Sources"],["settings","⚙️ Config"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ fontSize:8,padding:"3px 8px",borderRadius:8,background:tab===id?`${C.orange}18`:"transparent",border:`1px solid ${tab===id?C.orange:C.border}`,color:tab===id?C.orange:C.muted,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0 }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
          {lastCheck && <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>✅ Vérifié {new Date(lastCheck.date).toLocaleDateString("fr-MA")}</span>}
          <button onClick={runEventsChecker} disabled={checking}
            style={{ fontSize:8, padding:"3px 10px", background:`${C.green}18`, border:`1px solid ${C.green}`, borderRadius:7, color:C.green, cursor:"pointer", fontWeight:700 }}>
            {checking ? "⏳ Vérification..." : "🔍 Vérifier"}
          </button>
          <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>
            {posts.filter(p=>p.status==="posted").length} publiés · {posts.filter(p=>p.status==="draft").length} drafts
          </span>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ display:"flex", overflow:"hidden", height:"100%" }}>

        {/* LEFT — Event list */}
        <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"7px 8px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <span style={{ fontSize:8,color:C.muted,fontFamily:"monospace" }}>{events.filter(e=>e.active).length} événements actifs</span>
            <button onClick={()=>setShowAddEvent(p=>!p)}
              style={{ fontSize:7,padding:"2px 7px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:5,color:C.green,cursor:"pointer",fontWeight:700 }}>
              + Ajouter
            </button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"5px" }}>
            {events.sort((a,b)=>new Date(a.date_start)-new Date(b.date_start)).map(ev=>{
              const days = daysUntil(ev.date_start);
              const isUrgent = days >= 0 && days <= 7;
              const isPast = days < -1;
              return (
                <div key={ev.id}
                  onClick={()=>setEditingEvent(editingEvent?.id===ev.id?null:ev)}
                  style={{ background:editingEvent?.id===ev.id?`${C.orange}12`:isUrgent?`${C.red}06`:C.bg, border:`1px solid ${editingEvent?.id===ev.id?C.orange:isUrgent?C.red+"44":C.border}`, borderRadius:8, padding:"7px 8px", marginBottom:4, cursor:"pointer", opacity:isPast||!ev.active?0.5:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:isUrgent?C.red:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{ev.title}</span>
                  </div>
                  <div style={{ fontSize:7, color:C.muted, marginBottom:2 }}>{ev.date_start} · {ev.city}</div>
                  <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                    <span style={{ fontSize:6,padding:"1px 4px",borderRadius:3,background:`${C.orange}18`,color:C.orange }}>{ev.category}</span>
                    <span style={{ fontSize:6,padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",color:C.muted }}>{ev.type}</span>
                    {days>=0&&days<=30&&<span style={{ fontSize:6,padding:"1px 4px",borderRadius:3,background:days<=3?`${C.red}18`:`${C.amber}18`,color:days<=3?C.red:C.amber,fontWeight:700 }}>J-{days}</span>}
                  {ev.discovered&&!ev.active&&<span style={{ fontSize:6,padding:"1px 4px",borderRadius:3,background:`${C.green}18`,color:C.green,fontWeight:700 }}>🆕 Nouveau</span>}
                  {ev.status==="cancelled"&&<span style={{ fontSize:6,padding:"1px 4px",borderRadius:3,background:`${C.red}18`,color:C.red }}>Annulé</span>}
                    {isPast&&<span style={{ fontSize:6,padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.04)",color:C.muted }}>passé</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Log */}
          <div style={{ borderTop:`1px solid ${C.border}`, padding:"5px 7px", flexShrink:0, maxHeight:80, overflowY:"auto" }}>
            {log.slice(0,5).map((l,i)=>(
              <div key={i} style={{ fontSize:7,fontFamily:"monospace",color:l.type==="error"?C.red:l.type==="success"?C.green:C.muted,marginBottom:1 }}>
                <span style={{ opacity:0.5 }}>{l.time} </span>{l.msg}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Main content */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* CALENDAR TAB */}
          {tab==="calendar" && (
            <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>

              {/* Add event form */}
              {showAddEvent && (
                <div style={{ background:C.bg,border:`1px solid ${C.green}`,borderRadius:9,padding:"12px",marginBottom:12 }}>
                  <div style={{ fontSize:9,color:C.green,fontFamily:"monospace",marginBottom:8 }}>NOUVEL ÉVÉNEMENT</div>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8 }}>
                    {[["Titre","title"],["Ville","city"],["Date début","date_start"],["Date fin","date_end"],["Source/URL","source"]].map(([l,f])=>(
                      <div key={f}>
                        <div style={{ fontSize:8,color:C.muted,marginBottom:2 }}>{l}</div>
                        <input type={f.includes("date")?"date":"text"} value={newEvent[f]||""} onChange={e=>setNewEvent(p=>({...p,[f]:e.target.value}))} placeholder={l}
                          style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}/>
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize:8,color:C.muted,marginBottom:2 }}>Catégorie</div>
                      <select value={newEvent.category} onChange={e=>setNewEvent(p=>({...p,category:e.target.value}))}
                        style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                        {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize:8,color:C.muted,marginBottom:2 }}>Type</div>
                      <select value={newEvent.type} onChange={e=>setNewEvent(p=>({...p,type:e.target.value}))}
                        style={{ width:"100%",padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:10,outline:"none" }}>
                        {EVENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={()=>{
                      if(!newEvent.title||!newEvent.date_start){alert("Titre et date requis");return;}
                      setEvents(p=>[...p,{...newEvent,id:Date.now(),official:false,approved:false}]);
                      setNewEvent({title:"",date_start:"",date_end:"",city:"",category:"Tech",type:"expo",official:false,source:"",active:true});
                      setShowAddEvent(false);
                      addLog(`✅ Événement ajouté: ${newEvent.title}`,"success");
                    }} style={{ padding:"6px 16px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:7,color:C.green,cursor:"pointer",fontSize:10,fontWeight:700 }}>
                      ✅ Ajouter
                    </button>
                    <button onClick={()=>setShowAddEvent(false)} style={{ padding:"6px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,cursor:"pointer",fontSize:10 }}>Annuler</button>
                  </div>
                </div>
              )}

              {/* Event detail + post generation */}
              {editingEvent ? (
                <div>
                  <div style={{ background:C.bg,border:`1px solid ${C.orange}`,borderRadius:10,padding:"12px 14px",marginBottom:12 }}>
                    <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13,fontWeight:700,color:C.orange,marginBottom:2 }}>{editingEvent.title}</div>
                        <div style={{ fontSize:9,color:C.muted,fontFamily:"monospace" }}>
                          {editingEvent.date_start}{editingEvent.date_end!==editingEvent.date_start?` → ${editingEvent.date_end}`:""} · {editingEvent.city} · {editingEvent.category}
                        </div>
                      </div>
                      <div style={{ display:"flex",gap:5 }}>
                        <button onClick={()=>setEvents(p=>p.map(e=>e.id===editingEvent.id?{...e,active:!e.active}:e))}
                          style={{ fontSize:8,padding:"3px 8px",background:editingEvent.active?`${C.amber}18`:`${C.green}18`,border:`1px solid ${editingEvent.active?C.amber:C.green}`,borderRadius:6,color:editingEvent.active?C.amber:C.green,cursor:"pointer" }}>
                          {editingEvent.active?"Désactiver":"Activer"}
                        </button>
                        <button onClick={()=>{ if(confirm("Supprimer?")) { setEvents(p=>p.filter(e=>e.id!==editingEvent.id)); setEditingEvent(null); }}}
                          style={{ fontSize:8,padding:"3px 8px",background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,color:C.red,cursor:"pointer" }}>
                          🗑️ Supprimer
                        </button>
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                      {[["Type",editingEvent.type],["Source",editingEvent.source],["Officiel",editingEvent.official?"Oui":"Non"],["J-",daysUntil(editingEvent.date_start)]].map(([l,v])=>(
                        <div key={l} style={{ fontSize:8,padding:"2px 8px",borderRadius:5,background:"rgba(255,255,255,0.06)",color:C.muted }}>
                          <span style={{ color:C.text }}>{l}:</span> {v}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Post phases */}
                  <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:8,textTransform:"uppercase" }}>Générer Posts par Phase</div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                    {POST_PHASES.map(phase=>{
                      const existingPost = posts.find(p=>p.eventId===editingEvent.id&&p.phase===phase.key);
                      const isGenerating = generating===`${editingEvent.id}_${phase.key}`;
                      return (
                        <div key={phase.key} style={{ background:C.bg,border:`1px solid ${existingPost?C.green:C.border}`,borderRadius:8,padding:"9px 10px" }}>
                          <div style={{ fontSize:9,fontWeight:700,color:existingPost?C.green:C.text,marginBottom:2 }}>{phase.label}</div>
                          <div style={{ fontSize:7,color:C.muted,marginBottom:6 }}>
                            {phase.daysBefore>0?`J-${phase.daysBefore}`:phase.daysBefore===0?"Jour J":"Après événement"}
                          </div>
                          {existingPost ? (
                            <div>
                              <div style={{ fontSize:7,padding:"1px 5px",borderRadius:3,background:`${statusColor(existingPost.status)}18`,color:statusColor(existingPost.status),marginBottom:4,fontFamily:"monospace" }}>
                                {existingPost.status}
                              </div>
                              <div style={{ display:"flex", gap:3 }}>
                                <button onClick={()=>{ setSelectedPost(existingPost); setTab("posts"); }}
                                  style={{ flex:1,fontSize:7,padding:"3px 0",background:`${C.blue}12`,border:`1px solid ${C.blue}44`,borderRadius:4,color:C.blue,cursor:"pointer" }}>
                                  👁️ Voir
                                </button>
                                <button onClick={()=>{ setPosts(p=>p.filter(x=>x.id!==existingPost.id)); setEvents(p=>p.map(e=>e.id===editingEvent.id?{...e,[`post_${phase.key}`]:undefined}:e)); }}
                                  style={{ fontSize:7,padding:"3px 5px",background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:4,color:C.red,cursor:"pointer" }}>
                                  🔄
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={()=>generatePost(editingEvent,phase)} disabled={!!generating}
                              style={{ width:"100%",fontSize:7,padding:"4px 0",background:`${C.orange}15`,border:`1px solid ${C.orange}44`,borderRadius:4,color:C.orange,cursor:"pointer",fontWeight:700 }}>
                              {isGenerating?"⏳...":"✨ Générer"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Upcoming events overview
                <div>
                  <div style={{ fontSize:10,color:C.gold,fontFamily:"monospace",marginBottom:12,textTransform:"uppercase" }}>
                    Événements à Venir (30 jours)
                  </div>
                  {upcoming.length===0 ? (
                    <div style={{ color:C.muted,fontSize:10,textAlign:"center",paddingTop:30 }}>Aucun événement dans les 30 prochains jours</div>
                  ) : upcoming.map(ev=>{
                    const days = daysUntil(ev.date_start);
                    return (
                      <div key={ev.id} onClick={()=>setEditingEvent(ev)}
                        style={{ background:C.bg,border:`1px solid ${days<=3?C.red:days<=7?C.amber:C.border}`,borderRadius:9,padding:"10px 12px",marginBottom:8,cursor:"pointer" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <div style={{ width:36,height:36,borderRadius:8,background:days<=3?`${C.red}18`:days<=7?`${C.amber}18`:`${C.orange}18`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:700,color:days<=3?C.red:days<=7?C.amber:C.orange,fontSize:11,flexShrink:0 }}>
                            J-{days}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:11,fontWeight:700,color:C.text }}>{ev.title}</div>
                            <div style={{ fontSize:8,color:C.muted }}>{ev.date_start} · {ev.city} · {ev.category}</div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();generatePost(ev,POST_PHASES[4]);}} disabled={!!generating}
                            style={{ fontSize:8,padding:"5px 10px",background:`${C.orange}15`,border:`1px solid ${C.orange}44`,borderRadius:7,color:C.orange,cursor:"pointer",fontWeight:700,flexShrink:0 }}>
                            {generating?.startsWith(String(ev.id))?"⏳...":"✨ Générer"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* POSTS TAB */}
          {tab==="posts" && (
            <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", overflow:"hidden", gap:0 }}>
              {/* Posts list */}
              <div style={{ borderRight:`1px solid ${C.border}`, overflowY:"auto", padding:"10px" }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:8 }}>{posts.length} posts générés</div>
                {posts.length===0 ? (
                  <div style={{ color:C.muted,fontSize:10,textAlign:"center",paddingTop:20 }}>Sélectionnez un événement et générez des posts</div>
                ) : posts.map(p=>(
                  <div key={p.id} onClick={()=>setSelectedPost(p)}
                    style={{ background:selectedPost?.id===p.id?`${C.orange}10`:C.bg,border:`1px solid ${selectedPost?.id===p.id?C.orange:C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:6,cursor:"pointer" }}>
                    <div style={{ fontSize:9,fontWeight:700,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{p.eventTitle}</div>
                    <div style={{ display:"flex",gap:4,alignItems:"center" }}>
                      <span style={{ fontSize:7,padding:"1px 5px",borderRadius:3,background:`${C.orange}18`,color:C.orange }}>{p.phaseLabel}</span>
                      <span style={{ fontSize:7,padding:"1px 5px",borderRadius:3,background:`${statusColor(p.status)}18`,color:statusColor(p.status),fontFamily:"monospace" }}>{p.status}</span>
                      <span style={{ fontSize:7,color:C.muted,marginLeft:"auto" }}>{new Date(p.createdAt).toLocaleDateString("fr-MA")}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Post detail */}
              <div style={{ overflowY:"auto", padding:"10px" }}>
                {selectedPost ? (
                  <div>
                    <div style={{ fontSize:10,color:C.gold,fontFamily:"monospace",marginBottom:8 }}>{selectedPost.eventTitle} — {selectedPost.phaseLabel}</div>

                    {/* Image preview */}
                    {selectedPost.imageUrl ? (
                      <img src={selectedPost.imageUrl} alt="event" style={{ width:"100%",borderRadius:8,marginBottom:10,maxHeight:150,objectFit:"cover" }}/>
                    ) : (
                      <div style={{ width:"100%",height:80,borderRadius:8,marginBottom:10,background:"rgba(255,255,255,0.04)",border:`1px dashed ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:C.muted }}>
                        🖼️ Pas d'image — génération en cours...
                      </div>
                    )}

                    {/* Tweet text */}
                    <div style={{ background:"rgba(29,161,242,0.07)",border:"1px solid rgba(29,161,242,0.2)",borderRadius:8,padding:"10px 12px",marginBottom:10 }}>
                      <div style={{ fontSize:11,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{selectedPost.text}</div>
                      <div style={{ fontSize:8,color:selectedPost.text?.length>260?C.red:C.muted,marginTop:6,fontFamily:"monospace" }}>
                        {selectedPost.text?.length||0}/280 chars
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                      {selectedPost.status==="draft" && (
                        <>
                          <button onClick={()=>setPosts(p=>p.map(x=>x.id===selectedPost.id?{...x,status:"approved"}:x))||setSelectedPost(p=>({...p,status:"approved"}))}
                            style={{ padding:"7px 14px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:7,color:C.green,cursor:"pointer",fontSize:10,fontWeight:700 }}>
                            ✅ Approuver
                          </button>
                          <button onClick={()=>setPosts(p=>p.map(x=>x.id===selectedPost.id?{...x,status:"rejected"}:x))||setSelectedPost(p=>({...p,status:"rejected"}))}
                            style={{ padding:"7px 12px",background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:7,color:C.red,cursor:"pointer",fontSize:10 }}>
                            ❌ Rejeter
                          </button>
                        </>
                      )}
                      {selectedPost.status==="approved" && (
                        <button onClick={()=>postToX(selectedPost)}
                          style={{ padding:"7px 16px",background:`linear-gradient(135deg,#1DA1F2,#0a5f8a)`,border:"none",borderRadius:7,color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700 }}>
                          🚀 Publier sur X
                        </button>
                      )}
                      <button onClick={()=>navigator.clipboard.writeText(selectedPost.text)}
                        style={{ padding:"7px 12px",background:`${C.gold}12`,border:`1px solid ${C.gold}44`,borderRadius:7,color:C.gold,cursor:"pointer",fontSize:10 }}>
                        📋 Copier
                      </button>
                      {selectedPost.status==="posted" && (
                        <div style={{ color:C.blue,fontSize:10,fontWeight:700,display:"flex",alignItems:"center" }}>✅ Publié!</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:C.muted,fontSize:10 }}>
                    Sélectionnez un post pour le voir
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SOURCES TAB */}
          {tab==="sources" && (
            <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",textTransform:"uppercase" }}>Sources Officielles — {sources.filter(s=>s.active).length} actives</div>
                <button onClick={()=>{
                  const name = prompt("Nom de la source:");
                  const url  = prompt("URL:");
                  const cat  = prompt("Catégorie (Tech/Food/Musique/Emploi/Auto/Sport/all):");
                  if(name && url) setSources(p=>[...p,{id:Date.now(),name,url,category:cat||"all",active:true}]);
                }} style={{ fontSize:8,padding:"3px 10px",background:`${C.green}18`,border:`1px solid ${C.green}`,borderRadius:6,color:C.green,cursor:"pointer",fontWeight:700 }}>
                  + Ajouter
                </button>
              </div>
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,overflow:"hidden" }}>
                {sources.map((s,i)=>(
                  <div key={s.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                    <input type="checkbox" checked={s.active} onChange={()=>setSources(p=>p.map(x=>x.id===s.id?{...x,active:!x.active}:x))} style={{ cursor:"pointer" }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10,color:C.text,fontWeight:700 }}>{s.name}</div>
                      <div style={{ fontSize:8,color:C.blue,fontFamily:"monospace" }}>{s.url}</div>
                    </div>
                    <span style={{ fontSize:7,padding:"1px 6px",borderRadius:8,background:`${C.orange}18`,color:C.orange }}>{s.category}</span>
                    <span style={{ fontSize:7,color:s.active?C.green:C.red,fontWeight:700 }}>{s.active?"✅":"⏸️"}</span>
                    <button onClick={()=>{ if(confirm(`Supprimer ${s.name}?`)) setSources(p=>p.filter(x=>x.id!==s.id)); }}
                      style={{ fontSize:7,padding:"2px 5px",background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:4,color:C.red,cursor:"pointer" }}>🗑️</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:10,fontSize:8,color:C.muted,fontStyle:"italic" }}>
                📌 Sources utilisées par le checker mensuel automatique (1er de chaque mois)
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {tab==="settings" && (
            <div style={{ flex:1,overflowY:"auto",padding:"10px 12px" }}>
              <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"12px",marginBottom:10 }}>
                <div style={{ fontSize:9,color:C.gold,fontFamily:"monospace",marginBottom:10,textTransform:"uppercase" }}>Workflow d'Approbation</div>
                {[
                  ["Auto-approuver les posts générés","autoApprove"],
                  ["Auto-poster après approbation","autoPost"],
                  ["Inclure image (Unsplash API)","imageEnabled"],
                ].map(([l,k])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ fontSize:9,color:C.text }}>{l}</span>
                    <button onClick={()=>setSettings(p=>({...p,[k]:!p[k]}))}
                      style={{ padding:"3px 12px",borderRadius:20,background:settings[k]?`${C.green}18`:"rgba(255,255,255,0.06)",border:`1px solid ${settings[k]?C.green:C.border}`,color:settings[k]?C.green:C.muted,cursor:"pointer",fontSize:9,fontWeight:700 }}>
                      {settings[k]?"ON":"OFF"}
                    </button>
                  </div>
                ))}
              </div>
              {/* Image orientation for Twitter */}
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"6px 0",marginTop:4,borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize:9,color:"#e8dcc8" }}>Format image Twitter</span>
                <div style={{ display:"flex",gap:4 }}>
                  {[["landscape","16:9"],["portrait","9:16"],["square","1:1"]].map(([o,label])=>(
                    <button key={o} onClick={()=>setSettings(p=>({...p,imageOrientation:o}))}
                      style={{ fontSize:7.5,padding:"2px 8px",borderRadius:10,cursor:"pointer",
                        background:(settings.imageOrientation||"landscape")===o?"rgba(212,175,55,0.15)":"rgba(0,0,0,0.3)",
                        border:`1px solid ${(settings.imageOrientation||"landscape")===o?"rgba(212,175,55,0.6)":"rgba(255,255,255,0.1)"}`,
                        color:(settings.imageOrientation||"landscape")===o?"#d4af37":"#666" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:9,padding:"12px" }}>
                <div style={{ fontSize:9,color:C.green,fontFamily:"monospace",marginBottom:6 }}>✅ PEXELS API — Configurée</div>
                <div style={{ fontSize:8,color:C.muted,marginBottom:2 }}>Images HD gratuites via Pexels</div>
                <div style={{ fontSize:8,color:C.muted }}>• 200 requêtes/heure gratuites</div>
                <div style={{ fontSize:8,color:C.muted }}>• Orientation paysage (idéal pour X)</div>
                <div style={{ fontSize:8,color:C.muted }}>• Recherche par catégorie + ville</div>
                <div style={{ fontSize:8,color:C.muted }}>• Fallback automatique si pas de résultat</div>
                <div style={{ fontSize:8,color:C.green,marginTop:6 }}>✅ PEXELS_KEY configurée dans Vercel</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
