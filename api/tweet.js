// ================================================================
//  VERCEL SERVERLESS FUNCTION — X/Twitter Proxy
//  Supports: post tweet, like, follow, repost, poll
// ================================================================
import { TwitterApi } from "twitter-api-v2";
function makeClient(body) {
  return new TwitterApi({
    appKey:    body.apiKey,
    appSecret: body.apiSecret,
    accessToken:  body.accessToken,
    accessSecret: body.accessTokenSecret,
  });
}
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });
  const body = req.body;
  const action = body.action || "tweet";
  const requiredKeys = ["apiKey","apiSecret","accessToken","accessTokenSecret"];
  for (const k of requiredKeys) {
    if (!body[k]) return res.status(400).json({ error: "Missing: " + k });
  }
  try {
    const client = makeClient(body);
    // ── LIKE ──────────────────────────────────────────────────
    if (action === "like") {
      if (!body.tweetId) return res.status(400).json({ error: "Missing tweetId" });
      const me = await client.v2.me();
      await client.v2.like(me.data.id, body.tweetId);
      return res.status(200).json({ success: true, action: "like", tweetId: body.tweetId });
    }
    // ── FOLLOW ────────────────────────────────────────────────
    if (action === "follow") {
      if (!body.targetUserId) return res.status(400).json({ error: "Missing targetUserId" });
      const me = await client.v2.me();
      await client.v2.follow(me.data.id, body.targetUserId);
      return res.status(200).json({ success: true, action: "follow", targetUserId: body.targetUserId });
    }
    // ── UNFOLLOW ──────────────────────────────────────────────
    if (action === "unfollow") {
      if (!body.targetUserId) return res.status(400).json({ error: "Missing targetUserId" });
      const meU = await client.v2.me();
      await client.v2.unfollow(meU.data.id, body.targetUserId);
      return res.status(200).json({ success: true, action: "unfollow", targetUserId: body.targetUserId });
    }
    // ── REPOST ────────────────────────────────────────────────
    if (action === "repost") {
      if (!body.tweetId) return res.status(400).json({ error: "Missing tweetId" });
      const me = await client.v2.me();
      await client.v2.retweet(me.data.id, body.tweetId);
      return res.status(200).json({ success: true, action: "repost", tweetId: body.tweetId });
    }
    // ── SEARCH TWEETS ─────────────────────────────────────────
    if (action === "search") {
      if (!body.query) return res.status(400).json({ error: "Missing query" });
      const results = await client.v2.search(body.query, {
        max_results: body.maxResults || 10,
        "tweet.fields": ["author_id","created_at","lang","public_metrics"],
      });
      return res.status(200).json({ success: true, tweets: results.data?.data || [] });
    }
    // ── USER LOOKUP ───────────────────────────────────────────
    if (action === "lookupUser") {
      if (!body.username) return res.status(400).json({ error: "Missing username" });
      const handle = body.username.replace("@", "");
      const user = await client.v2.userByUsername(handle);
      return res.status(200).json({ success: true, userId: user.data?.id, username: user.data?.username });
    }
    // ── REPLY ─────────────────────────────────────────────────
    if (action === "reply") {
      if (!body.tweetId || !body.text) return res.status(400).json({ error: "Missing tweetId or text" });
      const reply = await client.v2.tweet({
        text: body.text.substring(0, 275),
        reply: { in_reply_to_tweet_id: body.tweetId },
      });
      return res.status(200).json({ success: true, action: "reply", id: reply.data.id,
        tweetId: reply.data.id, text: reply.data.text });
    }
    // ── POLL TWEET ────────────────────────────────────────────
    if (action === "poll") {
      if (!body.text || !body.pollOptions) return res.status(400).json({ error: "Missing text or pollOptions" });
      // X API: options max 25 chars each, 2-4 options, duration 5-10080 minutes
      const options = body.pollOptions
        .slice(0, 4)
        .map(o => String(o).trim().substring(0, 25))
        .filter(o => o.length > 0);
      if (options.length < 2) return res.status(400).json({ error: "Poll needs at least 2 options" });
      const duration = Math.min(10080, Math.max(5, Number(body.pollDuration) || 1440));
      const tweetParams = {
        text: body.text.substring(0, 240),
        poll: { options, duration_minutes: duration },
      };
      console.log("Poll params:", JSON.stringify({ text: tweetParams.text.substring(0,50), options, duration }));
      const tweet = await client.v2.tweet(tweetParams);
      return res.status(200).json({ success: true, action: "poll", id: tweet.data.id, text: tweet.data.text });
    }
    // ── TWEET (default) ───────────────────────────────────────
    const { text, replyToId, imageUrl } = body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    let mediaId = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Travito/1.0)", "Referer": "https://www.pexels.com/" },
        });
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const mimeType  = imgRes.headers.get("content-type") || "image/jpeg";
          mediaId = await client.v1.uploadMedia(imgBuffer, { mimeType });
        }
      } catch (e) { console.error("Image upload:", e.message); }
    }
    const tweetParams = {
      text: text.substring(0, 275),
      ...(replyToId ? { reply: { in_reply_to_tweet_id: replyToId } } : {}),
      ...(mediaId   ? { media: { media_ids: [mediaId] } }            : {}),
    };
    const tweet = await client.v2.tweet(tweetParams);
    return res.status(200).json({
      success: true, id: tweet.data.id,
      tweetId: tweet.data.id,
      tweetUrl: "https://x.com/TravitoMaroc/status/" + tweet.data.id,
      text: tweet.data.text, hasImage: !!mediaId,
    });
  } catch (error) {
    console.error("Tweet error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
