// ================================================================
//  VERCEL SERVERLESS — KV Combined API
//  File: api/kv.js
// ================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=3600");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── ONE-TIME BACKFILL ──────────────────────────────────
  if (req.method === "GET" && req.query?.action === "backfill_x_history") {
    try {
      if (!process.env.KV_REST_API_URL) return res.status(500).json({ error: "KV not configured" });
      const headers = { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN };
      const scanRes = await fetch(process.env.KV_REST_API_URL + "/scan/0/match/travito%3Aposts%3Ax%3A*/count/200", { method: "GET", headers });
      const scanData = await scanRes.json();
      let keys = [];
      if (Array.isArray(scanData?.result)) {
        keys = Array.isArray(scanData.result[1]) ? scanData.result[1] : [];
      }
      if (keys.length === 0) {
        return res.status(200).json({ success: true, message: "No post keys found", count: 0 });
      }
      const entries = [];
      for (const key of keys) {
        try {
          const r = await fetch(process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(key), { headers });
          const d = await r.json();
          if (!d.result) continue;
          let val = d.result;
          if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
          if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
          if (!val || !val.topic) continue;
          const keyParts = key.split(":");
          const dateStr  = keyParts[3] || val.postedAt?.split("T")[0] || "";
          const d2       = dateStr ? new Date(dateStr) : new Date(val.postedAt || Date.now());
          const weekNum  = Math.ceil(d2.getDate() / 7);
          const weekKey  = "W" + weekNum + "-" + d2.getFullYear();
          const dayName  = d2.toLocaleDateString("fr-FR", { weekday: "long" });
          const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          entries.push({
            id: val.id || parseInt(keyParts[4]) || Date.now(),
            day: dayLabel, topic: val.topic || "Post X", theme: val.theme || "lifestyle",
            icon: "🤖", content: val.content || "", xPost: null,
            qualityPercent: val.quality || null,
            status: val.tweetUrl ? "posted" : "approved",
            postedAt: val.postedAt || d2.toISOString(),
            createdAt: val.postedAt || d2.toISOString(),
            blogUrl: val.blogUrl || null, tweetUrl: val.tweetUrl || null,
            weekKey, source: "backfill",
          });
        } catch(e) { console.log("Key error:", key, e.message); }
      }
      entries.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      const histRes  = await fetch(process.env.KV_REST_API_URL + "/get/travito:x_history", { headers });
      const histData = await histRes.json();
      let existing = [];
      if (histData.result) {
        try {
          existing = JSON.parse(typeof histData.result === "string" ? histData.result : JSON.stringify(histData.result));
          if (!Array.isArray(existing)) existing = [];
        } catch {}
      }
      const merged = [...entries, ...existing].reduce((acc, a) => {
        if (!acc.find(x => String(x.id) === String(a.id))) acc.push(a);
        return acc;
      }, []).slice(0, 500);
      await fetch(process.env.KV_REST_API_URL + "/set/travito:x_history", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify(merged)),
      });
      return res.status(200).json({ success: true, message: "Backfill complete", newEntries: entries.length, totalInHistory: merged.length });
    } catch(e) {
      return res.status(500).json({ error: "Backfill failed: " + e.message });
    }
  }

  // ── SERVE TEMP AUDIO ──────────────────────────────────
if (req.query?.audio) {
  const audioKey = req.query.audio;
  try {
    const kvUrl = process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(audioKey);
    const kvRes = await fetch(kvUrl, {
      headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN },
    });
    const kvData = await kvRes.json();

    if (kvData.result) {
      let outer = kvData.result;
      try { outer = JSON.parse(outer); } catch {}

      let parsed = outer;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch {}
      }

      const b64 = parsed?.b64 || parsed?.audio;
console.log("AUDIO SERVE BAD PAYLOAD", audioKey, typeof parsed, parsed && Object.keys(parsed || {}));
      if (!b64) {
        return res.status(404).json({ error: "Audio payload missing b64/audio" });
      }

      const audioBuffer = Buffer.from(b64, "base64");
      res.setHeader("Content-Type", parsed?.mime || "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.setHeader("Cache-Control", "public, max-age=3600");
console.log("AUDIO SERVE OK", audioKey, parsed?.mime || "audio/mpeg", audioBuffer.length);
      return res.status(200).end(audioBuffer);
    }
  } catch (e) {
    return res.status(404).json({ error: "Audio not found: " + e.message });
  }
  return res.status(404).json({ error: "Audio key not found" });
}

    // ── PEXELS MEDIA SEARCH ───────────────────────────────
  if (req.query?.action === "pexels" || req.query?.pexels || req.query?.service === "pexels") {
    const query = req.query.query || req.query.q || "Morocco";
    const format = (req.query.format || "").toLowerCase();
    const apiKey = process.env.PEXELS_KEY;
    if (!apiKey) return res.status(500).json({ error: "PEXELS_KEY not configured" });

    const pickBestVideoFile = (files = []) => {
      if (!files.length) return null;
      const sorted = [...files].sort(
        (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
      );
      return sorted.find(f => (f.height || 0) > (f.width || 0)) || sorted[0] || null;
    };

    const pickBestPhoto = (photo) => {
      if (!photo?.src) return null;
      return {
        imageUrl: photo.src.portrait || photo.src.large2x || photo.src.large || photo.src.original || null,
        imageSmall: photo.src.medium || photo.src.small || null,
      };
    };

    try {
      // ── YOUTUBE / SHORTS MODE: video first ─────────────────
      if (format === "shorts") {
        const vr = await fetch(
          "https://api.pexels.com/videos/search?query=" +
            encodeURIComponent(query) +
            "&per_page=8&orientation=portrait&size=medium",
          { headers: { Authorization: apiKey } }
        );

        if (vr.ok) {
          const vd = await vr.json();
          const video = (vd.videos || []).find(v => (v.height || 0) > (v.width || 0));
          if (video) {
            const best = pickBestVideoFile(video.video_files || []);
            if (best?.link) {
              return res.status(200).json({
                mediaType: "video",
                videoUrl: best.link,
                imageUrl: video.image || null,
                width: best.width || video.width || null,
                height: best.height || video.height || null,
                duration: video.duration || null,
                pexelsUrl: video.url || null,
                isPortrait: true,
                fallback: false,
              });
            }
          }
        }

        // fallback to portrait photo for shorts if no video
        const pr = await fetch(
          "https://api.pexels.com/v1/search?query=" +
            encodeURIComponent(query) +
            "&per_page=6&orientation=portrait&size=large",
          { headers: { Authorization: apiKey } }
        );

        if (pr.ok) {
          const pd = await pr.json();
          const photo = (pd.photos || []).find(p => (p.height || 0) > (p.width || 0)) || pd.photos?.[0];
          if (photo) {
            const best = pickBestPhoto(photo);
            return res.status(200).json({
              mediaType: "image",
              imageUrl: best.imageUrl,
              imageSmall: best.imageSmall,
              photographer: photo.photographer || null,
              pexelsUrl: photo.url || null,
              width: photo.width || null,
              height: photo.height || null,
              isPortrait: (photo.height || 0) > (photo.width || 0),
              fallback: false,
            });
          }
        }
      }

      // ── DEFAULT / X-TWITTER MODE: image first ─────────────
      const page = Number(req.query.page || 1);
      const url =
        "https://api.pexels.com/v1/search?query=" +
        encodeURIComponent(query) +
        "&per_page=5&orientation=landscape&size=medium&page=" + page;

      const r = await fetch(url, { headers: { Authorization: apiKey } });
      if (!r.ok) return res.status(r.status).json({ error: "Pexels: " + r.status });

      const d = await r.json();
      if (!d.photos?.length) {
        const fb = await fetch(
          "https://api.pexels.com/v1/search?query=Morocco+lifestyle+city&per_page=3&orientation=landscape&page=" + page,
          { headers: { Authorization: apiKey } }
        );
        const fbd = await fb.json();
        const p = fbd.photos?.[0];
        return res.status(200).json({
          mediaType: "image",
          imageUrl: p?.src?.large || null,
          imageSmall: p?.src?.medium || null,
          photographer: p?.photographer || null,
          photoId: p?.id || null,
          fallback: true,
        });
      }

      const photo = d.photos[0];
      return res.status(200).json({
        mediaType: "image",
        imageUrl: photo.src.large,
        imageSmall: photo.src.medium,
        photographer: photo.photographer,
        pexelsUrl: photo.url,
        photoId: photo.id || null,
        fallback: false,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }


// ── FETCH RAW HTML — full source (no transformation) ──────────
if (req.method === "GET" && req.query?.action === "fetch_raw" && req.query?.url) {
  const targetUrl = req.query.url;

  try {
    const r = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-MA,fr;q=0.9,ar;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });

    const html = await r.text();

    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      finalUrl: r.url,
      html,
      length: html.length,
    });

  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e.message,
      html: "",
      length: 0,
    });
  }
}


  // ── FETCH URL — server-side page fetch (bypasses CORS) ───────
  if (req.method === "GET" && req.query?.action === "fetch_url" && req.query?.url) {
    const targetUrl = req.query.url;
    try {
      const r = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-MA,fr;q=0.9,ar;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
      });
      if(!r.ok) return res.status(200).json({ success: false, html: "", error: "HTTP " + r.status });
      const html = await r.text();
      // Strip scripts, styles, nav to reduce size — keep text content
      const clean = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s{3,}/g, " ")
        .trim()
        .slice(0, 12000); // limit to 12k chars
      return res.status(200).json({ success: true, html: clean });
    } catch(e) {
      return res.status(200).json({ success: false, html: "", error: e.message });
    }
  }

  // ── FETCH URL (server-side proxy to bypass CORS) ────────
  if (req.method === "GET" && req.query?.action === "fetch_url") {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "Missing url param" });
    try {
      const r = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7",
          "Referer": "https://www.google.com/",
        },
        redirect: "follow",
      });
      if (!r.ok) return res.status(200).json({ success: false, html: "", status: r.status });
      const html = await r.text();
      // Return up to 15000 chars to stay within Claude context
      return res.status(200).json({ success: true, html: html.slice(0, 15000), status: r.status });
    } catch(e) {
      return res.status(200).json({ success: false, html: "", error: e.message });
    }
  }

  if (!process.env.KV_REST_API_URL) {
    return res.status(200).json({ success: false, error: "KV not configured" });
  }

  const kvGet = async (key) => {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    if (!d.result) return null;
    let val = d.result;
    try { val = JSON.parse(val); } catch {}
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  };

  const kvSet = async (key, value, ex = null) => {
    const url = ex ? `${process.env.KV_REST_API_URL}/set/${key}?ex=${ex}` : `${process.env.KV_REST_API_URL}/set/${key}`;
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify(value)),
    });
  };

  try {
    // ── LIST posts for audit ──────────────────────────────
    if (req.method === "GET" && req.query.action === "list_posts") {
      const { platform = "x", date } = req.query;
      try {
        const histKey = platform === "x" ? "travito:x_history" : "travito:"+platform+"_history";
        const r = await fetch(process.env.KV_REST_API_URL+"/get/"+encodeURIComponent(histKey), {
          headers: { Authorization: "Bearer "+process.env.KV_REST_API_TOKEN },
        });
        const d = await r.json();
        let posts = [];
        if (d.result) {
          try {
            let val = d.result;
            if (typeof val === "string") val = JSON.parse(val);
            if (typeof val === "string") val = JSON.parse(val);
            posts = Array.isArray(val) ? val : [];
          } catch {}
        }
        if (date) posts = posts.filter(p => (p.postedAt||p.createdAt||"").startsWith(date));
        posts = posts.sort((a,b)=>new Date(b.postedAt||b.createdAt)-new Date(a.postedAt||a.createdAt));
        return res.status(200).json({ success: true, posts: posts.slice(0,100) });
      } catch(e) {
        return res.status(500).json({ success:false, error: e.message });
      }
    }

    // ── MARK post as audited ──────────────────────────────
    if (req.method === "POST" && req.body?.action === "audit_post") {
      const { postKey, audited = true } = req.body;
      if (!postKey) return res.status(400).json({ error: "Missing postKey" });
      const getR = await fetch(`${process.env.KV_REST_API_URL}/get/${postKey}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const getData = await getR.json();
      if (!getData.result) return res.status(404).json({ error: "Post not found" });
      const post = JSON.parse(getData.result);
      post.audited = audited;
      post.auditedAt = new Date().toISOString();
      await fetch(`${process.env.KV_REST_API_URL}/set/${postKey}?ex=${90*24*3600}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify(post)),
      });
      return res.status(200).json({ success: true, post });
    }

    // ── SAVE post (from browser agents) ──────────────────
    if (req.method === "POST" && req.body?.action === "save_post") {
      const { platform, agent, topic, content: postContent, tweetUrl, postedAt } = req.body;
      const postKey = `travito:posts:${platform}:${new Date(postedAt||Date.now()).toISOString().split("T")[0]}:${Date.now()}`;
      await fetch(`${process.env.KV_REST_API_URL}/set/${postKey}?ex=${90*24*3600}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify({
          id: Date.now().toString(), platform, agent, topic,
          content: postContent?.substring(0,500),
          tweetUrl, postedAt: postedAt || new Date().toISOString(),
          audited: false, auditedAt: null,
        })),
      });
      return res.status(200).json({ success: true, postKey });
    }

    // ── GET — read any key ────────────────────────────────
    if (req.method === "GET") {
      const { key = "travito:dynamic_config" } = req.query;
      const data = await kvGet(key);
      if (!data) return res.status(200).json({ success: false, error: "No data found", config: null });
      return res.status(200).json({ success: true, config: data });
    }

    // ── POST — generic key/value save ────────────────────
    if (req.method === "POST" && req.body?.key && req.body?.value !== undefined && !req.body?.action) {
      const { key, value } = req.body;
      await fetch(process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(key), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      });
      return res.status(200).json({ success: true, key });
    }

    // ── POST — save performance data ──────────────────────
    if (req.method === "POST") {
      const { topic, theme, qualityPercent, status, postedAt, weekKey } = req.body;
      const existing = await kvGet("travito:performance") || {
        articles: [], qualityAvg: {}, topTheme: null, weakAreas: [],
      };
      existing.articles = [
        { topic, theme, qualityPercent, status, postedAt, weekKey, savedAt: new Date().toISOString() },
        ...(existing.articles || []),
      ].slice(0, 200);
      const recent = existing.articles.slice(0, 50).filter(a => a.qualityPercent);
      if (recent.length > 0) {
        existing.qualityAvg.overall = Math.round(recent.reduce((s, a) => s + a.qualityPercent, 0) / recent.length);
        const themes = [...new Set(recent.map(a => a.theme).filter(Boolean))];
        for (const t of themes) {
          const ta = recent.filter(a => a.theme === t);
          existing.qualityAvg[t] = Math.round(ta.reduce((s, a) => s + a.qualityPercent, 0) / ta.length);
        }
        existing.topTheme  = themes.sort((a, b) => (existing.qualityAvg[b] || 0) - (existing.qualityAvg[a] || 0))[0] || null;
        existing.weakAreas = themes.filter(t => (existing.qualityAvg[t] || 100) < 80);
      }
      existing.lastUpdated = new Date().toISOString();
      await kvSet("travito:performance", existing);
      return res.status(200).json({ success: true, qualityAvg: existing.qualityAvg, topTheme: existing.topTheme, total: existing.articles.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch(error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
