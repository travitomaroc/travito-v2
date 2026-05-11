// ================================================================
//  YouTubeManager.jsx — Main shell: Ideas | QC | Video | Log | Config
//  Orchestrates YouTubeIdeationAgent + YouTubeVideoAgent
//  Shared state flows down; agents communicate via ideas array
// ================================================================
import { useState, useEffect } from "react";
import {
  C,
  todayAgentIdFromSlots,
  DEFAULT_AGENTS,
  DEFAULT_WEEKLY_SLOTS,
  DEFAULT_AUTOMATION,
} from "./youtubeConfig";
import YouTubeIdeationAgent from "./YouTubeIdeationAgent";
import YouTubeVideoAgent    from "./YouTubeVideoAgent";

// ── TABS ──────────────────────────────────────────────────────
const AGENT_TABS = [
  { id:"ideas", icon:"💡", name:"Ideation Agent",  desc:"Idees · Bible · Planning",     color:"#D4AF37" },
  { id:"qc",    icon:"🔎", name:"QC Controller",   desc:"Qualite · Feedback · Retries",  color:"#10b981" },
  { id:"video", icon:"🎬", name:"Video Agent",      desc:"Production · Rendu · Publish",  color:"#8b5cf6" },
];

const SUB_TABS = [
  { id:"log",        label:"📋 Log"        },
  { id:"config",     label:"⚙️ Config"     },
  { id:"bibleprompt",label:"📖 BiblePrompt" },
  { id:"blacklist",  label:"🚫 Blacklist"   },
];

// ── MIGRATION ─────────────────────────────────────────────────
function migrateAgent(agent, defaults = []) {
  const def = defaults.find((d) => d.id === agent.id) || {};
  return {
    ...def,
    ...agent,
    voiceIdFR:    agent.voiceIdFR    ?? agent.voiceId ?? "",  // never from defaults
    voiceIdAR:    agent.voiceIdAR    ?? "",  // never from defaults
    voiceIdEN:    agent.voiceIdEN    ?? "",  // never from defaults
    customPrompt:      agent.customPrompt      ?? def.customPrompt      ?? "",
    customBiblePrompt: agent.customBiblePrompt ?? def.customBiblePrompt ?? "",
    blacklist:         Array.isArray(agent.blacklist) ? agent.blacklist : [],
    enabled:      agent.enabled      ?? def.enabled ?? true,
    durationRange: Array.isArray(agent.durationRange) ? agent.durationRange
                 : Array.isArray(def.durationRange)   ? def.durationRange
                 : [35, 55],
    lang: agent.lang || def.lang || "fr",
  };
}

function loadAgents() {
  try {
    const raw = localStorage.getItem("ytv2_agents");
    if (!raw) return DEFAULT_AGENTS.map((a) => migrateAgent(a, DEFAULT_AGENTS));
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return DEFAULT_AGENTS.map((a) => migrateAgent(a, DEFAULT_AGENTS));
    return saved.map((a) => migrateAgent(a, DEFAULT_AGENTS));
  } catch {
    return DEFAULT_AGENTS.map((a) => migrateAgent(a, DEFAULT_AGENTS));
  }
}

// ── AGENT FORM (outside ConfigPanel to avoid re-mount on edit) ─
function AgentForm({ agent, onSave, onCancel }) {
  const [form, setForm] = useState({ ...agent });
  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const inp = {
    width:"100%", fontSize:9, padding:"4px 7px",
    background:"rgba(0,0,0,0.4)", border:"1px solid rgba(212,175,55,0.18)",
    borderRadius:5, color:"#e8dcc8", outline:"none", boxSizing:"border-box",
  };

  const avgDur       = Math.round(((form.durationRange?.[0]||35)+(form.durationRange?.[1]||55))/2);
  const wordsEstimate = Math.max(50, Math.round((avgDur-6)*2.2));

  return (
    <div style={{ background:"rgba(0,0,0,0.3)", border:"1px solid #D4AF37", borderRadius:8, padding:10, marginBottom:8 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>

        {/* ── PROMPTS — visible at top without scrolling ── */}
        <div style={{ gridColumn:"1 / -1", padding:"8px 10px",
          background:"rgba(212,175,55,0.05)", border:"1px solid rgba(212,175,55,0.15)",
          borderRadius:6, marginBottom:4 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <div style={{ fontSize:7, color:"#D4AF37", fontWeight:700 }}>💡 Prompt Idées</div>
            <button onClick={()=>f("customPrompt","")}
              style={{ fontSize:6.5, padding:"1px 6px", background:"rgba(239,68,68,0.08)",
                border:"1px solid rgba(239,68,68,0.2)", borderRadius:3, color:"#ef4444", cursor:"pointer" }}>
              ✕ Vider
            </button>
          </div>
          <textarea value={form.customPrompt||""} onChange={e=>f("customPrompt",e.target.value)}
            rows={3} placeholder="Instructions pour la génération d idées: sujets, angles, ton, exclusions..."
            style={{...inp, resize:"vertical", lineHeight:1.5, fontFamily:"inherit"}}/>
          <div style={{ fontSize:6.5, color:"#6b6050", marginTop:2, marginBottom:10 }}>
            Injecté dans chaque génération d idées pour cet agent.
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <div style={{ fontSize:7, color:"#8b5cf6", fontWeight:700 }}>📖 Prompt Bible</div>
            <button onClick={()=>f("customBiblePrompt","")}
              style={{ fontSize:6.5, padding:"1px 6px", background:"rgba(239,68,68,0.08)",
                border:"1px solid rgba(239,68,68,0.2)", borderRadius:3, color:"#ef4444", cursor:"pointer" }}>
              ✕ Vider
            </button>
          </div>
          <textarea value={form.customBiblePrompt||""} onChange={e=>f("customBiblePrompt",e.target.value)}
            rows={3} placeholder="Instructions pour la Bible: structure du script, ton, style visuel, CTA personnalisé..."
            style={{...inp, resize:"vertical", lineHeight:1.5, fontFamily:"inherit"}}/>
          <div style={{ fontSize:6.5, color:"#6b6050", marginTop:2 }}>
            Injecté dans chaque génération de Bible pour cet agent.
          </div>
        </div>

        {/* ── BASIC INFO ── */}
        {[["name","Nom"],["icon","Icone"],["color","Couleur"],["description","Description"]].map(([key,label])=>(
          <div key={key} style={{ gridColumn:key==="description"?"1 / -1":"auto" }}>
            <div style={{ fontSize:7, color:"#6b6050", marginBottom:2 }}>{label}</div>
            <input value={form[key]||""} onChange={e=>f(key,e.target.value)} style={inp}/>
          </div>
        ))}

        <div>
          <div style={{ fontSize:7, color:"#6b6050", marginBottom:2 }}>Langue</div>
          <select value={form.lang||"fr"} onChange={e=>f("lang",e.target.value)} style={inp}>
            {["fr","en","ar"].map(l=><option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>

        <div style={{ gridColumn:"1 / -1" }}>
          <div style={{ fontSize:7, color:"#6b6050", fontWeight:700, marginBottom:4 }}>
            Voice IDs ElevenLabs (par langue)
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
            {[["voiceIdFR","🇫🇷 FR"],["voiceIdAR","🇲🇦 AR"],["voiceIdEN","🇬🇧 EN"]].map(([key,label])=>(
              <div key={key}>
                <div style={{ fontSize:6.5, color:"#6b6050", marginBottom:2 }}>{label} Voice ID</div>
                <input value={form[key]||""} onChange={e=>f(key,e.target.value)}
                  placeholder="A renseigner" style={{...inp, fontSize:8}}/>
              </div>
            ))}
          </div>
          <div style={{ fontSize:6.5, color:"#6b6050", marginTop:3 }}>
            Entrez l ID ElevenLabs pour chaque langue utilisee.
          </div>
        </div>

        <div style={{ gridColumn:"1 / -1", padding:"5px 8px",
          background:"rgba(239,68,68,0.04)", border:"1px solid rgba(239,68,68,0.12)",
          borderRadius:5 }}>
          <div style={{ fontSize:6.5, color:"#ef4444" }}>
            🚫 La liste noire globale (concurrents, mots interdits) est gérée dans
            <strong> Config → Blacklist</strong> — s'applique à tous les agents YouTube et Twitter.
          </div>
        </div>

        <div>
          <div style={{ fontSize:7, color:"#6b6050", marginBottom:2 }}>Duree min-max (s)</div>
          <div style={{ display:"flex", gap:4 }}>
            <input type="number" value={form.durationRange?.[0]||35}
              onChange={e=>f("durationRange",[+e.target.value, form.durationRange?.[1]||55])}
              style={{...inp, width:"50%"}}/>
            <input type="number" value={form.durationRange?.[1]||55}
              onChange={e=>f("durationRange",[form.durationRange?.[0]||35, +e.target.value])}
              style={{...inp, width:"50%"}}/>
          </div>
        </div>

        <div style={{ padding:"4px 8px", background:"rgba(16,185,129,0.06)",
          border:"1px solid rgba(16,185,129,0.15)", borderRadius:5, fontSize:7, color:"#10b981" }}>
          💡 Mots auto-calculés depuis la durée:<br/>~{wordsEstimate} mots cible
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <input type="checkbox" checked={!!form.enabled} onChange={e=>f("enabled",e.target.checked)} style={{ cursor:"pointer" }}/>
          <span style={{ fontSize:8, color:"#e8dcc8" }}>Active</span>
        </div>
      </div>

      <div style={{ display:"flex", gap:6 }}>
        <button onClick={()=>onSave(form)}
          style={{ fontSize:8, padding:"4px 14px", background:"rgba(16,185,129,0.12)",
            border:"1px solid rgba(16,185,129,0.4)", borderRadius:5, color:"#10b981",
            cursor:"pointer", fontWeight:700 }}>
          Sauvegarder
        </button>
        <button onClick={onCancel}
          style={{ fontSize:8, padding:"4px 10px", background:"transparent",
            border:"1px solid rgba(212,175,55,0.18)", borderRadius:5,
            color:"#6b6050", cursor:"pointer" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── CONFIG PANEL ──────────────────────────────────────────────
function ConfigPanel({ agents, setAgents, weeklySlots, setWeeklySlots, automation, setAutomation }) {
  const [editingId, setEditingId] = useState(null);
  const [newAgent, setNewAgent]   = useState(null);

  const saveAgent = (updated) => {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingId(null);
  };

  const addAgent = () => {
    setNewAgent({
      id: "agent_" + Date.now().toString(36),
      name:"Nouvel Agent", icon:"⭐", color:"#10b981", enabled:true,
      lang:"fr", durationRange:[35,55], voiceIdFR:"", voiceIdAR:"", voiceIdEN:"",
      description:"", customPrompt:"", customBiblePrompt:"", blacklist:[],
    });
  };

  return (
    <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"12px 16px" }}>

      {/* AGENTS */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:10, color:"#D4AF37", fontFamily:"monospace", fontWeight:700 }}>AGENTS / TOPICS</div>
          <button onClick={addAgent}
            style={{ fontSize:8, padding:"3px 10px", background:"rgba(16,185,129,0.1)",
              border:"1px solid rgba(16,185,129,0.4)", borderRadius:5, color:"#10b981", cursor:"pointer" }}>
            + Ajouter
          </button>
        </div>

        {newAgent && (
          <AgentForm agent={newAgent}
            onSave={a=>{ setAgents(p=>[...p,a]); setNewAgent(null); }}
            onCancel={()=>setNewAgent(null)}/>
        )}

        {agents.map((agent) => {
          const hasFR = !!agent.voiceIdFR;
          const hasAR = !!agent.voiceIdAR;
          const hasEN = !!agent.voiceIdEN;
          return (
            <div key={agent.id} style={{ marginBottom:6 }}>
              {editingId===agent.id ? (
                <AgentForm agent={agent} onSave={saveAgent} onCancel={()=>setEditingId(null)}/>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                  background:"rgba(0,0,0,0.2)", border:"1px solid rgba(212,175,55,0.18)", borderRadius:7 }}>
                  <span style={{ fontSize:16 }}>{agent.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:agent.enabled?"#e8dcc8":"#6b6050" }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize:7, color:"#6b6050" }}>
                      {(agent.lang||"fr").toUpperCase()} / {agent.durationRange?.[0]}-{agent.durationRange?.[1]}s
                      / Voices: {hasFR?"FR✓":"FR×"} · {hasAR?"AR✓":"AR×"} · {hasEN?"EN✓":"EN×"}
                      {" · "}{agent.customPrompt?"💡✓":"💡—"}{" "}{agent.customBiblePrompt?"📖✓":"📖—"}{agent.blacklist?.length>0?" 🚫"+agent.blacklist.length:""}
                    </div>
                  </div>
                  <input type="checkbox" checked={!!agent.enabled}
                    onChange={e=>setAgents(p=>p.map(a=>a.id===agent.id?{...a,enabled:e.target.checked}:a))}
                    style={{ cursor:"pointer" }}/>
                  <button onClick={()=>setEditingId(agent.id)}
                    style={{ fontSize:7, padding:"2px 7px", background:"rgba(212,175,55,0.1)",
                      border:"1px solid rgba(212,175,55,0.3)", borderRadius:4, color:"#D4AF37", cursor:"pointer" }}>
                    Edit
                  </button>
                  <button onClick={()=>{ if(window.confirm("Supprimer "+agent.name+"?")) setAgents(p=>p.filter(a=>a.id!==agent.id)); }}
                    style={{ fontSize:7, padding:"2px 7px", background:"rgba(239,68,68,0.08)",
                      border:"1px solid rgba(239,68,68,0.3)", borderRadius:4, color:"#ef4444", cursor:"pointer" }}>
                    Del
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* PLANNING */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, color:"#D4AF37", fontFamily:"monospace", fontWeight:700, marginBottom:10 }}>
          PLANNING HEBDOMADAIRE
        </div>
        <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid rgba(212,175,55,0.18)", borderRadius:8, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 80px 60px",
            padding:"5px 10px", borderBottom:"1px solid rgba(212,175,55,0.18)", background:"rgba(0,0,0,0.2)" }}>
            {["Jour","Agent","Mode","Actif"].map(h=>(
              <span key={h} style={{ fontSize:7, color:"#6b6050", fontFamily:"monospace" }}>{h}</span>
            ))}
          </div>
          {weeklySlots.map((slot,i)=>(
            <div key={slot.dow} style={{ display:"grid", gridTemplateColumns:"80px 1fr 80px 60px",
              padding:"5px 10px", borderBottom:"1px solid rgba(255,255,255,0.03)", alignItems:"center" }}>
              <span style={{ fontSize:9, color:slot.enabled?"#e8dcc8":"#6b6050" }}>{slot.day}</span>
              <select value={slot.agentId||""} disabled={!slot.enabled}
                onChange={e=>setWeeklySlots(p=>p.map((s,j)=>j===i?{...s,agentId:e.target.value||null}:s))}
                style={{ fontSize:8, padding:"2px 4px", background:"rgba(0,0,0,0.4)",
                  border:"1px solid rgba(212,175,55,0.18)", borderRadius:4, color:"#e8dcc8", outline:"none" }}>
                <option value="">-- Aucun --</option>
                {agents.filter(a=>a.enabled).map(a=>(
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
              <select value={slot.mode||"auto"}
                onChange={e=>setWeeklySlots(p=>p.map((s,j)=>j===i?{...s,mode:e.target.value}:s))}
                style={{ fontSize:8, padding:"2px 4px", background:"rgba(0,0,0,0.4)",
                  border:"1px solid rgba(212,175,55,0.18)", borderRadius:4, color:"#e8dcc8", outline:"none" }}>
                <option value="auto">Auto</option>
                <option value="manual">Manuel</option>
              </select>
              <input type="checkbox" checked={!!slot.enabled}
                onChange={e=>setWeeklySlots(p=>p.map((s,j)=>j===i?{...s,enabled:e.target.checked}:s))}
                style={{ cursor:"pointer" }}/>
            </div>
          ))}
        </div>
      </div>

      {/* AUTOMATISATION */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, color:"#D4AF37", fontFamily:"monospace", fontWeight:700, marginBottom:10 }}>
          AUTOMATISATION
        </div>
        <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid rgba(212,175,55,0.18)",
          borderRadius:8, padding:"8px 12px" }}>
          {[
            ["autoGenerateIdeas",  "1. Generation idees",              "Au lancement: genere 5 idees pour l agent du jour si aucune idee existe"],
            ["autoGenerateBible",  "2. Bible automatique (top idee)",  "Apres generation: genere la Bible pour l idee #1 automatiquement"],
            ["qcEnabled",          "3. Agent QC actif",                "Evalue idees + Bible, regenere avec feedback si score sous le seuil"],
            ["autoApproveTopIdea", "4. Approbation automatique",       "Apres Bible + QC pass: approuve l idee #1 sans action manuelle"],
            ["autoGenerateVideo",  "5. Production video automatique",  "Apres approbation: lance Pexels + TTS + Shotstack automatiquement"],
            ["autoPublishYoutube", "6. Publication YouTube auto",      "Apres rendu: publie sur YouTube"],
          ].map(([key,label,desc])=>(
            <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ flex:1, marginRight:12 }}>
                <div style={{ fontSize:9, color:"#e8dcc8", fontWeight:600 }}>{label}</div>
                <div style={{ fontSize:7, color:"#6b6050", marginTop:1, lineHeight:1.4 }}>{desc}</div>
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", flexShrink:0 }}>
                <input type="checkbox" checked={!!automation[key]}
                  onChange={e=>setAutomation(p=>({...p,[key]:e.target.checked}))}/>
                <span style={{ fontSize:8, fontWeight:700, color:automation[key]?"#10b981":"#6b6050",
                  minWidth:28, textAlign:"right" }}>
                  {automation[key]?"ON":"OFF"}
                </span>
              </label>
            </div>
          ))}

          {/* Chain display */}
          <div style={{ marginTop:10, padding:"6px 10px", background:"rgba(0,0,0,0.2)", borderRadius:6 }}>
            <div style={{ fontSize:7, color:"#6b6050", marginBottom:4 }}>Chaine d automatisation:</div>
            <div style={{ display:"flex", alignItems:"center", gap:3, flexWrap:"wrap" }}>
              {[["autoGenerateIdeas","💡 Idees"],["autoGenerateBible","📖 Bible"],["qcEnabled","🔎 QC"],
                ["autoApproveTopIdea","✅ Approuver"],["autoGenerateVideo","🎬 Video"],["autoPublishYoutube","▶️ YouTube"]
              ].map(([key,label],i,arr)=>(
                <span key={key} style={{ display:"flex", alignItems:"center", gap:3 }}>
                  <span style={{ fontSize:8, padding:"1px 6px", borderRadius:4,
                    background:automation[key]?"rgba(16,185,129,0.12)":"rgba(107,96,80,0.1)",
                    color:automation[key]?"#10b981":"#6b6050",
                    border:"1px solid "+(automation[key]?"rgba(16,185,129,0.3)":"rgba(107,96,80,0.2)") }}>
                    {label}
                  </span>
                  {i<arr.length-1 && <span style={{ fontSize:8, color:"rgba(212,175,55,0.3)" }}>→</span>}
                </span>
              ))}
            </div>
          </div>

          {/* QC settings */}
          {/* Ideas per day — always visible */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
            <div>
              <div style={{ fontSize:7, color:"#6b6050", marginBottom:3 }}>Idées générées / jour</div>
              <input type="number" min={1} max={5} value={automation.ideasPerDay??5}
                onChange={e=>setAutomation(p=>({...p,ideasPerDay:Math.min(5,Math.max(1,+e.target.value))}))}
                style={{ width:"100%", fontSize:9, padding:"4px 7px", background:"rgba(0,0,0,0.4)",
                  border:"1px solid rgba(212,175,55,0.18)", borderRadius:5, color:"#e8dcc8", outline:"none" }}/>
              <div style={{ fontSize:6.5, color:"#6b6050", marginTop:2 }}>
                1-5. Top N idées classées sont gardées. Defaut: 5.
              </div>
            </div>
          </div>

          {automation.qcEnabled && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
              {[
                ["qcThreshold",       "Seuil qualite QC (%)",       0,  100, 60, "Defaut: 60%. En dessous = regeneration auto."],
                ["qcMaxRetriesPerDay","Max regenerations / jour",    1,  10,   3, "Defaut: 3. Evite les boucles infinies."],
              ].map(([key,label,min,max,def_,hint])=>(
                <div key={key}>
                  <div style={{ fontSize:7, color:"#6b6050", marginBottom:3 }}>{label}</div>
                  <input type="number" min={min} max={max} value={automation[key]??def_}
                    onChange={e=>setAutomation(p=>({...p,[key]:+e.target.value}))}
                    style={{ width:"100%", fontSize:9, padding:"4px 7px", background:"rgba(0,0,0,0.4)",
                      border:"1px solid rgba(212,175,55,0.18)", borderRadius:5, color:"#e8dcc8", outline:"none" }}/>
                  <div style={{ fontSize:6.5, color:"#6b6050", marginTop:2 }}>{hint}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
// ── GLOBAL BLACKLIST PANEL ───────────────────────────────────
function BlacklistPanel() {
  const [words,    setWords]    = useState([]);
  const [input,    setInput]    = useState("");
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/kv?key=travito:global_blacklist")
      .then(r=>r.json())
      .then(d => {
        if (Array.isArray(d.config?.words)) setWords(d.config.words);
        setLoading(false);
      })
      .catch(()=>setLoading(false));
  }, []);

  const save = (newWords) => {
    fetch("/api/kv", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ key:"travito:global_blacklist", value: JSON.stringify({ words: newWords }) }),
    }).then(()=>{ setSaved(true); setTimeout(()=>setSaved(false), 2000); }).catch(()=>{});
  };

  const add = () => {
    const toAdd = input.split(",").map(w=>w.trim().toLowerCase()).filter(w=>w && !words.includes(w));
    if (!toAdd.length) return;
    const updated = [...words, ...toAdd];
    setWords(updated);
    save(updated);
    setInput("");
  };

  const remove = (w) => {
    const updated = words.filter(x=>x!==w);
    setWords(updated);
    save(updated);
  };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
      <div style={{ fontSize:10, color:C.red, fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>
        🚫 BLACKLIST GLOBALE
      </div>
      <div style={{ fontSize:7.5, color:C.muted, marginBottom:16, lineHeight:1.7 }}>
        Ces mots/marques ne seront <strong style={{color:C.text}}>jamais mentionnés</strong> dans
        les idées, scripts, Bibles YouTube <strong style={{color:C.text}}>ni dans les likes/reposts/replies Twitter</strong>.
        S'applique automatiquement à tous les agents.
      </div>

      {/* Add new words */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter" && add()}
          placeholder="Ex: Avito, Mubawab, OLX, concurrent... (séparés par virgule)"
          style={{ flex:1, fontSize:9, padding:"6px 10px",
            background:"rgba(0,0,0,0.4)", border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:6, color:C.text, outline:"none" }}
        />
        <button onClick={add}
          style={{ fontSize:8, padding:"6px 16px", fontWeight:700, cursor:"pointer",
            background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.4)",
            borderRadius:6, color:C.red }}>
          + Ajouter
        </button>
        {saved && <span style={{ fontSize:8, color:C.green, alignSelf:"center" }}>✓ Sauvegardé</span>}
      </div>

      {/* Word list */}
      {loading ? (
        <div style={{ fontSize:8, color:C.muted }}>Chargement...</div>
      ) : words.length === 0 ? (
        <div style={{ fontSize:8, color:C.muted, fontStyle:"italic" }}>
          Aucun terme blacklisté. Ajoutez des concurrents ou mots à bannir.
        </div>
      ) : (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {words.map(w => (
            <span key={w} style={{ display:"flex", alignItems:"center", gap:4,
              fontSize:8, padding:"3px 8px", borderRadius:20,
              background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)",
              color:C.text }}>
              {w}
              <button onClick={()=>remove(w)}
                style={{ fontSize:9, lineHeight:1, background:"none", border:"none",
                  color:C.red, cursor:"pointer", padding:0 }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop:20, padding:"10px 12px",
        background:"rgba(0,0,0,0.2)", border:"1px solid "+C.border, borderRadius:8 }}>
        <div style={{ fontSize:7.5, color:C.gold, fontWeight:700, marginBottom:6 }}>
          APPLIQUÉ AUTOMATIQUEMENT À:
        </div>
        {[
          ["💡 YouTube Idées",   "Topics et angles — jamais générés"],
          ["📖 YouTube Bible",   "Script voiceover — jamais cité"],
          ["❤️ Twitter Likes",   "Tweets contenant ces mots — ignorés"],
          ["🔄 Twitter Reposts", "Tweets contenant ces mots — ignorés"],
          ["💬 Twitter Replies", "Tweets contenant ces mots — ignorés"],
        ].map(([label, desc]) => (
          <div key={label} style={{ display:"flex", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:8, color:C.text, width:160, flexShrink:0 }}>{label}</span>
            <span style={{ fontSize:7.5, color:C.muted }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BIBLE PROMPT EDITOR — standalone, always visible ─────────
function BiblePromptEditor({ agent, onSave }) {
  const [prompt, setPrompt] = useState(agent.customBiblePrompt || "");
  const [saved,  setSaved]  = useState(false);

  const handleSave = () => {
    onSave({ ...agent, customBiblePrompt: prompt });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ marginBottom:16, background:"rgba(0,0,0,0.25)",
      border:"1px solid rgba(139,92,246,0.25)", borderRadius:9, padding:"10px 12px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <span style={{ fontSize:18 }}>{agent.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:9, fontWeight:700, color:"#e8dcc8" }}>{agent.name}</div>
          <div style={{ fontSize:7, color:C.muted }}>
            {(agent.lang||"fr").toUpperCase()} · {agent.durationRange?.[0]}-{agent.durationRange?.[1]}s
          </div>
        </div>
        <span style={{ fontSize:7, color:prompt?"#8b5cf6":C.muted }}>
          {prompt ? "📖 prompt défini" : "📖 vide (défaut)"}
        </span>
      </div>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={5}
        placeholder={"Instructions Bible pour " + agent.name + ":\n- Structure du script\n- Ton et style\n- Queries Pexels spécifiques\n- CTA personnalisé\n- Toute règle spécifique à cet agent..."}
        style={{
          width:"100%", fontSize:8.5, padding:"8px 10px", boxSizing:"border-box",
          background:"rgba(0,0,0,0.4)", border:"1px solid rgba(139,92,246,0.3)",
          borderRadius:6, color:"#e8dcc8", outline:"none",
          resize:"vertical", lineHeight:1.6, fontFamily:"inherit",
        }}
      />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
        <button onClick={() => { setPrompt(""); onSave({ ...agent, customBiblePrompt: "" }); setSaved(true); setTimeout(()=>setSaved(false),1500); }}
          style={{ fontSize:7, padding:"2px 8px", background:"rgba(239,68,68,0.08)",
            border:"1px solid rgba(239,68,68,0.2)", borderRadius:4, color:"#ef4444", cursor:"pointer" }}>
          ✕ Vider
        </button>
        <button onClick={handleSave}
          style={{ fontSize:8, padding:"4px 16px", fontWeight:700, cursor:"pointer",
            background:saved?"rgba(16,185,129,0.15)":"rgba(139,92,246,0.15)",
            border:"1px solid "+(saved?"rgba(16,185,129,0.5)":"rgba(139,92,246,0.4)"),
            borderRadius:5, color:saved?"#10b981":"#8b5cf6" }}>
          {saved ? "✓ Sauvegardé" : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}

export default function YouTubeManager() {
  const [ideas,       setIdeas]       = useState(()=>{ try{return JSON.parse(localStorage.getItem("ytv2_ideas")||"[]");}catch{return[];} });
  const [selected,    setSelected]    = useState(null);
  const [activeAgent, setActiveAgent] = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [log,         setLog]         = useState(()=>{ try{return JSON.parse(localStorage.getItem("ytv2_log")||"[]");}catch{return[];} });
  const [tab,         setTab]         = useState("ideas");
  const [qcFilter,    setQcFilter]    = useState({ week:"", agent:"", date:"" });
  const [qcSelected,  setQcSelected]  = useState(new Set());
  const [agents,      setAgents]      = useState(loadAgents);
  const [weeklySlots, setWeeklySlots] = useState(()=>{ try{return JSON.parse(localStorage.getItem("ytv2_slots")||"null")||DEFAULT_WEEKLY_SLOTS;}catch{return DEFAULT_WEEKLY_SLOTS;} });
  const [automation,  setAutomation]  = useState(()=>{ try{return JSON.parse(localStorage.getItem("ytv2_automation")||"null")||DEFAULT_AUTOMATION;}catch{return DEFAULT_AUTOMATION;} });

  // ── STORAGE ────────────────────────────────────────────────
  useEffect(()=>{ localStorage.setItem("ytv2_ideas",      JSON.stringify(ideas)); },           [ideas]);
  useEffect(()=>{ localStorage.setItem("ytv2_agents",     JSON.stringify(agents)); },          [agents]);
  useEffect(()=>{ localStorage.setItem("ytv2_slots",      JSON.stringify(weeklySlots)); },     [weeklySlots]);
  useEffect(()=>{ localStorage.setItem("ytv2_log",        JSON.stringify(log.slice(0,200))); },[log]);
  useEffect(()=>{ localStorage.setItem("ytv2_automation", JSON.stringify(automation)); },      [automation]);

  // KV sync — agents (source of truth for voiceIds + customPrompt)
  useEffect(()=>{
    fetch("/api/kv",{ method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ key:"travito:yt_agents_config", value:JSON.stringify(agents) }),
    }).catch(()=>{});
  },[agents]);

  // KV sync — ideas (source of truth for ideas, bibles, QC scores)
  useEffect(()=>{
    fetch("/api/kv",{ method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ key:"travito:yt_ideas", value:JSON.stringify(ideas) }),
    }).catch(()=>{});
  },[ideas]);

  // KV sync — weeklySlots + automation (planning + settings)
  useEffect(()=>{
    fetch("/api/kv",{ method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ key:"travito:yt_config", value:JSON.stringify({ weeklySlots, automation }) }),
    }).catch(()=>{});
  },[weeklySlots, automation]);

  // KV restore — on mount, restore ALL state from KV (survives new browser + redeployment)
  useEffect(()=>{
    const parse = (v) => {
      if (!v) return null;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
      return v;
    };

    // 1. Restore agents (full object — KV is source of truth)
    fetch("/api/kv?key=travito:yt_agents_config")
      .then(r=>r.json())
      .then(d=>{
        const kvAgents = parse(d.config);
        if (!Array.isArray(kvAgents) || kvAgents.length === 0) return;
        setAgents(prev => {
          // KV wins for all user-configured fields on existing agents
          const merged = prev.map(a => {
            const kv = kvAgents.find(k => k.id === a.id);
            if (!kv) return a;
            return {
              ...a,                           // localStorage base
              ...kv,                          // KV wins for everything
              // Safety: never lose localStorage-only transient state
              enabled:           kv.enabled           ?? a.enabled           ?? true,
              // Preserve prompts from localStorage if KV doesn't have them yet
              customPrompt:      kv.customPrompt      ?? a.customPrompt      ?? "",
              customBiblePrompt: kv.customBiblePrompt ?? a.customBiblePrompt ?? "",
            };
          });
          // Add any new agents that exist in KV but not in localStorage
          const newAgents = kvAgents.filter(kv => !prev.find(a => a.id === kv.id));
          return [...merged, ...newAgents.map(a => migrateAgent(a, []))];
        });
      })
      .catch(()=>{});

    // 2. Restore ideas (all generated ideas, bibles, QC scores)
    fetch("/api/kv?key=travito:yt_ideas")
      .then(r=>r.json())
      .then(d=>{
        const kvIdeas = parse(d.config);
        if (!Array.isArray(kvIdeas) || kvIdeas.length === 0) return;
        setIdeas(prev => {
          if (prev.length === 0) return kvIdeas; // fresh browser — use KV directly
          // Merge: keep localStorage ideas, add any from KV not present locally
          // KV wins for QC scores + bible + status on matching ideas
          const merged = prev.map(local => {
            const kv = kvIdeas.find(k => k.id === local.id);
            if (!kv) return local;
            return {
              ...local,
              // KV wins for these fields (set server-side or after page reload)
              bible:            kv.bible            ?? local.bible,
              bibleScore:       kv.bibleScore        ?? local.bibleScore,
              status:           kv.status            || local.status,
              qcScore:          kv.qcScore           ?? local.qcScore,
              qcScores:         kv.qcScores          ?? local.qcScores,
              qcVerdict:        kv.qcVerdict         ?? local.qcVerdict,
              qcIssue:          kv.qcIssue           ?? local.qcIssue,
              qcSuggestion:     kv.qcSuggestion      ?? local.qcSuggestion,
              qcBibleScore:     kv.qcBibleScore      ?? local.qcBibleScore,
              qcBibleFeedback:  kv.qcBibleFeedback   ?? local.qcBibleFeedback,
              productionJob:    kv.productionJob      ?? local.productionJob,
              publishedUrl:     kv.publishedUrl       ?? local.publishedUrl,
              publishedAt:      kv.publishedAt        ?? local.publishedAt,
            };
          });
          // Add ideas in KV not in localStorage
          const newIdeas = kvIdeas.filter(kv => !prev.find(l => l.id === kv.id));
          return [...merged, ...newIdeas];
        });
      })
      .catch(()=>{});

    // 3. Restore weeklySlots + automation
    // Only restore from KV if localStorage was empty (new browser / cleared storage)
    const hasLocalAuto  = !!localStorage.getItem("ytv2_automation");
    const hasLocalSlots = !!localStorage.getItem("ytv2_slots");
    if (!hasLocalAuto || !hasLocalSlots) {
      fetch("/api/kv?key=travito:yt_config")
        .then(r=>r.json())
        .then(d=>{
          const kvConfig = parse(d.config);
          if (!kvConfig) return;
          if (!hasLocalSlots && Array.isArray(kvConfig.weeklySlots) && kvConfig.weeklySlots.length > 0) {
            setWeeklySlots(kvConfig.weeklySlots);
          }
          if (!hasLocalAuto && kvConfig.automation && typeof kvConfig.automation === "object") {
            setAutomation(prev => ({ ...prev, ...kvConfig.automation }));
          }
        })
        .catch(()=>{});
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Init: set today's agent + clean old ideas
  useEffect(()=>{
    const todayId = todayAgentIdFromSlots(weeklySlots);
    setActiveAgent(todayId || agents.find(a=>a.enabled)?.id || "facts");
    const now = Date.now();
    setIdeas(prev=>prev.filter(i=>{
      if (i.status==="published") return true;
      if (i.bible) return true;
      return (now - new Date(i.createdAt||0).getTime()) / 86400000 < 20;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const addLog = (msg, type="info", meta={}) => {
    const now = new Date();
    setLog(p=>[{
      msg, type,
      time: now.toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),
      date: now.toLocaleDateString("fr-MA",{day:"2-digit",month:"2-digit",year:"numeric"}),
      topic:  meta.topic  || null,
      source: meta.source || (type==="auto"?"auto":"manuel"),
    },...p].slice(0,200));
  };

  // ── STATS ──────────────────────────────────────────────────
  const totalIdeas     = ideas.filter(i=>!["published","parked"].includes(i.status)).length;
  const totalPublished = ideas.filter(i=>i.status==="published").length;
  const totalRendered  = ideas.filter(i=>i.status==="rendered").length;
  const pendingProd    = ideas.filter(i=>i.status==="approved"&&i.bible).length;
  const todayAgentId   = todayAgentIdFromSlots(weeklySlots);
  const todayAgent     = agents.find(a=>a.id===todayAgentId);

  // ── ROUTING ────────────────────────────────────────────────
  const renderMainPanel = () => {
    if (tab==="ideas") {
      return (
        <YouTubeIdeationAgent
          ideas={ideas} setIdeas={setIdeas}
          agents={agents} weeklySlots={weeklySlots} automation={automation}
          selected={selected} setSelected={setSelected}
          activeAgent={activeAgent} setActiveAgent={setActiveAgent}
          addLog={addLog} generating={generating} setGenerating={setGenerating}
        />
      );
    }
    if (tab==="qc") {
      // ── INLINE QC TAB ─────────────────────────────────────────
      const qcIdeas = ideas
        .filter(i =>
        i.qcScore!=null || i.qcBibleScore!=null ||
        i.qcBibleFeedback || i.qcIssue || i.qcSuggestion)
        .filter(i => !qcFilter.week  || i.weekKey  === qcFilter.week)
        .filter(i => !qcFilter.agent || i.agentId  === qcFilter.agent)
        .filter(i => !qcFilter.date  || (i.createdAt||"").startsWith(qcFilter.date))
        .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));

      const allWeeks  = [...new Set(ideas.filter(i=>i.weekKey).map(i=>i.weekKey))].sort().reverse();
      const allAgents = agents.filter(a=>a.enabled);
      const allSel    = qcIdeas.length>0 && qcIdeas.every(i=>qcSelected.has(i.id));
      const threshold = automation?.qcThreshold ?? 60;

      // Stats summary
      const allWithQC   = ideas.filter(i=>i.qcScore!=null);
      const passCount   = allWithQC.filter(i=>i.qcScore>=threshold).length;
      const failCount   = allWithQC.length - passCount;
      const avgScore    = allWithQC.length ? Math.round(allWithQC.reduce((s,i)=>s+i.qcScore,0)/allWithQC.length) : null;
      const avgCol      = avgScore==null?C.muted:avgScore>=threshold?C.green:C.red;

      const deleteSelected = () => {
        setIdeas(prev=>prev.map(i=>qcSelected.has(i.id)
          ?{...i,qcScore:null,qcScores:null,qcVerdict:null,qcIssue:null,qcSuggestion:null,qcBibleScore:null,qcBibleFeedback:null}
          :i));
        setQcSelected(new Set());
      };

      return (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Stats summary bar */}
          <div style={{ padding:"5px 14px", borderBottom:"1px solid rgba(16,185,129,0.15)",
            flexShrink:0, display:"flex", gap:12, alignItems:"center",
            background:"rgba(16,185,129,0.04)", flexWrap:"wrap" }}>
            <div style={{ fontSize:8, color:C.green, fontFamily:"monospace", fontWeight:700 }}>
              📊 STATS SEMAINE
            </div>
            {avgScore!=null && (
              <span style={{ fontSize:8, fontFamily:"monospace" }}>
                Moy: <span style={{ color:avgCol, fontWeight:700 }}>{avgScore}%</span>
              </span>
            )}
            <span style={{ fontSize:8, color:C.green }}>✓ {passCount} pass</span>
            <span style={{ fontSize:8, color:C.red   }}>✗ {failCount} fail</span>
            <span style={{ fontSize:8, color:C.muted }}>{allWithQC.length} évalués</span>
            {/* Per-agent mini stats */}
            {allAgents.map(a=>{
              const aideas = ideas.filter(i=>i.agentId===a.id&&i.qcScore!=null);
              if (!aideas.length) return null;
              const aAvg = Math.round(aideas.reduce((s,i)=>s+i.qcScore,0)/aideas.length);
              const aCol = aAvg>=threshold?C.green:C.red;
              return (
                <span key={a.id} style={{ fontSize:7.5, padding:"1px 6px", borderRadius:4,
                  background:aCol+"18", color:aCol, border:"1px solid "+aCol+"33" }}>
                  {a.icon} {aAvg}%
                </span>
              );
            })}
            {/* Retries today indicator */}
          </div>

          {/* QC Config row */}
          <div style={{ padding:"6px 14px", borderBottom:"1px solid rgba(212,175,55,0.12)",
            flexShrink:0, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:8.5, color:C.green, fontFamily:"monospace", fontWeight:700 }}>🔎 QC</div>
            <label style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
              <input type="checkbox" checked={!!automation.qcEnabled}
                onChange={e=>setAutomation(p=>({...p,qcEnabled:e.target.checked}))}/>
              <span style={{ fontSize:8, fontWeight:700, color:automation.qcEnabled?C.green:C.muted }}>
                {automation.qcEnabled?"ON":"OFF"}
              </span>
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:7.5, color:C.muted }}>Seuil</span>
              <input type="number" min={0} max={100} value={automation.qcThreshold??60}
                onChange={e=>setAutomation(p=>({...p,qcThreshold:+e.target.value}))}
                style={{ width:44, fontSize:9, fontWeight:700, padding:"2px 5px",
                  background:"rgba(0,0,0,0.4)", border:"1px solid rgba(16,185,129,0.3)",
                  borderRadius:4, color:C.green, outline:"none", textAlign:"center", fontFamily:"monospace" }}/>
              <span style={{ fontSize:7, color:C.muted }}>%</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:7.5, color:C.muted }}>Max retries</span>
              <input type="number" min={1} max={10} value={automation.qcMaxRetriesPerDay??3}
                onChange={e=>setAutomation(p=>({...p,qcMaxRetriesPerDay:+e.target.value}))}
                style={{ width:34, fontSize:9, fontWeight:700, padding:"2px 5px",
                  background:"rgba(0,0,0,0.4)", border:"1px solid rgba(29,161,242,0.3)",
                  borderRadius:4, color:"#1DA1F2", outline:"none", textAlign:"center", fontFamily:"monospace" }}/>
              <span style={{ fontSize:7, color:C.muted }}>/j</span>
            </div>
          </div>

          {/* Filters + bulk actions */}
          <div style={{ padding:"5px 14px", borderBottom:"1px solid rgba(212,175,55,0.08)",
            flexShrink:0, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            <label style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
              <input type="checkbox" checked={allSel}
                onChange={()=>{ if(allSel) setQcSelected(new Set()); else setQcSelected(new Set(qcIdeas.map(i=>i.id))); }}/>
              <span style={{ fontSize:7.5, color:C.muted }}>Tout</span>
            </label>
            {qcSelected.size>0 && (
              <button onClick={deleteSelected}
                style={{ fontSize:7.5, padding:"2px 8px", background:"rgba(239,68,68,0.1)",
                  border:"1px solid rgba(239,68,68,0.3)", borderRadius:4, color:C.red,
                  cursor:"pointer", fontWeight:700 }}>
                🗑️ Effacer QC ({qcSelected.size})
              </button>
            )}
            <div style={{ marginLeft:"auto", display:"flex", gap:5, alignItems:"center" }}>
              <select value={qcFilter.week} onChange={e=>setQcFilter(p=>({...p,week:e.target.value}))}
                style={{ fontSize:7.5, padding:"2px 5px", background:"rgba(0,0,0,0.4)",
                  border:"1px solid "+C.border, borderRadius:4,
                  color:qcFilter.week?C.gold:C.muted, outline:"none" }}>
                <option value="">Toutes semaines</option>
                {allWeeks.map(w=><option key={w} value={w}>{w}</option>)}
              </select>
              <select value={qcFilter.agent} onChange={e=>setQcFilter(p=>({...p,agent:e.target.value}))}
                style={{ fontSize:7.5, padding:"2px 5px", background:"rgba(0,0,0,0.4)",
                  border:"1px solid "+C.border, borderRadius:4,
                  color:qcFilter.agent?C.gold:C.muted, outline:"none" }}>
                <option value="">Tous agents</option>
                {allAgents.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
              <input type="date" value={qcFilter.date} onChange={e=>setQcFilter(p=>({...p,date:e.target.value}))}
                style={{ fontSize:7.5, padding:"2px 5px", background:"rgba(0,0,0,0.4)",
                  border:"1px solid "+C.border, borderRadius:4,
                  color:qcFilter.date?C.gold:C.muted, outline:"none", colorScheme:"dark" }}/>
              {(qcFilter.week||qcFilter.agent||qcFilter.date) && (
                <button onClick={()=>setQcFilter({week:"",agent:"",date:""})}
                  style={{ fontSize:7.5, padding:"2px 6px", background:"transparent",
                    border:"1px solid rgba(107,96,80,0.3)", borderRadius:4, color:C.muted, cursor:"pointer" }}>
                  ✕
                </button>
              )}
              <span style={{ fontSize:7.5, color:C.muted }}>{qcIdeas.length} entrée{qcIdeas.length!==1?"s":""}</span>
            </div>
          </div>

          {/* Per-idea list */}
          <div style={{ flex:1, overflowY:"auto", padding:"8px 14px" }}>
            {qcIdeas.length===0 ? (
              <div style={{ textAlign:"center", paddingTop:36, color:C.muted, fontSize:8.5, lineHeight:1.8 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🔎</div>
                {ideas.filter(i=>i.qcScore!=null||i.qcIssue).length===0
                  ? "Aucun historique QC — activez QC et generez des idees."
                  : "Aucun resultat pour ces filtres."}
              </div>
            ) : qcIdeas.map((idea,idx)=>{
              const agent      = agents.find(a=>a.id===idea.agentId);
              const iSel       = qcSelected.has(idea.id);
              const ideaCol    = (idea.qcScore??0)>=threshold?C.green:C.red;
              const bibleCol   = (idea.qcBibleScore??0)>=threshold?C.green:C.red;
              const slot       = weeklySlots?.find(s=>s.agentId===idea.agentId);
              const dayLabel   = slot?.day || idea.scheduledDay || "";
              const dt         = idea.createdAt ? new Date(idea.createdAt) : null;
              const dateStr    = dt ? dt.toLocaleDateString("fr-MA",{day:"2-digit",month:"2-digit",year:"numeric"}) : "";
              const timeStr    = dt ? dt.toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"}) : "";
              return (
                <div key={idea.id||idx} style={{ padding:"9px 11px", marginBottom:7, borderRadius:8,
                  background:iSel?"rgba(212,175,55,0.07)":"rgba(0,0,0,0.2)",
                  border:"1px solid "+(iSel?"rgba(212,175,55,0.35)":"rgba(212,175,55,0.1)") }}>

                  {/* Row 1: checkbox + topic + delete */}
                  <div style={{ display:"flex", alignItems:"flex-start", gap:7, marginBottom:5 }}>
                    <input type="checkbox" checked={iSel} style={{ marginTop:2, cursor:"pointer", flexShrink:0 }}
                      onChange={()=>setQcSelected(p=>{ const n=new Set(p); iSel?n.delete(idea.id):n.add(idea.id); return n; })}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.text, lineHeight:1.3, marginBottom:3 }}>
                        {idea.topic}
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                        {dayLabel && <span style={{ fontSize:7, padding:"0 5px", borderRadius:3,
                          background:"rgba(212,175,55,0.1)", color:C.gold,
                          border:"1px solid rgba(212,175,55,0.2)" }}>{dayLabel}</span>}
                        {agent && <span style={{ fontSize:7, color:C.muted }}>{agent.icon} {agent.name}</span>}
                        {dateStr && <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>{dateStr} {timeStr}</span>}
                        {idea.weekKey && <span style={{ fontSize:7, padding:"0 5px", borderRadius:3,
                          background:"rgba(20,184,166,0.1)", color:"#14b8a6",
                          border:"1px solid rgba(20,184,166,0.2)" }}>{idea.weekKey}</span>}
                      </div>
                    </div>
                    <button onClick={()=>{
                      setIdeas(prev=>prev.map(i=>i.id===idea.id
                        ?{...i,qcScore:null,qcScores:null,qcVerdict:null,qcIssue:null,qcSuggestion:null,qcBibleScore:null,qcBibleFeedback:null}:i));
                      setQcSelected(p=>{const n=new Set(p);n.delete(idea.id);return n;});
                    }} style={{ fontSize:7.5, padding:"2px 6px", flexShrink:0,
                      background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
                      borderRadius:4, color:C.red, cursor:"pointer" }}>🗑️</button>
                  </div>

                  {/* Idea QC score */}
                  {idea.qcScore!=null && (
                    <div style={{ marginBottom:idea.qcBibleScore!=null?6:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                        <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace",
                          fontWeight:700, width:80 }}>IDEE SCORE</span>
                        <span style={{ fontSize:11, fontWeight:700, fontFamily:"monospace", color:ideaCol }}>{idea.qcScore}%</span>
                        <span style={{ fontSize:7.5, padding:"1px 6px", borderRadius:3, fontWeight:700,
                          background:ideaCol+"18", color:ideaCol, border:"1px solid "+ideaCol+"44" }}>
                          {(idea.qcScore??0)>=threshold?"PASS":"FAIL"}
                        </span>
                        <span style={{ fontSize:6.5, color:C.muted }}>seuil {threshold}%</span>
                      </div>
                      {/* Per-criterion mini bars */}
                      {idea.qcScores && Object.keys(idea.qcScores).length>0 && (
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", paddingLeft:2, marginBottom:4 }}>
                          {Object.entries(idea.qcScores).map(([k,v])=>(
                            <div key={k} style={{ display:"flex", alignItems:"center", gap:3 }}>
                              <span style={{ fontSize:6.5, color:C.muted, width:68,
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {k.replace(/_/g," ")}
                              </span>
                              <div style={{ width:30, height:3, background:"rgba(255,255,255,0.07)",
                                borderRadius:2, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:(v/10*100)+"%", borderRadius:2,
                                  background:v>=8?C.green:v>=5?C.amber:C.red }}/>
                              </div>
                              <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace" }}>{v}/10</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {idea.qcIssue && (
                        <div style={{ fontSize:7.5, color:C.muted, padding:"3px 7px",
                          background:"rgba(239,68,68,0.06)", borderRadius:4,
                          borderLeft:"2px solid "+C.red, marginBottom:3 }}>
                          <span style={{ color:C.red, fontWeight:700 }}>⚠️ </span>{idea.qcIssue}
                        </div>
                      )}
                      {idea.qcSuggestion && (
                        <div style={{ fontSize:7.5, color:C.muted, padding:"3px 7px",
                          background:"rgba(16,185,129,0.06)", borderRadius:4,
                          borderLeft:"2px solid "+C.green }}>
                          <span style={{ color:C.green, fontWeight:700 }}>💡 </span>{idea.qcSuggestion}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bible QC */}
                  {(idea.qcBibleScore!=null||idea.qcBibleFeedback) && (
                    <div style={{ paddingTop:5, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                        <span style={{ fontSize:7, color:C.muted, fontFamily:"monospace",
                          fontWeight:700, width:80 }}>BIBLE SCORE</span>
                        {idea.qcBibleScore!=null && (
                          <>
                            <span style={{ fontSize:11, fontWeight:700, fontFamily:"monospace",
                              color:bibleCol }}>{idea.qcBibleScore}%</span>
                            <span style={{ fontSize:7.5, padding:"1px 6px", borderRadius:3, fontWeight:700,
                              background:bibleCol+"18", color:bibleCol, border:"1px solid "+bibleCol+"44" }}>
                              {(idea.qcBibleScore??0)>=threshold?"PASS":"FAIL"}
                            </span>
                          </>
                        )}
                      </div>
                      {idea.qcBibleFeedback && (
                        <div style={{ fontSize:7.5, color:C.muted, padding:"3px 7px",
                          background:"rgba(29,161,242,0.06)", borderRadius:4,
                          borderLeft:"2px solid #1DA1F2" }}>
                          <span style={{ color:"#1DA1F2", fontWeight:700 }}>Feedback: </span>{idea.qcBibleFeedback}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    if (tab==="video") {
      return (
        <YouTubeVideoAgent
          ideas={ideas} setIdeas={setIdeas}
          agents={agents} addLog={addLog}
          generating={generating} setGenerating={setGenerating}
          automation={automation}
        />
      );
    }
    if (tab==="config") {
      return (
        <ConfigPanel
          agents={agents} setAgents={setAgents}
          weeklySlots={weeklySlots} setWeeklySlots={setWeeklySlots}
          automation={automation} setAutomation={setAutomation}
        />
      );
    }
    if (tab==="bibleprompt") {
      return (
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          <div style={{ fontSize:10, color:C.gold, fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>
            📖 BIBLE PROMPTS — par agent
          </div>
          <div style={{ fontSize:7.5, color:C.muted, marginBottom:16, lineHeight:1.6 }}>
            Ces instructions guident Claude lors de la génération de la Bible (script, segments, Pexels queries).
            Laissez vide pour utiliser les règles par défaut. Sauvegardez après chaque modification.
          </div>
          {agents.filter(a=>a.enabled).map(agent => (
            <BiblePromptEditor
              key={agent.id}
              agent={agent}
              onSave={updated => setAgents(prev => prev.map(a => a.id===updated.id ? updated : a))}
            />
          ))}
        </div>
      );
    }

    if (tab==="blacklist") {
      return <BlacklistPanel />;
    }

    if (tab==="log") {
      return (
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:10, color:C.gold, fontFamily:"monospace", fontWeight:700 }}>
              LOGS ({log.length})
            </div>
            {log.length > 0 && (
              <button onClick={()=>setLog([])}
                style={{ fontSize:7.5, padding:"2px 10px",
                  background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)",
                  borderRadius:4, color:C.red, cursor:"pointer" }}>
                🗑️ Vider
              </button>
            )}
          </div>
          {log.length===0 ? (
            <div style={{ fontSize:9, color:C.muted }}>Aucun log.</div>
          ) : log.map((entry,i)=>(
            <div key={i} style={{ padding:"7px 10px", marginBottom:6, borderRadius:7,
              background:"rgba(0,0,0,0.2)", border:"1px solid "+C.border }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:2, flexWrap:"wrap" }}>
                <span style={{ fontSize:7, color:C.gold, fontFamily:"monospace" }}>{entry.date} {entry.time}</span>
                <span style={{ fontSize:7, color:
                  entry.type==="error"?"#ef4444":entry.type==="success"?"#10b981":
                  entry.type==="auto"?"#8b5cf6":"#6b6050" }}>
                  {entry.type}
                </span>
                {entry.source && <span style={{ fontSize:7, color:C.muted }}>{entry.source}</span>}
                {entry.topic  && <span style={{ fontSize:7, color:"#1DA1F2" }}>{entry.topic}</span>}
              </div>
              <div style={{ fontSize:8.5, color:C.text }}>{entry.msg}</div>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:"rgba(12,18,35,0.95)" }}>
      <style>{`@keyframes ytpulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      {/* TOP BAR */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 12px",
        borderBottom:"1px solid rgba(212,175,55,0.18)", height:38, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          <div style={{ width:22, height:22, background:"linear-gradient(135deg,#D4AF37,#b8860b)",
            borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, color:"#000", fontWeight:700 }}>YT</div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#D4AF37", lineHeight:1 }}>YouTube Manager</div>
            {todayAgent && (
              <div style={{ fontSize:7, color:"#6b6050", lineHeight:1.3 }}>
                {todayAgent.icon} {todayAgent.name} · aujourd hui
              </div>
            )}
          </div>
        </div>

        <div style={{ width:1, height:20, background:"rgba(212,175,55,0.18)", flexShrink:0 }}/>

        <div style={{ display:"flex", gap:8, fontSize:7.5, color:"#6b6050" }}>
          <span>{totalIdeas} idees</span>
          {pendingProd>0  && <span style={{ color:"#1DA1F2"  }}>{pendingProd} prod</span>}
          {totalRendered>0 && <span style={{ color:"#8b5cf6" }}>{totalRendered} rendu</span>}
          <span style={{ color:"#10b981" }}>{totalPublished} publies</span>
        </div>

        <div style={{ marginLeft:"auto", display:"flex", gap:3 }}>
          {SUB_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ fontSize:7.5, padding:"2px 8px", borderRadius:5, cursor:"pointer",
                background:tab===t.id?"rgba(212,175,55,0.12)":"transparent",
                border:"1px solid "+(tab===t.id?"#D4AF37":"rgba(212,175,55,0.18)"),
                color:tab===t.id?"#D4AF37":"#6b6050" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* AGENT TABS BAR */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(212,175,55,0.18)",
        background:"rgba(8,13,26,0.6)", flexShrink:0 }}>
        {AGENT_TABS.map(agent=>{
          const isActive = tab===agent.id;
          const hasPending =
            (agent.id==="ideas" && ideas.filter(i=>i.status==="selected"&&i.bible).length>0) ||
            (agent.id==="video" && ideas.filter(i=>i.status==="approved"&&i.bible).length>0) ||
            (agent.id==="qc"    && ideas.filter(i=>i.qcBibleFeedback||i.qcScore!=null).length>0);
          return (
            <button key={agent.id} onClick={()=>setTab(agent.id)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 18px", cursor:"pointer",
                background:isActive?agent.color+"11":"transparent",
                borderBottom:isActive?"2px solid "+agent.color:"2px solid transparent",
                borderTop:"none", borderLeft:"none",
                borderRight:"1px solid rgba(212,175,55,0.1)", flexShrink:0 }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <div style={{ width:32, height:32, borderRadius:9,
                  background:isActive?agent.color+"22":"rgba(255,255,255,0.04)",
                  border:"1px solid "+(isActive?agent.color+"55":"rgba(255,255,255,0.06)"),
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
                  {agent.icon}
                </div>
                {hasPending && (
                  <div style={{ position:"absolute", top:-2, right:-2, width:8, height:8,
                    borderRadius:"50%", background:agent.color,
                    border:"2px solid rgba(8,13,26,0.95)", animation:"ytpulse 2s infinite" }}/>
                )}
              </div>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:9, fontWeight:700, lineHeight:1.2,
                  color:isActive?agent.color:"#e8dcc8" }}>{agent.name}</div>
                <div style={{ fontSize:7, color:"#6b6050", lineHeight:1.3 }}>{agent.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* MAIN PANEL — scroll fix */}
      <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {renderMainPanel()}
      </div>
    </div>
  );
}
