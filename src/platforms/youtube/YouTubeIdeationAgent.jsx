// ================================================================
//  YouTubeIdeationAgent.jsx — Idea generation, ranking, Bible
//  Handles: 5 ideas/day, scoring, Bible, weekly plan, week history
// ================================================================
import { useState, useEffect } from "react";
import React from "react";
import { callClaude } from "../../config/agentConfig";
import {
  C, uid, IDEAS_PER_DAY, PARK_DAYS, DUPLICATE_WINDOW_DAYS,
  STATUS_STYLE, getWeekKey, DEFAULT_AGENT_PROMPT,
} from "./youtubeConfig";
import { evaluateIdeas, evaluateBible, canRetry, incrementRetry } from "./YouTubeQCAgent";

async function generateIdeasForDay(agent, avoidTopics, ytVideos, customInstructions = "", count = IDEAS_PER_DAY, globalBlacklist = []) {
  // Duration is the only config — words auto-derived
  const dur = agent.dur || agent.durationRange || [40, 55];
  const lang    = agent.lang    || "fr";
  const dayName = agent.dayName || "";
  agent = { ...agent, dur, lang, dayName };

  // Build avoid list with status icons — Claude understands priority
  const avoid = (avoidTopics || []).slice(0, 60).map(t =>
    (t.status === "published" ? "[PUBLIE] " : t.status === "approved" ? "[APPROUVE] " : "[RECENT] ") + t.topic
  ).join(" | ");
  const sources = (ytVideos || []).slice(0, 5).map((v, i) =>
    `${i + 1}. ${v.title}${v.views ? ` (${v.views} vues)` : ""}`
  ).join("\n");
  const avgDur      = Math.round((dur[0] + dur[1]) / 2);
  const spokenSec   = Math.max(20, avgDur - 6);
  const wordsTarget = Math.max(70, Math.round(spokenSec * 2.2));

  const focusInstructions = customInstructions || (agent.customPrompt || "");
  const commonBrief = `Tu es un strategiste contenu YouTube Shorts pour Travito Maroc (travito.ma).

AGENT: ${agent.name} | JOUR: ${agent.dayName}
LANGUE: ${agent.lang} | DUREE: ${agent.dur[0]}-${agent.dur[1]}s (~${avgDur}s)
${focusInstructions ? "INSTRUCTIONS SPECIFIQUES AGENT: " + focusInstructions : ""}
${globalBlacklist.length > 0 ? "MOTS/MARQUES INTERDITS (ne jamais mentionner dans les idees, topics ou scripts): " + globalBlacklist.join(", ") : ""}

MEMOIRE CONTENU — EVITER CES SUJETS:
(🎬=publie, ✅=approuve non produit, 💡=genere recemment)
${avoid || "aucun"}
REGLE: sujets [PUBLIE] et [APPROUVE] = INTERDITS (${DUPLICATE_WINDOW_DAYS}j minimum) | [RECENT] = INTERDITS angle similaire (${DUPLICATE_WINDOW_DAYS}j)
REQUIS: chaque idee DOIT avoir un angle nouveau, une approche differente, jamais vue sur ce canal.

REGLES ANTI-DOUBLONS STRICTES:
- Chaque idee doit traiter un SUJET COMPLETEMENT DIFFERENT (pas juste reformulation)
- INTERDIT: meme sujet avec synonymes ou tournure differente
- INTERDIT: meme intention utilisateur (ex: "prix immobilier" vs "cout logement")
- INTERDIT: variations autour d’un meme concept dans la meme batch
- Chaque idee doit appartenir a un angle editorial DIFFERENT (ex: conseil vs fait vs comparaison vs erreur vs opportunite)

DIVERSITE OBLIGATOIRE:
- Maximum 1 idee par theme (ex: location, achat, investissement, etc.)
- Couvrir plusieurs categories: logement, investissement, vie quotidienne, lois, astuces, culture
- Varier les formats: au moins 3 formats differents (list, facts, tips, comparison, etc.)
VIDEOS REFERENCE YOUTUBE:
${sources || "Pas de references disponibles"}

CRITERES DE FILTRAGE (chaque idee doit passer TOUS ces criteres):
- Forte pertinence Maroc: ancree dans la realite marocaine
- Visualisable: illustrable avec des clips stock generiques et coherents
- Format court: narration complete en ${agent.dur[0]}-${agent.dur[1]} secondes
- Automatisable: pas besoin de footage special ou tournage custom
- Pas trop abstrait, pas trop niche, pas trop long

FORMATS FAVORISES: listes, faits, comparaisons, classements, conseils pratiques, culture, opportunites

SYSTEME DE SCORING (100pts total):
- Pertinence Maroc (20pts): concept ancre dans la realite marocaine?
- Force du hook (20pts): 3 premieres secondes accrochent-elles?
- Facilite visuelle (15pts): clips stock disponibles et coherents?
- Fraicheur (15pts): angle nouveau, pas vu mille fois?
- Automatisation (15pts): production sans footage custom?
- Format court (15pts): parfait pour 30-60 secondes?
- Penalite repetition (-10pts si similaire a un sujet publie)

Genere exactement ${count} idees UNIQUES (pas plus, pas moins), triees par score decroissant.`;

  const jsonPrompt = `${commonBrief}

REPONDS EN JSON UNIQUEMENT (pas de markdown, pas d'explication):
{"ideas":[
  {
    "topic":"Titre accrocheur max 60 chars",
    "angle":"Angle unique en 1 phrase",
    "hook":"Premiere phrase du script - max 15 mots - accroche immediate",
    "format":"listicle|tips|facts|comparison|ranking|advice|culture|opportunity",
    "scores":{"morocco":18,"hook":17,"visual":13,"fresh":14,"auto":14,"short":14,"repeat_penalty":0},
    "total_score":90,
    "reason":"Pourquoi ce score en 1 phrase",
    "estimated_words":${wordsTarget},
    "key_points":["Point 1","Point 2","Point 3","Point 4"],
    "pexels_theme":"theme visuel general pour recherche stock",
    "visual_mood":"bright_urban|warm_indoor|neutral_professional|energetic_outdoor",
    "suitability_flags":{"visualizable":true,"automatable":true,"short_form_fit":true,"morocco_anchored":true}
  }
]}`;

  const blockPrompt = `${commonBrief}

REPONDS EN TEXTE STRUCTURE EXACTEMENT DANS CE FORMAT ET RIEN D'AUTRE:
IDEA 1
TOPIC: ...
ANGLE: ...
HOOK: ...
FORMAT: ...
TOTAL_SCORE: ...
REASON: ...
ESTIMATED_WORDS: ...
KEY_POINTS: point 1 | point 2 | point 3 | point 4
PEXELS_THEME: ...
VISUAL_MOOD: bright_urban|warm_indoor|neutral_professional|energetic_outdoor
SCORES: morocco=..; hook=..; visual=..; fresh=..; auto=..; short=..; repeat_penalty=..
FLAGS: visualizable=true; automatable=true; short_form_fit=true; morocco_anchored=true

IDEA 2
...

Jusqu'a IDEA 5. Exactement ${count} idees. Pas de markdown. Pas de code fence.`;

  const sanitizeJsonText = (str) => str
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .trim();

  const extractJsonCandidate = (text) => {
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) return codeBlockMatch[1];
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e > s) return text.slice(s, e + 1);
    return text;
  };

  const normalizeIdea = (idea, i, parseMode = "json") => ({
    id: uid(),
    agentId: agent.id,
    topic: String(idea.topic || `Idee ${i + 1}`).trim(),
    angle: String(idea.angle || "").trim(),
    hook: String(idea.hook || "").trim(),
    format: String(idea.format || "tips").trim(),
    scores: idea.scores || {},
    totalScore: Number(idea.total_score || idea.totalScore || (parseMode !== "json" ? 72 : 0)),
    rank: i + 1,
    reason: String(idea.reason || (parseMode !== "json" ? "Recupere depuis une reponse Claude mal formatee" : "")).trim(),
    estimatedWords: Number(idea.estimated_words || idea.estimatedWords || wordsTarget || 88),
    keyPoints: Array.isArray(idea.key_points) ? idea.key_points : Array.isArray(idea.keyPoints) ? idea.keyPoints : [],
    pexelsTheme: String(idea.pexels_theme || idea.pexelsTheme || "").trim(),
    visualMood: String(idea.visual_mood || idea.visualMood || "neutral_professional").trim(),
    suitabilityFlags: {
      ...(idea.suitability_flags || idea.suitabilityFlags || {}),
      low_confidence: parseMode !== "json",
    },
    parseMode,
    language: agent.lang,
    status: i === 0 ? "selected" : "generated",
    dayStatus: i === 0 ? "planned" : "draft",
    bible: null,
    bibleScore: null,
    createdAt: new Date().toISOString(),
    ytVideos: ytVideos || [],
  });

const dedupeAndFinalize = (ideas, parseMode) => {
  const normalize = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const isSimilar = (a, b) => {
    const wa = new Set(normalize(a).split(" "));
    const wb = new Set(normalize(b).split(" "));
    const intersection = [...wa].filter(w => wb.has(w));
    const ratio = intersection.length / Math.max(wa.size, 1);
    return ratio > 0.6;
  };

  const deduped = [];

  for (const idea of ideas) {
    if (!idea.topic) continue;

    const exists = deduped.some(d => isSimilar(d.topic, idea.topic));
    if (!exists) deduped.push(idea);
  }
    return deduped
      .sort((a, b) => (b.total_score || b.totalScore || 0) - (a.total_score || a.totalScore || 0))
      .slice(0, IDEAS_PER_DAY)
      .map((idea, i) => normalizeIdea(idea, i, parseMode));
  };

  const tryParseJsonIdeas = (raw) => {
    let parsed = null;
    const candidate = extractJsonCandidate(raw);
    try {
      parsed = JSON.parse(candidate);
    } catch {
      try {
        parsed = JSON.parse(sanitizeJsonText(candidate));
      } catch {}
    }

    let ideas = [];
    let parseMode = "json";

    if (parsed) {
      ideas = Array.isArray(parsed.ideas)
        ? parsed.ideas
        : Array.isArray(parsed)
          ? parsed
          : Object.values(parsed).find(v => Array.isArray(v)) || [];
    }

    if (!Array.isArray(ideas) || ideas.length === 0) {
      const objectMatches = [...raw.matchAll(/\{[^{}]*"topic"\s*:\s*"[^"]+"[^{}]*\}/g)];
      if (objectMatches.length >= 3) {
        ideas = objectMatches.map((m) => {
          const objText = sanitizeJsonText(m[0]);
          try {
            return JSON.parse(objText);
          } catch {
            const topic = (objText.match(/"topic"\s*:\s*"([^"]+)"/) || [])[1] || "";
            const angle = (objText.match(/"angle"\s*:\s*"([^"]+)"/) || [])[1] || "";
            const hook = (objText.match(/"hook"\s*:\s*"([^"]+)"/) || [])[1] || "";
            return {
              topic,
              angle,
              hook,
              format: "tips",
              scores: { morocco: 15, hook: 15, visual: 12, fresh: 12, auto: 12, short: 12, repeat_penalty: 0 },
              total_score: 72,
              reason: "Recupere automatiquement depuis une reponse mal formatee",
              estimated_words: wordsTarget || 88,
              key_points: [],
              pexels_theme: agent.name,
              visual_mood: "neutral_professional",
              suitability_flags: { visualizable: true, automatable: true, short_form_fit: true, morocco_anchored: true }
            };
          }
        }).filter(x => x.topic);
        parseMode = "json_recovered";
      }
    }

    if (Array.isArray(ideas) && ideas.length > 0) return dedupeAndFinalize(ideas, parseMode);
    return [];
  };

  const parseBlockIdeas = (raw) => {
    const cleaned = raw.replace(/\r/g, "");
    const blocks = cleaned.split(/\n(?=IDEA\s+\d+)/i).map(s => s.trim()).filter(Boolean);
    const ideas = [];

    const getLine = (block, label) => {
      const re = new RegExp(`(?:^|\\n)${label}:\\s*(.+)`, "i");
      const m = block.match(re);
      return m ? m[1].trim() : "";
    };

    const parseScores = (line) => {
      const obj = {};
      line.split(/;\s*/).forEach(part => {
        const m = part.match(/([a-z_]+)\s*=\s*(-?\d+)/i);
        if (m) obj[m[1]] = Number(m[2]);
      });
      return obj;
    };

    const parseFlags = (line) => {
      const obj = {};
      line.split(/;\s*/).forEach(part => {
        const m = part.match(/([a-z_]+)\s*=\s*(true|false)/i);
        if (m) obj[m[1]] = m[2].toLowerCase() === "true";
      });
      return obj;
    };

    for (const block of blocks) {
      const topic = getLine(block, "TOPIC");
      if (!topic) continue;
      ideas.push({
        topic,
        angle: getLine(block, "ANGLE"),
        hook: getLine(block, "HOOK"),
        format: getLine(block, "FORMAT") || "tips",
        total_score: Number(getLine(block, "TOTAL_SCORE") || 72),
        reason: getLine(block, "REASON") || "Recupere depuis format structure texte",
        estimated_words: Number(getLine(block, "ESTIMATED_WORDS") || wordsTarget || 88),
        key_points: (getLine(block, "KEY_POINTS") || "").split(/\s*\|\s*/).filter(Boolean),
        pexels_theme: getLine(block, "PEXELS_THEME") || agent.name,
        visual_mood: getLine(block, "VISUAL_MOOD") || "neutral_professional",
        scores: parseScores(getLine(block, "SCORES") || ""),
        suitability_flags: parseFlags(getLine(block, "FLAGS") || "")
      });
    }

    if (ideas.length > 0) return dedupeAndFinalize(ideas, "block_recovered");
    return [];
  };

  // Ideas need more tokens than callClaude's 1500 default — use direct fetch
  const _callIdeas = async (system, user, attempt=1) => {
    const r = await fetch("/api/claude", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ max_tokens:4000, system, messages:[{role:"user",content:user}] }),
    });
    const d = await r.json();
    if (attempt < 3 && (r.status===529 || (d.error?.type==="overloaded_error") ||
        (d.error?.message||"").toLowerCase().includes("overload"))) {
      await new Promise(res=>setTimeout(res, attempt*12000));
      return _callIdeas(system, user, attempt+1);
    }
    return d.content?.map(b=>b.text||"").join("\n") || "";
  };
  const raw = await _callIdeas(
    "Tu generes des idees de contenu YouTube Shorts pour Travito Maroc. Reponds UNIQUEMENT en JSON valide sans markdown ni commentaire.",
    jsonPrompt
  );

  // Debug: log first 200 chars of raw to help diagnose parse failures
  if (!raw || raw.length < 10) {
    throw new Error("Claude returned empty response — possible API error");
  }

  let finalized = tryParseJsonIdeas(raw);
  if (finalized.length >= 2) return finalized;

  // JSON parse failed — log what we got before trying block format
  // (visible in browser console for debugging)
  console.warn("[Ideas] JSON parse yielded 0 ideas. raw length:", (raw||"").length,
    "| first 200 chars:", (raw||"").slice(0,200));

  const retryRaw = await _callIdeas(
    "Tu generes des idees de contenu YouTube Shorts pour Travito Maroc. Reponds dans un format texte structure tres strict, sans JSON, sans markdown.",
    blockPrompt
  );

  finalized = parseBlockIdeas(retryRaw);
  if (finalized.length >= 1) return finalized;

  // Build diagnostic — what did Claude actually return?
  const rawPreview = (raw||"").slice(0, 120).replace(/\n/g, " ").trim();
  const retryPreview = (retryRaw||"").slice(0, 120).replace(/\n/g, " ").trim();
  const diag = [
    "raw(" + (raw||"").length + "chars): " + (rawPreview || "VIDE"),
    "retry(" + (retryRaw||"").length + "chars): " + (retryPreview || "VIDE"),
  ].join(" | ");
  throw new Error("Ideas parse failed — " + diag);
}

// ── BIBLE GENERATION ─────────────────────────────────────────────
async function generateBible(idea, agent, isAuto = false, globalBlacklist = []) {
  // Duration drives everything — words are derived, not configured
  const dur    = agent.dur || agent.durationRange || [40, 55];
  const avgDur = Math.round((dur[0] + dur[1]) / 2);
  // At 2.2 words/sec, spoken portion = avgDur - 6s (opener 3s + cta 3s silent)
  const spokenSec  = avgDur - 6;
  const wordsMin   = Math.round(spokenSec * 2.0); // slow speaker floor
  const wordsMax   = Math.round(spokenSec * 2.4); // fast speaker ceiling
  const wordsTarget = Math.round(spokenSec * 2.2); // ideal
  agent = { ...agent, dur };

  const _fallbackBibleInstructions = [
    "STRUCTURE OBLIGATOIRE DES SEGMENTS:",
    "- 1 opener  : 3s fixe, SILENCIEUX",
    "- 1 hook    : 5-7s, narration percutante",
    "- 3-5 points: repartis sur " + (spokenSec - 6) + "s restants",
    "  \u2192 3 points = ~" + Math.round((spokenSec-6)/3) + "s chacun",
    "  \u2192 4 points = ~" + Math.round((spokenSec-6)/4) + "s chacun",
    "  \u2192 5 points = ~" + Math.round((spokenSec-6)/5) + "s chacun",
    "- 1 cta     : 3s fixe, SILENCIEUX",
    "TOTAL OBLIGATOIRE: " + avgDur + "s",
    "",
    "REGLES IMPORTANTES:",
    "- 1 seul clip stock par segment dans le rendu final",
    "- Script voiceover = source canonique unique pour la narration",
    "- Chaque segment doit avoir ses propres Pexels queries",
    "- Pas de personnage nomme ni decor cinematique complexe",
    "- Clips stock + sous-titres + voiceover = production de base",
    "- Queries Pexels: concret + activite + contexte (ex: \"market negotiation people\")",
    "- Eviter: noms propres specifiques, celebrities, evenements rares",
    "",
    "SYNCHRONISATION AUDIO/VIDEO (CRITIQUE):",
    "- Opener(3s) et CTA(3s) = SILENCIEUX, pas de narration",
    "- Voiceover couvre: hook + tous les points = " + spokenSec + "s de parole",
    "- Chaque narration_text doit remplir EXACTEMENT son target_duration_sec:",
    "  * 1s de parole = 2.2 mots \u2192 segment 6s = ~13 mots, 8s = ~18 mots, 10s = ~22 mots, 12s = ~26 mots",
    "- voiceover_script = concatenation exacte de tous les narration_text (hook + points)",
    "- INTERDIT: script trop court (silence a la fin) ou trop long (audio coupe)",
  ].join("\n");
  const _bibleInstructions = idea.customBibleInstructions || _fallbackBibleInstructions;

  // CTA rules injected ALWAYS — even if custom prompt is set
  // Custom prompt cannot override these brand requirements
  const _mandatoryRules = [
    "",
    "REGLES OBLIGATOIRES (priorité absolue, non négociables):",
    "- Le segment CTA DOIT contenir dans narration_text: 'travito.ma' ET une invitation à s'abonner",
    "- voiceover_script DOIT se terminer par la mention de travito.ma",
    "- INTERDIT: CTA vide, CTA sans travito.ma, voiceover tronqué ou sans conclusion",
    "- INTERDIT: termes abstraits dans pexels_query (toujours: sujet + action + contexte)",
  ].join("\n");

  const prompt = `Tu crees une Bible de production legere pour un YouTube Short de Travito Maroc.

IDEE: "${idea.topic}"
ANGLE: ${idea.angle}
HOOK: ${idea.hook}
FORMAT: ${idea.format}
POINTS CLES: ${(idea.keyPoints||[]).join(" | ")}
DUREE CIBLE: ${dur[0]}-${dur[1]}s (cible: ${avgDur}s)
SCRIPT VOICEOVER: doit remplir exactement ${spokenSec}s de parole (${wordsMin}-${wordsMax} mots)
NOTE: opener(3s) + cta(3s) sont SILENCIEUX — le script couvre uniquement les segments parles

CONTRAINTE ABSOLUE DE LONGUEUR VOICEOVER:
- Le voiceover_script DOIT contenir entre ${wordsMin} et ${wordsMax} mots
- Cible ideale: ${wordsTarget} mots
- Si le script est trop court, developpe les explications
- Si le script est trop long, simplifie la formulation
- INTERDIT: voiceover_script sous ${wordsMin} mots
- INTERDIT: segments parles avec narration trop courte pour leur duree
- Chaque segment parle doit respecter environ 2.0 a 2.4 mots/seconde

LANGUE: ${idea.language}
MOTS ESTIMES: ${idea.estimatedWords}
THEME VISUEL: ${idea.pexelsTheme||"Morocco urban lifestyle"}
HUMEUR VISUELLE: ${idea.visualMood||"neutral_professional"}
${globalBlacklist.length > 0 ? "MOTS/MARQUES INTERDITS (ne jamais citer dans le script voiceover): " + globalBlacklist.join(", ") : ""}


${_bibleInstructions}
${_mandatoryRules}

REPONDS EN JSON UNIQUEMENT:
{
  "bible_id": "auto_generated",
  "idea_id": "${idea.id}",
  "title": "Titre YouTube max 70 chars",
  "hook": "Texte accroche 3-5 mots pour l ecran",
  "angle": "Angle editorial",
  "audience": "Profil audience cible",
  "topic_type": "${agent.id}",
  "language": "${idea.language}",
  "target_duration_sec": ${avgDur},
  "estimated_word_count": ${idea.estimatedWords},
  "quality_score": 85,
  "quality_notes": "Evaluation en 1 phrase",
  "voice_style": "energetic_clear",
  "music_style": "light_background_optional",
  "visual_theme": "morocco_urban_lifestyle",
  "preferred_pacing": "medium_fast",
  "preferred_clip_energy": "moderate",
  "preferred_color_mood": "warm_neutral",
  "preferred_clip_style": "realistic_stock",
  "avoid_styles": ["cinematic_dramatic","night_dark_moody","abstract_artistic"],
  "preferred_people_density": "medium",
  "preferred_environment_types": ["urban","office","market","outdoor"],
  "cta_text": "Decouvre plus sur travito.ma",
  "pexels_strategy": "semantic_broad_first",
  "render_strategy": "fixed_template_v1",
  "opener_template_id": "opener_v1",
  "cta_template_id": "cta_v1",
  "production_status": "bible_ready",
  "approval_status": "pending",
  "voiceover_script": "Script complet naturel et punchy pour la voix",
  "subtitle_blocks": ["Bloc sous-titre 1","Bloc 2","Bloc 3","Bloc 4","Bloc 5"],
  "visual_keyword_map": ["kw1","kw2","kw3","kw4","kw5","kw6"],
  "hashtags": ["#Maroc","#tag2","#tag3","#tag4","#tag5"],
  "source_notes": "Source ou inspiration principale",
  "sources": [],
  "segment_timeline": [
    {
      "segment_id": "seg_1",
      "segment_type": "opener",
      "narration_text": "",
      "on_screen_text": "${agent.name}",
      "subtitle_text": "",
      "target_duration_sec": 3,
      "visual_keywords": [],
      "pexels_query_primary": "",
      "pexels_query_secondary": "",
      "clip_selection_constraints": {"orientation":"vertical","min_duration_sec":3,"max_duration_sec":5},
      "edit_style": "fixed_template",
      "transition_in": "fade",
      "transition_out": "cut",
      "subtitle_density": "none",
      "emphasis_words": [],
      "audio_timing_hint": "no_voice"
    },
    {
      "segment_id": "seg_2",
      "segment_type": "hook",
      "narration_text": "Texte voiceover pour le hook",
      "on_screen_text": "Texte court impactant 5 mots max",
      "subtitle_text": "Meme texte pour sous-titre",
      "target_duration_sec": 6,
      "visual_keywords": ["kw1","kw2","kw3"],
      "pexels_query_primary": "query concrete relevante",
      "pexels_query_secondary": "query plus large fallback",
      "clip_selection_constraints": {"orientation":"vertical","min_duration_sec":5,"max_duration_sec":10,"prefer_people":true},
      "edit_style": "hard_cut_dynamic",
      "transition_in": "cut",
      "transition_out": "cut",
      "subtitle_density": "low",
      "emphasis_words": ["mot_fort"],
      "audio_timing_hint": "start_immediately"
    },
    {
      "segment_id": "seg_3",
      "segment_type": "point",
      "narration_text": "Explication point 1",
      "on_screen_text": "Point 1 court",
      "subtitle_text": "Sous-titre point 1",
      "target_duration_sec": 10,
      "visual_keywords": ["kw1","kw2"],
      "pexels_query_primary": "query pertinente pour point 1",
      "pexels_query_secondary": "query plus large",
      "clip_selection_constraints": {"orientation":"vertical","min_duration_sec":8,"max_duration_sec":15},
      "edit_style": "steady_clip",
      "transition_in": "cut",
      "transition_out": "cut",
      "subtitle_density": "medium",
      "emphasis_words": ["mot_cle"],
      "audio_timing_hint": "normal"
    },
    {
      "segment_id": "seg_cta",
      "segment_type": "cta",
      "narration_text": "Decouvre plus sur travito.ma, abonne-toi!",
      "on_screen_text": "travito.ma",
      "subtitle_text": "",
      "target_duration_sec": 3,
      "visual_keywords": [],
      "pexels_query_primary": "",
      "pexels_query_secondary": "",
      "clip_selection_constraints": {"orientation":"vertical","min_duration_sec":3,"max_duration_sec":5},
      "edit_style": "fixed_template",
      "transition_in": "fade",
      "transition_out": "fade",
      "subtitle_density": "none",
      "emphasis_words": ["travito.ma"],
      "audio_timing_hint": "fade_out"
    }
  ]
}

IMPORTANT:
- Somme des target_duration_sec = ${avgDur}s exactement
- Cree assez de segments point pour atteindre ${avgDur}s
- Chaque narration_text doit remplir son segment (2.2 mots/sec)
- voiceover_script = tous les narration_text concatenes = exactement ${spokenSec}s de lecture
- OBLIGATOIRE: segment_type "cta" DOIT avoir narration_text contenant "travito.ma" et "abonne"
- OBLIGATOIRE: voiceover_script DOIT se terminer avec une mention de travito.ma
- INTERDIT: CTA vide, CTA sans travito.ma, voiceover tronque`;

  // Retry wrapper — auto mode: 20min between retries | manual mode: 12s/24s
  const callWithRetry = async (body, attempt = 1) => {
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (attempt < 3 && (r.status === 529 || (d.error?.type === "overloaded_error") ||
        (d.error?.message||"").toLowerCase().includes("overload"))) {
      const wait = isAuto
        ? 20 * 60 * 1000          // auto: 20 min between retries
        : attempt * 12000;         // manual: 12s then 24s
      await new Promise(res => setTimeout(res, wait));
      return callWithRetry(body, attempt + 1);
    }
    return d;
  };

  const data = await callWithRetry({
    max_tokens: 4000,
    system: "Tu crees des Bibles de production pour YouTube Shorts Travito Maroc. REGLES ABSOLUES: (1) segment CTA DOIT contenir travito.ma + invitation abonnement dans narration_text (2) voiceover_script DOIT se terminer par mention travito.ma (3) JSON valide uniquement sans markdown.",
    messages: [{ role: "user", content: prompt }]
  });
  if (!data.content?.[0]) throw new Error("API error: "+(data.error?.message||"unknown"));
  const raw = data.content[0].text;
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON in bible response");
  const tryParseBible = (str) => {
    try { return JSON.parse(str); } catch {}
    const fixed = str
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/‘|’/g, "'")
      .replace(/“|”/g, '"')
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
    try { return JSON.parse(fixed); } catch(e2) {
      throw new Error("Bible JSON parse: "+e2.message.slice(0,60));
    }
  };
  const bible = tryParseBible(raw.substring(s, e+1));
  bible.bible_id = "bible_"+uid();
  return bible;
}

// ── SHARED HELPER COMPONENTS ─────────────────────────────────

// ── HELPER COMPONENTS ────────────────────────────────────────────
function Section({ title, color, action, children }) {
  return (
    <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7, padding:"8px 10px", marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontSize:8, color:color||C.gold, fontFamily:"monospace", fontWeight:700 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display:"flex", gap:8, marginBottom:3 }}>
      <span style={{ fontSize:8, color:C.muted, width:130, flexShrink:0 }}>{label}:</span>
      <span style={{ fontSize:8, color:C.text, flex:1 }}>{Array.isArray(value)?value.join(", "):String(value||"")}</span>
    </div>
  );
}

function ScoreBadge({ score }) {
  const c = score >= 85 ? C.green : score >= 70 ? C.amber : C.red;
  return (
    <span style={{ fontSize:8, padding:"1px 6px", borderRadius:4, fontFamily:"monospace", fontWeight:700,
      background:score>=85?"rgba(16,185,129,0.12)":score>=70?"rgba(245,158,11,0.12)":"rgba(239,68,68,0.12)",
      color:c, border:"1px solid "+c+"44" }}>
      {score}%
    </span>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{ fontSize:7, padding:"1px 6px", borderRadius:4,
      background:(color||C.blue)+"18", color:color||C.blue,
      border:"1px solid "+(color||C.blue)+"33" }}>{label}</span>
  );
}

function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={()=>{navigator.clipboard.writeText(text||"");setCopied(true);setTimeout(()=>setCopied(false),1500);}}
      style={{ fontSize:7, padding:"2px 8px", background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.3)", borderRadius:4, color:C.gold, cursor:"pointer", fontWeight:700 }}>
      {copied?"Copie!":label||"Copier"}
    </button>
  );
}

// ── IDEA CARD ────────────────────────────────────────────────────
function IdeaCard({ idea, isSelected, onSelect, onDelete, onPark, onApprove }) {
  const ss = STATUS_STYLE[idea.status] || STATUS_STYLE.generated;
  return (
    <div onClick={onSelect} style={{ padding:"8px 10px", marginBottom:5, borderRadius:8, cursor:"pointer",
      background:isSelected?"rgba(212,175,55,0.1)":"rgba(0,0,0,0.2)",
      border:"1px solid "+(isSelected?C.gold:C.border) }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ fontSize:8, color:C.muted, fontFamily:"monospace", fontWeight:700 }}>#{idea.rank}</span>
          <ScoreBadge score={idea.totalScore||0}/>
          {idea.bible && <span style={{ fontSize:7, color:C.green }}>📖</span>}
          {idea.suitabilityFlags?.visualizable === false && <span style={{ fontSize:7, color:C.red }}>⚠️</span>}
        </div>
        <span style={{ fontSize:7, padding:"1px 5px", borderRadius:3, background:ss.bg, color:ss.color, border:"1px solid "+ss.color+"44", flexShrink:0 }}>{ss.label}</span>
      </div>
      <div style={{ fontSize:9, color:C.text, fontWeight:600, lineHeight:1.3, marginBottom:3 }}>{idea.topic}</div>
      <div style={{ fontSize:7.5, color:C.muted, lineHeight:1.3, marginBottom:3 }}>{idea.angle}</div>
      {idea.hook && <div style={{ fontSize:7, color:C.gold, fontStyle:"italic", marginBottom:4, lineHeight:1.3 }}>"{idea.hook}"</div>}
      <div style={{ display:"flex", gap:3, justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", gap:3 }}>
          <Chip label={idea.format} color={C.purple}/>
          <Chip label={"~"+idea.estimatedWords+"m"} color={C.muted}/>
        </div>
        <div style={{ display:"flex", gap:3 }}>
          {!["published","approved","queued","rendering","rendered"].includes(idea.status) && idea.bible && (
            <button onClick={e=>{e.stopPropagation();onApprove();}}
              style={{ fontSize:6.5, padding:"1px 6px", background:"rgba(29,161,242,0.1)", border:"1px solid rgba(29,161,242,0.3)", borderRadius:3, color:C.blue, cursor:"pointer" }}>
              ✅ Approuver
            </button>
          )}
          {!idea.bible && !["published","approved","queued","rendering","rendered"].includes(idea.status) && (
            <span style={{ fontSize:6, color:C.muted, fontStyle:"italic" }}>📖 Bible d abord</span>
          )}
          {!["published","parked"].includes(idea.status) && (
            <button onClick={e=>{e.stopPropagation();onPark();}}
              style={{ fontSize:6.5, padding:"1px 5px", background:"rgba(107,96,80,0.1)", border:"1px solid rgba(107,96,80,0.3)", borderRadius:3, color:C.muted, cursor:"pointer" }}>
              Parker
            </button>
          )}
          <button onClick={e=>{e.stopPropagation();onDelete();}}
            style={{ fontSize:6.5, padding:"1px 5px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:3, color:C.red, cursor:"pointer" }}>
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BIBLE PANEL ──────────────────────────────────────────────────
function BiblePanel({ idea, agent, onGenerate, generating }) {
  const bible = idea.bible;
  const [expandedSeg, setExpandedSeg] = useState(null);

  if (!bible) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, paddingTop:50 }}>
      <div style={{ fontSize:48 }}>📖</div>
      <div style={{ fontSize:12, color:C.text, fontWeight:700 }}>Bible non generee</div>
      <div style={{ fontSize:9, color:C.muted, textAlign:"center", maxWidth:320, lineHeight:1.7 }}>
        Bible legere avec segments, queries Pexels, script voiceover, sous-titres et metadata de rendu
      </div>
      <button onClick={onGenerate} disabled={generating}
        style={{ padding:"11px 32px", background:"linear-gradient(135deg,#D4AF37,#b8860b)", border:"none", borderRadius:8, color:"#000", fontWeight:700, cursor:generating?"not-allowed":"pointer", fontSize:11 }}>
        {generating ? "Generation en cours..." : "Generer la Bible"}
      </button>
    </div>
  );

  const segments = bible.segment_timeline || [];

  return (
    <div>
      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ flex:1, marginRight:10 }}>
          <div style={{ fontSize:10, color:C.gold, fontFamily:"monospace", fontWeight:700, marginBottom:2 }}>{bible.title||idea.topic}</div>
          <div style={{ fontSize:8, color:C.muted }}>{bible.angle}</div>
        </div>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          {bible.quality_score && <ScoreBadge score={bible.quality_score}/>}
          <button onClick={onGenerate} disabled={generating}
            style={{ fontSize:8, padding:"3px 8px", background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.3)", borderRadius:5, color:C.gold, cursor:"pointer" }}>
            Regenerer
          </button>
        </div>
      </div>

      {/* Info chips */}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
        <Chip label={bible.target_duration_sec+"s"} color={C.blue}/>
        <Chip label={bible.estimated_word_count+" mots"} color={C.purple}/>
        <Chip label={(bible.language||"fr").toUpperCase()} color={C.amber}/>
        <Chip label={bible.visual_theme||"—"} color={C.teal}/>
        <Chip label={bible.preferred_pacing||"—"} color={C.muted}/>
        <Chip label={bible.voice_style||"—"} color={C.green}/>
        <Chip label={"Opener: "+bible.opener_template_id} color={C.gold}/>
        <Chip label={"CTA: "+bible.cta_template_id} color={C.gold}/>
      </div>

      {/* Visual harmony */}
      <Section title="HARMONIE VISUELLE" color={C.teal}>
        <Row label="Energie clips" value={bible.preferred_clip_energy}/>
        <Row label="Humeur couleur" value={bible.preferred_color_mood}/>
        <Row label="Style clips" value={bible.preferred_clip_style}/>
        <Row label="Densite personnes" value={bible.preferred_people_density}/>
        <Row label="Environnements" value={bible.preferred_environment_types}/>
        {bible.avoid_styles?.length > 0 && (
          <Row label="Eviter styles" value={bible.avoid_styles}/>
        )}
      </Section>

      {/* Segments */}
      {segments.length > 0 && (
        <Section title={"SEGMENTS ("+segments.length+") — opener+hook+points+cta"} color={C.amber}>
          {segments.map((seg, i) => {
            const isExp = expandedSeg === seg.segment_id;
            const segColor = seg.segment_type==="opener"?C.muted:seg.segment_type==="hook"?C.gold:seg.segment_type==="cta"?C.green:C.blue;
            return (
              <div key={i} style={{ marginBottom:6 }}>
                <div onClick={()=>setExpandedSeg(isExp?null:seg.segment_id)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 8px",
                    background:"rgba(0,0,0,0.3)", borderRadius:6, cursor:"pointer",
                    border:"1px solid "+(isExp?"rgba(212,175,55,0.2)":"rgba(255,255,255,0.04)") }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:7, padding:"1px 5px", borderRadius:3, background:segColor+"18", color:segColor, border:"1px solid "+segColor+"33", fontFamily:"monospace" }}>
                      {seg.segment_type}
                    </span>
                    <span style={{ fontSize:8, color:C.text, fontWeight:600 }}>{seg.on_screen_text}</span>
                    <span style={{ fontSize:7, color:C.muted }}>{seg.target_duration_sec}s</span>
                  </div>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <CopyBtn text={seg.narration_text} label="Narration"/>
                    <span style={{ fontSize:8, color:C.muted }}>{isExp?"▲":"▼"}</span>
                  </div>
                </div>
                {isExp && (
                  <div style={{ padding:"8px 10px", background:"rgba(0,0,0,0.2)", borderRadius:"0 0 6px 6px", border:"1px solid rgba(255,255,255,0.04)", borderTop:"none" }}>
                    {seg.narration_text && <Row label="Narration" value={seg.narration_text}/>}
                    {seg.subtitle_text  && <Row label="Sous-titre" value={seg.subtitle_text}/>}
                    {seg.pexels_query_primary && (
                      <div style={{ marginTop:6 }}>
                        <div style={{ fontSize:7, color:C.amber, fontFamily:"monospace", marginBottom:3 }}>PEXELS QUERIES</div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          <span style={{ fontSize:7.5, padding:"2px 8px", borderRadius:4, background:"rgba(245,158,11,0.1)", color:C.amber, border:"1px solid rgba(245,158,11,0.2)" }}>
                            1. {seg.pexels_query_primary}
                          </span>
                          {seg.pexels_query_secondary && (
                            <span style={{ fontSize:7.5, padding:"2px 8px", borderRadius:4, background:"rgba(107,96,80,0.1)", color:C.muted, border:"1px solid rgba(107,96,80,0.2)" }}>
                              2. {seg.pexels_query_secondary}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {seg.visual_keywords?.length > 0 && (
                      <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>
                        {seg.visual_keywords.map((kw,j)=>(
                          <span key={j} style={{ fontSize:7, padding:"1px 5px", borderRadius:8, background:"rgba(139,92,246,0.1)", color:"#8b5cf6", border:"1px solid rgba(139,92,246,0.2)" }}>{kw}</span>
                        ))}
                      </div>
                    )}
                    {seg.emphasis_words?.length > 0 && <Row label="Emphase" value={seg.emphasis_words}/>}
                    {seg.transition_in && <Row label="Transition" value={seg.transition_in+" → "+seg.transition_out}/>}
                    {seg.edit_style && <Row label="Style edit" value={seg.edit_style}/>}
                    {seg.audio_timing_hint && <Row label="Audio hint" value={seg.audio_timing_hint}/>}
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* Voiceover */}
      {bible.voiceover_script && (
        <Section title="SCRIPT VOICEOVER" color={C.gold}
          action={<CopyBtn text={bible.voiceover_script} label="Copier Script"/>}>
          <div style={{ fontSize:9, color:C.text, lineHeight:1.8 }}>{bible.voiceover_script}</div>
        </Section>
      )}

      {/* CTA */}
      {bible.cta_text && (
        <div style={{ padding:"8px 10px", background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:7, marginBottom:8 }}>
          <div style={{ fontSize:8, color:C.green, fontFamily:"monospace", fontWeight:700, marginBottom:3 }}>CTA</div>
          <div style={{ fontSize:9, color:C.text }}>{bible.cta_text}</div>
        </div>
      )}

      {/* Subtitle blocks */}
      {bible.subtitle_blocks?.length > 0 && (
        <Section title="SOUS-TITRES" color={C.blue}>
          {bible.subtitle_blocks.map((b,i)=>(
            <div key={i} style={{ fontSize:8, color:C.text, padding:"2px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{i+1}. {b}</div>
          ))}
        </Section>
      )}

      {/* Visual keywords */}
      {bible.visual_keyword_map?.length > 0 && (
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:8, color:C.gold, fontFamily:"monospace", marginBottom:5, fontWeight:700 }}>MOTS-CLES VISUELS</div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {bible.visual_keyword_map.map((kw,i)=>(
              <span key={i} onClick={()=>navigator.clipboard.writeText(kw)}
                style={{ fontSize:8, padding:"2px 8px", borderRadius:10, background:"rgba(139,92,246,0.1)", color:"#8b5cf6", border:"1px solid rgba(139,92,246,0.2)", cursor:"pointer" }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hashtags */}
      {bible.hashtags?.length > 0 && (
        <Section title="HASHTAGS" color={C.purple}
          action={<CopyBtn text={bible.hashtags.join(" ")} label="Copier tous"/>}>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {bible.hashtags.map((h,i)=>(
              <span key={i} onClick={()=>navigator.clipboard.writeText(h)}
                style={{ fontSize:8, padding:"2px 10px", borderRadius:12, background:"rgba(139,92,246,0.1)", color:"#8b5cf6", border:"1px solid rgba(139,92,246,0.2)", cursor:"pointer" }}>
                {h}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Render info */}
      <Section title="PRODUCTION" color={C.muted}>
        <Row label="Bible ID" value={bible.bible_id}/>
        <Row label="Render strategy" value={bible.render_strategy}/>
        <Row label="Pexels strategy" value={bible.pexels_strategy}/>
        <Row label="Production status" value={bible.production_status}/>
        <Row label="Approval status" value={bible.approval_status}/>
        <Row label="Music style" value={bible.music_style}/>
        {bible.source_notes && <Row label="Sources" value={bible.source_notes}/>}
      </Section>
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────


// ── YOUTUBE IDEATION AGENT ───────────────────────────────────────
export default function YouTubeIdeationAgent({
  ideas, setIdeas, agents, weeklySlots, automation,
  selected, setSelected, activeAgent, setActiveAgent,
  addLog, generating, setGenerating,
}) {
  const [tab, setTab]               = useState("ideas");  // ideas | parked | published
  const [weekFilter, setWeekFilter] = useState(getWeekKey());
  const [massSelected, setMassSelected] = useState(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);

  const todaySlot = weeklySlots.find(s => s.dow === new Date().getDay() && s.enabled);
  const todayAgentId = todaySlot?.agentId || null;

  // All week keys with ideas
  const allWeeks = [...new Set(ideas.map(i => i.weekKey).filter(Boolean))].sort().reverse();
  if (!allWeeks.includes(weekFilter) && allWeeks.length > 0) {
    // ensure current week always in list
  }
  const weekKeys = [...new Set([getWeekKey(), ...allWeeks])].sort().reverse();

  // Filtered ideas for current view
  const getFiltered = () => {
    const base = ideas.filter(i => i.agentId === activeAgent);
    let filtered = base;
    if (tab === "ideas") {
      filtered = base.filter(i => i.status !== "parked");
      if (weekFilter) filtered = filtered.filter(i => !i.weekKey || i.weekKey === weekFilter);
      // Sort: fresh ranked ideas first, then protected (in-production), then published at bottom
      const PROTECTED  = ["queued","rendering","rendered","approved"];
      const fresh      = filtered.filter(i => !PROTECTED.includes(i.status) && i.status !== "published")
                                 .sort((a,b) => (a.rank||99)-(b.rank||99));
      const protected_ = filtered.filter(i => PROTECTED.includes(i.status))
                                 .sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0));
      const published_ = filtered.filter(i => i.status === "published")
                                 .sort((a,b) => new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
      return [...fresh, ...protected_, ...published_];
    } else if (tab === "parked") {
      filtered = base.filter(i => i.status === "parked");
    } else if (tab === "published") {
      filtered = base.filter(i => i.status === "published");
    }
    return filtered.sort((a,b) => (a.rank||99) - (b.rank||99));
  };
  const filteredIdeas = getFiltered();

  const queueCount = (agentId) => ideas.filter(i => i.agentId === agentId && !["published","parked"].includes(i.status)).length;
  const pubCount   = (agentId) => ideas.filter(i => i.agentId === agentId && i.status === "published").length;
  const hasTop     = (agentId) => ideas.some(i => i.agentId === agentId && i.status === "selected");

  // ── AUTOMATION — runs only when ideas count changes ─────────
  // Tracks which idea IDs have already had auto-bible triggered this session
  // Automation trigger sets — persisted in KV so they survive:
  //   - tab switches, page refreshes, new devices, incognito
  // Key includes today's date so they auto-reset next day
  const _today = new Date().toISOString().split("T")[0];
  const autoBibleTriggered   = useState(() => new Set())[0];
  const autoApproveTriggered = useState(() => new Set())[0];

  // Load triggered sets from KV on mount
  useEffect(() => {
    fetch("/api/kv?key=travito:yt_bible_triggered:" + _today)
      .then(r=>r.json()).then(d => {
        if (Array.isArray(d.config?.ids)) d.config.ids.forEach(id => autoBibleTriggered.add(id));
      }).catch(()=>{});
    fetch("/api/kv?key=travito:yt_approve_triggered:" + _today)
      .then(r=>r.json()).then(d => {
        if (Array.isArray(d.config?.ids)) d.config.ids.forEach(id => autoApproveTriggered.add(id));
      }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markBibleTriggered = (id) => {
    autoBibleTriggered.add(id);
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:yt_bible_triggered:"+_today,
        value: JSON.stringify({ ids:[...autoBibleTriggered], date:_today }) }) }).catch(()=>{});
  };
  const markApproveTriggered = (id) => {
    autoApproveTriggered.add(id);
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:yt_approve_triggered:"+_today,
        value: JSON.stringify({ ids:[...autoApproveTriggered], date:_today }) }) }).catch(()=>{});
  };

  useEffect(() => {
    if (!todayAgentId) return;
    const wk = getWeekKey();
    const todayIdeas = ideas.filter(i =>
      i.agentId === todayAgentId && i.weekKey === wk &&
      !["published","parked","deleted"].includes(i.status)
    );

    // 1. autoGenerateIdeas — only if truly no ideas exist
    if (automation?.autoGenerateIdeas && todayIdeas.length === 0) {
      addLog("Auto: generation idees " + todayAgentId + "...", "auto");
      setTimeout(() => generateIdeasFor(todayAgentId, wk, "", true), 800);
      return;
    }

    if (todayIdeas.length === 0) return;

    // Only act on rank #1 idea
    const topIdea = [...todayIdeas].sort((a,b) => (a.rank||99)-(b.rank||99))[0];
    if (!topIdea) return;

    // 2. autoGenerateBible — only for rank #1, only once per idea ID
    if (automation?.autoGenerateBible &&
        !topIdea.bible &&
        !generating &&
        !autoBibleTriggered.has(topIdea.id) &&
        topIdea.status === "selected") {
      markBibleTriggered(topIdea.id);
      addLog("Auto: Bible pour #1 — " + topIdea.topic.slice(0,30), "auto", {topic: topIdea.topic, source: "auto"});
      setSelected(topIdea);
      setTimeout(() => generateBibleForIdea(topIdea, "", true), 1200);
      return;
    }

    // 3. autoApproveTopIdea — only if has bible, only once per idea ID
    if (automation?.autoApproveTopIdea &&
        topIdea.bible &&
        !autoApproveTriggered.has(topIdea.id) &&
        topIdea.status === "selected") {
      markApproveTriggered(topIdea.id);
      addLog("Auto: approbation #1 — " + topIdea.topic.slice(0,30), "auto", {topic: topIdea.topic, source: "auto"});
      handleApprove(topIdea.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas.length, ideas.filter(i=>i.bible).length]);

  // ── HANDLERS ──────────────────────────────────────────────────
  const handleDeleteIdea = (id) => {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    // Clear from triggered sets so automation doesn't re-run if idea is restored
    autoBibleTriggered.delete(id);
    autoApproveTriggered.delete(id);
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:yt_bible_triggered:"+_today,
        value: JSON.stringify({ ids:[...autoBibleTriggered], date:_today }) }) }).catch(()=>{});
    fetch("/api/kv", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:yt_approve_triggered:"+_today,
        value: JSON.stringify({ ids:[...autoApproveTriggered], date:_today }) }) }).catch(()=>{});
    const wasSelected = idea.status === "selected";
    setIdeas(prev => {
      const filtered = prev.filter(i => i.id !== id);
      if (wasSelected) {
        const candidates = filtered
          .filter(i => i.agentId === idea.agentId && !["deleted","published","parked","failed"].includes(i.status))
          .sort((a,b) => a.rank - b.rank);
        if (candidates.length > 0) {
          addLog("Auto-promotion: " + candidates[0].topic.slice(0,35), "success");
          return filtered.map(i => i.id === candidates[0].id ? {...i, status:"selected"} : i);
        } else {
          addLog("Jour sans idees valides — regeneration necessaire", "error");
        }
      }
      return filtered;
    });
    if (selected?.id === id) setSelected(null);
    addLog("Idee supprimee");
  };

  const handleMassDelete = () => {
    if (massSelected.size === 0) return;
    massSelected.forEach(id => handleDeleteIdea(id));
    setMassSelected(new Set());
  };

  const handleApprove = (id) => {
    setIdeas(prev => prev.map(i => i.id === id ? {...i, status:"approved", approval_status:"approved"} : i));
    // Sync selected immediately so buttons update
    setSelected(prev => prev?.id === id ? {...prev, status:"approved", approval_status:"approved"} : prev);
    const approvedIdea = ideas.find(i => i.id === id);
    addLog("Idee approuvee — prete pour production", "success", {topic: approvedIdea?.topic, source: "manuel"});
  };

  const handlePark = (id) => {
    setIdeas(prev => prev.map(i => i.id === id ? {...i, status:"parked", parkedAt:new Date().toISOString()} : i));
    if (selected?.id === id) setSelected(null);
    addLog("Idee parkee pour " + PARK_DAYS + " jours");
  };

  const handleUnpark = (id) => {
    setIdeas(prev => prev.map(i => i.id === id ? {...i, status:"generated", parkedAt:null} : i));
    addLog("Idee restauree", "success");
  };

  const generateIdeasFor = async (agentId, weekKey, feedbackContext = "", isAuto = false) => {
    const effectiveCount = Math.min(5, Math.max(1, automation?.ideasPerDay ?? IDEAS_PER_DAY));
    setGenerating(true);
    const agent = agents.find(a => a.id === agentId);
    if (!agent) { addLog("Agent inconnu: " + agentId, "error"); setGenerating(false); return; }
    const wk = weekKey || getWeekKey();
    const isRetry = !!feedbackContext;
    addLog((isRetry ? "Re-generation (feedback QC) " : "Generation ") + effectiveCount + " idees — " + agent.name + " [" + wk + "]...", "info", {source: feedbackContext ? "auto" : "manuel"});
    try {
      let ytVideos = [];
      try {
        const cd = await (await fetch("/api/kv?key=travito:yt_insights:" + agentId)).json();
        if (cd.success && cd.config?.topVideos?.length > 0) {
          ytVideos = cd.config.topVideos;
          addLog(ytVideos.length + " videos reference en cache", "success");
        }
      } catch {}

      // Fetch global blacklist (shared across Twitter + YouTube)
      let globalBlacklist = [];
      try {
        const blr = await fetch("/api/kv?key=travito:global_blacklist");
        const bld = await blr.json();
        if (Array.isArray(bld.config?.words) && bld.config.words.length > 0) {
          globalBlacklist = bld.config.words;
        }
      } catch {}

      // Build custom instructions: agent prompt + QC feedback if retry
      const customInstructions = (agent.customPrompt || "") + (feedbackContext ? "\n\nFEEDBACK QUALITE PRECEDENTE (corriger imperativement): " + feedbackContext : "");

      // Tier 1: Hard avoid — published + approved ideas (30 days) — topic already chosen
      const hardAvoid = ideas.filter(i =>
        i.agentId === agentId &&
        (i.status === "published" ||
         (["approved","queued","rendering","rendered"].includes(i.status)))
      );
      // Tier 2: Soft avoid — recent generated ideas (14 days) — avoid same angle
      const duplicateCutoff = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 3600 * 1000);
      // Soft avoid: ALL non-published ideas within 60 days (including deleted from UI)
      // parked + failed + generated all count as "tried recently"
      const softAvoid = ideas.filter(i =>
        i.agentId === agentId &&
        !["published"].includes(i.status) &&
        !hardAvoid.find(h => h.id === i.id) && // don't double-count hardAvoid
        i.createdAt && new Date(i.createdAt) > duplicateCutoff
      );
      // Fetch long-term published history from KV (survives idea deletion)
      let kvHistory = [];
      try {
        const hr = await fetch("/api/kv?key=travito:yt_history:" + agentId);
        const hd = await hr.json();
        if (Array.isArray(hd.config?.topics)) {
          const duplicateCutoffTs = Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 3600 * 1000;
          kvHistory = hd.config.topics
            .filter(t => new Date(t.date||0).getTime() > duplicateCutoffTs)
            .map(t => ({ topic: t.topic, status: "published", agentId }));
        }
      } catch {}
      const avoidList = [...hardAvoid, ...softAvoid, ...kvHistory];
      // Generate exactly enough to fill available slots
      // Manual trigger always generates full IDEAS_PER_DAY
      // Auto mode respects slotsNeeded to avoid duplicating protected ideas
      const slotsNeeded = isAuto
        ? Math.max(1, effectiveCount - ideas.filter(i =>
            i.agentId === agentId && i.weekKey === wk &&
            ["published","queued","rendering","rendered","approved"].includes(i.status)
          ).length)
        : effectiveCount;
      const newIdeas = await generateIdeasForDay(agent, avoidList, ytVideos, customInstructions, slotsNeeded, globalBlacklist);

      // QC evaluation
      if (automation?.qcEnabled !== false) {
        const threshold = automation?.qcThreshold ?? 60;
        const maxRetries = automation?.qcMaxRetriesPerDay ?? 3;
        addLog("QC Agent — evaluation " + newIdeas.length + " idees...");
        try {
          const qcResult = await evaluateIdeas(newIdeas, agent, threshold);
          addLog(
            "QC Ideas: " + qcResult.score + "% " + (qcResult.pass ? "PASS" : "FAIL") +
            (qcResult.topIssue ? " — " + qcResult.topIssue : ""),
            qcResult.pass ? "success" : "error",
            {topic: newIdeas[0]?.topic, source: "auto"}
          );
          // Store per-idea QC scores on each idea
          if (qcResult.perIdea && qcResult.perIdea.length > 0) {
            qcResult.perIdea.forEach(qr => {
              const idx = newIdeas.findIndex(i => i.id === qr.ideaId);
              if (idx > -1) {
                newIdeas[idx] = { ...newIdeas[idx], qcScore: qr.score, qcVerdict: qr.verdict, qcIssue: qr.issue, qcSuggestion: qr.suggestion, qcScores: qr.scores };
              }
            });
            addLog(qcResult.perIdea.map(r=>r.topic.slice(0,20)+" "+r.score+"%").join(" | "), "info", {topic: newIdeas[0]?.topic});
          }
          // Log detailed QC verdict
          addLog(
            "QC: avg=" + qcResult.score + "% top=" + (qcResult.topIdeaScore||"?") + "%" +
            " | avg " + (qcResult.avgPasses?"PASS":"FAIL") +
            " | top " + (qcResult.topIdeaPasses?"PASS":"FAIL"),
            qcResult.pass ? "success" : "error",
            {topic: newIdeas[0]?.topic, source: "auto"}
          );

          if (!qcResult.pass && !isRetry) {
            // Both avg AND top idea failed threshold
            const ok = await canRetry(agentId, maxRetries);
            if (ok) {
              const retryNum = await incrementRetry(agentId);
              addLog(
                "QC fail (retry " + retryNum + "/" + maxRetries + ") — " +
                "suppression idees agent [" + wk + "] et regeneration avec feedback",
                "auto"
              );
              // Delete only this agent's ideas for this week before retry
              // Preserve: published, other agents, other weeks, QC history
              setIdeas(prev => prev.filter(i =>
                !(i.agentId === agentId && i.weekKey === wk && !["published"].includes(i.status))
              ));
              setGenerating(false);
              return generateIdeasFor(agentId, wk, qcResult.topIssue + " | " + qcResult.feedback);
            } else {
              addLog("QC fail — quota " + maxRetries + " retries/jour atteint — idees conservees", "error");
            }
          } else if (!qcResult.pass && isRetry) {
            addLog("QC fail apres retry — idees conservees (quota epuise)", "error");
          }
        } catch(qcErr) {
          addLog("QC erreur: " + qcErr.message + " — idees acceptees", "error");
        }
      }

      const slot = weeklySlots.find(s => s.agentId === agentId);
      const dayName = slot?.day || "";
      // Protected: published, queued/rendering/rendered (active production) — cannot be replaced
      const PROTECTED_STATUSES = ["published","queued","rendering","rendered"];
      const protectedIdeas = ideas.filter(i =>
        i.agentId === agentId && i.weekKey === wk && PROTECTED_STATUSES.includes(i.status)
      );
      // Only keep up to (IDEAS_PER_DAY - protectedCount) new ideas to maintain total = IDEAS_PER_DAY
      const slotsAvailable = Math.max(0, effectiveCount - protectedIdeas.length);
      const ideasToAdd = newIdeas.slice(0, slotsAvailable);
      addLog(
        `Protected: ${protectedIdeas.length} | New slots: ${slotsAvailable} | Adding: ${ideasToAdd.length}`,
        "info"
      );
      const tagged = ideasToAdd.map(idea => ({
        ...idea, weekKey: wk, scheduledDay: dayName, topicType: agentId,
      }));
      setIdeas(prev => {
        // Keep: any approved/in-production idea regardless of week (carry-forward)
        // Remove: generated (non-approved) ideas for this agent+week only
        const kept = prev.filter(i => {
          if (i.agentId !== agentId) return true; // different agent — keep
          if (PROTECTED_STATUSES.includes(i.status)) return true; // in-production — keep
          if (i.status === "approved" || i.status === "parked") return true; // chosen/parked — keep
          if (i.weekKey !== wk) return true; // different week non-approved — keep (history)
          return false; // generated this week, not approved — replace with fresh
        });
        return [...kept, ...tagged];
      });
      if (tagged[0]) setSelected(tagged[0]);
      addLog(tagged.length + " idees ajoutees — top: " + tagged[0]?.totalScore + "% — " + tagged[0]?.topic?.slice(0,35), "success", {topic: tagged[0]?.topic});
    } catch(err) {
      if (isAuto && (err.message||"").toLowerCase().includes("overload")) {
        addLog("Overloaded — retry auto dans 20 min...", "auto");
        setGenerating(false);
        setTimeout(() => generateIdeasFor(agentId, weekKey, feedbackContext, true), 20 * 60 * 1000);
        return;
      }
      addLog("Erreur generation: " + err.message, "error");
    }
    setGenerating(false);
  };

  const generateWeeklyPlan = async (weekKey) => {
    setGenerating(true);
    const wk = weekKey || getWeekKey();
    const enabledSlots = weeklySlots.filter(s => s.enabled && s.agentId);
    addLog("Generation plan semaine [" + wk + "] — " + enabledSlots.length + " agents...");
    for (const slot of enabledSlots) {
      const agent = agents.find(a => a.id === slot.agentId);
      if (!agent) continue;
      addLog(agent.icon + " " + agent.name + "...");
      try {
        let ytVideos = [];
        try {
          const cd = await (await fetch("/api/kv?key=travito:yt_insights:" + agent.id)).json();
          if (cd.success && cd.config?.topVideos?.length > 0) ytVideos = cd.config.topVideos;
        } catch {}
        const hardAvoid2 = ideas.filter(i =>
          i.agentId === agent.id &&
          (i.status === "published" || ["approved","queued","rendering","rendered"].includes(i.status))
        );
const duplicateCutoff2 = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 3600 * 1000);
const softAvoid2 = ideas.filter(i =>
  i.agentId === agent.id &&
  i.status === "generated" &&
  i.createdAt &&
  new Date(i.createdAt) > duplicateCutoff2
);
        const newIdeas = await generateIdeasForDay(agent, [...hardAvoid2,...softAvoid2], ytVideos);
        const tagged = newIdeas.map(idea => ({
          ...idea, weekKey: wk, scheduledDay: slot.day, topicType: agent.id,
        }));
        setIdeas(prev => {
          const kept = prev.filter(i =>
            !(i.agentId === agent.id && i.weekKey === wk && !["published"].includes(i.status))
          );
          return [...kept, ...tagged];
        });
        addLog(agent.name + ": " + tagged[0]?.totalScore + "% — " + tagged[0]?.topic?.slice(0,30), "success");
        await new Promise(r => setTimeout(r, 1500));
      } catch(e) { addLog(agent.name + " erreur: " + e.message, "error"); }
    }
    setGenerating(false);
    addLog("Plan semaine [" + wk + "] complet!", "success");
  };

  const generateBibleForIdea = async (idea, bibleFeedback = "", isAuto = false) => {
    // Reset generating in case it was stuck, then set true
    setGenerating(false);
    await new Promise(r => setTimeout(r, 50));
    setGenerating(true);
    const isRetry = !!bibleFeedback;
    addLog((isRetry ? "Re-generation Bible (QC feedback) " : "Generation Bible ") + idea.topic.slice(0,40) + "...", "info", {topic: idea.topic, source: "manuel"});
    try {
      const agent = agents.find(a => a.id === idea.agentId);

      // Fetch global blacklist for Bible prompt
      let globalBlacklist = [];
      try {
        const blr = await fetch("/api/kv?key=travito:global_blacklist");
        const bld = await blr.json();
        if (Array.isArray(bld.config?.words)) globalBlacklist = bld.config.words;
      } catch {}

      // Inject agent customPrompt + QC feedback into idea for bible generation
      const ideaWithContext = {
        ...idea,
        customBibleInstructions: (agent?.customBiblePrompt || agent?.customPrompt || "") + (bibleFeedback ? "\n\nFEEDBACK QC BIBLE (corriger imperativement): " + bibleFeedback : ""),
      };
      const bible = await generateBible(ideaWithContext, agent, isAuto, globalBlacklist);
      const updated = {...idea, bible, bibleScore: bible.quality_score, production_status: "bible_ready",
        qcBibleFeedback: null};

      // QC evaluation on bible
      if (automation?.qcEnabled !== false) {
        const threshold = automation?.qcThreshold ?? 60;
        const maxRetries = automation?.qcMaxRetriesPerDay ?? 3;
        addLog("QC Agent — evaluation Bible...");
        try {
          const qcResult = await evaluateBible(bible, agent, idea, threshold);
          addLog(
            "QC Bible: " + qcResult.score + "% " + (qcResult.pass ? "PASS" : "FAIL") +
            (qcResult.topIssue ? " — " + qcResult.topIssue : ""),
            qcResult.pass ? "success" : "error"
          );
          addLog(
            "QC Bible: " + qcResult.score + "%" + (qcResult.topIssue ? " — " + qcResult.topIssue : ""),
            qcResult.pass ? "success" : "error"
          );

          if (!qcResult.pass && !isRetry) {
            const ok = await canRetry(idea.agentId, maxRetries);
            if (ok) {
              const retryNum = await incrementRetry(idea.agentId);
              addLog(
                "QC Bible fail (retry " + retryNum + "/" + maxRetries + ") — " +
                "suppression Bible et regeneration avec feedback",
                "auto"
              );
              // Delete only this idea's bible — preserve all other data
              setIdeas(prev => prev.map(i =>
                i.id === idea.id
                  ? {...i, bible: null, bibleScore: null, production_status: null,
                     qcBibleFeedback: qcResult.feedback, qcBibleScore: qcResult.score}
                  : i
              ));
              setGenerating(false);
              return generateBibleForIdea({...idea, bible: null}, qcResult.feedback);
            } else {
              addLog("QC Bible fail — quota " + maxRetries + " retries/jour atteint — Bible conservee", "error");
            }
          }
        } catch(qcErr) {
          addLog("QC Bible erreur: " + qcErr.message + " — Bible acceptee", "error");
        }
      }

      setIdeas(prev => prev.map(i => i.id === idea.id ? updated : i));
      setSelected(updated);
      addLog("Bible: " + bible.segment_timeline?.length + " segments | Score: " + bible.quality_score + "%", "success", {topic: idea.topic});
    } catch(err) {
      if (isAuto && (err.message||"").toLowerCase().includes("overload")) {
        addLog("Bible Overloaded — retry auto dans 20 min...", "auto", { topic: idea.topic });
        // Remove from triggered set so it can retry after 20min
        autoBibleTriggered.delete(idea.id);
        setGenerating(false);
        setTimeout(() => generateBibleForIdea(idea, bibleFeedback, true), 20 * 60 * 1000);
        return;
      }
      addLog("Erreur Bible: " + err.message, "error");
    }
    setGenerating(false);
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

      {/* LEFT COL — Agents list */}
      <div style={{ width:160, flexShrink:0, borderRight:"1px solid "+C.border, display:"flex", flexDirection:"column", overflow:"hidden", background:"rgba(8,13,26,0.5)" }}>
        <div style={{ padding:"5px 8px", borderBottom:"1px solid rgba(212,175,55,0.12)", flexShrink:0, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:7, color:C.muted, fontFamily:"monospace", textTransform:"uppercase" }}>Agents</div>
          <button onClick={()=>setShowConfig(p=>!p)}
            style={{ fontSize:7, padding:"1px 5px", background:showConfig?"rgba(212,175,55,0.15)":"transparent", border:"1px solid "+C.border, borderRadius:4, color:showConfig?C.gold:C.muted, cursor:"pointer" }}>
            ⚙️
          </button>
        </div>

        {/* Week selector */}
        <div style={{ padding:"4px 6px", borderBottom:"1px solid rgba(212,175,55,0.08)", flexShrink:0 }}>
          <select value={weekFilter} onChange={e=>setWeekFilter(e.target.value)}
            style={{ width:"100%", fontSize:7, padding:"2px 4px", background:"rgba(0,0,0,0.4)", border:"1px solid "+C.border, borderRadius:4, color:C.gold, outline:"none" }}>
            {weekKeys.map(wk => (
              <option key={wk} value={wk}>{wk === getWeekKey() ? "Cette semaine" : wk}</option>
            ))}
          </select>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"4px 5px" }}>
          {agents.filter(a => a.enabled).map(a => {
            const isToday = a.id === todayAgentId;
            const isActive = a.id === activeAgent;
            const cnt = queueCount(a.id);
            const pub = pubCount(a.id);
            const top = ideas.find(i => i.agentId===a.id && i.status==="selected" && (!weekFilter || i.weekKey===weekFilter));
            return (
              <div key={a.id} onClick={()=>{setActiveAgent(a.id);setTab("ideas");setSelected(null);}}
                style={{ padding:"6px 7px", marginBottom:3, borderRadius:7, cursor:"pointer",
                  background:isActive?"rgba(212,175,55,0.1)":"transparent",
                  border:"1px solid "+(isActive?"rgba(212,175,55,0.4)":isToday?"rgba(212,175,55,0.15)":"transparent") }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                  <span style={{ fontSize:14 }}>{a.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:8, fontWeight:700, color:isActive?C.gold:isToday?"rgba(212,175,55,0.8)":C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</div>
                    <div style={{ fontSize:6.5, color:C.muted }}>
                      {a.durationRange?.[0]||40}-{a.durationRange?.[1]||55}s
                      · ~{Math.round(((a.durationRange?.[0]||40)+(a.durationRange?.[1]||55))/2-6)*2.2|0} mots
                      · {(a.lang||"fr").toUpperCase()}
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", gap:3 }}>
                    {cnt > 0 && <span style={{ fontSize:6.5, color:C.gold, fontFamily:"monospace" }}>{cnt} idees</span>}
                    {pub > 0 && <span style={{ fontSize:6.5, color:C.green, fontFamily:"monospace" }}>{pub} pub</span>}
                    {cnt===0&&pub===0 && <span style={{ fontSize:6.5, color:C.muted }}>Vide</span>}
                  </div>
                  <button onClick={e=>{e.stopPropagation();setActiveAgent(a.id);generateIdeasFor(a.id, weekFilter);}} disabled={generating}
                    style={{ fontSize:6, padding:"1px 4px", background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.3)", borderRadius:3, color:C.green, cursor:"pointer" }}>
                    {generating&&activeAgent===a.id?"...":"+ Gen"}
                  </button>
                </div>
                {top && (
                  <div style={{ marginTop:3, fontSize:6.5, color:C.gold, background:"rgba(212,175,55,0.08)", padding:"1px 4px", borderRadius:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    #{top.rank} {top.topic.slice(0,20)}...
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Weekly plan button */}
        <div style={{ padding:5, borderTop:"1px solid "+C.border, flexShrink:0 }}>
          <button onClick={()=>generateWeeklyPlan(weekFilter)} disabled={generating}
            style={{ width:"100%", fontSize:7, padding:"4px 0", background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.4)", borderRadius:5, color:C.gold, cursor:"pointer", fontWeight:700 }}>
            {generating?"...":"📅 Planifier la semaine"}
          </button>
        </div>
      </div>

      {/* MIDDLE COL — Ideas list */}
      <div style={{ width:220, flexShrink:0, borderRight:"1px solid "+C.border, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"4px 8px", borderBottom:"1px solid rgba(212,175,55,0.12)", flexShrink:0, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:3 }}>
            {[["ideas","Idees"],["parked","Parkes"],["published","Publies"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{ fontSize:7, padding:"2px 5px", borderRadius:4, background:tab===id?"rgba(212,175,55,0.15)":"transparent", border:"1px solid "+(tab===id?C.gold:C.border), color:tab===id?C.gold:C.muted, cursor:"pointer" }}>
                {label}
              </button>
            ))}
          </div>
          {massSelected.size > 0 && (
            <button onClick={handleMassDelete}
              style={{ fontSize:6.5, padding:"1px 5px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:3, color:C.red, cursor:"pointer" }}>
              🗑️ {massSelected.size}
            </button>
          )}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:5 }}>
          {filteredIdeas.length === 0 ? (
            <div style={{ padding:16, textAlign:"center", color:C.muted, fontSize:8, lineHeight:1.6 }}>
              {tab==="ideas"
                ? "Aucune idee — cliquez + Gen ou Planifier la semaine"
                : "Aucun element"}
            </div>
          ) : filteredIdeas.map((idea, listIdx) => {
            const ss = STATUS_STYLE[idea.status] || STATUS_STYLE.generated;
            const isMassSel = massSelected.has(idea.id);
            const PROTECTED = ["queued","rendering","rendered","approved"];
            const isProtected = PROTECTED.includes(idea.status);
            // Show separator before first protected idea
            const prevIdea = filteredIdeas[listIdx - 1];
            const showSep  = isProtected && prevIdea && !PROTECTED.includes(prevIdea.status);
            return (
              <React.Fragment key={idea.id}>
              {showSep && (
                <div style={{ padding:"3px 6px", marginBottom:4, marginTop:2 }}>
                  <div style={{ fontSize:6.5, color:C.muted, fontFamily:"monospace",
                    borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:4 }}>
                    EN PRODUCTION — non supprimables
                  </div>
                </div>
              )}
              <div
                style={{ padding:"7px 9px", marginBottom:4, borderRadius:7, cursor:"pointer",
                  background:selected?.id===idea.id?"rgba(212,175,55,0.1)":isProtected?"rgba(139,92,246,0.04)":"rgba(0,0,0,0.2)",
                  border:"1px solid "+(selected?.id===idea.id?C.gold:isProtected?"rgba(139,92,246,0.2)":isMassSel?"rgba(239,68,68,0.4)":C.border) }}>
                <div onClick={()=>setSelected(idea)} style={{ marginBottom:3 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <input type="checkbox" checked={isMassSel}
                        onChange={e=>{e.stopPropagation();setMassSelected(p=>{const n=new Set(p);isMassSel?n.delete(idea.id):n.add(idea.id);return n;});}}
                        onClick={e=>e.stopPropagation()}
                        style={{ width:9, height:9, cursor:"pointer" }}/>
                      <span style={{ fontSize:7.5, color:isProtected?C.purple:C.muted, fontFamily:"monospace" }}>
                        {isProtected ? "🔒" : "#"+(idea.rank||"?")}
                      </span>
                      <span style={{ fontSize:7.5, padding:"1px 5px", borderRadius:3, fontFamily:"monospace", fontWeight:700,
                        background:idea.totalScore>=85?"rgba(16,185,129,0.12)":idea.totalScore>=70?"rgba(245,158,11,0.12)":"rgba(239,68,68,0.12)",
                        color:idea.totalScore>=85?C.green:idea.totalScore>=70?C.amber:C.red }}>
                        {idea.totalScore||0}%
                      </span>
                      {idea.qcScore != null && (
                        <span style={{ fontSize:7, padding:"1px 4px", borderRadius:3, fontFamily:"monospace",
                          background:idea.qcScore>=60?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
                          color:idea.qcScore>=60?C.green:C.red }}>
                          QC {idea.qcScore}%
                        </span>
                      )}
                      {idea.bible && <span style={{ fontSize:7, color:C.green }}>📖</span>}
                    </div>
                    <span style={{ fontSize:6.5, padding:"1px 4px", borderRadius:3, background:ss.bg, color:ss.color }}>{ss.label}</span>
                  </div>
                  <div style={{ fontSize:8.5, color:C.text, fontWeight:600, lineHeight:1.3, marginBottom:2 }}>{idea.topic}</div>
                  <div style={{ fontSize:7, color:C.muted, lineHeight:1.3 }}>{idea.angle}</div>
                  {idea.qcIssue && (
                    <div style={{ fontSize:6.5, color:C.red, lineHeight:1.3, marginTop:1,
                      padding:"1px 5px", background:"rgba(239,68,68,0.06)", borderRadius:3,
                      borderLeft:"2px solid rgba(239,68,68,0.4)" }}>
                      ⚠️ {idea.qcIssue}
                    </div>
                  )}
                  {idea.qcSuggestion && !idea.qcIssue && (
                    <div style={{ fontSize:6.5, color:C.green, lineHeight:1.3, marginTop:1 }}>
                      💡 {idea.qcSuggestion}
                    </div>
                  )}
                  {idea.weekKey && (
                    <div style={{ fontSize:6.5, color:C.muted, marginTop:2 }}>{idea.weekKey} · {idea.scheduledDay||""}</div>
                  )}
                </div>
                <div style={{ display:"flex", gap:3, justifyContent:"flex-end" }}>
                  {!["published","approved","queued","rendering","rendered"].includes(idea.status) && (
                    <button onClick={e=>{e.stopPropagation();handleApprove(idea.id);}}
                      style={{ fontSize:6, padding:"1px 5px", background:"rgba(29,161,242,0.1)", border:"1px solid rgba(29,161,242,0.3)", borderRadius:3, color:C.blue, cursor:"pointer" }}>
                      Approuver
                    </button>
                  )}
                  {!["published","parked"].includes(idea.status) && (
                    <button onClick={e=>{e.stopPropagation();handlePark(idea.id);}}
                      style={{ fontSize:6, padding:"1px 4px", background:"rgba(107,96,80,0.1)", border:"1px solid rgba(107,96,80,0.3)", borderRadius:3, color:C.muted, cursor:"pointer" }}>
                      Parker
                    </button>
                  )}
                  {idea.status==="parked" && (
                    <button onClick={e=>{e.stopPropagation();handleUnpark(idea.id);}}
                      style={{ fontSize:6, padding:"1px 4px", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:3, color:C.amber, cursor:"pointer" }}>
                      Restaurer
                    </button>
                  )}
                  <button onClick={e=>{e.stopPropagation();handleDeleteIdea(idea.id);}}
                    style={{ fontSize:6, padding:"1px 4px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:3, color:C.red, cursor:"pointer" }}>
                    🗑️
                  </button>
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* RIGHT COL — Bible / detail panel */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {selected ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {/* Generating status bar */}
            {generating && (
              <div style={{ padding:"5px 13px", background:"rgba(212,175,55,0.08)",
                borderBottom:"1px solid rgba(212,175,55,0.2)", flexShrink:0,
                display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:C.gold,
                    animation:"ytpulse 1s infinite" }}/>
                  <span style={{ fontSize:8, color:C.gold }}>Generation en cours...</span>
                </div>
                <button onClick={()=>setGenerating(false)}
                  style={{ fontSize:7, padding:"1px 7px", background:"rgba(239,68,68,0.1)",
                    border:"1px solid rgba(239,68,68,0.3)", borderRadius:4,
                    color:C.red, cursor:"pointer" }}>
                  Annuler
                </button>
              </div>
            )}
            {/* Header */}
            <div style={{ padding:"9px 13px", borderBottom:"1px solid "+C.border, flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1, marginRight:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:2 }}>{selected.topic}</div>
                  <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{selected.angle}</div>
                  {selected.hook && <div style={{ fontSize:8, color:C.gold, fontStyle:"italic", marginBottom:4 }}>"{selected.hook}"</div>}
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    <Chip label={"#"+selected.rank} color={C.muted}/>
                    {selected.totalScore > 0 && <ScoreBadge score={selected.totalScore}/>}
                    <Chip label={selected.format} color={C.purple}/>
                    <Chip label={"~"+selected.estimatedWords+" mots"} color={C.muted}/>
                    {selected.weekKey && <Chip label={selected.weekKey} color={C.teal}/>}
                    {selected.scheduledDay && <Chip label={selected.scheduledDay} color={C.gold}/>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:4, flexShrink:0, flexWrap:"wrap", justifyContent:"flex-end" }}>
                  {selected.bible && <CopyBtn text={selected.bible.voiceover_script} label="Script"/>}
                  {/* Always show Generate Bible button manually */}
                  <button onClick={()=>{ if(!generating) generateBibleForIdea(selected); }}
                    disabled={generating}
                    style={{ fontSize:8, padding:"3px 9px",
                      background:generating?"rgba(107,96,80,0.1)":"rgba(212,175,55,0.1)",
                      border:"1px solid rgba(212,175,55,0.3)", borderRadius:5,
                      color:generating?C.muted:C.gold, cursor:generating?"not-allowed":"pointer", fontWeight:700 }}>
                    {generating?"...":"📖 " + (selected.bible?"Re-gen Bible":"Gen Bible")}
                  </button>
                  {selected.bible && !["approved","queued","rendering","rendered","published"].includes(selected.status) && (
                    <button onClick={()=>handleApprove(selected.id)}
                      style={{ fontSize:8, padding:"3px 9px", background:"rgba(29,161,242,0.1)", border:"1px solid rgba(29,161,242,0.4)", borderRadius:5, color:C.blue, cursor:"pointer", fontWeight:700 }}>
                      ✅ Approuver
                    </button>
                  )}
                  {!selected.bible && !["approved","queued","rendering","rendered","published"].includes(selected.status) && (
                    <span style={{ fontSize:7, color:C.muted, fontStyle:"italic" }}>
                      Generer Bible d abord
                    </span>
                  )}
                  {selected.status==="parked" && (
                    <button onClick={()=>handleUnpark(selected.id)}
                      style={{ fontSize:8, padding:"3px 8px", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:5, color:C.amber, cursor:"pointer" }}>
                      Restaurer
                    </button>
                  )}
                  <button onClick={()=>handleDeleteIdea(selected.id)}
                    style={{ fontSize:8, padding:"3px 8px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:5, color:C.red, cursor:"pointer" }}>
                    Supprimer
                  </button>
                </div>
              </div>
              {/* Score bars */}
              {selected.scores && Object.keys(selected.scores).length > 0 && (
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginTop:6 }}>
                  {[["Maroc",selected.scores.morocco,20],["Hook",selected.scores.hook,20],["Visuel",selected.scores.visual,15],["Frais",selected.scores.fresh,15],["Auto",selected.scores.auto,15],["Court",selected.scores.short,15]].map(([label,val,max])=>(
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:3 }}>
                      <span style={{ fontSize:7, color:C.muted, width:32 }}>{label}</span>
                      <div style={{ width:26, height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:((val||0)/max*100)+"%", borderRadius:2,
                          background:(val||0)>=max*0.8?C.green:(val||0)>=max*0.6?C.amber:C.red }}/>
                      </div>
                      <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>{val||0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Bible panel */}
            <div style={{ flex:1, overflowY:"auto", padding:"10px 13px" }}>
              <BiblePanel
                idea={selected}
                agent={agents.find(a=>a.id===selected.agentId)}
                onGenerate={()=>generateBibleForIdea(selected)}
                generating={generating}
              />
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, color:C.muted }}>
              {generating && (
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px",
                  background:"rgba(212,175,55,0.08)", border:"1px solid rgba(212,175,55,0.2)",
                  borderRadius:6 }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:C.gold,
                    animation:"ytpulse 1s infinite" }}/>
                  <span style={{ fontSize:8, color:C.gold }}>Generation en cours...</span>
                  <button onClick={()=>setGenerating(false)}
                    style={{ fontSize:7, padding:"1px 6px", background:"rgba(239,68,68,0.1)",
                      border:"1px solid rgba(239,68,68,0.3)", borderRadius:3,
                      color:C.red, cursor:"pointer", marginLeft:4 }}>
                    Annuler
                  </button>
                </div>
              )}
              <div style={{ fontSize:36 }}>📋</div>
              <div style={{ fontSize:10, color:C.gold, fontWeight:700 }}>Selectionnez une idee</div>
              <div style={{ fontSize:8, textAlign:"center", maxWidth:220, lineHeight:1.7 }}>
                Cliquez sur une idee pour voir les details et generer la Bible
              </div>
              {ideas.filter(i=>i.agentId===activeAgent&&!["published","parked"].includes(i.status)).length===0 && !generating && (
                <button onClick={()=>generateIdeasFor(activeAgent, weekFilter)}
                  style={{ marginTop:6, padding:"8px 20px", background:"linear-gradient(135deg,#D4AF37,#b8860b)", border:"none", borderRadius:7, color:"#000", fontWeight:700, cursor:"pointer", fontSize:9 }}>
                  Generer {automation?.ideasPerDay ?? IDEAS_PER_DAY} idees
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
