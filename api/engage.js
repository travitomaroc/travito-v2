// ================================================================
//  VERCEL SERVERLESS FUNCTION — Daily Network Engagement Cron
//  File: api/engage.js
//  Actions: likes, follows, reposts, poll, replies, follow-back,
//           hashtag tracking, retweet own top, auto-unfollow
// ================================================================

const APP_URL = process.env.APP_URL || "https://travito-agents.vercel.app";

async function kvGet(key) {
  try {
    const r = await fetch(process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(key), {
      headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN },
    });
    const d = await r.json();
    if (!d.result) return null;
    let val = d.result;
    try { val = JSON.parse(val); } catch {}
    // Unwrap {value: "..."} wrapper from JSON.stringify({value: ...}) saves
    if (val && typeof val === "object" && !Array.isArray(val) && val.value !== undefined) {
      val = val.value;
    }
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  } catch { return null; }
}

// Ensure KV value is always an array regardless of storage format
function safeArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch {}
  }
  return [];
}

async function kvSet(key, value) {
  try {
    await fetch(process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(key), {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(value) }),
    });
  } catch(e) { console.error("KV set error:", e.message); }
}

async function xAction(action, params) {
  const r = await fetch(APP_URL + "/api/tweet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      apiKey:            process.env.X_API_KEY,
      apiSecret:         process.env.X_API_SECRET,
      accessToken:       process.env.X_ACCESS_TOKEN,
      accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
      ...params,
    }),
  });
  return await r.json();
}

async function callClaude(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  return d.content?.[0]?.text || "";
}

async function generatePoll() {
  const themes = ["Immobilier","Automobile","Emploi","Services","Animaux","Electronique"];
  const theme = themes[new Date().getDay() % themes.length];
  const raw = await callClaude(
    "Cree un sondage X pour @TravitoMaroc sur: " + theme + " au Maroc.\n" +
    "Reponds UNIQUEMENT en JSON: {\"question\":\"Question max 200 chars\",\"options\":[\"A\",\"B\",\"C\",\"D\"]}\n" +
    "Options max 25 chars. Pas de politique ni religion."
  );
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON for poll");
  return JSON.parse(raw.substring(s, e+1));
}

export default async function handler(req, res) {
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const isForce      = req.query?.force === "true";
  const cronSecret   = process.env.CRON_SECRET;
  if (!isForce && !isVercelCron && cronSecret && req.headers["authorization"] !== "Bearer " + cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now      = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekStr  = (() => {
    // ISO week — matches NetworkEngager UI format "W15-2026"
    const d = new Date(now); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const w1 = new Date(d.getFullYear(), 0, 4);
    const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
    return `W${String(wk).padStart(2,"0")}-${d.getFullYear()}`;
  })();

  console.log("Engage cron started:", todayStr);

  // ── Load settings ───────────────────────────────────────────────
  const DEFAULT_FORBIDDEN = [
    "war","guerre","weapon","missile","bomb","explosion","strike","attack","attaque",
    "military","army","soldier","drone","tank","israel","palestine","gaza",
    "ukraine","russia","nato","iron dome","hezbollah","hamas","isis","daesh","terroris",
    "killed","mort","dead","victim","massacre","genocide","shooting","fusillade",
    "financial times","ft.com","apartheid","boycott",
  ];

  const settings = await kvGet("travito:ne_settings") || {
    limits: { likes:4, follows:1, reposts:3, pollsPerWeek:1, replies:2, unfollowPerDay:2 },
    hashtags: ["#Maroc","#MarocTech","#emploiMaroc","#immobilierMaroc","#startupMaroc","#MarocBusiness"],
    targetAccounts: ["@AvitoMaroc","@Mubawab_Maroc","@TechInAfrica","@StartupMaroc","@CasablancaCity"],
    safetyThreshold: 60,
    enabled: true,
    forbidden: DEFAULT_FORBIDDEN,
  };

  // Merge: ne_settings.forbidden + global_blacklist (shared across all agents)
  const globalBL = await kvGet("travito:global_blacklist");
  const globalWords = Array.isArray(globalBL?.words) ? globalBL.words : [];
  const baseForbidden = (settings.forbidden?.length > 0) ? settings.forbidden : DEFAULT_FORBIDDEN;
  const forbidden = [...new Set([...baseForbidden, ...globalWords.map(w=>w.toLowerCase())])];
  const limits    = { likes:4, follows:1, reposts:3, pollsPerWeek:1, replies:2, unfollowPerDay:2, ...settings.limits };

  if (!settings.enabled) return res.status(200).json({ success:true, message:"Engagement disabled" });

  const rawQuota = await kvGet("travito:ne_quota") || {};
  console.log("KV quota loaded:", JSON.stringify(rawQuota), "todayStr:", todayStr);
  let quota;
  if (!rawQuota.date || rawQuota.date !== todayStr) {
    // New day — reset all counters
    console.log("Quota reset for new day");
    quota = { date:todayStr, likes:0, follows:0, reposts:0, replies:0, unfollows:0 };
  } else {
    // Same day — carry forward ALL metrics with defaults for any missing fields
    quota = {
      date:      todayStr,
      likes:     rawQuota.likes     || 0,
      follows:   rawQuota.follows   || 0,
      reposts:   rawQuota.reposts   || 0,
      replies:   rawQuota.replies   || 0,
      unfollows: rawQuota.unfollows || 0,
    };
    console.log(`Carry-forward: likes:${quota.likes} follows:${quota.follows} reposts:${quota.reposts} replies:${quota.replies} unfollows:${quota.unfollows}`);
  }

  const rawWeekQuota = await kvGet("travito:ne_week_quota") || {};
  let weekQuota;
  if (!rawWeekQuota.week || rawWeekQuota.week !== weekStr) {
    weekQuota = { week:weekStr, polls:0 };
  } else {
    // Carry forward all weekly counters
    weekQuota = { week:weekStr, polls: rawWeekQuota.polls || 0 };
    console.log(`Week carry-forward: polls:${weekQuota.polls}`);
  }

  const isForbidden = (text) => forbidden.some(w => (text||"").toLowerCase().includes(w.toLowerCase()));

  const results = { likes:[], follows:[], reposts:[], polls:[], replies:[], followBacks:[], unfollows:[], hashtagStats:[], errors:[] };

  // ── 1. LIKES ────────────────────────────────────────────────────
  if (quota.likes < limits.likes) {
    const tolike  = limits.likes - quota.likes;
    // Try multiple hashtags until we find tweets
    const allHashtags = settings.hashtags?.length > 0
      ? settings.hashtags
      : ["#Maroc","#MarocTech","#Casablanca","#emploiMaroc","#startupMaroc"];
    // Shuffle and try each until we get results
    const shuffled = allHashtags.sort(()=>Math.random()-0.5);
    let sr = { tweets: [] };
    let hashtag = shuffled[0];
    for (const ht of shuffled) {
      hashtag = ht;
      const attempt = await xAction("search", {
        query: ht + " -is:retweet lang:fr",
        maxResults: 20
      });
      if ((attempt.tweets||[]).length > 0) { sr = attempt; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    console.log("Likes: searching", hashtag, "→", (sr.tweets||[]).length, "tweets");
    try {
      let liked = 0;
      for (const tw of (sr.tweets||[])) {
        if (liked >= tolike) break;
        if ((tw.text||"").includes("@TravitoMaroc")) continue;
        if (isForbidden(tw.text)) { console.log("Like skip forbidden:", tw.id); continue; }
        const lr = await xAction("like", { tweetId: tw.id });
        if (lr.success) { quota.likes++; liked++; results.likes.push({ tweetId:tw.id }); await new Promise(r=>setTimeout(r,1500)); }
        else results.errors.push({ action:"like", error:lr.error });
      }
      // ── Hashtag performance tracking ─────────────────────────
      results.hashtagStats.push({ hashtag, tweetsFound:(sr.tweets||[]).length, liked });
    } catch(e) { results.errors.push({ action:"like_search", error:e.message }); }
  }

  // ── 2. FOLLOWS ──────────────────────────────────────────────────
  if (quota.follows < limits.follows) {
    const toFollow = limits.follows - quota.follows;
    // Rotate accounts — skip first N based on day to avoid always retrying same accounts
    const allHandles = settings.targetAccounts || [];
    const offset = new Date().getDate() % Math.max(1, allHandles.length);
    const rotated = [...allHandles.slice(offset), ...allHandles.slice(0, offset)];
    const handles = rotated.slice(0, toFollow);
    for (const handle of handles) {
      if (quota.follows >= limits.follows) break;
      try {
        const lu = await xAction("lookupUser", { username: handle.replace("@","") });
        if (lu.success && lu.userId) {
          const fr = await xAction("follow", { targetUserId: lu.userId });
          if (fr.success) {
            quota.follows++;
            results.follows.push({ handle });
            // Track followed accounts for auto-unfollow later
            let followed = safeArray(await kvGet("travito:ne_followed"));
            followed.push({ handle, userId:lu.userId, followedAt:now.toISOString() });
            await kvSet("travito:ne_followed", followed.slice(-500));
            await new Promise(r=>setTimeout(r,2000));
          } else {
            // 400 usually means already following — not a real error
            if ((fr.error||"").includes("400") || (fr.error||"").toLowerCase().includes("already")) {
              console.log("Already following:", handle);
            } else {
              results.errors.push({ action:"follow", handle, error:fr.error });
            }
          }
        }
      } catch(e) { results.errors.push({ action:"follow", handle, error:e.message }); }
    }
  }

  // ── 3. REPOSTS ──────────────────────────────────────────────────
  if (quota.reposts < limits.reposts) {
    const hashtag = (settings.hashtags||["#Maroc"])[0];
    try {
      const sr = await xAction("search", { query: hashtag + " #Maroc -is:retweet -is:reply min_faves:2", maxResults:10 });
      for (const tw of (sr.tweets||[])) {
        if (quota.reposts >= limits.reposts) break;
        if ((tw.text||"").includes("@TravitoMaroc")) continue;
        if (isForbidden(tw.text)) { console.log("Repost skip forbidden:", tw.id); continue; }
        const rr = await xAction("repost", { tweetId: tw.id });
        if (rr.success) { quota.reposts++; results.reposts.push({ tweetId:tw.id }); break; }
      }
    } catch(e) { results.errors.push({ action:"repost", error:e.message }); }
  }

  // ── 4. REPLIES TO MENTIONS ──────────────────────────────────────
  if (quota.replies < limits.replies) {
    try {
      const toReply = limits.replies - quota.replies;
      const mentionsRes = await xAction("search", {
        query: "@TravitoMaroc -is:retweet -from:TravitoMaroc",
        maxResults: 10,
      });
      const replied = safeArray(await kvGet("travito:ne_replied"));
      let replyCount = 0;

      for (const tw of (mentionsRes.tweets||[])) {
        if (replyCount >= toReply) break;
        if (replied.includes(tw.id)) continue;
        if (isForbidden(tw.text)) continue;

        // Generate reply with Claude
        const replyRaw = await callClaude(
          "Tu reponds au nom de TravitoMaroc (marketplace marocain: emploi, immobilier, auto, services)." +
          " Tweet: " + (tw.text||"").substring(0,150) +
          " Redige une reponse courte en francais (<180 chars), amicale, professionnelle." +
          " Mentionne travito.ma si pertinent. Pas de hashtags. Pas de guillemets. Pas de @."
        );
        const replyText = (replyRaw||"").replace(/["'@#]/g,"").trim().substring(0,240);

        if (replyText.length > 10) {
          console.log("Replying to", tw.id, ":", replyText.substring(0,60));
          const rr = await xAction("tweet", { text: replyText, replyToId: tw.id });
          if (rr.success || rr.id) {
            replyCount++;
            quota.replies++;
            replied.push(tw.id);
            results.replies.push({ tweetId:tw.id, reply:replyText.substring(0,60) });
            await kvSet("travito:ne_replied", replied.slice(-200));
            await new Promise(r=>setTimeout(r,3000));
          } else {
            console.log("Reply failed:", rr.error);
            results.errors.push({ action:"reply", tweetId:tw.id, error:rr.error });
          }
        }
      }
    } catch(e) { results.errors.push({ action:"replies", error:e.message }); }
  }

    // ── 5. FOLLOW-BACK ──────────────────────────────────────────────
  // Check recent followers and follow back Moroccan-relevant accounts
  // Note: requires followers lookup — skip if not supported on free tier
  // We use a heuristic: search for accounts that mentioned or liked us recently
  try {
    const fbQuota = await kvGet("travito:ne_fb_quota") || { date:"", count:0 };
    if (fbQuota.date !== todayStr) {
      const fbSearch = await xAction("search", {
        query: "@TravitoMaroc OR #Maroc -is:retweet",
        maxResults: 5,
      });
      let fbCount = 0;
      const fbDone = safeArray(await kvGet("travito:ne_fb_done"));
      for (const tw of (fbSearch.tweets||[])) {
        if (fbCount >= 1) break; // max 1 follow-back per day
        if (!tw.author_id || fbDone.includes(tw.author_id)) continue;
        if ((tw.text||"").includes("TravitoMaroc")) continue; // skip our own
        const fr = await xAction("follow", { targetUserId: tw.author_id });
        if (fr.success) {
          fbCount++;
          fbDone.push(tw.author_id);
          results.followBacks.push({ userId:tw.author_id });
          console.log("Follow-back:", tw.author_id);
          await kvSet("travito:ne_fb_done", fbDone.slice(-500));
        }
      }
      await kvSet("travito:ne_fb_quota", { date:todayStr, count:fbCount });
    }
  } catch(e) { results.errors.push({ action:"follow_back", error:e.message }); }

  // ── 6. RETWEET OWN TOP POSTS ────────────────────────────────────
  // Once a week (Friday), retweet a past high-performing own tweet
  if (now.getDay() === 5) {
    try {
      const retweetDone = await kvGet("travito:ne_retweet_week") || "";
      if (retweetDone !== weekStr) {
        const history = safeArray(await kvGet("travito:x_history"));
        // Pick a random posted article from last 2-3 weeks with a blog URL
        const candidates = history.filter(h => h.status==="posted" && h.tweetUrl && h.tweetId);
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random()*Math.min(candidates.length,10))];
          const rr = await xAction("repost", { tweetId: pick.tweetId });
          if (rr.success) {
            results.reposts.push({ tweetId:pick.tweetId, type:"own_top" });
            await kvSet("travito:ne_retweet_week", weekStr);
            console.log("Retweeted own post:", pick.tweetId);
          }
        }
      }
    } catch(e) { results.errors.push({ action:"retweet_own", error:e.message }); }
  }

  // ── 7. AUTO-UNFOLLOW ────────────────────────────────────────────
  // Unfollow accounts followed >30 days ago (avoids follow/unfollow spam)
  if (quota.unfollows < limits.unfollowPerDay) {
    try {
      let followed = safeArray(await kvGet("travito:ne_followed"));
      const thirtyDaysAgo = Date.now() - 30*24*3600*1000;
      const toUnfollow = followed
        .filter(f => new Date(f.followedAt).getTime() < thirtyDaysAgo)
        .slice(0, limits.unfollowPerDay - quota.unfollows);

      for (const f of toUnfollow) {
        if (quota.unfollows >= limits.unfollowPerDay) break;
        const ur = await xAction("unfollow", { targetUserId: f.userId });
        if (ur.success) {
          quota.unfollows++;
          results.unfollows.push({ handle: f.handle });
          // Remove from followed list
          const updated = followed.filter(x => x.userId !== f.userId);
          await kvSet("travito:ne_followed", updated);
          console.log("Unfollowed:", f.handle);
          await new Promise(r=>setTimeout(r,2000));
        }
      }
    } catch(e) { results.errors.push({ action:"unfollow", error:e.message }); }
  }

// ── 8. WEEKLY POLL ──────────────────────────────────────────────
if (weekQuota.polls < limits.pollsPerWeek && now.getDay() === 1) {
  try {
    const currentIsoWeek = (() => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
      const w1 = new Date(d.getFullYear(), 0, 4);
      const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
      return `W${String(wk).padStart(2, "0")}-${d.getFullYear()}`;
    })();

    const existingPolls = safeArray(await kvGet("travito:ne_polls"));
    const pollLibrary = safeArray(await kvGet("travito:ne_poll_library"));

    // Avoid reposting something already posted this week
    const alreadyPostedThisWeek = existingPolls.find(
      p =>
        (p.status === "posted" || p.status === "published") &&
        p.isoWeek === currentIsoWeek
    );

    if (alreadyPostedThisWeek) {
      console.log("Weekly poll skipped: already posted this week", alreadyPostedThisWeek.question);
    } else {
      // Prefer next active library poll that has not been posted already
      const nextPoll =
        pollLibrary.find(p =>
          p &&
          p.status === "active" &&
          p.question &&
          Array.isArray(p.options) &&
          p.options.filter(Boolean).length >= 2 &&
          !existingPolls.some(ep =>
            (ep.status === "posted" || ep.status === "published") &&
            String(ep.question || "").trim().toLowerCase() === String(p.question || "").trim().toLowerCase()
          )
        ) || null;

      // Fallback to AI generation if library empty or exhausted
      const poll = nextPoll || await generatePoll();

      if (!poll?.question || !Array.isArray(poll?.options) || poll.options.filter(Boolean).length < 2) {
        results.errors.push({ action: "poll", error: "Invalid poll payload" });
      } else {
        const pollRes = await xAction("poll", {
          text: poll.question,
          pollOptions: poll.options,
          pollDuration: settings.pollDuration || 1440
        });

        if (pollRes.success) {
          weekQuota.polls++;
          results.polls.push({ tweetId: pollRes.id, question: poll.question });
          console.log("Poll posted:", pollRes.id);

          const tweetUrl = pollRes.id
            ? `https://twitter.com/TravitoMaroc/status/${pollRes.id}`
            : null;

          // 1) Update ne_polls so NetworkEngager UI can display the posted poll
          try {
            const newEntry = {
              id: nextPoll?.id || pollRes.id || Date.now(),
              tweetId: pollRes.id || null,
              question: poll.question,
              options: poll.options,
              status: "posted",
              postedAt: now.toISOString(),
              isoWeek: currentIsoWeek,
              tweetUrl,
              source: nextPoll ? "library" : "generated",
            };

            // Remove same question / same id duplicates, then prepend
            const deduped = existingPolls.filter(p => {
              const sameId = nextPoll?.id && String(p.id) === String(nextPoll.id);
              const sameQuestion =
                String(p.question || "").trim().toLowerCase() ===
                String(poll.question || "").trim().toLowerCase();
              return !sameId && !sameQuestion;
            });

            await kvSet("travito:ne_polls", [newEntry, ...deduped].slice(0, 52));
          } catch (e) {
            console.log("Poll KV save error:", e.message);
          }

          // 2) Mark library poll as posted so it cannot be reused
          if (nextPoll) {
            try {
              const updatedLibrary = pollLibrary.map(p =>
                String(p.id) === String(nextPoll.id)
                  ? {
                      ...p,
                      status: "posted",
                      postedAt: now.toISOString(),
                      tweetId: pollRes.id || null,
                      tweetUrl,
                      isoWeek: currentIsoWeek,
                    }
                  : p
              );

              await kvSet("travito:ne_poll_library", updatedLibrary);
            } catch (e) {
              console.log("Poll library update error:", e.message);
            }
          }
        } else {
          results.errors.push({ action: "poll", error: pollRes.error || "Poll post failed" });
        }
      }
    }
  } catch (e) {
    results.errors.push({ action: "poll", error: e.message });
  }
}


  // ── 9. WEEKLY HASHTAG REFRESH (Monday) ─────────────────────────
  if (now.getDay() === 1) {
    try {
      const lastHashRefresh = await kvGet("travito:ne_hashtags_updated");
      const hoursSince = lastHashRefresh?.updatedAt
        ? (Date.now() - new Date(lastHashRefresh.updatedAt)) / 3600000
        : 999;

      if (hoursSince > 100) { // ~4 days minimum between refreshes
        console.log("Weekly hashtag refresh...");
        const categories = settings.categories || [
          "Emploi","Immobilier","Auto","Tech","Services","Sport","Food","Mode","Animaux"
        ];
        const prompt = "Generate the best X (Twitter) hashtags for a Moroccan marketplace app (travito.ma) "
          + "covering: " + categories.join(", ") + ". "
          + "Include city hashtags: Casablanca, Rabat, Marrakech, Tanger, Agadir. "
          + "Suggest 3-5 hashtags per category in French, Arabic and English. "
          + 'Return ONLY a JSON array: [{"tag":"#HashTag","category":"Emploi","lang":"FR","type":"niche","priority":1}] '  
          + "Priority 1=very relevant, 2=relevant. No markdown, no explanation.";

        const raw = await callClaude(prompt);
        const s = raw.indexOf("["), e = raw.lastIndexOf("]");
        if (s !== -1) {
          const suggestions = JSON.parse(raw.substring(s, e+1));
          // Load existing hashtag list from KV
          const existing = (await kvGet("travito:ne_hashtag_list")) || [];
          const existingTags = new Set(existing.map(h => h.tag.toLowerCase()));
          const newOnes = suggestions
            .filter(h => h.tag && !existingTags.has(h.tag.toLowerCase()))
            .map((h, i) => ({
              id: Date.now() + i,
              tag: h.tag,
              type: h.type || "niche",
              lang: h.lang || "FR",
              category: h.category || "all",
              active: true,
              priority: h.priority || 2,
              score: 0,
            }));
          const updated = [...existing, ...newOnes];
          await kvSet("travito:ne_hashtag_list", updated);
          await kvSet("travito:ne_hashtags_updated", { updatedAt: now.toISOString(), newCount: newOnes.length });
          console.log("Hashtag refresh: added", newOnes.length, "new hashtags, total:", updated.length);
          results.hashtagStats.push({ type:"weekly_refresh", newHashtags: newOnes.length });
        }
      }
    } catch(e) {
      results.errors.push({ action:"hashtag_refresh", error:e.message });
    }
  }

  // ── Save activity log to KV ─────────────────────────────────────
  try {
    const actLog = (await kvGet("travito:ne_activity_log")) || [];
    const newEntries = [];
    const ts = now.toISOString();

    results.likes.forEach(r    => newEntries.push({ ts, timestamp:ts, action:"LIKE",       target:r.tweetId,   source:"cron" }));
    results.follows.forEach(r  => newEntries.push({ ts, timestamp:ts, action:"FOLLOW",     target:r.handle,    source:"cron" }));
    results.reposts.forEach(r  => newEntries.push({ ts, timestamp:ts, action:"REPOST",     target:r.tweetId,   source:"cron" }));
    results.replies.forEach(r  => newEntries.push({ ts, timestamp:ts, action:"REPLY",      target:r.reply,     source:"cron" }));
    results.followBacks.forEach(r=>newEntries.push({ ts, timestamp:ts, action:"FOLLOWBACK", target:r.userId,   source:"cron" }));
    results.unfollows.forEach(r=> newEntries.push({ ts, timestamp:ts, action:"UNFOLLOW",   target:r.handle,    source:"cron" }));
    results.polls.forEach(r    => newEntries.push({ ts, timestamp:ts, action:"POLL",       target:r.question,  source:"cron" }));

    if (newEntries.length > 0) {
      const updated = [...newEntries, ...actLog].slice(0, 500);
      await kvSet("travito:ne_activity_log", updated);
      console.log("Activity log: saved", newEntries.length, "entries");
    }
  } catch(e) { console.log("Activity log error:", e.message); }

  // ── Account discovery (Wednesday) ────────────────────────────────
  if (now.getDay() === 3) {
    try {
      const lastDisc = await kvGet("travito:ne_account_discovery");
      const hoursSince = lastDisc?.updatedAt ? (Date.now()-new Date(lastDisc.updatedAt))/3600000 : 999;

      if (hoursSince > 100) {
        console.log("Weekly account discovery...");
        const categories = settings.categories || ["Emploi","Immobilier","Auto","Tech","Services"];

        const prompt = "Find the best Moroccan X (Twitter) accounts to follow for a Moroccan marketplace (travito.ma) "
          + "covering: " + categories.join(", ") + ". "
          + "Focus on: Moroccan businesses, job boards, real estate, automotive, tech influencers, city accounts. "
          + "Return ONLY a JSON array of max 10 accounts: "
          + '[{"handle":"@AccountName","label":"competitor","category":"Emploi","reason":"why relevant"}] '  
          + "Labels: partner|competitor|influencer|media|marketplace. No markdown.";

        const raw = await callClaude(prompt);
        const s = raw.indexOf("["), e = raw.lastIndexOf("]");
        if (s !== -1) {
          const discovered = JSON.parse(raw.substring(s, e+1));
          // Load existing accounts
          const existing = (await kvGet("travito:ne_accounts")) || [];
          const existingHandles = new Set(existing.map(a => (a.handle||"").toLowerCase()));
          const newAccounts = discovered
            .filter(a => a.handle && !existingHandles.has(a.handle.toLowerCase()))
            .map((a, i) => ({
              id: Date.now()+i, handle: a.handle,
              label: a.label||"unknown", category: a.category||"all",
              trusted: true, active: true,
              discoveredAt: now.toISOString(), reason: a.reason||"",
              source: "ai_discovery",
            }));
          const updated = [...existing, ...newAccounts];
          await kvSet("travito:ne_accounts", updated);
          await kvSet("travito:ne_account_discovery", { updatedAt:now.toISOString(), newCount:newAccounts.length });

          // Also update targetAccounts in settings for follow actions
          const activeHandles = updated.filter(a=>a.active&&a.trusted).map(a=>a.handle);
          settings.targetAccounts = activeHandles;
          await kvSet("travito:ne_settings", settings);

          console.log("Account discovery: added", newAccounts.length, "accounts, total:", updated.length);
        }
      }
    } catch(e) { results.errors.push({ action:"account_discovery", error:e.message }); }
  }

  // ── Save hashtag performance ─────────────────────────────────────
  if (results.hashtagStats.length > 0) {
    try {
      const hperf = (await kvGet("travito:ne_hashtag_perf")) || {};
      for (const hs of results.hashtagStats) {
        if (!hperf[hs.hashtag]) hperf[hs.hashtag] = { searches:0, tweetsFound:0, liked:0 };
        hperf[hs.hashtag].searches++;
        hperf[hs.hashtag].tweetsFound += hs.tweetsFound;
        hperf[hs.hashtag].liked += hs.liked;
        hperf[hs.hashtag].lastUsed = now.toISOString();
      }
      await kvSet("travito:ne_hashtag_perf", hperf);
    } catch {}
  }

  // ── Save quotas + stats ─────────────────────────────────────────
  await kvSet("travito:ne_quota", quota);
  await kvSet("travito:ne_week_quota", weekQuota);

  try {
    const stats = (await kvGet("travito:stats")) || {};
    stats.lastEngagement = now.toISOString();
    stats.totalLikes     = (stats.totalLikes    ||0) + results.likes.length;
    stats.totalFollows   = (stats.totalFollows  ||0) + results.follows.length + results.followBacks.length;
    stats.totalReposts   = (stats.totalReposts  ||0) + results.reposts.length;
    stats.totalPolls     = (stats.totalPolls    ||0) + results.polls.length;
    stats.totalReplies   = (stats.totalReplies  ||0) + results.replies.length;
    stats.totalUnfollows = (stats.totalUnfollows||0) + results.unfollows.length;
    await kvSet("travito:stats", stats);
  } catch {}

  console.log("Engage complete:", JSON.stringify({
    likes:results.likes.length, follows:results.follows.length,
    reposts:results.reposts.length, polls:results.polls.length,
    replies:results.replies.length, followBacks:results.followBacks.length,
    unfollows:results.unfollows.length, errors:results.errors.length,
  }));

  return res.status(200).json({
    success: true,
    date: todayStr,
    quota, weekQuota, results,
    summary: {
      likes:results.likes.length, follows:results.follows.length,
      reposts:results.reposts.length, polls:results.polls.length,
      replies:results.replies.length, followBacks:results.followBacks.length,
      unfollows:results.unfollows.length, errors:results.errors.length,
    },
  });
}
