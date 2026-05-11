// ================================================================
//  YouTubeVideoAgent.jsx — Video production, render, publish
// ================================================================
import { useState, useEffect } from "react";
import { C, uid, STATUS_STYLE } from "./youtubeConfig";

function Chip({ label, color }) {
  return (
    <span style={{ fontSize:7, padding:"1px 6px", borderRadius:4,
      background:(color||C.blue)+"18", color:color||C.blue,
      border:"1px solid "+(color||C.blue)+"33" }}>{label}</span>
  );
}

export default function YouTubeVideoAgent({
  ideas, setIdeas, agents, addLog, generating, setGenerating, automation,
}) {

const [posts, setPosts] = useState(() => {
  try { return JSON.parse(localStorage.getItem("ytv2_posts")||"[]"); } catch { return []; }
});
const [deletedPostIds, setDeletedPostIds] = useState(() => {
  try { return JSON.parse(localStorage.getItem("ytv2_deleted_posts")||"[]"); } catch { return []; }
});

  useEffect(() => {
    localStorage.setItem("ytv2_posts", JSON.stringify(posts.slice(0,200)));
    // KV sync for cross-device access
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:yt_posts", value:JSON.stringify(posts.slice(0,200)) })
    }).catch(()=>{});
  }, [posts]);

useEffect(() => {
  localStorage.setItem("ytv2_deleted_posts", JSON.stringify(deletedPostIds.slice(0,500)));
  fetch("/api/kv", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      key:"travito:yt_deleted_posts",
      value: JSON.stringify(deletedPostIds.slice(0,500))
    })
  }).catch(()=>{});
}, [deletedPostIds]);

useEffect(() => {
  const local = localStorage.getItem("ytv2_deleted_posts");
  if (!local || local === "[]") {
    fetch("/api/kv?key=travito:yt_deleted_posts")
      .then(r=>r.json())
      .then(d => {
        if (Array.isArray(d.config) && d.config.length > 0) setDeletedPostIds(d.config);
      }).catch(()=>{});
  }
}, []);

  // Restore posts from KV on mount if localStorage empty (new device/browser)
  useEffect(() => {
    const local = localStorage.getItem("ytv2_posts");
    if (!local || local === "[]") {
      fetch("/api/kv?key=travito:yt_posts")
        .then(r=>r.json())
        .then(d => {
          if (Array.isArray(d.config) && d.config.length > 0) setPosts(d.config);
        }).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── AUTO VIDEO PRODUCTION ─────────────────────────────────────
  useEffect(() => {
    if (!automation?.autoGenerateVideo || generating) return;
    const next = ideas.find(i =>
      i.status === "approved" && i.bible &&
      !["queued","rendering","rendered","published","failed"].includes(i.status) &&
      !i.productionJob  // guard: never auto-launch if a job already exists for this idea
    );
    if (next) {
      addLog("Auto: lancement production " + next.topic.slice(0,30) + "...", "auto");
      setTimeout(() => runProductionPipeline(next.id), 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas.filter(i=>i.status==="approved").length, automation?.autoGenerateVideo]);

  // Sync idea status changes into posts
  useEffect(() => {
const relevant = ideas.filter(i =>
  !deletedPostIds.includes(i.id) &&
  (["published","rendered","rendering","queued","failed"].includes(i.status) || i.productionJob)
);
    setPosts(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newPosts = relevant
        .filter(i => !existingIds.has(i.id))
        .map(i => ({
          id: i.id, topic: i.topic, agentId: i.agentId,
          status: i.status, weekKey: i.weekKey||null,
          scheduledDay: i.scheduledDay||null, language: i.language||"fr",
          voiceId: i.productionJob?.voiceId||null,
          renderUrl: i.productionJob?.renderResult?.url||null,
          youtubeUrl: i.publishedUrl||null,
          publishedAt: i.publishedAt||null,
          createdAt: i.createdAt,
          productionJob: i.productionJob||null,
        }));
      const updated = prev.map(p => {
        const live = relevant.find(i => i.id === p.id);
        if (!live) return p;
        return { ...p, status:live.status,
          renderUrl: live.productionJob?.renderResult?.url || p.renderUrl,
          youtubeUrl: live.publishedUrl || p.youtubeUrl,
          publishedAt: live.publishedAt || p.publishedAt,
          voiceId: live.productionJob?.voiceId || p.voiceId,
        };
      });
      return [...newPosts, ...updated].slice(0,200);
    });
}, [ideas, deletedPostIds]);

const normalizeVoiceText = (text = "") => {
  return text
    // DH / Dhs / MAD → dirhams
    .replace(/\b(\d+)\s?(dh|dhs|mad)\b/gi, "$1 dirhams")
    .replace(/\b(\d+)(dh|dhs|mad)\b/gi, "$1 dirhams")
    .replace(/\b(\d+)\s?(dh|dhs|mad)([.,!?])/gi, "$1 dirhams$3")

    // 1k → 1000
    .replace(/\b(\d+)k\b/gi, (_, n) => String(Number(n) * 1000))

    // 1M → 1000000
    .replace(/\b(\d+(?:\.\d+)?)m\b/gi, (_, n) => String(Number(n) * 1000000))

    // % → percent
    .replace(/\b(\d+(?:\.\d+)?)%\b/g, "$1 percent")

    // clean spacing
    .replace(/\s+/g, " ")
    .trim();
};


  // ── PRODUCTION PIPELINE ──────────────────────────────────────
  const runProductionPipeline = async (ideaId) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea?.bible) { addLog("Bible introuvable — approuvez une idee avec Bible", "error"); return; }
    const bible = idea.bible;
    const agent = agents.find(a => a.id === idea.agentId);


const jobId = "job_" + uid();

const updateIdea = (patch) => {
  setIdeas(prev => prev.map(i => i.id === ideaId ? {...i, ...patch} : i));
};




const spokenSegments = (bible.segment_timeline || []).filter(
  s => !["opener", "cta"].includes(s.segment_type)
);

const expectedSpokenSec = spokenSegments.reduce(
  (sum, s) => sum + Math.max(2, s.target_duration_sec || 5),
  0
);

const actualWords = (bible.voiceover_script || "")
  .trim()
  .split(/\s+/)
  .filter(Boolean).length;

const minWordsAllowed = Math.round(expectedSpokenSec * 1.7);
const maxWordsAllowed = Math.round(expectedSpokenSec * 2.7);

if (actualWords < minWordsAllowed) {
  addLog(
    `Voiceover trop court: ${actualWords} mots pour ~${expectedSpokenSec}s (min ${minWordsAllowed})`,
    "error"
  );
  updateIdea({
    status: "failed",
    productionJob: {
      id: "job_" + uid(),
      ideaId,
      status: "failed",
      createdAt: new Date().toISOString(),
      voiceId: null,
      steps: { pexels: "pending", voice: "failed", render: "failed" },
      error: "Bible voiceover too short"
    }
  });
  return;
}

if (actualWords > maxWordsAllowed) {
  addLog(
    `Voiceover trop long: ${actualWords} mots pour ~${expectedSpokenSec}s (max ${maxWordsAllowed})`,
    "error"
  );
  updateIdea({
    status: "failed",
    productionJob: {
      id: "job_" + uid(),
      ideaId,
      status: "failed",
      createdAt: new Date().toISOString(),
      voiceId: null,
      steps: { pexels: "pending", voice: "failed", render: "failed" },
      error: "Bible voiceover too long"
    }
  });
  return;
}



    // Pick voiceId for the idea's language from agent config
    const ideaLang = (idea.language || agent?.lang || "fr").toLowerCase();
    const voiceIdForLang = ideaLang.startsWith("ar") ? (agent?.voiceIdAR || null)
                         : ideaLang.startsWith("en") ? (agent?.voiceIdEN || null)
                         : (agent?.voiceIdFR || agent?.voiceId || null);

    const job = {
      id: jobId, ideaId, status: "queued",
      createdAt: new Date().toISOString(),
      voiceId: voiceIdForLang,
      steps: { pexels:"pending", voice:"pending", render:"pending" },
    };
    updateIdea({ status:"queued", productionJob: job });
    addLog("Job " + jobId + " — en queue", "success");

    // Step 2: Pexels clips
    updateIdea({ productionJob:{...job, status:"pexels", steps:{...job.steps, pexels:"running"}} });
    addLog("Recherche clips Pexels...");
    let pexelsAssets = [];
    try {
      const segments = (bible.segment_timeline || [])
  .filter(s => s.pexels_query_primary && !["opener", "cta"].includes(s.segment_type))
  .sort((a, b) => {
    const order = { hook: 0, point: 1, payoff: 2 };
    return (order[a.segment_type] ?? 9) - (order[b.segment_type] ?? 9);
  });
      for (const seg of segments.slice(0, segments.length)) {
        const query = seg.pexels_query_primary || seg.visual_keywords?.[0] || "Morocco lifestyle";
        try {
          const r = await fetch(
            "/api/kv?action=pexels&format=shorts&query=" + encodeURIComponent(query)
          );
          const d = await r.json();
          // Prefer video, fallback to image — pass all metadata for Shotstack aspect-ratio logic
          if (d.videoUrl || d.imageUrl) {
            pexelsAssets.push({
              segmentId: seg.segment_id,
              query,
              url:       d.videoUrl || d.imageUrl,
              mediaType: d.mediaType || (d.videoUrl ? "video" : "image"),
              width:     d.width  || null,
              height:    d.height || null,
              isPortrait: d.isPortrait ?? ((d.height||0) > (d.width||0)),
            });
          }
        } catch {}
        await new Promise(r => setTimeout(r, 400));
      }
      updateIdea({ productionJob:{...job, status:"pexels_done", pexelsAssets, steps:{...job.steps, pexels:"done"}} });
      addLog(pexelsAssets.length + " clips Pexels", "success");
    } catch(e) { addLog("Pexels erreur: " + e.message, "error"); }




    // Step 3: ElevenLabs TTS with per-agent voiceId
    updateIdea({ productionJob:{...job, status:"voice", steps:{...job.steps, pexels:"done", voice:"running"}} });
    // voiceIdForLang resolved per-language above (ideaLang → voiceIdFR/AR/EN)
    addLog("ElevenLabs TTS" + (voiceIdForLang ? " (voice: " + voiceIdForLang.slice(0,8) + "...)" : "") + "...");
let audioBase64 = null;
let audioDurationSec = 0;
    try {

const cleanedVoice = normalizeVoiceText(bible.voiceover_script || "");

const body = {
  action: "tts",
  text: cleanedVoice,
  language: (bible.language || idea.language || "fr").toUpperCase(),
};

      if (voiceIdForLang) body.voiceId = voiceIdForLang;
      const vr = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const vd = await vr.json();
      if (vd.success && vd.audio) {
        audioBase64 = vd.audio;
        updateIdea({ productionJob:{...job, status:"voice_done",
          voiceId: voiceIdForLang, voiceResult:{mimeType:vd.mimeType},
          steps:{...job.steps, pexels:"done", voice:"done"}} });
        audioDurationSec = (vd.bytes || 0) / 16000; // 128kbps = 16000 bytes/sec
          addLog("Voiceover OK (~" + audioDurationSec + "s)", "success");
      } else {
        addLog("ElevenLabs: " + (vd.error||"echec") + " — rendu sans audio", "error");
        updateIdea({ productionJob:{...job, steps:{...job.steps, pexels:"done", voice:"failed"}} });
      }


    } catch(ve) {
      addLog("Voice erreur: " + ve.message + " — rendu sans audio", "error");
    }

    // Step 4: Shotstack render
    updateIdea({ productionJob:{...job, status:"render",
      steps:{...job.steps, pexels:"done", voice:audioBase64?"done":"failed", render:"running"}} });
    addLog("Rendu Shotstack" + (audioBase64?" avec audio":" SANS audio") + "...");

    try {
      const openerClip = pexelsAssets[0]?.url || null;
const ctaClip    = pexelsAssets[pexelsAssets.length - 1]?.url || openerClip;

      const totalTargetDuration = (bible.segment_timeline || []).reduce(
        (sum, seg) => sum + Math.max(2, seg.target_duration_sec || 5),
        0
      );

      const durationScale =
        audioDurationSec > 0 && totalTargetDuration > 0
          ? audioDurationSec / totalTargetDuration
          : 1;

const usedAssetUrls = new Set();
let assetIndex = 0;

const takeUnusedAsset = () => {
  const unused = pexelsAssets.filter(a => a?.url && !usedAssetUrls.has(a.url));

  let next = unused[0] || null;

  if (!next && pexelsAssets.length > 0) {
    next = pexelsAssets[assetIndex % pexelsAssets.length];
  }

  if (next?.url) {
    usedAssetUrls.add(next.url);
    assetIndex++;
  }

  return next;
};


const findExactAsset = (segmentId) => {
  const exact = pexelsAssets.find(a => a.segmentId === segmentId && a?.url) || null;
  if (exact?.url) usedAssetUrls.add(exact.url);
  return exact;
};



const scenesPayload = (bible.segment_timeline || []).map((seg) => {
  const segType = seg.segment_type || "content";
  const isTemplateSegment = segType === "opener" || segType === "cta";

  // opener / CTA should NOT steal spoken-content clips
let asset = null;

if (!isTemplateSegment) {
  asset =
    findExactAsset(seg.segment_id) ||
    takeUnusedAsset() ||
    pexelsAssets[pexelsAssets.length - 1] ||
    null;
}



  return {
    type: segType,
clip: asset?.url || openerClip || ctaClip || null,
    mediaType: asset?.mediaType || null,
    width: asset?.width || null,
    height: asset?.height || null,
    isPortrait: asset?.isPortrait ?? ((asset?.height || 0) > (asset?.width || 0)),
  duration: Math.max(2, Math.min(12, Math.round((seg.target_duration_sec || 5) * durationScale))),
    text: (seg.on_screen_text || "").slice(0, 24),
    narration: (seg.subtitle_text || seg.on_screen_text || "").slice(0, 50),
    segmentId: seg.segment_id,
    isTemplateSegment,
  };
});

const clipUsage = {};
scenesPayload.forEach(s => {
  if (!s.clip) return;
  clipUsage[s.clip] = (clipUsage[s.clip] || 0) + 1;
});

const repeatedClips = Object.entries(clipUsage).filter(([, count]) => count > 1);
if (repeatedClips.length) {
  addLog(
    `[DEBUG] repeatedClips=${repeatedClips.length} | maxReuse=${Math.max(...repeatedClips.map(([, c]) => c))}`,
    "error"
  );
}

  const missingScenes = scenesPayload.filter(s => !s.clip && !s.isTemplateSegment);
const templateScenes = scenesPayload.filter(s => s.isTemplateSegment);
addLog(
  `[DEBUG] templateScenes=${templateScenes.length} | templateWithoutClip=${templateScenes.filter(s => !s.clip).length}`,
  "info"
);

addLog(
  `[DEBUG] spokenSceneClips=${scenesPayload.filter(s => !s.isTemplateSegment && s.clip).length}`,
  "info"
);

  addLog(
    `[DEBUG] segments=${(bible.segment_timeline || []).length} | pexelsAssets=${pexelsAssets.length} | scenes=${scenesPayload.length} | missingClips=${missingScenes.length}`,
    missingScenes.length ? "error" : "info"
  );

  if (missingScenes.length) {
    addLog(
      `[DEBUG] missing segmentIds: ${missingScenes.map(s => s.segmentId).join(", ")}`,
      "error"
    );
  }

  addLog(
    `[DEBUG] audioBase64=${audioBase64 ? "yes" : "no"} | audioDurationSec=${audioDurationSec}`,
    "info"
  );

  const r = await fetch("/api/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "video",
      audioBase64: audioBase64 || null,
      audioDurationSec,
      scenes: scenesPayload,
      title: bible.title || idea.topic,
      format: "9:16",
    }),
  });

  const d = await r.json();
  if (d.success && (d.renderId || d.url)) {
    const renderResult = { renderId:d.renderId, url:d.url, status:"rendering" };
    updateIdea({ status:"rendering", productionJob:{...job,
      status:"render_submitted", renderResult, voiceId:voiceIdForLang,
      steps:{...job.steps, pexels:"done", voice:audioBase64?"done":"failed", render:"running"}} });
    addLog("Rendu lance! ID: " + (d.renderId||"ok"), "success");
    if (d.renderId && !d.url) pollRenderStatus(ideaId, d.renderId, job, voiceIdForLang);
  } else {
    addLog("Shotstack: " + (d.error||"echec rendu"), "error");
    updateIdea({ status:"failed",
      productionJob:{...job, status:"failed", steps:{...job.steps, render:"failed"}} });
  }
} catch(e) {
  addLog("Render erreur: " + e.message, "error");
  updateIdea({ status:"failed", productionJob:{...job, status:"failed"} });
}
  };

  const pollRenderStatus = async (ideaId, renderId, job, voiceId) => {
    let attempts = 0;
    const poll = async () => {
      if (attempts++ > 60) return; // 60 × 8s = ~8 min max
      try {
        const r = await fetch("/api/youtube?action=status&renderId=" + renderId);
        const d = await r.json();
        if (d.status === "done" || d.url) {
          setIdeas(prev => prev.map(i => i.id===ideaId ? {
            ...i, status:"rendered",
            productionJob:{...job, status:"rendered", voiceId,
              renderResult:{ renderId, url:d.url, status:"done" },
              steps:{pexels:"done", voice:"done", render:"done"}}
          } : i));
          addLog("Video rendue! Prete a publier.", "success");
        } else if (d.status === "failed") {
          setIdeas(prev => prev.map(i => i.id===ideaId ? {...i, status:"failed"} : i));
          addLog("Rendu echoue: " + (d.data?.error||d.data?.message||"").slice(0,80), "error");
        } else {
          setTimeout(poll, 8000);
        }
      } catch { setTimeout(poll, 10000); }
    };
    setTimeout(poll, 8000);
  };

  const handleMarkPublished = (ideaId, ytUrl) => {
    const now = new Date().toISOString();
    setIdeas(prev => prev.map(i => i.id === ideaId ? {
      ...i, status:"published", production_status:"published",
      publishedAt:now, publishedUrl:ytUrl||""
    } : i));
    addLog("Video publiee sur YouTube!", "success");
    // Delete render from Shotstack to stop storage charges
    const pubIdea = ideas.find(i => i.id === ideaId);
    const renderId = pubIdea?.productionJob?.renderResult?.renderId;
    if (renderId) {
      fetch("/api/youtube", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"delete_render", renderId }) }).catch(()=>{});
    }
    // Append to upload history (not overwrite)
    fetch("/api/kv?key=travito:yt_uploads")
      .then(r=>r.json())
      .then(d=>{
        const prev = Array.isArray(d.config) ? d.config : [];
        const updated = [...prev, {id:ideaId, publishedAt:now, url:ytUrl||""}].slice(-500);
        return fetch("/api/kv",{ method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({key:"travito:yt_uploads", value:JSON.stringify(updated)}) });
      }).catch(()=>{});
    // Save topic to long-term history to prevent re-generation (survives idea deletion)
    const publishedIdea = ideas.find(i => i.id === ideaId);
    if (publishedIdea?.topic && publishedIdea?.agentId) {
      fetch("/api/kv?key=travito:yt_history:" + publishedIdea.agentId)
        .then(r=>r.json())
        .then(d => {
          const existing = Array.isArray(d.config?.topics) ? d.config.topics : [];
          const updated  = [...existing.filter(t=>t.topic!==publishedIdea.topic),
                           { topic:publishedIdea.topic, date:now, url:ytUrl||"" }]
                           .slice(-200);
          return fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ key:"travito:yt_history:"+publishedIdea.agentId,
              value:JSON.stringify({ topics:updated }) }) });
        }).catch(()=>{});
    }
  };


  // ── HELPERS ───────────────────────────────────────────────────
const deleteIdea = async (ideaId) => {
  const idea = ideas.find(i => i.id === ideaId);
  const renderId = idea?.productionJob?.renderResult?.renderId || null;

setDeletedPostIds(prev => [...new Set([ideaId, ...prev])]);
  setIdeas(prev => prev.filter(i => i.id !== ideaId));
  setPosts(prev => prev.filter(p => p.id !== ideaId));
  addLog("Video supprimee", "info");

  try {
    const nextPosts = posts.filter(p => p.id !== ideaId);
    localStorage.setItem("ytv2_posts", JSON.stringify(nextPosts.slice(0,200)));

    await fetch("/api/kv", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        key:"travito:yt_posts",
        value: JSON.stringify(nextPosts.slice(0,200))
      })
    });
  } catch {}

  if (renderId) {
    try {
      await fetch("/api/youtube", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"delete_render", renderId })
      });
      addLog("Rendu Shotstack supprimé: " + renderId, "success");
    } catch {}
  }
};

  const relaunchIdea = (ideaId) => {
    setIdeas(prev => prev.map(i => i.id === ideaId
      ? {...i, status:"approved", productionJob:null}
      : i
    ));
    addLog("Re-lancement production...", "info");
    setTimeout(() => runProductionPipeline(ideaId), 300);
  };

  const handlePublish = async (ideaId) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const renderUrl = idea.productionJob?.renderResult?.url;
    addLog("Publication YouTube en cours...", "info", {topic: idea.topic});
    try {
      const agent = agents.find(a => a.id === idea.agentId);
      const bible = idea.bible || {};

      const r = await fetch("/api/youtube", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          action: "publish",
          videoUrl: renderUrl,
          title: bible.title || idea.topic,
          description: (bible.voiceover_script||"").slice(0,400) + "\n\n" +
            (bible.hashtags||[]).join(" ") + "\n\nDecouvre plus sur travito.ma",
          tags: (bible.hashtags||[]).map(h=>h.replace("#","")),
          language: (idea.language||"fr").toUpperCase(),
          isShorts: true,
          pinnedComment: "Plus de conseils sur travito.ma 🇲🇦",
        }),
      });
      const d = await r.json();
      if (d.success || d.youtubeUrl || d.videoId) {
        const ytUrl = d.youtubeUrl || "https://youtube.com/watch?v=" + d.videoId;
        handleMarkPublished(ideaId, ytUrl);
        addLog("Publiee sur YouTube! " + ytUrl, "success", {topic: idea.topic});
        // Delete render from Shotstack to stop storage charges
        const renderId = idea.productionJob?.renderResult?.renderId;
        if (renderId) {
          fetch("/api/youtube", { method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ action:"delete_render", renderId }) }).catch(()=>{});
        }
      } else {
        addLog("Erreur publication: " + (d.error||"echec"), "error", {topic: idea.topic});
      }
    } catch(e) {
      addLog("Erreur publication: " + e.message, "error");
    }
  };

  // ── QUEUE DATA ────────────────────────────────────────────────
const approvedIdeas = ideas.filter(i =>
  !deletedPostIds.includes(i.id) &&
  i.status === "approved" &&
  i.bible
);

const liveIdeas = ideas.filter(i =>
  !deletedPostIds.includes(i.id) &&
  ["queued","rendering","rendered","failed"].includes(i.status)
);
  const historyPosts  = posts.slice().sort((a,b) =>
    new Date(b.createdAt||0) - new Date(a.createdAt||0)
  );

  const StepDot = ({steps, key_}) => {
    const s = steps?.[key_];
    const icon = key_==="pexels"?"🎬":key_==="voice"?"🎙️":"🎥";
    const col  = s==="done"?C.green:s==="running"?C.purple:s==="failed"?C.red:C.muted;
    return (
      <span style={{fontSize:7.5, color:col}}>
        {icon}{s==="done"?"✓":s==="running"?"…":s==="failed"?"✗":"○"}
      </span>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

      {/* LEFT — Queue */}
      <div style={{ width:280, flexShrink:0, borderRight:"1px solid "+C.border,
        display:"flex", flexDirection:"column", overflow:"hidden" }}>

        <div style={{ padding:"6px 10px", borderBottom:"1px solid rgba(212,175,55,0.12)",
          flexShrink:0, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", fontWeight:700 }}>
            PRODUCTION QUEUE
          </div>
          <span style={{ fontSize:7, color:C.muted }}>
            {liveIdeas.length} actif · {approvedIdeas.length} attente
          </span>
        </div>

        <div style={{ flex:1, overflowY:"auto" }}>

          {/* Approved — ready to launch */}
          {approvedIdeas.length > 0 && (
            <div style={{ padding:"5px 8px",
              borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize:7, color:C.muted, fontFamily:"monospace",
                marginBottom:4, padding:"2px 0" }}>
                APPROUVEES — PRET A LANCER
              </div>
              {approvedIdeas.map(idea => {
                const agent = agents.find(a => a.id === idea.agentId);
                return (
                  <div key={idea.id} style={{ padding:"6px 8px", marginBottom:4,
                    borderRadius:7, background:"rgba(29,161,242,0.05)",
                    border:"1px solid rgba(29,161,242,0.18)" }}>
                    <div style={{ display:"flex", alignItems:"flex-start",
                      gap:6, marginBottom:5 }}>
                      <span style={{ fontSize:12, flexShrink:0 }}>
                        {agent?.icon||"💡"}
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:8, color:C.text, fontWeight:600,
                          lineHeight:1.3, marginBottom:2 }}>
                          {idea.topic}
                        </div>
                        <div style={{ fontSize:7, color:C.muted }}>
                          {idea.weekKey} · {idea.scheduledDay}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:4 }}>
                      <button onClick={()=>runProductionPipeline(idea.id)}
                        disabled={generating}
                        style={{ flex:1, fontSize:7.5, padding:"4px 0",
                          background:"linear-gradient(135deg,rgba(29,161,242,0.2),rgba(29,161,242,0.1))",
                          border:"1px solid rgba(29,161,242,0.5)",
                          borderRadius:5, color:C.blue, cursor:"pointer", fontWeight:700 }}>
                        🚀 Lancer
                      </button>
                      <button onClick={()=>deleteIdea(idea.id)}
                        style={{ fontSize:7.5, padding:"4px 8px",
                          background:"rgba(239,68,68,0.08)",
                          border:"1px solid rgba(239,68,68,0.2)",
                          borderRadius:5, color:C.red, cursor:"pointer" }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live jobs */}
          {liveIdeas.length > 0 && (
            <div style={{ padding:"5px 8px",
              borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize:7, color:C.muted, fontFamily:"monospace",
                marginBottom:4, padding:"2px 0" }}>
                EN COURS
              </div>
              {liveIdeas.map(idea => {
                const ss    = STATUS_STYLE[idea.status] || STATUS_STYLE.generated;
                const steps = idea.productionJob?.steps || {};
                const url   = idea.productionJob?.renderResult?.url;
                const isPub = idea.status === "published" || !!idea.publishedUrl;
                const isRend= idea.status === "rendered" || (!!url && !isPub);
                const isFail= idea.status === "failed";
                return (
                  <div key={idea.id}>
                  <div style={{ padding:"7px 9px", marginBottom:0,
                    borderRadius:7, background:"rgba(0,0,0,0.2)",
                    border:"1px solid "+C.border }}>

                    {/* Topic + status */}
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center", marginBottom:4 }}>
                      <div style={{ fontSize:8, color:C.text, fontWeight:600,
                        flex:1, marginRight:6, lineHeight:1.3 }}>
                        {idea.topic}
                      </div>
                      <span style={{ fontSize:7, padding:"1px 5px", borderRadius:3,
                        background:ss.bg, color:ss.color, flexShrink:0,
                        fontWeight:700 }}>
                        {ss.label}
                      </span>
                    </div>

                    {/* Step dots */}
                    <div style={{ display:"flex", gap:6, marginBottom:5,
                      alignItems:"center" }}>
                      {["pexels","voice","render"].map(k => (
                        <StepDot key={k} steps={steps} key_={k}/>
                      ))}
                      {/* Pulse if rendering */}
                      {idea.status === "rendering" && (
                        <span style={{ fontSize:7, color:C.purple,
                          animation:"ytpulse 1.5s infinite" }}>
                          rendu en cours...
                        </span>
                      )}
                    </div>

                    {/* Actions row */}
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {/* Voice chip */}
                      {idea.productionJob?.voiceId && (
                        <Chip label={"Voice " + idea.productionJob.voiceId.slice(0,8) + "..."} color={C.teal}/>
                      )}
                      {url && (
                        <a href={url} target="_blank" rel="noopener"
                          style={{ fontSize:7, padding:"2px 7px", background:"rgba(139,92,246,0.1)",
                            border:"1px solid rgba(139,92,246,0.3)", borderRadius:4,
                            color:C.purple, textDecoration:"none" }}>
                          🎬 Voir
                        </a>
                      )}
                      {isRend && !isPub && (
                        <button onClick={()=>handlePublish(idea.id)}
                          style={{ fontSize:7, padding:"2px 8px", background:"rgba(16,185,129,0.12)",
                            border:"1px solid rgba(16,185,129,0.4)", borderRadius:4,
                            color:C.green, cursor:"pointer", fontWeight:700 }}>
                          ▶️ Publier
                        </button>
                      )}
                      {isPub && (
                        <span style={{ fontSize:7, padding:"2px 8px", background:"rgba(16,185,129,0.08)",
                          border:"1px solid rgba(16,185,129,0.2)", borderRadius:4, color:C.green }}>
                          ✅ Publié
                        </span>
                      )}
                      {isRend && !isPub && (
                        <button onClick={()=>{
                          const u = window.prompt("URL YouTube (optionnel):");
                          if (u === null) return; // user cancelled — do nothing
                          handleMarkPublished(idea.id, u||"");
                        }}
                          style={{ fontSize:7, padding:"2px 7px", background:"rgba(20,184,166,0.08)",
                            border:"1px solid rgba(20,184,166,0.2)", borderRadius:4,
                            color:C.teal, cursor:"pointer" }}>
                          + URL
                        </button>
                      )}
                      <button onClick={()=>deleteIdea(idea.id)}
                        style={{ fontSize:7, padding:"2px 6px", background:"rgba(239,68,68,0.06)",
                          border:"1px solid rgba(239,68,68,0.15)", borderRadius:4,
                          color:C.red, cursor:"pointer" }}>
                        🗑️
                      </button>
                    </div>
                    {/* Resume polling — shown independently whenever renderId exists with no url */}
                    {idea.productionJob?.renderResult?.renderId &&
                     !idea.productionJob?.renderResult?.url && !isPub && (
                      <div style={{ marginTop:5 }}>
                        <button onClick={()=>{
                          const renderId = idea.productionJob.renderResult.renderId;
                          const job = idea.productionJob;
                          const voiceId = idea.productionJob?.voiceId || "";
                          addLog("🔄 Reprise polling rendu: " + renderId.slice(0,8) + "...", "info");
                          pollRenderStatus(idea.id, renderId, job, voiceId);
                        }}
                          style={{ width:"100%", fontSize:7.5, padding:"4px 0", fontWeight:700,
                            background:"rgba(139,92,246,0.1)", border:"1px solid rgba(139,92,246,0.4)",
                            borderRadius:5, color:C.purple, cursor:"pointer" }}>
                          ▶ Reprendre le rendu
                        </button>
                      </div>
                    )}
                    {/* Re-lancer — own row so always visible */}
                    {(isFail || isRend) && !isPub && (
                      <div style={{ marginTop:5, display:"flex", flexDirection:"column", gap:4 }}>
                        <button onClick={()=>relaunchIdea(idea.id)} disabled={generating}
                          style={{ width:"100%", fontSize:7.5, padding:"4px 0", fontWeight:700,
                            background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.4)",
                            borderRadius:5, color:C.amber,
                            cursor:generating?"not-allowed":"pointer" }}>
                          🔄 Re-lancer la production
                        </button>
                      {/* Resume polling (legacy location - kept for rendered state) */}
                      {isRend && (
                        <button onClick={async ()=>{
                          if (!window.confirm("Supprimer ce rendu de Shotstack (stop facturation stockage) ?")) return;
                          const renderId = idea.productionJob?.renderResult?.renderId;
                          if (renderId) {
                            await fetch("/api/youtube", { method:"POST",
                              headers:{"Content-Type":"application/json"},
                              body: JSON.stringify({ action:"delete_render", renderId }) }
                            ).catch(()=>{});
                          }
                          deleteIdea(idea.id);
                        }}
                          style={{ width:"100%", fontSize:7, padding:"3px 0",
                            background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)",
                            borderRadius:5, color:C.red, cursor:"pointer" }}>
                          🗑️ Supprimer du stockage Shotstack
                        </button>
                      )}
                      </div>
                    )}
                  </div>
                  </div>
                );
              })}
            </div>
          )}

          {approvedIdeas.length === 0 && liveIdeas.length === 0 && (
            <div style={{ padding:20, textAlign:"center", color:C.muted,
              fontSize:8, lineHeight:1.7 }}>
              Aucune video en attente.<br/>
              Approuvez une idee avec Bible<br/>dans l onglet Ideas.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Post history */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"6px 12px", borderBottom:"1px solid rgba(212,175,55,0.12)",
          flexShrink:0, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", fontWeight:700 }}>
            HISTORIQUE VIDEOS — {historyPosts.length} posts
          </div>
          <button
            title="Supprimer les fichiers audio temporaires de Shotstack (arrête les frais de stockage)"
            onClick={async () => {
              // Delete known source asset ocjrqgnmwq + any future ones stored
              const ids = ["ocjrqgnmwq"]; // add more IDs here if needed
              let ok = 0;
              for (const id of ids) {
                try {
                  const r = await fetch("/api/youtube", { method:"POST",
                    headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({ action:"delete_source", sourceId: id }) });
                  const d = await r.json();
                  if (d.success) ok++;
                } catch {}
              }
              addLog("Shotstack purge: " + ok + "/" + ids.length + " source(s) supprimé(s)", "success");
            }}
            style={{ fontSize:7, padding:"2px 8px", background:"rgba(239,68,68,0.08)",
              border:"1px solid rgba(239,68,68,0.2)", borderRadius:4,
              color:"#ef4444", cursor:"pointer" }}>
            🗑️ Purge Shotstack
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"8px 12px" }}>
          {historyPosts.length === 0 ? (
            <div style={{ textAlign:"center", paddingTop:40, color:C.muted,
              fontSize:9, lineHeight:1.8 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🎬</div>
              Aucune video produite encore.
            </div>
          ) : historyPosts.map((post, idx) => {
            const agent   = agents.find(a => a.id === post.agentId);
            const ss      = STATUS_STYLE[post.status] || STATUS_STYLE.generated;
            const isPub    = post.status === "published" || !!post.youtubeUrl;
            const liveIdea = ideas.find(i => i.id === post.id);
            const renderUrl= post.renderUrl || liveIdea?.productionJob?.renderResult?.url;
            const isRend   = post.status === "rendered" || (!!renderUrl && !isPub);
            const ytUrl     = post.youtubeUrl || liveIdea?.publishedUrl;
            const steps     = post.productionJob?.steps || liveIdea?.productionJob?.steps || {};
            return (
              <div key={post.id||idx} style={{ padding:"9px 12px", marginBottom:7,
                borderRadius:8, background:isPub?"rgba(16,185,129,0.04)":"rgba(0,0,0,0.2)",
                border:"1px solid "+(isPub?C.green:C.border) }}>

                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom:5 }}>
                  <div style={{ flex:1, marginRight:8 }}>
                    <div style={{ display:"flex", alignItems:"center",
                      gap:5, marginBottom:3 }}>
                      {agent && <span style={{ fontSize:12 }}>{agent.icon}</span>}
                      <span style={{ fontSize:9, fontWeight:700, color:C.text,
                        lineHeight:1.3 }}>{post.topic}</span>
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      <Chip label={post.weekKey||"—"} color={C.teal}/>
                      <Chip label={post.scheduledDay||"—"} color={C.gold}/>
                      <Chip label={(post.language||"fr").toUpperCase()} color={C.amber}/>
                      {post.voiceId && (
                        <Chip label={"Voice: "+post.voiceId.slice(0,8)+"..."} color={C.muted}/>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <span style={{ fontSize:7.5, padding:"2px 7px", borderRadius:4,
                      background:ss.bg, color:ss.color, display:"block",
                      marginBottom:3, fontWeight:700 }}>
                      {ss.label}
                    </span>
                    {post.publishedAt && (
                      <div style={{ fontSize:6.5, color:C.muted }}>
                        {new Date(post.publishedAt).toLocaleDateString("fr-MA")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step status */}
                {Object.keys(steps).length > 0 && (
                  <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                    {Object.entries(steps).map(([k,v])=>(
                      <span key={k} style={{ fontSize:7,
                        color:v==="done"?C.green:v==="failed"?C.red:C.muted }}>
                        {k}: {v==="done"?"✓":v==="failed"?"✗":v}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  {renderUrl && (
                    <a href={renderUrl} target="_blank" rel="noopener"
                      style={{ fontSize:7.5, padding:"3px 9px",
                        background:"rgba(139,92,246,0.1)",
                        border:"1px solid rgba(139,92,246,0.3)",
                        borderRadius:5, color:C.purple, textDecoration:"none" }}>
                      🎬 Voir rendu
                    </a>
                  )}
                  {ytUrl ? (
                    <a href={ytUrl} target="_blank" rel="noopener"
                      style={{ fontSize:7.5, padding:"3px 9px",
                        background:"rgba(16,185,129,0.1)",
                        border:"1px solid rgba(16,185,129,0.3)",
                        borderRadius:5, color:C.green, textDecoration:"none" }}>
                      ✅ Voir YouTube
                    </a>
                  ) : (isRend || isPub===false) && renderUrl ? (
                    <button onClick={()=>handlePublish(post.id)}
                      style={{ fontSize:7.5, padding:"3px 9px",
                        background:"rgba(16,185,129,0.12)",
                        border:"1px solid rgba(16,185,129,0.4)",
                        borderRadius:5, color:C.green,
                        cursor:"pointer", fontWeight:700 }}>
                      ▶️ Publier YouTube
                    </button>
                  ) : null}
                  {/* Re-lancer */}
                  {!isPub && renderUrl && (
                    <button onClick={()=>liveIdea && relaunchIdea(post.id)}
                      style={{ fontSize:7.5, padding:"3px 8px",
                        background:"rgba(245,158,11,0.08)",
                        border:"1px solid rgba(245,158,11,0.2)",
                        borderRadius:5, color:C.amber, cursor:"pointer" }}>
                      🔄 Re-lancer
                    </button>
                  )}
                  {/* Supprimer */}
                  <button onClick={()=>deleteIdea(post.id)}
                    style={{ fontSize:7.5, padding:"3px 8px",
                      background:"rgba(239,68,68,0.06)",
                      border:"1px solid rgba(239,68,68,0.15)",
                      borderRadius:5, color:C.red, cursor:"pointer" }}>
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
