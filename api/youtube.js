// ================================================================
//  VERCEL SERVERLESS — YouTube Combined API
//  File: api/youtube.js
// ================================================================

// ── ElevenLabs TTS ──────────────────────────────────────────────
async function handleTTS(body) {
  const { text, language = "FR", voiceId } = body;
  if (!text) return { error: "Missing text" };
  const apiKey = process.env.ELEVENLABS_KEY;
  if (!apiKey) return { error: "ELEVENLABS_KEY not configured" };
  // voiceId is passed directly from agent config (per-language field)
  // No hardcoded fallbacks — agent must configure their voice
  const FALLBACK_VOICES = {
    FR: "pNInz6obpgDQGcFmaJgB",
    AR: "VR6AewLTigWG4xSOukaG",
    EN: "EXAVITQu4vr4xnSDxMaL",
  };
  const normLang = (l) => {
    const u = (l||"fr").toUpperCase();
    if (u.startsWith("AR")) return "AR";
    if (u.startsWith("EN")) return "EN";
    return "FR";
  };
  const lang = normLang(language);
  // Use agent voiceId if provided, else fallback for the detected language
  const resolvedVoiceId = voiceId || FALLBACK_VOICES[lang];
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    }
  );
  if (!response.ok) return { error: `ElevenLabs ${response.status}: ${await response.text()}` };
  const audioBuffer = await response.arrayBuffer();
  return { success: true, audio: Buffer.from(audioBuffer).toString("base64"), mimeType: "audio/mpeg", language, bytes: audioBuffer.byteLength };
}

// ── Shotstack Video Assembly ────────────────────────────────────
async function handleVideo(body) {
  const { scenes, audioBase64, audioUrl, audioDurationSec } = body;
  if (!Array.isArray(scenes) || scenes.length === 0) return { error: "Missing scenes" };

  const apiKey = process.env.SHOTSTACK_KEY;
  const env    = process.env.SHOTSTACK_ENV || "production";
  if (!apiKey) return { error: "SHOTSTACK_KEY not configured" };

  const BASE = env === "production" ? "https://api.shotstack.io/v1" : "https://api.shotstack.io/stage";

  const isUrl   = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
  const isVideo = (u) => isUrl(u) && /\.(mp4|mov|webm)(\?|$)/i.test(u);

  // ── Audio: write base64 to temp KV, serve via /api/kv ──────────
  // Shotstack Assets API does NOT accept data: URIs reliably.
  // Strategy: store in Upstash KV, serve via our own endpoint as mp3.
  let finalAudioUrl = audioUrl || null;
  if (audioBase64 && !finalAudioUrl && process.env.KV_REST_API_URL) {
    try {
      const key = "travito_tmp_audio_" + Date.now();  // underscores - colons break URL params
      const kvSet = await fetch(process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(key) + "?ex=3600", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify({ b64: audioBase64 })),
      });
      if (kvSet.ok) {
        finalAudioUrl = (process.env.APP_URL || "https://travito-agents.vercel.app") + "/api/kv?audio=" + encodeURIComponent(key);
        console.log("Audio stored in KV, served at:", finalAudioUrl.slice(0, 80));
      }
    } catch(e) { console.log("Audio KV store failed:", e.message); }
  }

  // ── Text helpers ───────────────────────────────────────────────
  const ct = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);

  // ── Build clips ─────────────────────────────────────────────────
  // Valid Shotstack v1 title asset fields: type, text, style, color, size, background, position
  // Valid styles: minimal blockbuster vogue sketchy skinny chunk chunkLight marker future
  // Valid sizes: xx-small x-small small medium large x-large xx-large
  // Valid clip positions: top topLeft topRight center centerLeft centerRight bottom bottomLeft bottomRight
  // IMPORTANT: position on title asset is DEPRECATED in some plan levels
  //            Safe approach: put position ONLY on the clip level, NOT inside asset

  const clips = [];
  let T = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc      = scenes[i] || {};
    const dur     = Math.max(2, Number(sc.duration) || 5);
    const clipUrl = sc.clip || sc.mediaUrl || sc.imageUrl || null;
    const isFirst = i === 0;
    const isLast  = i === scenes.length - 1;
    const isOpener = sc.type === "opener" || isFirst;
    const isCta    = sc.type === "cta"    || isLast;

    // Strict text limits - prevent overflow in 9:16 frame
    const centerText   = ct(sc.text,     isOpener || isCta ? 20 : 18);
    const subtitleText = ct(sc.narration, 44);

    // Determine background type
    let bgAsset = null;
    // Detect portrait from scene metadata (passed from YouTubeVideoAgent)
    const assetIsPortrait = sc.isPortrait === true
      || (Number(sc.height) > 0 && Number(sc.width) > 0 && Number(sc.height) > Number(sc.width));

    if (isUrl(clipUrl)) {
      bgAsset = isVideo(clipUrl)
        ? { type: "video", src: clipUrl, trim: 0, volume: 0 }
        : { type: "image", src: clipUrl };
      bgAsset._isPortrait = assetIsPortrait;
      bgAsset._clipUrl    = clipUrl; // keep ref for blurred bg layer
    }

    console.log(JSON.stringify({ seg: i, type: sc.type || "content",
      clip: clipUrl || "FALLBACK", bgType: bgAsset ? bgAsset.type : "fallback",
      dur, centerText, audio: !!finalAudioUrl }));

    // Layer 1: background — portrait=cover (fills frame), landscape=contain+blurred bg
    if (bgAsset) {
      if (!bgAsset._isPortrait) {
        // Landscape/square asset: add blurred background fill FIRST (lower z-index)
        // This fills the 9:16 frame behind the contained asset
        const blurAsset = isVideo(clipUrl)
          ? { type: "video", src: bgAsset._clipUrl, trim: 0, volume: 0 }
          : { type: "image", src: bgAsset._clipUrl };
        clips.push({
          asset:    blurAsset,
          start:    T,
          length:   dur,
          fit:      "cover",   // fill entire 9:16 frame
          filter:   "blur",    // blur the background fill
          opacity:  0.4,       // semi-transparent so it doesn't distract
          position: "center",
        });
      }
      // Strip private tracking fields before sending to Shotstack API
      const { _isPortrait: _p, _clipUrl: _c, ...cleanBgAsset } = bgAsset;
      // Foreground: portrait=cover (fills cleanly), landscape=contain (no stretch)
      const bgClip = {
        asset:    cleanBgAsset,
        start:    T,
        length:   dur,
        fit:      bgAsset._isPortrait ? "cover" : "contain",
        position: "center",
      };
      if (isFirst) bgClip.transition = { in: "fade" };
      if (isLast)  bgClip.transition = { out: "fade" };
      clips.push(bgClip);
    } else {
      // Fallback: use title with space as background (color asset not reliable on all plans)
      clips.push({
        asset: { type: "title", text: " ", style: "minimal", color: "#ffffff", size: "medium",
                 background: isCta ? "#C8972B" : "#0D1B2A" },
        start: T, length: dur,
      });
    }

    // Layers 2, 3, 4 (text overlay, subtitle, watermark) removed — video only

    T += dur;
  }

  const totalDur = Math.round(T * 10) / 10;
  const tracks   = [{ clips }];

  // If audioDurationSec provided from frontend (calculated from ElevenLabs bytes),
  // use it to extend the final segment so video matches audio length.
  // audioDurationSec = bytes / 16000 (128kbps mp3 ≈ 16KB/s)
  const audioDur = (Number(audioDurationSec) || 0) + 0.35;
  let effectiveDur = totalDur;
  if (audioDur > 0 && audioDur > totalDur + 1) {
    // Case A: Audio LONGER than video — extend last content clip
    const deficit = audioDur - totalDur;
    console.log(`Audio longer than video by ${deficit.toFixed(1)}s — extending last segment`);
    for (let ci = clips.length - 1; ci >= 0; ci--) {
      const a = clips[ci].asset;
      if (a.type === "video" || a.type === "image") {
        clips[ci].length = (clips[ci].length || 5) + deficit;
        effectiveDur = audioDur;
        console.log(`Extended clip ${ci} by ${deficit.toFixed(1)}s`);
        break;
      }
    }
  } else if (audioDur > 0 && totalDur > audioDur + 1) {
    // Case B: Video LONGER than audio — trim last clips to match audio
    const excess = totalDur - audioDur;
    console.log(`Video longer than audio by ${excess.toFixed(1)}s — trimming`);
    let remaining = excess;
    for (let ci = clips.length - 1; ci >= 0 && remaining > 0; ci--) {
      const a = clips[ci].asset;
      if (a.type === "video" || a.type === "image") {
        const clipLen = clips[ci].length || 5;
        const canTrim = Math.min(remaining, clipLen - 2); // never below 2s
        if (canTrim > 0) {
          clips[ci].length = clipLen - canTrim;
          remaining -= canTrim;
          console.log(`Trimmed clip ${ci} by ${canTrim.toFixed(1)}s`);
        }
      }
    }
    effectiveDur = audioDur;
  }

  if (finalAudioUrl) {
    tracks.push({ clips: [{ asset: { type: "audio", src: finalAudioUrl, volume: 1 }, start: 0, length: effectiveDur }] });
    console.log("Audio track added:", finalAudioUrl.slice(0, 80));
  } else {
    console.log("No audio — rendering silent. audioBase64 present:", !!audioBase64);
  }

  // Validate before send: strip private fields, check type+src, drop nulls
  const VALID_TYPES = ["video","image","color","title","audio","luma","merge","effect","shape"];
  const NEEDS_SRC   = ["video","image","audio","luma"];
  for (let ci = clips.length - 1; ci >= 0; ci--) {
    const a = clips[ci]?.asset;
    if (!a || !VALID_TYPES.includes(a.type)) {
      return { success: false, error: `Pre-validation: clip ${ci} invalid type: ${a?.type}` };
    }
    // Strip private tracking fields Shotstack rejects
    delete a._isPortrait;
    delete a._clipUrl;
    // Drop clips with null/undefined src — avoid "File not found: undefined"
    if (NEEDS_SRC.includes(a.type) && !a.src) {
      console.log(`Dropping clip ${ci}: type=${a.type} src undefined`);
      clips.splice(ci, 1);
      continue;
    }
    if (a.position !== undefined) {
      console.log(`Removing position from asset on clip ${ci}`);
      delete a.position;
    }
  }
  if (clips.length === 0) return { success: false, error: "No valid clips after validation" };

  const payload = {
    timeline: { tracks },
    output: { format: "mp4", aspectRatio: "9:16", resolution: "hd", fps: 25 },
  };

  console.log(`Shotstack submit: clips=${clips.length} dur=${totalDur}s audio=${!!finalAudioUrl}`);

  const renderRes  = await fetch(BASE + "/render", {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const renderData = await renderRes.json().catch(() => ({}));
  console.log("Shotstack response:", JSON.stringify(renderData).slice(0, 1000));

  if (renderData.success && renderData.response?.id) {
    return { success: true, renderId: renderData.response.id, status: "queued",
             totalDur, clipCount: clips.length, audioIncluded: !!finalAudioUrl };
  }
  return { success: false, error: JSON.stringify(renderData).slice(0, 1000), audioIncluded: !!finalAudioUrl };
}

async function handleStatus(renderId) {
  const apiKey = process.env.SHOTSTACK_KEY;
  const env    = process.env.SHOTSTACK_ENV || "production";
  const base   = env === "production" ? "https://api.shotstack.io/v1" : "https://api.shotstack.io/stage";
  const r = await fetch(`${base}/render/${renderId}`, { headers: { "x-api-key": apiKey } });
  const d = await r.json();
  return { success: true, status: d.response?.status, url: d.response?.url, data: d.response };
}

async function deleteShotstackRender(renderId) {
  if (!renderId) return { success: false, error: "Missing renderId" };

  const apiKey = process.env.SHOTSTACK_KEY;
  const env    = process.env.SHOTSTACK_ENV || "production";
  const base   = env === "production"
    ? "https://api.shotstack.io/v1"
    : "https://api.shotstack.io/stage";

  if (!apiKey) return { success: false, error: "SHOTSTACK_KEY not configured" };

  const r = await fetch(`${base}/render/${renderId}`, {
    method: "DELETE",
    headers: { "x-api-key": apiKey },
  });

  const text = await r.text().catch(() => "");
  console.log("Shotstack delete render:", renderId, r.status, text.slice(0, 300));

  if (!r.ok) {
    return { success: false, error: `Shotstack delete failed: ${r.status} ${text}` };
  }

  return { success: true, renderId };
}


// ── YouTube Publish ────────────────────────────────────────────
async function handlePublish(body) {
  const { videoUrl, title, description, tags = [], language = "FR", isShorts = false, scheduledAt, arabicSummary, pinnedComment } = body;
  if (!videoUrl || !title) return { error: "Missing videoUrl or title" };
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return { error: "YouTube credentials not configured" };

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return { error: "Failed to refresh token: " + JSON.stringify(tokenData) };
  }

  const accessToken = tokenData.access_token;
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) return { error: "Video download failed: " + videoRes.status };
  const videoBuffer = await videoRes.arrayBuffer();
  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": videoBuffer.byteLength },
    body: JSON.stringify({
      snippet: { title: title.substring(0, 100), description: description || "", tags: tags.slice(0, 30), categoryId: "26", defaultLanguage: language === "AR" ? "ar" : language === "EN" ? "en" : "fr" },
      status: { privacyStatus: scheduledAt ? "private" : "public", publishAt: scheduledAt || null, selfDeclaredMadeForKids: false },
    }),
  });
  if (!initRes.ok) return { error: `YouTube init failed: ${await initRes.text()}` };
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) return { error: "No upload URL" };
  const uploadRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": videoBuffer.byteLength }, body: videoBuffer });
  if (!uploadRes.ok) return { error: `Upload failed: ${await uploadRes.text()}` };
  const uploadData = await uploadRes.json();
  const videoId = uploadData.id;
  if ((pinnedComment || arabicSummary) && videoId) {
    try {
      const commentText = arabicSummary ? `${arabicSummary}\n\n${pinnedComment || "اكتشف المزيد على travito.ma 🇲🇦"}` : pinnedComment;
      await fetch("https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: commentText } } } }),
      });
    } catch(e) { console.log("Comment failed:", e.message); }
  }
  return { success: true, videoId, videoUrl: `https://youtube.com/watch?v=${videoId}`, title, language, isShorts };
}

// ── YouTube Learning ───────────────────────────────────────────
async function handleLearn(body) {
  const { topic, agentType, language = "FR", maxVideos = 5 } = body;
  if (!topic) return { error: "Missing topic" };
  const ytApiKey = process.env.YOUTUBE_API_KEY_PUBLIC;
  const insights = { topic, agentType, topVideos: [], titleFormulas: [], bestHooks: [], recommendedStructure: [], topTags: [] };
  if (ytApiKey) {
    const searchQuery = encodeURIComponent(`${topic} maroc morocco`);
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&maxResults=${maxVideos}&order=viewCount&key=${ytApiKey}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const videoIds = searchData.items?.map((v) => v.id?.videoId).filter(Boolean) || [];
      if (videoIds.length > 0) {
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${ytApiKey}`);
        if (detailsRes.ok) {
          const d = await detailsRes.json();
          insights.topVideos = (d.items || []).map((v) => ({ title: v.snippet?.title, views: parseInt(v.statistics?.viewCount || 0, 10), tags: v.snippet?.tags?.slice(0, 8) || [] }));
        }
      }
    }
  }
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 800,
      system: "Expert YouTube strategy Morocco. Analyze top videos and extract patterns for original content.",
      messages: [{ role: "user", content: `Topic: "${topic}" Agent: ${agentType}\nTop videos: ${insights.topVideos.slice(0,3).map(v=>`"${v.title}" (${v.views} views)`).join(", ")}\n\nReturn JSON: {"titleFormulas":["formula with [TOPIC]"],"bestHooks":["hook1","hook2"],"recommendedStructure":["step1","step2"],"topTags":["tag1"],"moroccanAngle":"how to adapt","optimalDurationSecs":180}` }],
    }),
  });
  if (claudeRes.ok) {
    const d = await claudeRes.json();
    const raw = d.content?.[0]?.text || "{}";
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); Object.assign(insights, JSON.parse(raw.substring(s, e+1))); }
    catch(e) { console.log("Analysis parse error:", e.message); }
  }
  if (process.env.KV_REST_API_URL) {
    const key = `travito:yt_insights:${agentType}:${topic.substring(0,40).replace(/\s+/g,"_")}`;
    await fetch(`${process.env.KV_REST_API_URL}/set/${key}?ex=${604800}`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify({ ...insights, savedAt: new Date().toISOString() })),
    });
  }
  return { success: true, insights };
}

// ── Main Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Serve temp audio from KV
  if (req.method === "GET" && req.query?.audio) {
    const audioKey = req.query.audio;
    console.log("Audio serve request for key:", audioKey);
    try {
      const kvUrl = process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(audioKey);
      const kvRes = await fetch(kvUrl, { headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN } });
      const kvData = await kvRes.json();
      console.log("KV audio result present:", !!kvData.result);
      if (kvData.result) {
        const outer = JSON.parse(kvData.result);
        const parsed = typeof outer === "string" ? JSON.parse(outer) : outer;
        const b64 = parsed.b64 || parsed.audio;
        if (!b64) return res.status(404).json({ error: "No b64 field in stored data" });
        const buf = Buffer.from(b64, "base64");
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", buf.length);
        res.setHeader("Cache-Control", "public, max-age=3600");
        console.log("Audio served:", buf.length, "bytes");
        return res.status(200).end(buf);
      }
      return res.status(404).json({ error: "KV key not found: " + audioKey });
    } catch(e) {
      console.log("Audio serve error:", e.message);
      return res.status(500).json({ error: "Audio serve error: " + e.message });
    }
  }

  try {
    if (req.method === "GET") {
      const { action, renderId } = req.query;
      if (action === "status" && renderId) return res.status(200).json(await handleStatus(renderId));
      if (action === "weekly_learn") {
        const agents = ["facts","consumer","skills","top","opps"];
        const agentNames = { facts:"Morocco Facts", consumer:"Smart Consumer", skills:"Skills Life Hacks", top:"Top Rankings Morocco", opps:"Opportunities Business Morocco" };
        const results = {};
        for (const agentId of agents) {
          try {
            const learn = await handleLearn({ topic: agentNames[agentId]+" Maroc", agentType: agentId, language:"fr" });
            if (learn.success && learn.insights?.topVideos?.length > 0) {
              await fetch((process.env.KV_REST_API_URL||"")+"/set/travito:yt_insights:"+agentId, {
                method:"POST", headers:{ Authorization:"Bearer "+(process.env.KV_REST_API_TOKEN||""), "Content-Type":"application/json" },
                body: JSON.stringify({ value: JSON.stringify({ topVideos: learn.insights.topVideos, updatedAt: new Date().toISOString() }) }),
              });
              results[agentId] = learn.insights.topVideos.length+" videos cached";
            } else results[agentId] = "no videos found";
            await new Promise(r => setTimeout(r, 1000));
          } catch(e) { results[agentId] = "error: "+e.message; }
        }
        return res.status(200).json({ success:true, action:"weekly_learn", results });
      }
      return res.status(400).json({ error: "Missing action or renderId" });
    }
    if (req.method === "POST") {
      const { action, ...body } = req.body;
      console.log(`YouTube API action: ${action}`);
      switch (action) {
        case "tts":     return res.status(200).json(await handleTTS(body));
        case "video":   return res.status(200).json(await handleVideo(body));
        case "publish": return res.status(200).json(await handlePublish(body));
        case "learn":   return res.status(200).json(await handleLearn(body));
case "delete_render": {
  const out = await deleteShotstackRender(body.renderId);
  return res.status(200).json(out);
}
        case "delete_source": {
          // Delete a Shotstack source asset (stops storage charges)
          const srcId = body.sourceId;
          if (!srcId) return res.status(400).json({ error: "Missing sourceId" });
          const apiKey2 = process.env.SHOTSTACK_KEY;
          const env2    = process.env.SHOTSTACK_ENV || "production";
          const BASE2   = env2 === "production" ? "https://api.shotstack.io/v1" : "https://api.shotstack.io/stage";
          try {
            const dr = await fetch(`${BASE2}/sources/${srcId}`, {
              method: "DELETE", headers: { "x-api-key": apiKey2 },
            });
            const dt = await dr.text();
            console.log("Source deleted:", srcId, dr.status, dt);
            return res.status(200).json({ success: true, status: dr.status, body: dt });
          } catch(e) {
            return res.status(200).json({ success: false, error: e.message });
          }
        }


case "image_generate_openai_ref": {
const {
  prompt,
  listingId,
  referenceImageUrl,
  outputFormat = "webp",
  fallbackFormat = "jpg",
  size = "auto",
  mode = "edit",
  preserveRatio = true
} = body;

  if (!prompt || !listingId) {
    return res.status(400).json({ error: "Missing prompt or listingId" });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_GPT_IMAGE_MODEL;

  if (!openaiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  if (!openaiModel) {
    return res.status(500).json({ error: "OPENAI_GPT_IMAGE_MODEL not configured" });
  }

  if (!referenceImageUrl) {
    return res.status(400).json({ error: "Missing referenceImageUrl" });
  }

  try {
    console.log("[image_generate_openai_ref][start]", {
      listingId,
      model: openaiModel,
      size,
      outputFormat,
      fallbackFormat,
      mode,
      preserveRatio,
      hasReferenceImageUrl: !!referenceImageUrl
    });

    // Timeout for source image download
    const srcAbort = new AbortController();
    const srcTimer = setTimeout(() => srcAbort.abort(), 15000);

    let srcRes;
    try {
      srcRes = await fetch(referenceImageUrl, { signal: srcAbort.signal });
    } finally {
      clearTimeout(srcTimer);
    }

    if (!srcRes.ok) {
      return res.status(200).json({
        success: false,
        error: `Failed to download source image: ${srcRes.status}`
      });
    }

    const srcBuffer = Buffer.from(await srcRes.arrayBuffer());
    const srcContentType = srcRes.headers.get("content-type") || "image/jpeg";

    const srcExt =
      srcContentType.includes("png") ? "png" :
      srcContentType.includes("webp") ? "webp" :
      "jpg";

    const safeOutputFormat =
      outputFormat === "png" ? "png" :
      outputFormat === "webp" ? "webp" :
      "jpeg";

    const safeSize =
      ["1024x1024", "1024x1536", "1536x1024", "auto"].includes(size)
        ? size
        : "auto";

    const form = new FormData();
    form.append("model", openaiModel);
    form.append("prompt", prompt);
    form.append("size", safeSize);
    form.append("quality", "medium");
    form.append("output_format", safeOutputFormat);
    form.append(
      "image",
      new Blob([srcBuffer], { type: srcContentType }),
      `input.${srcExt}`
    );

    console.log("[image_generate_openai_ref][openai_request]", {
      listingId,
      model: openaiModel,
      size: safeSize,
      quality: "medium",
      outputFormat: safeOutputFormat,
      sourceBytes: srcBuffer.length
    });

    const oaRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`
      },
      body: form
    });

    const oaText = await oaRes.text();

    let oaData;
    try {
      oaData = JSON.parse(oaText);
    } catch (e) {
      return res.status(200).json({
        success: false,
        error: "OpenAI bad JSON: " + oaText.slice(0, 300)
      });
    }

    if (!oaRes.ok) {
      return res.status(200).json({
        success: false,
        error: oaData?.error?.message || "OpenAI image edit failed",
        raw: JSON.stringify(oaData).slice(0, 500)
      });
    }

    const b64 = oaData?.data?.[0]?.b64_json || null;
    if (!b64) {
      return res.status(200).json({
        success: false,
        error: "No b64 image returned from OpenAI",
        raw: JSON.stringify(oaData).slice(0, 500)
      });
    }

    const mimeType =
      safeOutputFormat === "png" ? "image/png" :
      safeOutputFormat === "jpeg" ? "image/jpeg" :
      "image/webp";

    const imageUrl = `data:${mimeType};base64,${b64}`;

    const record = JSON.stringify({
      imageUrl,
      referenceImageUrl: referenceImageUrl || null,
      prompt,
      outputFormat: safeOutputFormat,
      fallbackFormat,
      size: safeSize,
      mode,
      preserveRatio,
      provider: "openai_gpt_image",
      generatedAt: new Date().toISOString()
    });

    console.log("[image_generate_openai_ref][kv_store]", {
      listingId,
      approxBase64Chars: b64.length
    });

    await fetch(
      `${process.env.KV_REST_API_URL}/set/${encodeURIComponent("travito:pm_image:" + listingId)}?ex=864000`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.KV_REST_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(record),
      }
    );

    return res.status(200).json({
      success: true,
      imageUrl,
      prompt,
      referenceImageUrl: referenceImageUrl || null,
      outputFormat: safeOutputFormat,
      fallbackFormat,
      size: safeSize,
      provider: "openai_gpt_image",
      usage: oaData?.usage || null
    });
  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}




        case "image_generate_auto_ref": {
          const { prompt, listingId, referenceImageUrl } = body;
          if (!prompt || !listingId) return res.status(400).json({ error:"Missing prompt or listingId" });
          const falKey = process.env.FAL_KEY;
          if (!falKey) return res.status(500).json({ error:"FAL_KEY not configured" });
          try {
            const finalPrompt = [
              prompt,
              referenceImageUrl ? `Reference image URL: ${referenceImageUrl}` : "",
              "Remove watermark, logo, text overlay, marketplace branding and counters.",
              "Generate a clean realistic marketplace replacement image."
            ].filter(Boolean).join("\n");

            const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
              method:"POST",
              headers:{ "Authorization":`Key ${falKey}`, "Content-Type":"application/json" },
              body: JSON.stringify({
                prompt: finalPrompt,
                image_size:"landscape_16_9",
                num_inference_steps:4,
                num_images:1,
                enable_safety_checker:true,
                output_format:"jpeg",
              }),
            });

            const falText = await falRes.text();
            let falData;
            try { falData = JSON.parse(falText); }
            catch(e) {
              return res.status(200).json({
                success:false,
                error:"fal.ai bad JSON: " + falText.slice(0,200)
              });
            }

            const imageUrl = falData.images?.[0]?.url || null;
            if (!imageUrl) {
              return res.status(200).json({
                success:false,
                error:"No image URL from fal.ai",
                raw: JSON.stringify(falData).slice(0,300)
              });
            }

            const record = JSON.stringify({
              imageUrl,
              referenceImageUrl: referenceImageUrl || null,
              prompt: finalPrompt,
              generatedAt: new Date().toISOString()
            });

            await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent("travito:pm_image:"+listingId)}?ex=864000`, {
              method:"POST",
              headers:{
                "Authorization":`Bearer ${process.env.KV_REST_API_TOKEN}`,
                "Content-Type":"application/json"
              },
              body: JSON.stringify(record),
            });

            return res.status(200).json({
              success:true,
              imageUrl,
              prompt: finalPrompt,
              referenceImageUrl: referenceImageUrl || null
            });
          } catch(e) {
            return res.status(200).json({ success:false, error:e.message });
          }
        }


        // ── PM Image Generation via fal.ai flux-schnell ──────────────
        case "image_generate": {
          const { prompt, listingId } = body;
          if (!prompt || !listingId) return res.status(400).json({ error:"Missing prompt or listingId" });
          const falKey = process.env.FAL_KEY;
          if (!falKey) return res.status(500).json({ error:"FAL_KEY not configured" });
          try {
            // Use synchronous fal.ai endpoint (returns directly, no polling needed)
            const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
              method:"POST",
              headers:{ "Authorization":`Key ${falKey}`, "Content-Type":"application/json" },
              body: JSON.stringify({
                prompt,
                image_size:"landscape_16_9",
                num_inference_steps:4,
                num_images:1,
                enable_safety_checker:true,
                output_format:"jpeg",
              }),
            });
            const falText = await falRes.text();
            let falData;
            try { falData = JSON.parse(falText); }
            catch(e) { return res.status(200).json({ success:false, error:"fal.ai bad JSON: "+falText.slice(0,200) }); }

            const imageUrl = falData.images?.[0]?.url || null;
            if (!imageUrl) return res.status(200).json({ success:false, error:"No image URL from fal.ai", raw:JSON.stringify(falData).slice(0,300) });

            // Store URL in KV with 10-day TTL — URL persists on fal CDN
            const record = JSON.stringify({ imageUrl, generatedAt:new Date().toISOString() });
            await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent("travito:pm_image:"+listingId)}?ex=864000`, {
              method:"POST",
              headers:{ "Authorization":`Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type":"application/json" },
              body: JSON.stringify(record),
            });
            return res.status(200).json({ success:true, imageUrl });
          } catch(e) {
            return res.status(200).json({ success:false, error:e.message });
          }
        }

        // ── PM Image Delete ────────────────────────────────────────────────
        case "image_delete": {
          const { listingId } = body;
          if (!listingId) return res.status(400).json({ error:"Missing listingId" });
          try {
            await fetch(`${process.env.KV_REST_API_URL}/del/${encodeURIComponent("travito:pm_image:"+listingId)}`, {
              method:"POST",
              headers:{ "Authorization":`Bearer ${process.env.KV_REST_API_TOKEN}` },
            });
            return res.status(200).json({ success:true });
          } catch(e) {
            return res.status(200).json({ success:false, error:e.message });
          }
        }

        // ── PM Image Load ──────────────────────────────────────────────────
        case "image_load": {
          const { listingId } = body;
          if (!listingId) return res.status(400).json({ error:"Missing listingId" });
          try {
            const r = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent("travito:pm_image:"+listingId)}`, {
              headers:{ "Authorization":`Bearer ${process.env.KV_REST_API_TOKEN}` },
            });
            const d = await r.json();
            if (!d.result) return res.status(200).json({ success:false, error:"No image found" });
            let parsed = d.result;
            // Unwrap double-encoded JSON safely
            if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch {} }
            if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch {} }
            const imageUrl = parsed?.imageUrl || parsed?.dataUrl || null;
            return res.status(200).json({ success:!!imageUrl, imageUrl });
          } catch(e) {
            return res.status(200).json({ success:false, error:e.message });
          }
        }

        default:        return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("YouTube API error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
