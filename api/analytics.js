// ================================================================
//  api/analytics.js — Unified Analytics Engine
//  Collects: X/Twitter metrics + YouTube stats + Content quality
//  Runs: Weekly Monday 07:00 UTC | On-demand from dashboard
//  Saves to: travito:analytics_data (KV, 8-day TTL)
// ================================================================

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const d = await r.json();
    if (!d.result) return null;
    let val = d.result;
    try { val = JSON.parse(val); } catch {}
    if (val && typeof val === "object" && !Array.isArray(val) && val.value !== undefined) val = val.value;
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  } catch { return null; }
}

async function kvSet(key, value, ex = null) {
  const url = ex ? `${KV_URL}/set/${encodeURIComponent(key)}?ex=${ex}` : `${KV_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

// ── ISO week helper ───────────────────────────────────────────
function getISOWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2,"0")}`;
}

// ── Save weekly history snapshot ───────────────────────────────
async function saveHistorySnapshot(analyticsResult) {
  const weekKey = getISOWeek();
  const snapshotKey = `travito:analytics_history:${weekKey}`;

  // Compact snapshot — only what matters for trend charts
  const snapshot = {
    week:        weekKey,
    savedAt:     new Date().toISOString(),
    // Account (User)
    followers:   analyticsResult.x?.followers,
    following:   analyticsResult.x?.following,
    tweetCount:  analyticsResult.x?.tweetCount,
    followerDelta: analyticsResult.x?.followerDelta,
    // Received metrics (what others did to our posts)
    impressions: analyticsResult.x?.received?.impressions,
    likes:       analyticsResult.x?.received?.likes,
    reposts:     analyticsResult.x?.received?.reposts,
    replies:     analyticsResult.x?.received?.replies,
    quotes:      analyticsResult.x?.received?.quotes,
    bookmarks:   analyticsResult.x?.received?.bookmarks,
    engRate:     analyticsResult.x?.engagementRate,
    posts30d:    analyticsResult.x?.posts30d,
    postsCount:  analyticsResult.x?.postsAnalyzed,
    // Activity WE performed (Like, Follow, Repost, Reply given)
    likesGiven:    analyticsResult.x?.activity?.likesGiven,
    followsGiven:  analyticsResult.x?.activity?.followsGiven,
    repostsGiven:  analyticsResult.x?.activity?.repostsGiven,
    repliesGiven:  analyticsResult.x?.activity?.repliesGiven,
    unfollowsDone: analyticsResult.x?.activity?.unfollowsDone,
    pollsCreated:  analyticsResult.x?.activity?.pollsCreated,
    // SEO metrics
    scClicks:    analyticsResult.seo?.clicks,
    scImpr:      analyticsResult.seo?.impressions,
    ga4Sessions: analyticsResult.seo?.sessions,
    ga4Users:    analyticsResult.seo?.users,
    indexed:     analyticsResult.seo?.indexed,
    coverageRate:analyticsResult.seo?.coverageRate,
    // Content
    totalArticles: analyticsResult.content?.totalArticles,
    avgQuality:    analyticsResult.content?.avgQuality,
    totalTweets:   analyticsResult.content?.totalTweets,
    // YouTube
    ytVideos:    analyticsResult.youtube?.totalVideos,
    ytPublished: analyticsResult.youtube?.published,
  };

  // Save snapshot with no expiry (permanent history)
  await kvSet(snapshotKey, snapshot);

  // Update index list
  const indexKey = "travito:analytics_history_index";
  let index = await kvGet(indexKey) || [];
  if (!index.includes(weekKey)) {
    index = [weekKey, ...index].slice(0, 104); // keep 2 years max
    await kvSet(indexKey, index);
  }

  return weekKey;
}

// ── Load full history ──────────────────────────────────────────
async function loadHistory() {
  const indexKey = "travito:analytics_history_index";
  const index = await kvGet(indexKey) || [];
  if (index.length === 0) return [];

  // Load all snapshots in parallel
  const snapshots = await Promise.all(
    index.map(week => kvGet(`travito:analytics_history:${week}`))
  );

  return snapshots
    .filter(Boolean)
    .sort((a, b) => a.week < b.week ? -1 : 1); // chronological
}

// ── X/Twitter API helpers ──────────────────────────────────────
import { TwitterApi } from "twitter-api-v2";

function makeXClient() {
  return new TwitterApi({
    appKey:       process.env.X_API_KEY,
    appSecret:    process.env.X_API_SECRET,
    accessToken:  process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

// ── Fetch X analytics ──────────────────────────────────────────
async function fetchXAnalytics() {
  // ── TOTAL X API CALLS: 3 max ────────────────────────────────
  // Call 1: me()           — account metrics
  // Call 2: userTimeline() — post metrics (bulk, 1 call for up to 100 tweets)
  // Call 3: KV reads only  — no extra X API calls
  // Engage stats (likes given, follows done) come from KV — 0 X API calls

  const client = makeXClient();

  // CALL 1: Account info + follower count
  const me = await client.v2.me({
    "user.fields": ["public_metrics", "created_at", "description", "verified"],
  });
  const userId      = me.data.id;
  const userMetrics = me.data.public_metrics;
  // userMetrics: followers_count, following_count, tweet_count, listed_count

  // CALL 2: Recent posts with ALL public metrics in ONE bulk request
  // max_results=100 = still just 1 API call, covers ~5 weeks of content
  const tweets = await client.v2.userTimeline(userId, {
    max_results: 100,
    "tweet.fields": ["public_metrics", "created_at", "text", "attachments", "entities"],
    exclude: ["retweets", "replies"],
  });

  const tweetData = (tweets.data?.data || []).map(t => ({
    id:          t.id,
    text:        t.text?.substring(0, 120),
    createdAt:   t.created_at,
    // Received metrics (what others did TO our posts)
    impressions: t.public_metrics?.impression_count  || 0,
    likes:       t.public_metrics?.like_count         || 0,
    reposts:     t.public_metrics?.retweet_count      || 0,
    replies:     t.public_metrics?.reply_count        || 0,
    quotes:      t.public_metrics?.quote_count        || 0,
    bookmarks:   t.public_metrics?.bookmark_count     || 0,
    url:         `https://x.com/TravitoMaroc/status/${t.id}`,
    hasMedia:    !!(t.attachments?.media_keys?.length),
    hasLink:     !!(t.entities?.urls?.length),
  }));

  // Aggregate received metrics (what others did TO @TravitoMaroc)
  const received = tweetData.reduce((s, t) => ({
    impressions: s.impressions + t.impressions,
    likes:       s.likes + t.likes,
    reposts:     s.reposts + t.reposts,
    replies:     s.replies + t.replies,
    quotes:      s.quotes + t.quotes,
    bookmarks:   s.bookmarks + t.bookmarks,
  }), { impressions:0, likes:0, reposts:0, replies:0, quotes:0, bookmarks:0 });

  const totalEngagements = received.likes + received.reposts + received.replies + received.quotes;
  const engagementRate   = received.impressions > 0
    ? Math.round((totalEngagements / received.impressions) * 10000) / 100
    : 0;

  // CALL 3 (KV only — 0 X API calls):
  // Get activity stats WE performed (likes given, follows done) from engage.js KV
  const [kvStats, prevData] = await Promise.all([
    kvGet("travito:stats"),
    kvGet("travito:analytics_data"),
  ]);

  // Activity WE performed (outbound — from engage.js running daily)
  const activity = {
    likesGiven:       kvStats?.totalLikes     || 0,  // likes we gave to others
    followsGiven:     kvStats?.totalFollows   || 0,  // follows we did
    repostsGiven:     kvStats?.totalReposts   || 0,  // reposts we did
    repliesGiven:     kvStats?.totalReplies   || 0,  // replies we wrote
    unfollowsDone:    kvStats?.totalUnfollows || 0,  // unfollows we did
    pollsCreated:     kvStats?.totalPolls     || 0,  // polls we created
    lastEngagement:   kvStats?.lastEngagement || null,
  };

  // Follower delta vs last snapshot
  const followerDelta = prevData?.x?.followers
    ? userMetrics.followers_count - prevData.x.followers
    : 0;

  // Per-day breakdown from recent tweets (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30*24*3600*1000);
  const recent30 = tweetData.filter(t => new Date(t.createdAt) > thirtyDaysAgo);

  // Daily post count (for chart)
  const postsByDay = {};
  recent30.forEach(t => {
    const day = t.createdAt?.split("T")[0];
    if (day) {
      if (!postsByDay[day]) postsByDay[day] = { posts:0, impressions:0, likes:0 };
      postsByDay[day].posts++;
      postsByDay[day].impressions += t.impressions;
      postsByDay[day].likes += t.likes;
    }
  });

  // Top posts by impressions
  const topPosts = [...tweetData].sort((a, b) => b.impressions - a.impressions).slice(0, 5);
  // Also top by engagement (likes+reposts)
  const topByEngagement = [...tweetData]
    .sort((a, b) => (b.likes+b.reposts) - (a.likes+a.reposts))
    .slice(0, 5);

  return {
    // Account (User)
    followers:      userMetrics.followers_count,
    following:      userMetrics.following_count,
    tweetCount:     userMetrics.tweet_count,
    listedCount:    userMetrics.listed_count,
    followerDelta,

    // Received metrics (Post)
    received,
    engagementRate,
    postsAnalyzed:  tweetData.length,
    posts30d:       recent30.length,

    // Activity WE performed (Like, Follow, Repost, Reply)
    activity,

    // Breakdowns
    topPosts,
    topByEngagement,
    recentPosts:    tweetData.slice(0, 15),
    postsByDay,     // for daily chart

    // API usage note
    apiCallsUsed: 2, // me() + userTimeline() — all else is KV
  };
}

// ── Fetch YouTube analytics ────────────────────────────────────
async function fetchYouTubeAnalytics() {
  try {
    const uploads = await kvGet("travito:yt_uploads") || [];
    const stats = await kvGet("travito:stats") || {};

    const totalVideos   = uploads.length;
    const publishedUrls = uploads.filter(u => u.youtubeUrl || u.status === "published");

    return {
      totalVideos,
      published: publishedUrls.length,
      pending:   totalVideos - publishedUrls.length,
      recentUploads: uploads.slice(0, 5).map(u => ({
        title:     u.title || u.topic,
        status:    u.status,
        url:       u.youtubeUrl || null,
        createdAt: u.createdAt,
      })),
      source: "kv",
    };
  } catch(e) {
    return { error: e.message };
  }
}

// ── Fetch content quality from KV ─────────────────────────────
async function fetchContentQuality() {
  const [xHistory, stats, lastRun] = await Promise.all([
    kvGet("travito:x_history"),
    kvGet("travito:stats"),
    kvGet("travito:last_run"),
  ]);

  const articles = Array.isArray(xHistory) ? xHistory : [];
  const recentArticles = articles.slice(0, 20);

  const qualityScores = recentArticles
    .filter(a => a.qualityPercent)
    .map(a => a.qualityPercent);

  const avgQuality = qualityScores.length > 0
    ? Math.round(qualityScores.reduce((s, q) => s + q, 0) / qualityScores.length)
    : null;

  const byTheme = {};
  recentArticles.forEach(a => {
    if (!a.theme) return;
    if (!byTheme[a.theme]) byTheme[a.theme] = { count: 0, totalQ: 0 };
    byTheme[a.theme].count++;
    if (a.qualityPercent) byTheme[a.theme].totalQ += a.qualityPercent;
  });

  const themeStats = Object.entries(byTheme).map(([theme, d]) => ({
    theme,
    count:      d.count,
    avgQuality: d.totalQ > 0 ? Math.round(d.totalQ / d.count) : null,
  })).sort((a, b) => b.count - a.count);

  return {
    totalArticles:     stats?.totalArticles    || 0,
    totalTweets:       stats?.totalTweets      || 0,
    totalBlogs:        stats?.totalBlogs       || 0,
    avgQuality,
    themeStats,
    recentArticles:    recentArticles.slice(0, 5).map(a => ({
      topic:           a.topic,
      theme:           a.theme,
      quality:         a.qualityPercent,
      postedAt:        a.postedAt,
      blogUrl:         a.blogUrl,
      tweetUrl:        a.tweetUrl,
    })),
    lastRun: lastRun ? {
      topic:    lastRun.topic,
      quality:  lastRun.quality,
      ranAt:    lastRun.ranAt,
      success:  lastRun.success,
    } : null,
  };
}

// ── Claude AI cross-channel insights ──────────────────────────
async function generateInsights(xData, seoData, contentData) {
  const prompt = `Tu es le Performance Director de Travito Maroc.
Analyse les métriques cross-canal et génère 4 insights actionnables.

X/TWITTER:
Followers: ${xData.followers} (${xData.followerDelta>=0?"+":""}${xData.followerDelta} cette semaine)
Impressions (30 posts): ${xData.totals?.impressions?.toLocaleString() || "N/A"}
Engagement rate: ${xData.engagementRate}%
Top post impressions: ${xData.topPosts?.[0]?.impressions || "N/A"}

SEO (28j):
Clics SC: ${seoData?.searchConsole?.totals?.clicks || "N/A"}
Sessions GA4: ${seoData?.ga4?.total?.sessions || "N/A"}
Pages indexées: ${seoData?.coverage?.totalIndexed || "N/A"}/${seoData?.coverage?.totalSubmitted || "N/A"}

CONTENU:
Articles publiés: ${contentData.totalArticles}
Qualité moyenne: ${contentData.avgQuality || "N/A"}%
Tweets: ${contentData.totalTweets}

Réponds UNIQUEMENT en JSON:
{"insights":[
  {"channel":"X|SEO|Content|Cross","type":"win|warning|opportunity","title":"...","metric":"...","action":"...","priority":"high|medium"}
]}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    const text = d.content?.[0]?.text || "{}";
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    return JSON.parse(text.substring(s, e+1));
  } catch { return { insights: [] }; }
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const isForce      = req.query?.force === "true";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";

  // Return cache if fresh (< 7 days) and not forced
  if (!isForce && !isVercelCron) {
    const cached = await kvGet("travito:analytics_data");
    if (cached?.fetchedAt) {
      const age = (Date.now() - new Date(cached.fetchedAt).getTime()) / 3600000;
      if (age < 168) { // 7 days
        return res.status(200).json({ success: true, cached: true, ageHours: Math.round(age), ...cached });
      }
    }
  }

  // History endpoint — no X API call needed
  if (req.query?.action === "history") {
    try {
      const history = await loadHistory();
      return res.status(200).json({ success: true, history, weeks: history.length });
    } catch(e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (!process.env.X_API_KEY) {
    return res.status(200).json({ success: false, error: "X API keys not configured" });
  }

  try {
    // Fetch all data in parallel where possible
    const [xData, ytData, contentData, seoData] = await Promise.all([
      fetchXAnalytics(),
      fetchYouTubeAnalytics(),
      fetchContentQuality(),
      kvGet("travito:seo_data"),
    ]);

    const aiResult = await generateInsights(xData, seoData, contentData);

    const result = {
      fetchedAt:  new Date().toISOString(),
      x:          xData,
      youtube:    ytData,
      content:    contentData,
      seo:        seoData ? {
        clicks:         seoData.searchConsole?.totals?.clicks,
        impressions:    seoData.searchConsole?.totals?.impressions,
        sessions:       seoData.ga4?.total?.sessions,
        users:          seoData.ga4?.total?.users,
        indexed:        seoData.coverage?.totalIndexed,
        submitted:      seoData.coverage?.totalSubmitted,
        coverageRate:   seoData.coverage?.coverageRate,
        topKeyword:     seoData.searchConsole?.keywords?.[0]?.keyword,
        topKeywordPos:  seoData.searchConsole?.keywords?.[0]?.position,
        period:         seoData.searchConsole?.period,
      } : null,
      insights:   aiResult.insights || [],
    };

    await kvSet("travito:analytics_data", result, 8 * 24 * 3600); // 8-day TTL

    // Save weekly history snapshot (permanent, for trend charts)
    const savedWeek = await saveHistorySnapshot(result);
    console.log("History snapshot saved:", savedWeek);

    return res.status(200).json({ success: true, cached: false, ...result });

  } catch(error) {
    console.error("Analytics error:", error.message);
    const cached = await kvGet("travito:analytics_data");
    if (cached) return res.status(200).json({ success: true, cached: true, stale: true, ...cached });
    return res.status(500).json({ success: false, error: error.message });
  }
}

export const config = { maxDuration: 30 };
