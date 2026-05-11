import { useState, useEffect, useRef, useCallback } from "react";

// ── KV helpers ──────────────────────────────────────────────────────────────
const kvGet = async (key) => {
  try {
    const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    let val = d.config ?? null;
    // Handle double-stringified values from kvSet
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  } catch { return null; }
};
const kvSet = async (key, value) => {
  try {
    const r = await fetch("/api/kv", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: JSON.stringify(value) }),
    });
    return await r.json();
  } catch(e) { console.error("kvSet failed:", key, e); return null; }
};

// ── ID generator ────────────────────────────────────────────────────────────
const uid = () => `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "";
const getISOWeek = (d=new Date()) => {
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const y=new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return `W${String(Math.ceil((((date-y)/86400000)+1)/7)).padStart(2,"0")}-${date.getUTCFullYear()}`;
};
const getISOWeeksList = (n=10) => {
  const weeks=[],today=new Date();
  for(let i=0;i<n;i++){const d=new Date(today);d.setDate(d.getDate()-i*7);weeks.push(getISOWeek(d));}
  return weeks;
};

// ── Palette ─────────────────────────────────────────────────────────────────
const P = {
  bg:      "#0E1117",
  surface: "#161B27",
  card:    "#1C2333",
  border:  "#2A3348",
  gold:    "#C8972B",
  goldSoft:"rgba(200,151,43,0.12)",
  text:    "#E8EAF0",
  muted:   "#6B7A99",
  green:   "#22C55E",
  greenS:  "rgba(34,197,94,0.12)",
  red:     "#EF4444",
  redS:    "rgba(239,68,68,0.10)",
  blue:    "#3B82F6",
  blueS:   "rgba(59,130,246,0.12)",
  amber:   "#F59E0B",
  amberS:  "rgba(245,158,11,0.10)",
  goldS: "rgba(200,151,43,0.12)",
  purple: "#8B5CF6",
  purpleS: "rgba(139,92,246,0.12)",
};

const TAXONOMY_TYPES = ["category","tag","attribute","brand","region","material","size","color","custom"];
const LANGUAGES      = ["fr","ar","en","fr/ar","fr/en","ar/en","fr/ar/en"];

// ── Shared field styles ──────────────────────────────────────────────────────
const inp = {
  background: P.card, border: `1px solid ${P.border}`, borderRadius: 6,
  color: P.text, padding: "6px 10px", fontSize: 12, outline: "none",
  fontFamily: "'IBM Plex Mono', monospace",
};
const btn = (color = P.gold, bg = P.goldSoft) => ({
  background: bg, border: `1px solid ${color}40`, borderRadius: 6,
  color, padding: "5px 12px", fontSize: 11, cursor: "pointer",
  fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
  transition: "all .15s",
});

// ════════════════════════════════════════════════════════════════════════════
//  TAXONOMY PANEL — shared by Tab1 and Tab2
// ════════════════════════════════════════════════════════════════════════════
function TaxonomyPanel({ kvKey, title, isSecondary }) {
  const [data,    setData]    = useState([]);       // array of taxonomy objects
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState(false);

  // Selected taxonomies (for mass delete)
  const [selTax,  setSelTax]  = useState(new Set());
  // Expanded taxonomy (shows terms)
  const [expanded,setExpanded]= useState(null);
  // Selected terms (for mass delete within a taxonomy)
  const [selTerms,setSelTerms]= useState(new Set());
  // Inline edit states
  const [editTax, setEditTax] = useState(null);   // {id, name, slug, type} or "new"
  const [editTerm,setEditTerm]= useState(null);   // {taxId, id, name, slug, language} or "new"
  // Mass upload state
  const [massUpload,setMassUpload] = useState(null); // taxId or null
  const [massText,  setMassText]   = useState("");
  const massRef = useRef(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    kvGet(kvKey).then(d => {
      setData(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, [kvKey]);

  // ── Persist ───────────────────────────────────────────────────────────────
  const persist = useCallback(async (next) => {
    setData(next);
    await kvSet(kvKey, next);
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  }, [kvKey]);

  // ── Taxonomy CRUD ─────────────────────────────────────────────────────────
  const saveTaxonomy = (form) => {
    if (!form.name.trim()) return;
    const baseFields = {
      name:       form.name.trim(),
      slug:       form.slug.trim() || form.name.trim().toLowerCase().replace(/\s+/g,"-"),
      type:       form.type || "category",
      wpMetaKey:  form.wpMetaKey ?? "",
      wpMetaType: form.wpMetaType || "Taxonomie",
      // secondary-only fields
      ...(isSecondary ? {
        fieldType:      form.fieldType      || "Global",
        conditionValue: form.conditionValue || "",
        conditionMedia: form.conditionMedia || [],
        language:       form.language       || "fr",
      } : {}),
    };
    const next = editTax === "new"
      ? [...data, { id: uid(), ...baseFields, terms: [] }]
      : data.map(t => t.id === form.id ? { ...t, ...baseFields } : t);
    persist(next);
    setEditTax(null);
  };

  const deleteTaxonomies = (ids) => {
    persist(data.filter(t => !ids.has(t.id)));
    setSelTax(new Set());
  };

  // ── Term CRUD ─────────────────────────────────────────────────────────────
  const saveTerm = (taxId, form) => {
    if (!form.name.trim()) return;
    const next = data.map(tax => {
      if (tax.id !== taxId) return tax;
      const term = { id: uid(), name: form.name.trim(), slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/\s+/g,"-"), language: form.language || "fr" };
      const terms = editTerm?.id
        ? tax.terms.map(t => t.id === form.id ? { ...t, ...term, id: t.id } : t)
        : [...(tax.terms||[]), term];
      return { ...tax, terms };
    });
    persist(next);
    setEditTerm(null);
  };

  const deleteTerms = (taxId, termIds) => {
    const next = data.map(tax => tax.id !== taxId ? tax : { ...tax, terms: tax.terms.filter(t => !termIds.has(t.id)) });
    persist(next);
    setSelTerms(new Set());
  };

  // ── Mass upload ───────────────────────────────────────────────────────────
  // Format: one term per line, columns: name, slug (opt), language (opt)
  // Separator: comma or tab
  const processMassUpload = (taxId) => {
    const lines = massText.split("\n").map(l => l.trim()).filter(Boolean);
    const newTerms = lines.map(line => {
      const parts = line.split(/,|\t/).map(p => p.trim());
      const name = parts[0] || "";
      const slug = parts[1] || name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-_]/g,"");
      const language = parts[2] || "fr";
      return { id: uid(), name, slug, language };
    }).filter(t => t.name);
    if (!newTerms.length) return;
    const next = data.map(tax => tax.id !== taxId ? tax : { ...tax, terms: [...(tax.terms||[]), ...newTerms] });
    persist(next);
    setMassUpload(null);
    setMassText("");
  };

  if (loading) return <div style={{ padding: 20, color: P.muted, fontSize: 12 }}>Chargement...</div>;

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize: 11, color: P.muted, fontFamily:"'IBM Plex Mono',monospace" }}>
          {data.length} taxonomie{data.length!==1?"s":""} · {data.reduce((s,t)=>s+(t.terms?.length||0),0)} termes
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {saved && <span style={{ fontSize:10, color:P.green }}>✓ sauvegardé</span>}
          {selTax.size > 0 && (
            <button style={btn(P.red,P.redS)}
              onClick={() => { if(window.confirm(`Supprimer ${selTax.size} taxonomie(s) ?`)) deleteTaxonomies(selTax); }}>
              🗑 Supprimer ({selTax.size})
            </button>
          )}
          <button style={btn(P.green,P.greenS)} onClick={() => setEditTax("new")}>+ Taxonomie</button>
        </div>
      </div>

      {/* ── New/Edit Taxonomy Form ── */}
      {editTax && (
        <TaxonomyForm
          initial={editTax === "new" ? {} : data.find(t=>t.id===editTax)}
          onSave={saveTaxonomy}
          onCancel={() => setEditTax(null)}
          isSecondary={isSecondary}
        />
      )}

      {/* ── Taxonomy List ── */}
      {data.length === 0 && !editTax && (
        <div style={{ textAlign:"center", padding:"32px 0", color:P.muted, fontSize:12 }}>
          Aucune taxonomie. Cliquez "+ Taxonomie" pour commencer.
        </div>
      )}

      {data.map(tax => {
        const isExp = expanded === tax.id;
        return (
          <div key={tax.id} style={{ marginBottom:8, border:`1px solid ${P.border}`, borderRadius:10 }}>
            {/* Taxonomy row */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px",
              background: isExp ? P.card : P.surface, cursor:"pointer" }}
              onClick={() => { setExpanded(isExp ? null : tax.id); setSelTerms(new Set()); setEditTerm(null); }}>
              <input type="checkbox" checked={selTax.has(tax.id)}
                onClick={e => e.stopPropagation()}
                onChange={e => { const s=new Set(selTax); e.target.checked?s.add(tax.id):s.delete(tax.id); setSelTax(s); }}
                style={{ accentColor:P.gold, cursor:"pointer" }}/>
              <span style={{ fontSize:12, color:P.text, fontWeight:600, flex:1, fontFamily:"'IBM Plex Mono',monospace" }}>{tax.name}</span>
              <span style={{ fontSize:10, color:P.muted, fontFamily:"monospace" }}>{tax.slug}</span>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:P.blueS, color:P.blue, marginLeft:4 }}>{tax.type}</span>
              {isSecondary && tax.fieldType && tax.fieldType !== "Global" && (
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:"rgba(139,92,246,0.12)", color:"#8b5cf6", marginLeft:4 }}>
                  {tax.fieldType}{tax.conditionValue ? ` · ${tax.conditionValue}` : ""}{tax.conditionMedia?.length ? ` · ${tax.conditionMedia.join(",")}` : ""}
                </span>
              )}
              {tax.wpMetaKey && (
                <span style={{ fontSize:9, padding:"2px 7px", borderRadius:4,
                  background:(tax.wpMetaType||"Taxonomie")==="Taxonomie"?"rgba(200,151,43,0.12)":"rgba(20,184,166,0.12)",
                  color:(tax.wpMetaType||"Taxonomie")==="Taxonomie"?"#C8972B":"#14b8a6",
                  marginLeft:4, fontFamily:"monospace" }}>
                  {(tax.wpMetaType||"Taxonomie")==="Taxonomie"?"🏷":"🔑"} {tax.wpMetaKey}
                </span>
              )}
              <span style={{ fontSize:10, color:P.muted }}>{tax.terms?.length||0} termes</span>
              <button style={{ ...btn(P.gold), padding:"2px 8px", fontSize:10, marginLeft:4 }}
                onClick={e => { e.stopPropagation(); setEditTax(tax.id); setExpanded(null); }}>✏️</button>
              <span style={{ fontSize:11, color:P.muted, marginLeft:2 }}>{isExp?"▲":"▼"}</span>
            </div>

            {/* Terms panel */}
            {isExp && (
              <div style={{ padding:"10px 14px", background:P.bg, borderTop:`1px solid ${P.border}` }}>
                {/* Terms header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:10, color:P.muted }}>{tax.terms?.length||0} terme{(tax.terms?.length||0)!==1?"s":""}</div>
                  <div style={{ display:"flex", gap:6 }}>
                    {selTerms.size > 0 && (
                      <button style={btn(P.red,P.redS)}
                        onClick={() => { if(window.confirm(`Supprimer ${selTerms.size} terme(s) ?`)) deleteTerms(tax.id, selTerms); }}>
                        🗑 ({selTerms.size})
                      </button>
                    )}
                    <button style={btn(P.amber,P.amberS)} onClick={() => { setMassUpload(tax.id); setMassText(""); }}>⬆ Upload</button>
                    <button style={btn(P.green,P.greenS)} onClick={() => setEditTerm({ taxId:tax.id, id:null })}>+ Terme</button>
                  </div>
                </div>

                {/* Select all terms */}
                {(tax.terms?.length||0) > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${P.border}` }}>
                    <input type="checkbox"
                      checked={selTerms.size === tax.terms.length && tax.terms.length > 0}
                      onChange={e => setSelTerms(e.target.checked ? new Set(tax.terms.map(t=>t.id)) : new Set())}
                      style={{ accentColor:P.gold }}/>
                    <span style={{ fontSize:10, color:P.muted }}>Tout sélectionner</span>
                  </div>
                )}

                {/* New term form */}
                {editTerm?.taxId === tax.id && !editTerm.id && (
                  <TermForm initial={{}} onSave={f => saveTerm(tax.id, f)} onCancel={() => setEditTerm(null)} isSecondary={isSecondary}/>
                )}

                {/* Mass upload panel */}
                {massUpload === tax.id && (
                  <div style={{ marginBottom:10, padding:10, background:P.card, borderRadius:8, border:`1px solid ${P.border}` }}>
                    <div style={{ fontSize:10, color:P.muted, marginBottom:6 }}>
                      Format: <code style={{color:P.gold}}>nom, slug, langue</code> — un terme par ligne (slug et langue optionnels)
                    </div>
                    <textarea ref={massRef} value={massText} onChange={e=>setMassText(e.target.value)}
                      rows={6} placeholder={"Appartement, appartement, fr\nVilla, villa, fr\nBureau, bureau, fr\n..."}
                      style={{ ...inp, width:"100%", resize:"vertical", fontSize:11, boxSizing:"border-box", display:"block" }}/>
                    <div style={{ display:"flex", gap:6, marginTop:8 }}>
                      <button style={btn(P.green,P.greenS)} onClick={() => processMassUpload(tax.id)}>
                        ⬆ Importer ({massText.split("\n").filter(l=>l.trim()).length} lignes)
                      </button>
                      <button style={btn(P.muted,"transparent")} onClick={() => { setMassUpload(null); setMassText(""); }}>Annuler</button>
                    </div>
                  </div>
                )}

                {/* Terms table */}
                {(tax.terms?.length||0) > 0 && (
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                    <thead>
                      <tr style={{ background:P.card }}>
                        {(isSecondary ? ["","Nom","Slug",""] : ["","Nom","Slug","Langue",""]).map((h,i) => (
                          <th key={i} style={{ padding:"5px 8px", color:P.muted, fontWeight:600,
                            textAlign: i===0||i===(isSecondary?3:4)?"center":"left",
                            borderBottom:`1px solid ${P.border}`, fontFamily:"'IBM Plex Mono',monospace" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(tax.terms||[]).map(term => (
                        editTerm?.id === term.id
                          ? (
                            <tr key={term.id}>
                              <td colSpan={5} style={{ padding:"4px 0" }}>
                                <TermForm initial={term} onSave={f => saveTerm(tax.id,{...f,id:term.id})} onCancel={() => setEditTerm(null)} isSecondary={isSecondary}/>
                              </td>
                            </tr>
                          )
                          : (
                            <tr key={term.id} style={{ borderBottom:`1px solid ${P.border}20` }}>
                              <td style={{ padding:"5px 8px", textAlign:"center" }}>
                                <input type="checkbox" checked={selTerms.has(term.id)}
                                  onChange={e => { const s=new Set(selTerms); e.target.checked?s.add(term.id):s.delete(term.id); setSelTerms(s); }}
                                  style={{ accentColor:P.gold }}/>
                              </td>
                              <td style={{ padding:"5px 8px", color:P.text }}>{term.name}</td>
                              <td style={{ padding:"5px 8px", color:P.muted, fontFamily:"monospace", fontSize:10 }}>{term.slug}</td>
                              {!isSecondary && (
                              <td style={{ padding:"5px 8px" }}>
                                <span style={{ fontSize:10, padding:"1px 7px", borderRadius:4, background:P.blueS, color:P.blue }}>{term.language||"fr"}</span>
                              </td>
                              )}
                              <td style={{ padding:"5px 8px", textAlign:"center" }}>
                                <button style={{ ...btn(P.gold), padding:"1px 6px", fontSize:10 }}
                                  onClick={() => setEditTerm({ taxId:tax.id, id:term.id })}>✏️</button>
                              </td>
                            </tr>
                          )
                      ))}
                    </tbody>
                  </table>
                )}

                {(tax.terms?.length||0) === 0 && !editTerm && massUpload !== tax.id && (
                  <div style={{ textAlign:"center", padding:"12px 0", color:P.muted, fontSize:11 }}>
                    Aucun terme. Ajoutez manuellement ou utilisez Upload.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Taxonomy Form ─────────────────────────────────────────────────────────────
const MEDIA_OPTIONS = ["png","jpg","jpeg","webp","gif","bmp","tiff","mp4","mov","wmv","avi","m4v"];
const FIELD_TYPES   = ["Global","Numeric","Text","Media"];

function TaxonomyForm({ initial, onSave, onCancel, isSecondary }) {
  const [f, setF] = useState({
    name:"", slug:"", type:"category",
    fieldType:"Global", conditionValue:"", conditionMedia:[],
    wpMetaKey:"",
    wpMetaType:"Taxonomie",
    ...initial
  });

  const toggleMedia = (ext) => {
    const cur = f.conditionMedia || [];
    const next = cur.includes(ext) ? cur.filter(e=>e!==ext) : [...cur, ext];
    setF({...f, conditionMedia: next});
  };

  return (
    <div style={{ padding:12, marginBottom:10, background:P.card, borderRadius:8, border:`1px solid ${P.gold}30` }}>
      {/* Row 1: name, slug, type */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:8, alignItems:"end", marginBottom: isSecondary ? 10 : 0 }}>
        <div>
          <div style={{ fontSize:10, color:P.muted, marginBottom:3 }}>Nom *</div>
          <input value={f.name} onChange={e=>setF({...f,name:e.target.value,slug:f.slug||e.target.value.toLowerCase().replace(/\s+/g,"-")})}
            placeholder="ex: Type de bien" style={{ ...inp, width:"100%", boxSizing:"border-box" }}/>
        </div>
        <div>
          <div style={{ fontSize:10, color:P.muted, marginBottom:3 }}>Slug</div>
          <input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}
            placeholder="ex: type-de-bien" style={{ ...inp, width:"100%", boxSizing:"border-box" }}/>
        </div>
        <div>
          <div style={{ fontSize:10, color:P.muted, marginBottom:3 }}>Type taxonomie</div>
          <select value={f.type} onChange={e=>setF({...f,type:e.target.value})}
            style={{ ...inp, cursor:"pointer" }}>
            {TAXONOMY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2: secondary-only settings */}
      {isSecondary && (
        <div style={{ borderTop:`1px solid ${P.border}`, paddingTop:10 }}>
          <div style={{ fontSize:10, color:P.gold, marginBottom:8, fontWeight:700 }}>⚙️ Paramètres du champ</div>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:10, alignItems:"start" }}>
            {/* Field type selector */}
            <div>
              <div style={{ fontSize:10, color:P.muted, marginBottom:4 }}>Type de champ</div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {FIELD_TYPES.map(ft => (
                  <label key={ft} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <input type="radio" name="fieldType" value={ft}
                      checked={f.fieldType===ft}
                      onChange={()=>setF({...f, fieldType:ft, conditionValue:"", conditionMedia:[]})}
                      style={{ accentColor:P.gold }}/>
                    <span style={{ fontSize:11, color: f.fieldType===ft ? P.gold : P.text }}>{ft}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Condition — depends on fieldType */}
            <div>
              <div style={{ fontSize:10, color:P.muted, marginBottom:4 }}>Conditions</div>
              {f.fieldType === "Global" && (
                <div style={{ fontSize:11, color:P.muted, padding:"8px 10px",
                  background:"rgba(0,0,0,0.2)", borderRadius:6, border:`1px solid ${P.border}` }}>
                  Aucune condition — champ libre sans contrainte.
                </div>
              )}
              {f.fieldType === "Numeric" && (
                <div>
                  <div style={{ fontSize:10, color:P.muted, marginBottom:4 }}>Valeur par défaut</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <input type="number" value={f.conditionValue}
                      onChange={e=>setF({...f,conditionValue:e.target.value})}
                      placeholder="ex: 0"
                      style={{ ...inp, width:100 }}/>
                    <span style={{ fontSize:10, color:P.muted }}>xxx</span>
                  </div>
                </div>
              )}
              {f.fieldType === "Text" && (
                <div>
                  <div style={{ fontSize:10, color:P.muted, marginBottom:4 }}>Max caractères</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <input type="number" value={f.conditionValue}
                      onChange={e=>setF({...f,conditionValue:e.target.value})}
                      placeholder="ex: 255"
                      style={{ ...inp, width:100 }}/>
                    <span style={{ fontSize:10, color:P.muted }}>xxx</span>
                  </div>
                </div>
              )}
              {f.fieldType === "Media" && (
                <div>
                  <div style={{ fontSize:10, color:P.muted, marginBottom:6 }}>Types de fichiers acceptés</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {MEDIA_OPTIONS.map(ext => {
                      const checked = (f.conditionMedia||[]).includes(ext);
                      return (
                        <label key={ext} style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer",
                          padding:"3px 8px", borderRadius:4,
                          background: checked ? P.blueS : "rgba(0,0,0,0.2)",
                          border:`1px solid ${checked ? P.blue : P.border}` }}>
                          <input type="checkbox" checked={checked} onChange={()=>toggleMedia(ext)}
                            style={{ accentColor:P.blue, width:11, height:11 }}/>
                          <span style={{ fontSize:10, color: checked ? P.blue : P.muted }}>.{ext}</span>
                        </label>
                      );
                    })}
                  </div>
                  {(f.conditionMedia||[]).length > 0 && (
                    <div style={{ marginTop:6, fontSize:9, color:P.muted }}>
                      Sélectionnés: {(f.conditionMedia||[]).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginTop:12 }}>
        <div style={{ width:"100%", marginBottom:8 }}>
          <div style={{ fontSize:10, color:P.gold, marginBottom:2, fontWeight:600 }}>
            {isSecondary ? "Clé WP (Taxonomie ou Méta)" : "Listivo ID (référence)"}
          </div>
          <div style={{ fontSize:9, color:P.muted, marginBottom:4 }}>
            {isSecondary
              ? "listivo_XXXXX pour Ville/Quartier/Type (Taxonomie) ou clé meta pour Prix/Surface (Méta)"
              : "ID Listivo de cette taxonomie pour référence (ex: listivo_23016)"}
          </div>
          {isSecondary && (
            <div style={{ display:"flex", gap:6, marginBottom:6 }}>
              {["Taxonomie","Méta"].map(t=>(
                <label key={t} style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer",
                  fontSize:10, padding:"3px 10px", borderRadius:5,
                  background:(f.wpMetaType||"Taxonomie")===t?"rgba(200,151,43,0.15)":"transparent",
                  border:`1px solid ${(f.wpMetaType||"Taxonomie")===t?P.gold:P.border}`,
                  color:(f.wpMetaType||"Taxonomie")===t?P.gold:P.muted }}>
                  <input type="radio" name="wpMetaType" value={t}
                    checked={(f.wpMetaType||"Taxonomie")===t}
                    onChange={()=>setF({...f,wpMetaType:t})} style={{display:"none"}}/>
                  {t==="Taxonomie"?"🏷 Taxonomie":"🔑 Méta"}
                </label>
              ))}
            </div>
          )}
          <input value={f.wpMetaKey||""} onChange={e=>setF({...f,wpMetaKey:e.target.value})}
            placeholder={isSecondary
              ? (f.wpMetaType||"Taxonomie")==="Taxonomie"
                ? "ex: listivo_24530 (Ville), listivo_24531 (Quartier)"
                : "ex: listivo_price, listivo_surface"
              : "ex: listivo_23016"}
            style={{...inp, fontSize:11, maxWidth:360}}/>
        </div>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:isSecondary?4:12 }}>
        <button style={btn(P.green,P.greenS)} onClick={() => onSave(f)}>✓ Sauvegarder</button>
        <button style={btn(P.muted,"transparent")} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// ── Term Form ─────────────────────────────────────────────────────────────────
function TermForm({ initial, onSave, onCancel, isSecondary }) {
  const [f, setF] = useState({ name:"", slug:"", language:"fr", ...initial });
  return (
    <div style={{ display:"grid",
      gridTemplateColumns: isSecondary ? "1fr 1fr auto auto" : "1fr 1fr auto auto auto",
      gap:6, alignItems:"center",
      padding:"8px 10px", background:P.card, borderRadius:6, marginBottom:4, border:`1px solid ${P.gold}30` }}>
      <input value={f.name} onChange={e=>setF({...f,name:e.target.value,slug:f.slug||e.target.value.toLowerCase().replace(/\s+/g,"-")})}
        placeholder="Nom *" style={{ ...inp, fontSize:11 }}/>
      <input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}
        placeholder="Slug" style={{ ...inp, fontSize:11 }}/>
      {!isSecondary && (
        <select value={f.language} onChange={e=>setF({...f,language:e.target.value})}
          style={{ ...inp, fontSize:11, cursor:"pointer" }}>
          {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      )}
      <button style={btn(P.green,P.greenS)} onClick={() => onSave(f)}>✓</button>
      <button style={btn(P.muted,"transparent")} onClick={onCancel}>✕</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MAPPING TAB
// ════════════════════════════════════════════════════════════════════════════
function MappingPanel() {
  const [primary,   setPrimary]   = useState([]);
  const [secondary, setSecondary] = useState([]);
  const [mapping,   setMapping]   = useState({});  // { "primTermId|secTaxId": "M"|"O" }
  const [loading,   setLoading]   = useState(true);
  const [saved,     setSaved]     = useState(false);
  const [isDirty,   setIsDirty]   = useState(false);
  const [expanded,  setExpanded]  = useState(new Set());
  const mappingRef                = useRef({});

  useEffect(() => {
    Promise.all([
      kvGet("travito:dm_primary_fields"),
      kvGet("travito:dm_secondary_fields"),
      kvGet("travito:dm_mapping"),
    ]).then(([p, s, m]) => {
      setPrimary(Array.isArray(p) ? p : []);
      setSecondary(Array.isArray(s) ? s : []);
      const mappingData = m && typeof m === "object" ? m : {};
      setMapping(mappingData);
      mappingRef.current = mappingData;
      setLoading(false);
    });
  }, []);

  const persist = async (next) => {
    setMapping(next);
    await kvSet("travito:dm_mapping", next);
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  // Cell key: primaryTermId | secondaryTaxonomyId
  const getCell = (primTermId, secTaxId) => mapping[`${primTermId}|${secTaxId}`] || null;

  const setCell = (primTermId, secTaxId, value) => {
    const key = `${primTermId}|${secTaxId}`;
    const next = { ...mapping };
    if (next[key] === value) { delete next[key]; } else { next[key] = value; }
    setMapping(next);
    mappingRef.current = next;
    setIsDirty(true);
  };

  // Apply value to ALL terms of a primary taxonomy for one secondary taxonomy column
  const setTaxRow = (primTax, secTaxId, value) => {
    const terms = primTax.terms || [];
    if (!terms.length) return;
    const next = { ...mapping };
    const allSame = terms.every(t => next[`${t.id}|${secTaxId}`] === value);
    terms.forEach(t => {
      const key = `${t.id}|${secTaxId}`;
      if (allSame) { delete next[key]; } else { next[key] = value; }
    });
    setMapping(next);
    mappingRef.current = next;
    setIsDirty(true);
  };

  // Aggregate: what value does a primary taxonomy have for a secondary taxonomy?
  const getTaxAgg = (primTax, secTaxId) => {
    const terms = primTax.terms || [];
    if (!terms.length) return null;
    const vals = terms.map(t => mapping[`${t.id}|${secTaxId}`] || null);
    if (vals.every(v => v === "M")) return "M";
    if (vals.every(v => v === "O")) return "O";
    if (vals.every(v => v === null)) return null;
    return "mixed";
  };

  const toggleExpand = (id) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  if (loading) return <div style={{ padding:20, color:P.muted, fontSize:12 }}>Chargement...</div>;

  if (!primary.length || !secondary.length) {
    return (
      <div style={{ textAlign:"center", padding:"40px 0", color:P.muted, fontSize:12 }}>
        {!primary.length   && <div style={{marginBottom:6}}>⚠ Aucun champ clé cible (Tab 1)</div>}
        {!secondary.length && <div style={{marginBottom:6}}>⚠ Aucun champ cible secondaire (Tab 2)</div>}
        <div style={{ marginTop:12, fontSize:11 }}>Complétez les onglets 1 et 2 pour activer le mapping.</div>
      </div>
    );
  }

  const countM = Object.values(mapping).filter(v=>v==="M").length;
  const countO = Object.values(mapping).filter(v=>v==="O").length;

  const BtnCell = ({ val, active, agg, onClick }) => {
    const color = val==="M" ? "#EF4444" : P.amber;
    const bg    = val==="M" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)";
    const isMixed = agg === "mixed";
    return (
      <button onClick={onClick}
        title={val==="M" ? "Mandatory — obligatoire" : "Optional — optionnel"}
        style={{ width:26, height:20, borderRadius:3, cursor:"pointer",
          fontWeight:700, fontSize:9, fontFamily:"'IBM Plex Mono',monospace",
          border:`1px solid ${active===val ? color : isMixed ? color+"55" : P.border}`,
          background: active===val ? bg : isMixed ? color+"10" : "transparent",
          color: active===val ? color : isMixed ? color+"70" : P.muted,
          transition:"all .1s",
        }}>
        {val}
      </button>
    );
  };

  return (
    <div style={{ paddingBottom:24 }}>
      {/* Legend */}
      <div style={{ display:"flex", gap:16, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:16 }}>
          {[["M","Mandatory","#EF4444","rgba(239,68,68,0.15)","Relation obligatoire."],
            ["O","Optional",P.amber,"rgba(245,158,11,0.12)","Relation optionnelle."]
          ].map(([v,label,color,bg,desc]) => (
            <div key={v} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:4,
                background:bg, color, border:`1px solid ${color}50`,
                fontFamily:"'IBM Plex Mono',monospace" }}>{v}</span>
              <div>
                <div style={{ fontSize:11, color:P.text, fontWeight:600 }}>{label}</div>
                <div style={{ fontSize:9, color:P.muted }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:10, color:P.muted, display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ color:"#EF4444" }}>M: {countM}</span>
          <span style={{ color:P.amber }}>O: {countO}</span>
          {saved && <span style={{ color:P.green, fontSize:10 }}>✓ sauvegardé</span>}
          <button
            onClick={async()=>{ await persist(mappingRef.current); setIsDirty(false); }}
            style={{ padding:"4px 12px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:700,
              background:isDirty?"rgba(34,197,94,0.15)":"rgba(107,122,153,0.08)",
              border:`1px solid ${isDirty?"#22C55E":"rgba(107,122,153,0.25)"}`,
              color:isDirty?"#22C55E":"#6B7A99" }}>
            💾 Sauvegarder mapping{isDirty?" *":""}
          </button>
        </div>
      </div>

      {/* Matrix */}
      <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"65vh",
        border:`1px solid ${P.border}`, borderRadius:8 }}>
        <table style={{ borderCollapse:"collapse", fontSize:11, minWidth:"100%" }}>
          <thead style={{ position:"sticky", top:0, zIndex:3 }}>
            <tr>
              {/* Corner */}
              <th style={{ padding:"8px 12px", border:`1px solid ${P.border}`,
                background:P.card, position:"sticky", left:0, zIndex:4,
                minWidth:180, textAlign:"left", verticalAlign:"bottom" }}>
                <div style={{ color:P.gold, fontSize:10, fontWeight:700 }}>Champs Clés Cibles</div>
                <div style={{ color:P.muted, fontSize:8, marginTop:2 }}>▶ Taxo / termes → Secondaires</div>
              </th>
              {/* One column per secondary taxonomy */}
              {secondary.map(sec => (
                <th key={sec.id} style={{ padding:"8px 10px", border:`1px solid ${P.border}`,
                  background:"#1A2540", fontSize:10, color:P.blue,
                  textAlign:"center", minWidth:110, fontFamily:"'IBM Plex Mono',monospace",
                  fontWeight:700, whiteSpace:"nowrap" }}>
                  <div>{sec.name}</div>
                  <div style={{ fontSize:8, color:P.muted, fontWeight:400 }}>{sec.slug}</div>
                  <div style={{ fontSize:8, color:P.muted, fontWeight:400 }}>{sec.type}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {primary.map((primTax, ti) => {
              const isExp  = expanded.has(primTax.id);
              const hasTerms = (primTax.terms||[]).length > 0;
              return [
                /* ── Primary taxonomy row ── */
                <tr key={primTax.id}
                  onClick={() => hasTerms && toggleExpand(primTax.id)}
                  style={{ background: ti%2===0 ? "#131929" : "#0F1520",
                    cursor: hasTerms ? "pointer" : "default" }}>
                  <td style={{ padding:"8px 10px", border:`1px solid ${P.border}`,
                    background: ti%2===0 ? P.card : "#16202E",
                    position:"sticky", left:0, zIndex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:9, color:P.muted, width:12, flexShrink:0 }}>
                        {hasTerms ? (isExp?"▼":"▶") : "·"}
                      </span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:P.gold,
                          fontFamily:"'IBM Plex Mono',monospace" }}>{primTax.name}</div>
                        <div style={{ fontSize:8, color:P.muted }}>
                          {primTax.slug} · {primTax.type}
                          {hasTerms && <span style={{ marginLeft:4, color:P.blue }}>{primTax.terms.length} termes</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  {secondary.map(sec => {
                    const agg = getTaxAgg(primTax, sec.id);
                    return (
                      <td key={sec.id} style={{ padding:"5px 6px", border:`1px solid ${P.border}`,
                        textAlign:"center", background:"rgba(212,175,43,0.02)" }}>
                        {hasTerms ? (
                          <div style={{ display:"flex", gap:3, justifyContent:"center" }}
                            onClick={e => e.stopPropagation()}>
                            {["M","O"].map(v => (
                              <BtnCell key={v} val={v} active={agg} agg={agg}
                                onClick={() => setTaxRow(primTax, sec.id, v)} />
                            ))}
                          </div>
                        ) : (
                          <div style={{ display:"flex", gap:3, justifyContent:"center" }}>
                            {["M","O"].map(v => {
                              const val = getCell(primTax.id, sec.id);
                              return (
                                <BtnCell key={v} val={v} active={val} agg={null}
                                  onClick={() => setCell(primTax.id, sec.id, v)} />
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>,

                /* ── Term sub-rows ── */
                ...(isExp ? (primTax.terms||[]).map((term, ki) => (
                  <tr key={term.id}
                    style={{ background: ki%2===0 ? "#0C1320" : "#0A1018" }}>
                    <td style={{ padding:"5px 10px 5px 30px", border:`1px solid ${P.border}`,
                      background: ki%2===0 ? "#111E30" : "#0E1A28",
                      position:"sticky", left:0, zIndex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:9, color:P.muted }}>└</span>
                        <span style={{ fontSize:10, color:P.text }}>{term.name}</span>
                        <span style={{ fontSize:8, color:P.muted, fontFamily:"monospace" }}>{term.slug}</span>
                        <span style={{ fontSize:7, padding:"1px 5px", borderRadius:3,
                          background:P.blueS, color:P.blue }}>{term.language}</span>
                      </div>
                    </td>
                    {secondary.map(sec => {
                      const val = getCell(term.id, sec.id);
                      return (
                        <td key={sec.id} style={{ padding:"4px 5px",
                          border:`1px solid ${P.border}`, textAlign:"center" }}>
                          <div style={{ display:"flex", gap:3, justifyContent:"center" }}>
                            {["M","O"].map(v => (
                              <BtnCell key={v} val={v} active={val} agg={null}
                                onClick={() => setCell(term.id, sec.id, v)} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )) : [])
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* Note */}
      <div style={{ marginTop:12, padding:"10px 14px", background:P.card, borderRadius:8,
        border:`1px solid ${P.border}`, fontSize:10, color:P.muted, lineHeight:1.7 }}>
        <strong style={{ color:P.text }}>Utilisation :</strong>{" "}
        Cliquez ▶ sur une taxonomie pour voir ses termes.
        Les boutons <span style={{ color:"#EF4444", fontWeight:700 }}>M</span>/<span style={{ color:P.amber, fontWeight:700 }}>O</span> sur la ligne taxonomie s'appliquent à <em>tous ses termes</em> simultanément.
        Cliquez à nouveau pour effacer. Impossible de cocher M et O en même temps.
      </div>
    </div>
  );
}


// ── ComptesPanel — standalone component, injected into DataManager Tab 4 ──

// ── Email + Name generators ───────────────────────────────────────────────
const generateEmail = (username) => {
  const u = (username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!u) return "travito@gmail.com";
  return `${u[0]||""}travito${u[1]||""}maroc${u.slice(2)||""}@gmail.com`;
};
const splitName = (username) => {
  const parts = (username || "").replace(/[_-]/g, " ").trim().split(/\s+/).filter(Boolean);
  const prenom = parts[0] ? parts[0].charAt(0).toUpperCase()+parts[0].slice(1).toLowerCase() : username;
  const nom    = parts.slice(1).map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" ");
  return { prenom, nom };
};

const generatePassword = () => {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const digits  = "23456789";
  const special = "!@#$%^&*";
  const all     = upper + lower + digits + special;
  // Guarantee at least one of each category
  let pwd = [
    upper  [Math.floor(Math.random()*upper.length)],
    lower  [Math.floor(Math.random()*lower.length)],
    digits [Math.floor(Math.random()*digits.length)],
    special[Math.floor(Math.random()*special.length)],
  ];
  // Fill remaining 8 chars
  for (let i=0; i<8; i++) pwd.push(all[Math.floor(Math.random()*all.length)]);
  // Shuffle
  for (let i=pwd.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pwd[i],pwd[j]] = [pwd[j],pwd[i]];
  }
  return pwd.join("");
};

const validatePassword = (pwd) => {
  if (!pwd || pwd.length > 12) return "Max 12 caractères";
  if (!/[A-Z]/.test(pwd)) return "Doit contenir une majuscule";
  if (!/[a-z]/.test(pwd)) return "Doit contenir une minuscule";
  if (!/[0-9]/.test(pwd)) return "Doit contenir un chiffre";
  if (!/[!@#$%^&*]/.test(pwd)) return "Doit contenir un caractère spécial (!@#$%^&*)";
  return null;
};


// ══════════════════════════════════════════════════════════════════════════════
//  ListivoConfigPanel
// ══════════════════════════════════════════════════════════════════════════════
function ListivoConfigPanel({ kvGetFn, kvSetFn, P, btn, inp }) {
  const [cfg, setCfg]     = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);


  const DEFAULT = {
    cptSlug:"listings", primaryTaxSlug:"", secondaryTaxSlug:"",
    priceKey:"", locationKey:"", phoneKey:"phone",
    fieldMap:{}, publishStatus:"publish",
  };

  useEffect(()=>{
    kvGetFn("travito:listivo_config").then(d=>{setCfg(d||DEFAULT);setLoading(false);});
  },[]);

  const persist=async(next)=>{setCfg(next);await kvSetFn("travito:listivo_config",next);setSaved(true);setTimeout(()=>setSaved(false),1800);};
  const set=(key,val)=>setCfg(p=>({...p,[key]:val}));


  if(loading||!cfg)return <div style={{padding:20,color:P.muted}}>Chargement...</div>;

  const Row=({label,hint,field,ph})=>(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,color:P.gold,marginBottom:2,fontWeight:600}}>{label}</div>
      <div style={{fontSize:9,color:P.muted,marginBottom:5}}>{hint}</div>
      <input value={cfg[field]||""} onChange={e=>set(field,e.target.value)} placeholder={ph}
        style={{...inp,fontSize:11,maxWidth:400}}/>
    </div>
  );

  return (
    <div style={{maxWidth:700}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:P.gold}}>⚙️ Listivo / WordPress Config</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {saved&&<span style={{fontSize:10,color:P.green}}>✓ sauvegardé</span>}
          <button style={btn(P.green,"rgba(34,197,94,0.12)")} onClick={()=>persist(cfg)}>💾 Sauvegarder</button>
        </div>
      </div>
      <div style={{background:P.card,borderRadius:10,padding:16,marginBottom:16,border:`1px solid ${P.border}`}}>
        <div style={{fontSize:11,fontWeight:700,color:P.text,marginBottom:14}}>🏗 Post Type & Publication</div>
        <Row label="CPT REST Slug" hint="Slug REST du Custom Post Type Listivo" field="cptSlug" ph="listings"/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:P.gold,marginBottom:2,fontWeight:600}}>Statut de publication</div>
          <select value={cfg.publishStatus||"publish"} onChange={e=>set("publishStatus",e.target.value)}
            style={{...inp,fontSize:11,maxWidth:250,cursor:"pointer"}}>
            <option value="publish">publish — visible immédiatement</option>
            <option value="pending">pending — en attente révision</option>
            <option value="draft">draft — brouillon</option>
          </select>
        </div>
      </div>
      <div style={{background:P.card,borderRadius:10,padding:16,marginBottom:16,border:`1px solid ${P.border}`}}>
        <div style={{fontSize:11,fontWeight:700,color:P.text,marginBottom:14}}>🏷 Taxonomies WP (optionnel — auto-détectées)</div>
        <div style={{fontSize:9,color:P.muted,marginBottom:10}}>
          Laisser vide pour auto-détection. Remplir seulement si l'auto-détection échoue.
        </div>
        <Row label="Slug Taxonomie Principale (Catégorie)" hint="ex: listivo_category" field="primaryTaxSlug" ph="ex: listivo_category (auto-détecté si vide)"/>
        <Row label="Slug Taxonomie Secondaire (Type)" hint="ex: listivo_type" field="secondaryTaxSlug" ph="ex: listivo_type (auto-détecté si vide)"/>
      </div>
      <div style={{background:P.card,borderRadius:10,padding:16,marginBottom:16,border:`1px solid ${P.border}`}}>
        <div style={{fontSize:11,fontWeight:700,color:P.text,marginBottom:14}}>🔑 Clé Meta Téléphone</div>
        <Row label="Téléphone" hint="Clé meta WP pour le téléphone (ex: phone)" field="phoneKey" ph="phone"/>
      </div>
      <div style={{fontSize:9,color:P.muted,lineHeight:1.8,padding:"10px 14px",
        background:"rgba(59,130,246,0.06)",borderRadius:8,border:`1px solid ${P.blue}20`}}>
        💡 Le mapping des champs vers les clés meta WP se configure directement dans<br/>
        <b>📎 Champs Cibles Secondaires</b> → éditer chaque champ → "Clé Meta WordPress"<br/>
        Exemples: Ville → listivo_location · Prix → listivo_price · Quartier → listivo_neighbourhood
      </div>
      <div style={{fontSize:9,color:P.muted,lineHeight:1.8,padding:"10px 14px",background:"rgba(0,0,0,0.2)",borderRadius:8,border:`1px solid ${P.border}`}}>
        💡 Ces paramètres sont utilisés par 📢 Publier dans Product Manager. KV: travito:listivo_config<br/>
        Pour activer REST listings Listivo, ajouter au snippet WP:<br/>
        <code>{"add_filter('listivo_listing_post_type_args', function($a){ $a['show_in_rest']=true; return $a; });"}</code>
      </div>
    </div>
  );
}

function ComptesPanel({ kvGetFn, kvSetFn, P, btn, inp, fmtDate, getISOWeeksList }) {
  const [comptes,   setComptes]   = useState([]);
  const [listings,  setListings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saved,     setSaved]     = useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [showPwd,   setShowPwd]   = useState({});  // {id: bool}
  const [filterFrom,setFilterFrom]=useState("");
  const [filterTo,  setFilterTo]  =useState("");
  const [errors,    setErrors]    = useState({});
  // Inline edit state
  const [editing,   setEditing]   = useState({});
  const [selected,  setSelected]  = useState(new Set());
  const [creating,  setCreating]  = useState(false);
  const [wpResults, setWpResults] = useState({}); // {id: {field: value}}

  const [form, setForm] = useState({ username:"", phone:"", email:"", password:generatePassword() });

  const isoWeeks = getISOWeeksList(16);

  useEffect(() => {
    Promise.all([kvGetFn("travito:pm_comptes"), kvGetFn("travito:pm_listings")])
      .then(([c, l]) => {
        console.log("[Comptes] KV load — comptes:", Array.isArray(c)?c.length:"NOT ARRAY", typeof c);
        setComptes(Array.isArray(c) ? c : []);
        setListings(Array.isArray(l) ? l : []);
        setLoading(false);
      });
  }, []);

  const persist = async (next) => {
    setComptes(next); // update UI immediately
    const r = await kvSetFn("travito:pm_comptes", next);
    if (r?.success === true || r?.success === undefined) {
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } else {
      console.error("ComptesPanel persist failed, retrying...", r);
      await new Promise(res => setTimeout(res, 500));
      await kvSetFn("travito:pm_comptes", next);
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    }
  };

  const getStats = (username) => {
    const mine = listings.filter(l => l.username === username);
    return {
      total:    mine.length,
      created:  mine.filter(l => l.status === "initial").length,
      approved: mine.filter(l => l.status === "approved").length,
      posted:   mine.filter(l => l.status === "posted").length,
      deleted:  0, // future
    };
  };

  const validate = (f, excludeId=null) => {
    const e = {};
    if (!f.username.trim()) e.username = "Obligatoire";
    else if (comptes.find(c => c.username === f.username.trim() && c.id !== excludeId))
      e.username = "Déjà utilisé";
    if (!f.phone.trim()) e.phone = "Obligatoire";
    else if (comptes.find(c => c.phone === f.phone.trim() && c.id !== excludeId))
      e.phone = "Déjà utilisé";
    const pwdErr = validatePassword(f.password);
    if (pwdErr) e.password = pwdErr;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveCompte = () => {
    if (!validate(form)) return;
    const getISOWeek = (d=new Date()) => {
      const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
      date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
      const y=new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return `W${String(Math.ceil((((date-y)/86400000)+1)/7)).padStart(2,"0")}-${date.getUTCFullYear()}`;
    };
    const newC = { ...form, id:`cpt_${Date.now().toString(36)}`, createdAt:new Date().toISOString(), isoWeek:getISOWeek() };
    persist([newC, ...comptes]);
    setForm({ username:"", phone:"", email:"", password:generatePassword() });
    setShowForm(false);
    setErrors({});
  };

  const deleteCompte = (id) => {
    if (window.confirm("Supprimer ce compte?")) persist(comptes.filter(c => c.id !== id));
  };

  // Inline edit save
  const saveInlineEdit = (id) => {
    const edits = editing[id];
    if (!edits) return;
    const original = comptes.find(c => c.id === id);
    const merged = { ...original, ...edits };
    if (!validate(merged, id)) return;
    persist(comptes.map(c => c.id === id ? merged : c));
    setEditing(p => { const n={...p}; delete n[id]; return n; });
    // Also update listings with matching old username if username changed
    if (edits.username && edits.username !== original.username) {
      kvGetFn("travito:pm_listings").then(l => {
        if (!Array.isArray(l)) return;
        const updated = l.map(li => li.username === original.username ? {...li, username: edits.username} : li);
        kvSetFn("travito:pm_listings", updated);
        setListings(updated);
      });
    }
  };

  const setField = (id, field, value) => {
    setEditing(p => ({ ...p, [id]: { ...(p[id]||{}), [field]: value } }));
  };

  const getVal = (compte, field) => editing[compte.id]?.[field] ?? compte[field] ?? "";

  // Filter by ISO week range
  const filtered = comptes.filter(c => {
    if (filterFrom && c.isoWeek < filterFrom) return false;
    if (filterTo   && c.isoWeek > filterTo)   return false;
    return true;
  });

  if (loading) return <div style={{padding:20,color:P.muted,fontSize:12}}>Chargement...</div>;

  const inp2 = {...inp, padding:"4px 8px", fontSize:11};
  const hasWeekFilter = filterFrom || filterTo;

  return (
    <div style={{paddingBottom:24}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:11,color:P.muted,fontFamily:"'IBM Plex Mono',monospace"}}>
          {comptes.length} compte{comptes.length!==1?"s":""} · {listings.filter(l=>l.status==="approved").length} annonces approuvées
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {saved && <span style={{fontSize:10,color:P.green}}>✓ sauvegardé</span>}
          {selected.size > 0 && (
            <button
              title={`Créer ${selected.size} compte(s) sur travito.ma WordPress`}
              disabled={creating}
              style={{...btn(P.green,"rgba(34,197,94,0.12)"),padding:"5px 12px",fontSize:10,opacity:creating?0.6:1}}
              onClick={async()=>{
                if(!window.confirm(`Créer ${selected.size} compte(s) sur travito.ma?`)) return;
                setCreating(true);
                const toCreate = comptes.filter(c=>selected.has(c.id));
                const newResults = {...wpResults};
                for(const c of toCreate){
                  try{
                    const r = await fetch("/api/wordpress",{method:"POST",headers:{"Content-Type":"application/json"},
                      body:JSON.stringify({action:"create_user",username:c.username,password:c.password,phone:c.phone,firstName:c.username})});
                    const d = await r.json();
                    newResults[c.id] = d;
                    if(d.success){
                      persist(comptes.map(cc=>cc.id===c.id?{...cc,wpUserId:d.userId,wpCreatedAt:new Date().toISOString(),locked:true}:cc));
                      newResults[c.id]={...d,isNew:true};
                    }
                  }catch(e){
                    newResults[c.id]={success:false,error:e.message};
                  }
                }
                setWpResults(newResults);
                setCreating(false);
                setSelected(new Set());
              }}>
              {creating?"⏳ Création...":"🌐 Créer sur WP"}
            </button>
          )}
          <button title="Importer les comptes depuis les URL listings (pm_listings) qui ne sont pas encore dans la liste"
            style={{...btn(P.blue,"rgba(59,130,246,0.12)"),padding:"5px 12px",fontSize:10}}
            onClick={async()=>{
              // Always read fresh from KV (state may be stale if URLs were added in another tab)
              const listings = await kvGetFn("travito:pm_listings");
              if(!Array.isArray(listings)||listings.length===0){alert("Aucun listing trouvé dans KV — créez d'abord des URL records.");return;}
              // Also refresh comptes from KV to avoid stale dedup
              const freshComptes = await kvGetFn("travito:pm_comptes");
              if(Array.isArray(freshComptes) && freshComptes.length !== comptes.length) {
                setComptes(freshComptes); // sync state with KV
              }
              const latestComptes = Array.isArray(freshComptes) ? freshComptes : comptes;
              // Extract unique usernames/phones not already in comptes
              const existing = new Set(latestComptes.map(c=>c.username||c.phone));
              const newComptes = [];
              const seen = new Set();
              for(const l of listings){
                const u = (l.username||"").trim();
                if(!u||existing.has(u)||seen.has(u)) continue;
                seen.add(u);
                const getISOWeek=(d=new Date())=>{const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));const y=new Date(Date.UTC(date.getUTCFullYear(),0,1));return `W${String(Math.ceil((((date-y)/86400000)+1)/7)).padStart(2,"0")}-${date.getUTCFullYear()}`;};
                newComptes.push({
                  id:`cpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`,
                  username:u, phone:(l.phone||"").trim(), email:(l.email||"").trim(),
                  password:generatePassword(),
                  createdAt:l.createdAt||new Date().toISOString(),
                  isoWeek:l.isoWeek||getISOWeek(new Date(l.createdAt||Date.now())),
                });
              }
              if(newComptes.length===0){alert("Aucun nouveau compte à importer — tous déjà présents.");return;}
              const updated=[...newComptes,...latestComptes];
              await persist(updated);
              alert(`✅ ${newComptes.length} compte(s) importé(s) depuis les listings.`);
            }}>
            🔄 Sync depuis listings
          </button>
          <button style={btn(P.green,"rgba(34,197,94,0.12)")} onClick={()=>{setShowForm(!showForm);setErrors({});}}>
            {showForm?"✕ Annuler":"+ Nouveau compte"}
          </button>
        </div>
      </div>

      {/* New compte form */}
      {showForm && (
        <div style={{padding:14,background:P.card,borderRadius:10,border:`1px solid ${P.gold}40`,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:P.gold,marginBottom:12}}>➕ Nouveau compte</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
            {[
              ["username","Username *","username","ex: user_casa"],
              ["phone","Téléphone *","phone","+212..."],
              ["email","Email","","email@..."],
            ].map(([field,label,errKey,ph]) => (
              <div key={field}>
                <div style={{fontSize:10,color:errors[errKey]?P.red:P.muted,marginBottom:3}}>
                  {label}{errors[errKey]&&<span style={{marginLeft:4,fontSize:9}}>— {errors[errKey]}</span>}
                </div>
                <input value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})}
                  placeholder={ph} style={{...inp,borderColor:errors[errKey]?P.red:P.border}}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:10,color:errors.password?P.red:P.muted,marginBottom:3}}>
                Mot de passe *{errors.password&&<span style={{marginLeft:4,fontSize:9}}>— {errors.password}</span>}
              </div>
              <div style={{display:"flex",gap:4}}>
                <input value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
                  placeholder="Généré auto"
                  style={{...inp,flex:1,fontFamily:"monospace",borderColor:errors.password?P.red:P.border}}/>
                <button onClick={()=>setForm({...form,password:generatePassword()})}
                  title="Générer nouveau mot de passe"
                  style={{...btn(P.purple,"rgba(139,92,246,0.12)"),padding:"0 10px",fontSize:14}}>🔄</button>
              </div>
            </div>
          </div>
          <button style={btn(P.green,"rgba(34,197,94,0.12)")} onClick={saveCompte}>✓ Créer compte</button>
        </div>
      )}

      {/* ISO week range filter */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:10,color:P.muted}}>Semaines:</span>
        <select value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}
          style={{...inp,width:"auto",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>
          <option value="">De — toutes</option>
          {isoWeeks.map(w=><option key={w} value={w}>{w}</option>)}
        </select>
        <select value={filterTo} onChange={e=>setFilterTo(e.target.value)}
          style={{...inp,width:"auto",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>
          <option value="">À — toutes</option>
          {isoWeeks.map(w=><option key={w} value={w}>{w}</option>)}
        </select>
        {hasWeekFilter && (
          <button onClick={()=>{setFilterFrom("");setFilterTo("");}}
            style={{...btn(P.red,"rgba(239,68,68,0.10)"),padding:"4px 10px",fontSize:9}}>✕ Reset</button>
        )}
        <span style={{fontSize:9,color:P.muted,marginLeft:"auto"}}>{filtered.length} compte{filtered.length!==1?"s":""}</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:"32px 0",color:P.muted,fontSize:12}}>
          Aucun compte. Cliquez "+ Nouveau compte".
        </div>
      ) : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead style={{position:"sticky",top:0,zIndex:2}}>
              <tr style={{background:P.card}}>
                <th style={{padding:"8px 10px",borderBottom:`1px solid ${P.border}`,width:32}}>
                  <input type="checkbox" style={{accentColor:P.gold}}
                    checked={filtered.length>0&&filtered.every(c=>selected.has(c.id))}
                    onChange={e=>{const s=new Set(selected);filtered.forEach(c=>e.target.checked?s.add(c.id):s.delete(c.id));setSelected(s);}}/>
                </th>
              {["Username","Téléphone","Email (généré)","Mot de passe","Semaine","Email WP","URLs","Actions"].map((h,i)=>(
                  <th key={i} style={{padding:"8px 10px",color:P.muted,fontWeight:600,
                    textAlign:"left",borderBottom:`1px solid ${P.border}`,fontSize:10,
                    whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((compte, ri) => {
                const stats = getStats(compte.username);
                const isEditing = !!editing[compte.id];
                const pwdVisible = showPwd[compte.id];

                return (
                  <tr key={compte.id} style={{borderBottom:`1px solid ${P.border}`,
                    background:compte.locked&&wpResults[compte.id]?.success?"rgba(34,197,94,0.18)":compte.locked?"rgba(34,197,94,0.08)":ri%2===0?"#0E1117":"#161B27",
                    outline:compte.locked&&wpResults[compte.id]?.success?`2px solid ${P.green}`:"none"}}>
                    <td style={{padding:"6px 10px",textAlign:"center"}}>
                      <input type="checkbox" checked={selected.has(compte.id)} style={{accentColor:P.gold}}
                        onChange={e=>{const s=new Set(selected);e.target.checked?s.add(compte.id):s.delete(compte.id);setSelected(s);}}/>
                    </td>
                    {/* Username */}
                    <td style={{padding:"6px 10px"}}>
                      {compte.locked&&wpResults[compte.id]?.success&&(
                        <div style={{fontSize:8,color:P.green,marginBottom:3}}>
                          {wpResults[compte.id]?.metaUpdated&&!wpResults[compte.id]?.isNew
                            ? "✓ WP mis à jour"
                            : "✓ WP créé"
                          } · ID:{compte.wpUserId}
                          {compte.wpCreatedAt&&<span style={{color:P.muted,marginLeft:4}}>{fmtDate(compte.wpCreatedAt)}</span>}
                        </div>
                      )}
                      {wpResults[compte.id]&&!wpResults[compte.id].success&&(
                        <div style={{fontSize:8,color:P.red,marginBottom:3}}>✗ {wpResults[compte.id].error?.slice(0,40)}</div>
                      )}
                      <input value={getVal(compte,"username")}
                        onChange={e=>!compte.locked&&setField(compte.id,"username",e.target.value)}
                        readOnly={!!compte.locked}
                        style={{...inp2,width:120,
                          borderColor:errors[`${compte.id}_username`]?P.red:isEditing&&!compte.locked?P.gold:P.border,
                          opacity:compte.locked?0.7:1,cursor:compte.locked?"not-allowed":"text"}}
                        title={compte.locked?"Compte créé sur WP — non modifiable":"Editable — sauvegarder avec ✓"}/>
                      {errors[`${compte.id}_username`]&&<div style={{fontSize:8,color:P.red,marginTop:2}}>{errors[`${compte.id}_username`]}</div>}
                    </td>

                    {/* Phone */}
                    <td style={{padding:"6px 10px"}}>
                      <input value={getVal(compte,"phone")}
                        onChange={e=>setField(compte.id,"phone",e.target.value)}
                        style={{...inp2,width:110,borderColor:isEditing?P.gold:P.border}}/>
                    </td>

                    {/* Email */}
                    <td style={{padding:"6px 10px"}}>
                      <input value={getVal(compte,"email")||""}
                        onChange={e=>setField(compte.id,"email",e.target.value)}
                        placeholder="—"
                        style={{...inp2,width:130,borderColor:isEditing?P.gold:P.border}}/>
                    </td>

                    {/* Password */}
                    <td style={{padding:"6px 10px"}}>
                      <div style={{display:"flex",gap:4,alignItems:"center"}}>
                        <input
                          type={pwdVisible?"text":"password"}
                          value={getVal(compte,"password")}
                          onChange={e=>setField(compte.id,"password",e.target.value)}
                          style={{...inp2,width:110,fontFamily:"monospace",
                            borderColor:errors[`${compte.id}_password`]?P.red:isEditing?P.gold:P.border}}/>
                        <button onClick={()=>setShowPwd(p=>({...p,[compte.id]:!p[compte.id]}))}
                          title={pwdVisible?"Masquer":"Afficher"}
                          style={{background:"transparent",border:"none",cursor:"pointer",
                            fontSize:13,color:P.muted,padding:"0 2px"}}>
                          {pwdVisible?"🙈":"👁"}
                        </button>
                        <button onClick={()=>setField(compte.id,"password",generatePassword())}
                          title="Régénérer mot de passe"
                          style={{background:"transparent",border:"none",cursor:"pointer",
                            fontSize:12,color:P.muted,padding:"0 2px"}}>🔄</button>
                      </div>
                      {errors[`${compte.id}_password`]&&<div style={{fontSize:8,color:P.red,marginTop:2}}>{errors[`${compte.id}_password`]}</div>}
                    </td>

                    {/* ISO week + date */}
                    <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>
                      <div style={{fontSize:10,color:P.text}}>{compte.isoWeek||"—"}</div>
                      <div style={{fontSize:9,color:P.muted}}>{fmtDate(compte.createdAt)}</div>
                    </td>

                    {/* Generated email display */}
                    <td style={{padding:"6px 10px",fontSize:9,color:P.muted}}>
                      {generateEmail(getVal(compte,"username"))}
                    </td>
                    {/* URL stats */}
                    <td style={{padding:"6px 10px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px 8px",fontSize:9}}>
                        <span style={{color:P.muted}}>Total: <b style={{color:P.text}}>{stats.total}</b></span>
                        <span style={{color:P.muted}}>Créées: <b style={{color:P.text}}>{stats.created}</b></span>
                        <span style={{color:P.muted}}>Approuvées: <b style={{color:P.green}}>{stats.approved}</b></span>
                        <span style={{color:P.muted}}>Postées: <b style={{color:P.blue}}>{stats.posted}</b></span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>
                      {isEditing ? (
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>saveInlineEdit(compte.id)}
                            title="Sauvegarder les modifications"
                            style={{...btn(P.green,"rgba(34,197,94,0.12)"),padding:"3px 10px",fontSize:10}}>
                            ✓
                          </button>
                          <button onClick={()=>setEditing(p=>{const n={...p};delete n[compte.id];return n;})}
                            title="Annuler"
                            style={{...btn(P.muted,"transparent"),padding:"3px 8px",fontSize:10}}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{display:"flex",gap:4}}>
                          {compte.wpUserId&&(
                            <button
                              title="Pousser phone/confirmed/whatsapp vers WP"
                              onClick={async()=>{
                                const phone = compte.phone||"";
                                const knownCodes=["212","966","213","216","44","33","49","39","34","31","32","41","1"];
                                let cleanPhone=phone.trim().replace(/[\s\-\(\)]/g,"");
                                if(cleanPhone.startsWith("+")){for(const cc of knownCodes){if(cleanPhone.slice(1).startsWith(cc)){cleanPhone=cleanPhone.slice(1+cc.length);break;}}if(cleanPhone.startsWith("+"))cleanPhone=cleanPhone.replace(/^\+\d{1,4}/,"");}
                                try{
                                  const r=await fetch("/api/wordpress",{method:"POST",
                                    headers:{"Content-Type":"application/json"},
                                    body:JSON.stringify({
                                      action:"update_user_meta",
                                      userId:compte.wpUserId,
                                      meta:{phone:cleanPhone,confirmed:"1",verified:"1",whats_app:"1"}
                                    })});
                                  const d=await r.json();
                                  if(d.success){
                                    // Clear any previous error, mark meta as updated
                                    const newR={...wpResults,[compte.id]:{success:true,metaUpdated:true,userId:compte.wpUserId,customMeta:d.customMeta}};
                                    setWpResults(newR);
                                    const metaStatus=Object.entries(d.customMeta||{}).map(([k,v])=>`${k}:${v}`).join(", ");
                                    alert("✅ WP mis à jour: phone="+cleanPhone+"\n"+metaStatus);
                                  } else {
                                    alert("❌ Échec: "+(d.error||d.message||JSON.stringify(d).slice(0,200)));
                                  }
                                }catch(e){alert("❌ "+e.message);}
                              }}
                              style={{...btn(P.blue,"rgba(59,130,246,0.12)"),padding:"3px 8px",fontSize:10}}>
                              📤
                            </button>
                          )}
                          <button onClick={()=>deleteCompte(compte.id)}
                            title="Supprimer ce compte (Vercel uniquement)"
                            style={{...btn(P.red,"rgba(239,68,68,0.10)"),padding:"3px 8px",fontSize:10}}>
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{marginTop:12,fontSize:9,color:P.muted,lineHeight:1.8}}>
        💡 Cliquez sur n'importe quel champ pour le modifier — puis ✓ pour sauvegarder.<br/>
        Le mot de passe doit contenir: majuscule · minuscule · chiffre · caractère spécial (!@#$%^&*) · max 12 chars.<br/>
        Modifier le username met à jour automatiquement les URLs associées.
      </div>
    </div>
  );
}


const DELETED_KEY = "travito:pm_deleted_urls";


const normalizeUrlKey = (url) => {
  try {
    const u = new URL(String(url).trim());
    const host = u.hostname.toLowerCase();
    const pathname = decodeURIComponent(u.pathname)
      .replace(/\/+$/, "")
      .toLowerCase();
    return `${u.protocol}//${host}${pathname}`;
  } catch {
    return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
  }
};


function UrlsPanel({ kvGetFn, kvSetFn, P, btn, inp }) {
  const [seenUrls, setSeenUrls] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState("");

  const [scope, setScope] = useState("all"); // all | seen | listings
  const [isoWeek, setIsoWeek] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("all");

  const [openDetailsUrl, setOpenDetailsUrl] = useState(null);

  const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];


  useEffect(() => {
    Promise.all([
      kvGetFn("travito:pm_seen_urls"),
      kvGetFn("travito:pm_listings"),
    ]).then(([seen, list]) => {
      setSeenUrls(Array.isArray(seen) ? seen : []);
      setListings(Array.isArray(list) ? list : []);
      setLoading(false);
    });
  }, []);

  const markSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

const persistSeen = async (next) => {
  const byKey = new Map();
  for (const u of next) {
    const key = normalizeUrlKey(u);
    if (!byKey.has(key)) byKey.set(key, u);
  }
  const unique = [...byKey.values()];
  setSeenUrls(unique);
  await kvSetFn("travito:pm_seen_urls", unique);
};

const persistListings = async (next) => {
  const seen = new Set();
  const unique = [];

  for (const l of next) {
    const key = normalizeUrlKey(l.url);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(l);
    }
  }

  setListings(unique);
  await kvSetFn("travito:pm_listings", unique);
};


const seenByKey = new Map();
for (const rawUrl of seenUrls) {
  const key = normalizeUrlKey(rawUrl);
  if (!seenByKey.has(key)) {
    seenByKey.set(key, rawUrl);
  }
}

const listingByKey = new Map();
for (const l of listings) {
  if (!l?.url) continue;
  const key = normalizeUrlKey(l.url);

  if (!listingByKey.has(key)) {
    listingByKey.set(key, l);
  } else {
    const prev = listingByKey.get(key);
    const prevScore = Object.keys(prev || {}).length;
    const nextScore = Object.keys(l || {}).length;
    if (nextScore >= prevScore) listingByKey.set(key, l);
  }
}

const allKeys = [...new Set([
  ...seenByKey.keys(),
  ...listingByKey.keys()
])];

const rows = allKeys.map(key => {
  const seenUrl = seenByKey.get(key) || "";
  const listing = listingByKey.get(key) || null;
  const displayUrl = listing?.url || seenUrl || "";

  return {
    key,
    url: displayUrl,
    seen: seenByKey.has(key),
    inListings: !!listing,
    listing,
    id: listing?.id || "",
    status: listing?.status || "",
    mode: listing?.mode || "",
    isoWeek: listing?.isoWeek || "",
    username: listing?.username || "",
    phoneStatus: listing?.phoneStatus || "",
    createdAt: listing?.createdAt || "",
    day: listing?.dayConfig?.day || "",
  };
});

  const filteredRows = rows.filter(row => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = [
        row.url,
        row.id,
        row.status,
        row.mode,
        row.isoWeek,
        row.username,
        row.phoneStatus,
        row.day
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (scope === "seen" && !row.seen) return false;
    if (scope === "listings" && !row.inListings) return false;

    // listing-only filters
    if (isoWeek !== "all") {
      if (!row.inListings) return false;
      if (row.isoWeek !== isoWeek) return false;
    }

    if (dateFilter) {
      if (!row.inListings) return false;
      const rowDate = row.createdAt ? String(row.createdAt).slice(0, 10) : "";
      if (rowDate !== dateFilter) return false;
    }

    if (dayFilter !== "all") {
      if (!row.inListings) return false;
      if ((row.day || "") !== dayFilter) return false;
    }

    return true;
  });

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every(r => selected.has(r.key));

const toggleOne = (rowKey) => {
  const next = new Set(selected);
  if (next.has(rowKey)) next.delete(rowKey);
  else next.add(rowKey);
  setSelected(next);
};


const toggleAllVisible = (checked) => {
  const next = new Set(selected);
  if (checked) filteredRows.forEach(r => next.add(r.key));
  else filteredRows.forEach(r => next.delete(r.key));
  setSelected(next);
};


  const clearFilters = () => {
    setQuery("");
    setScope("all");
    setIsoWeek("all");
    setDateFilter("");
    setDayFilter("all");
  };


const deleteSelected = async () => {
  if (!selected.size) return;
  if (!window.confirm(`Supprimer ${selected.size} URL(s) de pm_seen_urls ET pm_listings ?`)) return;

  const keysToDelete = new Set(selected);

  const nextSeen = seenUrls.filter(u => !keysToDelete.has(normalizeUrlKey(u)));
  const nextListings = listings.filter(l => !keysToDelete.has(normalizeUrlKey(l.url)));

  // keep memory of manually deleted URLs
  const prevDeleted = await kvGetFn(DELETED_KEY).then(v => Array.isArray(v) ? v : []);
  const nextDeleted = [...new Set([...prevDeleted, ...keysToDelete])];

  await persistSeen(nextSeen);
  await persistListings(nextListings);
  await kvSetFn(DELETED_KEY, nextDeleted);

  setSeenUrls(nextSeen);
  setListings(nextListings);
  setSelected(new Set());
  if (openDetailsUrl && keysToDelete.has(openDetailsUrl)) setOpenDetailsUrl(null);
  markSaved();
};


const deleteSingle = async (rowKey) => {
  if (!window.confirm("Supprimer cette URL de pm_seen_urls ET pm_listings ?")) return;

  const nextSeen = seenUrls.filter(u => normalizeUrlKey(u) !== rowKey);
  const nextListings = listings.filter(l => normalizeUrlKey(l.url) !== rowKey);

  // keep memory of manually deleted URL
  const prevDeleted = await kvGetFn(DELETED_KEY).then(v => Array.isArray(v) ? v : []);
  const nextDeleted = [...new Set([...prevDeleted, rowKey])];

  await persistSeen(nextSeen);
  await persistListings(nextListings);
  await kvSetFn(DELETED_KEY, nextDeleted);

  setSeenUrls(nextSeen);
  setListings(nextListings);

  const s = new Set(selected);
  s.delete(rowKey);
  setSelected(s);

  if (openDetailsUrl === rowKey) setOpenDetailsUrl(null);
  markSaved();
};


  const rowStatusStyle = (status) => {
    switch (status) {
      case "initial":
        return { color: P.muted, bg: "rgba(107,122,153,0.12)" };
      case "generated":
        return { color: P.blue, bg: P.blueS };
      case "phone_revealed":
      case "phone_not_revealed":
        return { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" };
      case "user_ready":
        return { color: P.amber, bg: P.amberS };
      case "publish_ready":
        return { color: P.gold, bg: P.goldS };
      case "published":
        return { color: P.green, bg: P.greenS };
      default:
        return { color: P.muted, bg: "rgba(107,122,153,0.08)" };
    }
  };

  const isoWeeks = [...new Set(
    listings.map(l => l.isoWeek).filter(Boolean)
  )].sort().reverse();

  const openRow = rows.find(r => r.key === openDetailsUrl) || null;
  const openListing = openRow?.listing || null;

  if (loading) {
    return <div style={{ padding:20, color:P.muted, fontSize:12 }}>Chargement...</div>;
  }

  return (
    <div style={{ paddingBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, gap:10, flexWrap:"wrap" }}>
        <div style={{ fontSize:11, color:P.muted, fontFamily:"'IBM Plex Mono',monospace" }}>
          {filteredRows.length} ligne(s) affichée(s) · {seenUrls.length} seen · {listings.length} pm_listings
        </div>

        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {saved && <span style={{ fontSize:10, color:P.green }}>✓ sauvegardé</span>}

          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher URL / id / username / status..."
            style={{ ...inp, width:260, fontSize:11 }}
          />

          <select value={scope} onChange={e => setScope(e.target.value)} style={{ ...inp, width:"auto", fontSize:11, cursor:"pointer" }}>
            <option value="all">All</option>
            <option value="seen">Seen only</option>
            <option value="listings">pm_listings only</option>
          </select>

          <select value={isoWeek} onChange={e => setIsoWeek(e.target.value)} style={{ ...inp, width:"auto", fontSize:11, cursor:"pointer" }}>
            <option value="all">Toutes semaines</option>
            {isoWeeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>

          <select value={dayFilter} onChange={e => setDayFilter(e.target.value)} style={{ ...inp, width:"auto", fontSize:11, cursor:"pointer" }}>
            <option value="all">Tous jours</option>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ ...inp, width:"auto", fontSize:11 }}
          />

          <button
            style={btn(P.muted, "transparent")}
            onClick={clearFilters}
          >
            ✕ Reset
          </button>

          {selected.size > 0 && (
            <button
              style={btn(P.red, "rgba(239,68,68,0.10)")}
              onClick={deleteSelected}
            >
              🗑 Supprimer ({selected.size})
            </button>
          )}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div style={{ textAlign:"center", padding:"32px 0", color:P.muted, fontSize:12 }}>
          Aucune ligne pour ces filtres.
        </div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead style={{
  position:"sticky",
  top:0,
  zIndex:5,
  background:P.card,
  boxShadow:"0 2px 6px rgba(0,0,0,0.4)"
}}>
              <tr style={{ background:P.card }}>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, width:40 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={e => toggleAllVisible(e.target.checked)}
                    style={{ accentColor:P.gold }}
                  />
                </th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>URL</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"center", fontSize:10 }}>Seen</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"center", fontSize:10 }}>In Listings</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>Status</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>Mode</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>ISO Week</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>Jour</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>ID</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>Username</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"left", fontSize:10 }}>Phone Status</th>
                <th style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, color:P.muted, textAlign:"center", fontSize:10, width:110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => {
                const st = rowStatusStyle(row.status);



                return (
                  <tr
                    key={row.key}
                    style={{
                      borderBottom:`1px solid ${P.border}`,
                      background:i % 2 === 0 ? P.bg : P.surface
                    }}
                  >
                    <td style={{ padding:"8px 10px", textAlign:"center" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.key)}
                        onChange={() => toggleOne(row.key)}
                        style={{ accentColor:P.gold }}
                      />
                    </td>

                    <td style={{ padding:"8px 10px", minWidth:340 }}>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color:P.blue,
                          fontSize:11,
                          display:"block",
                          wordBreak:"break-all",
                          textDecoration:"none"
                        }}
                      >
                        {row.url}
                      </a>
                    </td>

                    <td style={{ padding:"8px 10px", textAlign:"center" }}>
                      <span style={{
                        fontSize:10,
                        padding:"2px 8px",
                        borderRadius:10,
                        background: row.seen ? P.greenS : "rgba(107,122,153,0.10)",
                        color: row.seen ? P.green : P.muted
                      }}>
                        {row.seen ? "Yes" : "No"}
                      </span>
                    </td>

                    <td style={{ padding:"8px 10px", textAlign:"center" }}>
                      <span style={{
                        fontSize:10,
                        padding:"2px 8px",
                        borderRadius:10,
                        background: row.inListings ? P.blueS : "rgba(107,122,153,0.10)",
                        color: row.inListings ? P.blue : P.muted
                      }}>
                        {row.inListings ? "Yes" : "No"}
                      </span>
                    </td>

                    <td style={{ padding:"8px 10px" }}>
                      {row.status ? (
                        <span style={{
                          fontSize:10,
                          padding:"3px 8px",
                          borderRadius:10,
                          background: st.bg,
                          color: st.color,
                          fontWeight:600
                        }}>
                          {row.status}
                        </span>
                      ) : (
                        <span style={{ color:P.muted, fontSize:10 }}>—</span>
                      )}
                    </td>

                    <td style={{ padding:"8px 10px", color: row.mode ? P.text : P.muted }}>
                      {row.mode || "—"}
                    </td>

                    <td style={{ padding:"8px 10px", color: row.isoWeek ? P.text : P.muted }}>
                      {row.isoWeek || "—"}
                    </td>

                    <td style={{ padding:"8px 10px", color: row.day ? P.text : P.muted }}>
                      {row.day || "—"}
                    </td>

                    <td style={{ padding:"8px 10px", color: row.id ? P.text : P.muted, fontFamily:"monospace", fontSize:10 }}>
                      {row.id || "—"}
                    </td>

                    <td style={{ padding:"8px 10px", color: row.username ? P.text : P.muted }}>
                      {row.username || "—"}
                    </td>

                    <td style={{ padding:"8px 10px", color: row.phoneStatus ? P.text : P.muted }}>
                      {row.phoneStatus || "—"}
                    </td>

                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap", textAlign:"center" }}>
                      <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
                        <button
                          onClick={() => setOpenDetailsUrl(row.key)}
                          style={{ ...btn(P.gold, P.goldS), padding:"3px 8px", fontSize:10 }}
                          title="Voir détails"
                        >
                          👁
                        </button>

                        <button
                          onClick={() => deleteSingle(row.key)}
                          style={{ ...btn(P.red, "rgba(239,68,68,0.10)"), padding:"3px 8px", fontSize:10 }}
                          title="Supprimer de seen + listings"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );


                
              })}
            </tbody>
          </table>
        </div>
      )}

      {openRow && (
        <div style={{
          position:"fixed",
          inset:0,
          background:"rgba(0,0,0,0.72)",
          zIndex:1000,
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          padding:16
        }}>
          <div style={{
            width:"min(980px, 96vw)",
            maxHeight:"90vh",
            overflow:"hidden",
            display:"flex",
            flexDirection:"column",
            background:P.surface,
            border:`1px solid ${P.border}`,
            borderRadius:12
          }}>
            <div style={{
              padding:"12px 16px",
              borderBottom:`1px solid ${P.border}`,
              display:"flex",
              justifyContent:"space-between",
              alignItems:"center"
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:P.gold }}>🔍 Détails URL</div>
                <div style={{ fontSize:10, color:P.muted, marginTop:2, wordBreak:"break-all" }}>{openRow.url}</div>
              </div>

              <button
                onClick={() => setOpenDetailsUrl(null)}
                style={btn(P.muted, "transparent")}
              >
                Fermer
              </button>
            </div>

            <div style={{ padding:16, overflowY:"auto" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div style={{ background:P.card, border:`1px solid ${P.border}`, borderRadius:8, padding:12 }}>
                  <div style={{ fontSize:11, color:P.gold, marginBottom:8, fontWeight:700 }}>Vue fusionnée</div>
                  {[
                    ["Seen", openRow.seen ? "Yes" : "No"],
                    ["In Listings", openRow.inListings ? "Yes" : "No"],
                    ["Status", openRow.status || "—"],
                    ["Mode", openRow.mode || "—"],
                    ["ISO Week", openRow.isoWeek || "—"],
                    ["Jour", openRow.day || "—"],
                    ["ID", openRow.id || "—"],
                    ["Username", openRow.username || "—"],
                    ["Phone Status", openRow.phoneStatus || "—"],
                    ["Created At", openRow.createdAt || "—"],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:10, padding:"4px 0", borderBottom:`1px solid ${P.border}20` }}>
                      <span style={{ fontSize:10, color:P.muted }}>{k}</span>
                      <span style={{ fontSize:10, color:P.text, textAlign:"right", wordBreak:"break-word" }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background:P.card, border:`1px solid ${P.border}`, borderRadius:8, padding:12 }}>
                  <div style={{ fontSize:11, color:P.gold, marginBottom:8, fontWeight:700 }}>Listing JSON</div>
                  {openListing ? (
                    <pre style={{
                      margin:0,
                      fontSize:10,
                      color:P.text,
                      whiteSpace:"pre-wrap",
                      wordBreak:"break-word",
                      maxHeight:380,
                      overflowY:"auto"
                    }}>
{JSON.stringify(openListing, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ fontSize:11, color:P.muted }}>Cette URL n’existe pas dans pm_listings.</div>
                  )}
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button
                  onClick={() => deleteSingle(openRow.key)}
                  style={btn(P.red, "rgba(239,68,68,0.10)")}
                >
                  🗑 Supprimer cette URL
                </button>
                <button
                  onClick={() => setOpenDetailsUrl(null)}
                  style={btn(P.muted, "transparent")}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop:12, fontSize:9, color:P.muted, lineHeight:1.7 }}>
        Source 1: <code>travito:pm_seen_urls</code> · URLs simples<br/>
        Source 2: <code>travito:pm_listings</code> · enregistrements pipeline complets<br/>
        Suppression depuis cet onglet = suppression depuis <b>les deux</b>.
      </div>
    </div>
  );
}


export default function DataManager() {
  const [tab, setTab] = useState("primary");

  const TABS = [
    { id:"comptes",   label:"📋 Comptes" },
    { id:"urls",      label:"🔗 URLs" },
    { id:"primary",   label:"📌 Champs Clés Cibles" },
    { id:"secondary", label:"📎 Champs Cibles Secondaires" },
    { id:"mapping",   label:"🔗 Mapping" },
    { id:"listivo",   label:"⚙️ Listivo Config" },
  ];

  return (
    <div style={{ fontFamily:"'IBM Plex Mono', 'Courier New', monospace",
      background:P.bg, height:"100%", display:"flex", flexDirection:"column",
      overflow:"hidden", color:P.text }}>

      {/* Header — fixed */}
      <div style={{ padding:"14px 20px 0", borderBottom:`1px solid ${P.border}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:14 }}>
          <div style={{ fontSize:18, fontWeight:700, color:P.gold, letterSpacing:"-0.5px" }}>
            📊 Data Manager
          </div>
          <div style={{ fontSize:10, color:P.muted }}>VP Production · Gestion des taxonomies & mapping</div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:"7px 16px", fontSize:11, cursor:"pointer", border:"none",
                borderRadius:"6px 6px 0 0", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600,
                background: tab===t.id ? P.card : "transparent",
                color: tab===t.id ? P.gold : P.muted,
                borderBottom: tab===t.id ? `2px solid ${P.gold}` : "2px solid transparent",
                transition:"all .15s",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content — scrollable, uses display:none to preserve state on tab switch */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>



{tab==="comptes" && (
  <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"16px 20px" }}>
    <ComptesPanel
      kvGetFn={kvGet}
      kvSetFn={kvSet}
      P={P}
      btn={btn}
      inp={inp}
      fmtDate={fmtDate}
      getISOWeeksList={getISOWeeksList}
    />
  </div>
)}

{tab==="urls" && (
  <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"16px 20px" }}>
    <UrlsPanel
      kvGetFn={kvGet}
      kvSetFn={kvSet}
      P={P}
      btn={btn}
      inp={inp}
    />
  </div>
)}

{tab==="primary" && (
  <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"16px 20px" }}>
    <TaxonomyPanel kvKey="travito:dm_primary_fields" title="Champs Clés Cibles" />
  </div>
)}

{tab==="secondary" && (
  <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"16px 20px" }}>
    <TaxonomyPanel
      kvKey="travito:dm_secondary_fields"
      title="Champs Cibles Secondaires"
      isSecondary={true}
    />
  </div>
)}

{tab==="mapping" && (
  <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"16px 20px" }}>
    <MappingPanel />
  </div>
)}

{tab==="listivo" && (
  <div style={{ position:"absolute", inset:0, overflowY:"auto", padding:"16px 20px" }}>
    <ListivoConfigPanel
      kvGetFn={kvGet}
      kvSetFn={kvSet}
      P={P}
      btn={btn}
      inp={inp}
    />
  </div>
)}




      </div>
    </div>
  );
}
