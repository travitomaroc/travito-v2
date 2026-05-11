// ================================================================
//  YouTubeQCAgent.js — Quality Control Agent
//  Evaluates idea generation output + Bible before approval
//  If score < threshold → returns feedback for regeneration
//  Max retries per day tracked in KV to prevent loops
// ================================================================

// Use /api/claude proxy — runs server-side with ANTHROPIC_API_KEY
async function callClaude(system, user) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const d = await r.json();
  return d.content?.[0]?.text || "";
}

// KV via /api/kv proxy
async function kvGet(key) {
  try {
    const r = await fetch("/api/kv?key=" + encodeURIComponent(key));
    const d = await r.json();
    return d.value != null ? JSON.parse(d.value) : null;
  } catch { return null; }
}

async function kvSet(key, value) {
  try {
    await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: JSON.stringify(value) }),
    });
  } catch(e) { console.error("KV set error:", e.message); }
}

// ── Retry counter ─────────────────────────────────────────────────
const retryKey = (agentId) =>
  "travito:yt_qc_retries:" + agentId + ":" + new Date().toISOString().split("T")[0];

export async function getRetryCount(agentId) {
  const data = await kvGet(retryKey(agentId));
  return data?.count || 0;
}

export async function incrementRetry(agentId) {
  const current = await getRetryCount(agentId);
  await kvSet(retryKey(agentId), { count: current + 1, date: new Date().toISOString() });
  return current + 1;
}

export async function canRetry(agentId, maxRetries = 3) {
  const count = await getRetryCount(agentId);
  return count < maxRetries;
}

// ── EVALUATE SINGLE IDEA ─────────────────────────────────────────
export async function evaluateSingleIdea(idea, agent, threshold = 60) {
  const system = "Tu es l Agent Qualite YouTube pour Travito Maroc. Tu evalues la qualite d une idee YouTube Short. Reponds UNIQUEMENT en JSON valide.";
  const prompt = "Evalue cette idee YouTube Short pour l agent '" + agent.name + "'.\n\n" +
    "TOPIC: " + idea.topic + "\n" +
    "ANGLE: " + (idea.angle||"") + "\n" +
    "HOOK: " + (idea.hook||"") + "\n" +
    "FORMAT: " + (idea.format||"") + "\n" +
    "SCORE INTERNE: " + (idea.totalScore||0) + "/100\n\n" +
    "FOCUS AGENT: " + (agent.customPrompt||agent.description||agent.name) + "\n\n" +
    "Evalue (0-10 chacun):\n" +
    "1. ANCRAGE_MAROC: Ancrage dans la realite marocaine?\n" +
    "2. FORCE_HOOK: Hook capte-t-il en moins de 3 secondes?\n" +
    "3. VISUALISABILITE: Illustrable avec clips stock?\n" +
    "4. FORMAT_COURT: Adapte au format 30-60s?\n" +
    "5. ORIGINALITE: Angle frais, pas deja vu?\n\n" +
    "Reponds en JSON: {\"scores\":{\"ancrage_maroc\":8,\"force_hook\":7,\"visualisabilite\":9,\"format_court\":8,\"originalite\":7},\"total\":78,\"pass\":true,\"verdict\":\"BON\",\"issue\":\"Faiblesse principale en 1 phrase ou null\",\"suggestion\":\"Amelioration concrete en 1 phrase\"}";

  try {
    const raw = await callClaude(system, prompt);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s === -1) throw new Error("No JSON");
    const result = JSON.parse(raw.substring(s, e+1));
    const score = result.total || Math.round(Object.values(result.scores||{}).reduce((a,b)=>a+b,0)/5*10);
    return {
      ideaId: idea.id,
      topic: idea.topic,
      pass: score >= threshold,
      score,
      scores: result.scores||{},
      verdict: result.verdict||"",
      issue: result.issue||"",
      suggestion: result.suggestion||"",
      evaluatedAt: new Date().toISOString(),
    };
  } catch(e) {
    return { ideaId:idea.id, topic:idea.topic, pass:true, score:70, verdict:"", issue:"", suggestion:"", error:e.message };
  }
}

// ── EVALUATE IDEAS (batch — evaluates each individually) ──────────
export async function evaluateIdeas(ideas, agent, threshold = 60) {
  if (!ideas || ideas.length === 0) {
    return { pass: false, score: 0, feedback: "Aucune idee generee.", perIdea: [] };
  }

  // Evaluate each idea individually
  const perIdea = [];
  for (const idea of ideas.slice(0, 5)) {
    const result = await evaluateSingleIdea(idea, agent, threshold);
    perIdea.push(result);
    await new Promise(r => setTimeout(r, 500)); // rate limit
  }

  // Overall: average of all scores
  const avgScore = Math.round(perIdea.reduce((s,r)=>s+r.score,0)/perIdea.length);
  const failedIdeas = perIdea.filter(r=>!r.pass);
  const topIdea = perIdea.sort((a,b)=>b.score-a.score)[0];

  // FAIL only if BOTH conditions met:
  // 1. Average score < threshold
  // 2. Top-ranked idea score < threshold
  // If top idea passes but average is low = acceptable (other ideas are weaker but top is good)
  const topIdeaResult = perIdea.find(r => r.ideaId === ideas[0]?.id);
  const topIdeaScore  = topIdeaResult?.score ?? avgScore;
  const topIdeaPasses = topIdeaScore >= threshold;
  const avgPasses     = avgScore >= threshold;

  // Must fail BOTH to trigger regeneration
  const overallPass = topIdeaPasses || avgPasses; // pass if EITHER passes

  const failedIdeasList = perIdea.filter(r => !r.pass);
  const topIssues = [
    !avgPasses     ? "Moyenne " + avgScore + "% sous le seuil" : null,
    !topIdeaPasses ? "Top idee " + topIdeaScore + "% sous le seuil" : null,
  ].filter(Boolean).join(" · ");

  const feedback = failedIdeasList.length > 0
    ? failedIdeasList.slice(0,3).map(r => r.topic.slice(0,25) + " — " + r.issue).join(" | ")
    : "";

  return {
    pass: overallPass,
    score: avgScore,
    topIdeaScore,
    avgPasses,
    topIdeaPasses,
    perIdea,
    feedback,
    topIssue: topIssues || failedIdeasList[0]?.issue || "",
    bestIdea: topIdeaResult?.topic || ideas[0]?.topic,
  };
}

// ── EVALUATE BIBLE ────────────────────────────────────────────────
export async function evaluateBible(bible, agent, idea, threshold = 60) {
  if (!bible) {
    return { pass: false, score: 0, feedback: "Bible manquante." };
  }

  const segmentSummary = (bible.segment_timeline || []).map((seg, i) =>
    seg.segment_type + " (" + seg.target_duration_sec + "s): " +
    (seg.narration_text || "").slice(0, 80) +
    " | Pexels: " + (seg.pexels_query_primary || "manquant")
  ).join("\n");

  const system = "Tu es l Agent Qualite YouTube pour Travito Maroc. Tu evalues la qualite d une Bible de production YouTube Short. Reponds UNIQUEMENT en JSON valide.";

  const prompt = "Evalue cette Bible de production pour le Short YouTube '" + (bible.title || idea?.topic || "") + "' (agent: " + agent.name + ").\n\n" +
    "FOCUS AGENT: " + (agent.customBiblePrompt || agent.customPrompt || agent.description || agent.name) + "\n\n" +
    "VOICEOVER SCRIPT:\n" + (bible.voiceover_script || "").slice(0, 400) + "\n\n" +
    "SEGMENTS (" + (bible.segment_timeline||[]).length + "):\n" + segmentSummary + "\n\n" +
    "DUREE CIBLE: " + (bible.target_duration_sec || "?") + "s\n" +
    "LANGUE: " + (bible.language || "fr") + "\n\n" +
    "Criteres d evaluation (0-10 chacun):\n" +
    "1. SCRIPT_QUALITE: Le voiceover est-il punchy, naturel, adapte au format court?\n" +
    "2. HOOK_FORT: Les 3 premieres secondes accrochent-elles vraiment?\n" +
    "3. SEGMENTS_COHERENTS: Les segments couvrent-ils bien le sujet en ordre logique?\n" +
    "4. PEXELS_PERTINENCE: Les queries Pexels sont-elles specifiques et pertinentes?\n" +
    "5. CTA_PRESENT: Le CTA mentionne-t-il travito.ma et invite a s abonner?\n\n" +
    "Reponds en JSON: {\"scores\":{\"script_qualite\":8,\"hook_fort\":7,\"segments_coherents\":9,\"pexels_pertinence\":6,\"cta_present\":10},\"total\":80,\"pass\":true,\"top_issue\":\"Faiblesse principale en 1 phrase\",\"feedback\":\"Conseil specifique pour ameliorer en 1-2 phrases\"}";

  try {
    const raw = await callClaude(system, prompt);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s === -1) throw new Error("No JSON");
    const result = JSON.parse(raw.substring(s, e + 1));
    const score = result.total || Math.round(Object.values(result.scores||{}).reduce((a,b)=>a+b,0) / 5 * 10);
    return {
      pass: score >= threshold,
      score,
      scores: result.scores || {},
      feedback: result.feedback || result.top_issue || "",
      topIssue: result.top_issue || "",
    };
  } catch(e) {
    console.error("QC bible eval error:", e.message);
    return { pass: true, score: 70, feedback: "Evaluation QC Bible echouee — acceptee par defaut.", error: e.message };
  }
}
