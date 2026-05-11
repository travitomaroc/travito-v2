import { useState, useEffect, useCallback, useRef } from "react";

// ── KV helpers ────────────────────────────────────────────────────────────────
const kvGet = async (key) => {
  try {
    const r=await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
    const d=await r.json();
    let val = d.config ?? null;
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  } catch { return null; }
};
const kvSet = async (key,value) => {
  try {
    const r = await fetch("/api/kv",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key,value:JSON.stringify(value)})});
    const d = await r.json();
    return d;
  } catch(e) { console.error("kvSet failed:",key,e); return null; }
};
const uid = () => `pm_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
const generateEmail = (username) => {
  const u = (username||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
  if(!u) return "";
  return `${u[0]||""}travito${u[1]||""}maroc${u.slice(2)||""}@gmail.com`;
};
const fmtDate = (iso) => iso?new Date(iso).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"";

// ISO week helpers
const getISOWeek = (d=new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date-yearStart)/86400000)+1)/7);
  return `W${String(weekNo).padStart(2,"0")}-${date.getUTCFullYear()}`;
};
const getISOWeeksList = (n=10) => {
  const weeks=[]; const today=new Date();
  for(let i=0;i<n;i++){const d=new Date(today);d.setDate(d.getDate()-i*7);weeks.push(getISOWeek(d));}
  return weeks;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const P = {
  bg:"#0E1117",surface:"#161B27",card:"#1C2333",border:"#2A3348",
  gold:"#C8972B",goldS:"rgba(200,151,43,0.12)",text:"#E8EAF0",
  muted:"#6B7A99",green:"#22C55E",greenS:"rgba(34,197,94,0.12)",
  red:"#EF4444",redS:"rgba(239,68,68,0.10)",blue:"#3B82F6",
  blueS:"rgba(59,130,246,0.12)",amber:"#F59E0B",amberS:"rgba(245,158,11,0.10)",
  purple:"#8B5CF6",purpleS:"rgba(139,92,246,0.12)",teal:"#14B8A6",tealS:"rgba(20,184,166,0.12)",
};
const STATUS = {
  initial:  {label:"Initial",   color:P.muted, bg:"rgba(107,122,153,0.12)"},
  generated:{label:"Généré",    color:P.amber, bg:P.amberS},
  saved:    {label:"Sauvegardé",color:P.blue,  bg:P.blueS},
  approved: {label:"Approuvé",  color:P.green, bg:P.greenS},
};
const inp={background:P.card,border:`1px solid ${P.border}`,borderRadius:6,color:P.text,padding:"7px 10px",fontSize:12,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
const btn=(color=P.gold,bg=P.goldS,extra={})=>({background:bg,border:`1px solid ${color}40`,borderRadius:6,color,padding:"6px 14px",fontSize:11,cursor:"pointer",fontWeight:600,transition:"all .15s",whiteSpace:"nowrap",...extra});

// ══════════════════════════════════════════════════════════════════════════════
//  ApproveField
// ══════════════════════════════════════════════════════════════════════════════
function ApproveField({label,value,found,fieldState,onStateChange,onValueChange,type="text",options=[]}) {
  const bg=fieldState==="approved"?"rgba(34,197,94,0.12)":fieldState==="draft"?"rgba(255,235,59,0.10)":found===false?"rgba(239,68,68,0.10)":"rgba(255,235,59,0.07)";
  const bc=fieldState==="approved"?P.green:fieldState==="draft"?"#F59E0B":found===false?P.red:"rgba(255,235,59,0.25)";
  return (
    <div style={{marginBottom:10,padding:"8px 10px",borderRadius:8,background:bg,border:`1px solid ${bc}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:10,color:P.muted}}>{label}{found===false&&<span style={{color:P.red,marginLeft:6,fontSize:9}}>⚠ non trouvé</span>}</span>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>onStateChange(fieldState==="draft"?null:"draft")} style={{fontSize:8,padding:"1px 7px",borderRadius:4,cursor:"pointer",background:fieldState==="draft"?P.amberS:"rgba(0,0,0,0.3)",border:`1px solid ${fieldState==="draft"?P.amber:P.border}`,color:fieldState==="draft"?P.amber:P.muted}}>Brouillon</button>
          <button onClick={()=>onStateChange(fieldState==="approved"?null:"approved")} style={{fontSize:8,padding:"1px 7px",borderRadius:4,cursor:"pointer",background:fieldState==="approved"?P.greenS:"rgba(0,0,0,0.3)",border:`1px solid ${fieldState==="approved"?P.green:P.border}`,color:fieldState==="approved"?P.green:P.muted}}>✓ Approuver</button>
        </div>
      </div>
      {type==="textarea"?(
        <textarea value={value||""} onChange={e=>onValueChange(e.target.value)} rows={3} style={{...inp,resize:"vertical",fontSize:11,lineHeight:1.6}}/>
      ):type==="select"?(
        <select value={value||""} onChange={e=>onValueChange(e.target.value)} style={{...inp,fontSize:11,cursor:"pointer"}}>
          <option value="">— Sélectionner —</option>
          {options.map(o=><option key={o.id||o} value={o.id||o}>{o.name||o}</option>)}
        </select>
      ):(
        <input value={value===null||value===undefined||value==="N/A"||value==="null"?"":value} onChange={e=>onValueChange(e.target.value)} style={{...inp,fontSize:11,background:found===false?"rgba(239,68,68,0.06)":"rgba(0,0,0,0.25)"}}/>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ViewPopup
// ══════════════════════════════════════════════════════════════════════════════
function ViewPopup({listing,primaryFields,secondaryFields,onApprove,onRegenerate,onSave,onClose}) {
  const initGenerated = JSON.parse(JSON.stringify(listing.generated||{}));
  if(!initGenerated.photoDescription) initGenerated.photoDescription = initGenerated.photoDescriptionOriginal||"";
  const [g,setG] = useState(initGenerated);
  const [fs,setFs] = useState({
    // Restore existing fieldStates
    ...listing.generated?.fieldStates,
    // Pre-approve vendeur/phone if already filled
    vendeur: listing.generated?.fieldStates?.vendeur || (listing.username ? "approved" : null),
    phone:   listing.generated?.fieldStates?.phone   || (listing.phone   ? "approved" : null),
  });
  const [generatingImg,setGeneratingImg] = useState(false);
  const [generatedImg,setGeneratedImg] = useState(listing.approvedImageUrl||null);
  const [imgApproved,setImgApproved] = useState(!!listing.approvedImageUrl);
  const [uploadedRefImg,setUploadedRefImg] = useState(null);
  const src = g.sourceExtract||{};
  const setFieldState=(k,v)=>setFs(p=>({...p,[k]:v}));
  const updateSecField=(i,value)=>{const u=[...(g.secondaryFields||[])];u[i]={...u[i],value};setG(p=>({...p,secondaryFields:u}));};

  // Load existing image from KV on mount
  // Load WP taxonomy terms for Taxonomy secondary fields (Ville, Quartier)
  const [taxTermsCache, setTaxTermsCache] = useState({});
  useEffect(()=>{
    if(!listing.id) return;
    // Load image
    if(!listing.approvedImageUrl) {
      fetch("/api/youtube",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"image_load",listingId:listing.id})})
      .then(r=>r.json()).then(d=>{if(d.success&&d.imageUrl)setGeneratedImg(d.imageUrl);}).catch(()=>{});
    }
    // Load secondary field defs from KV to get wpMetaKey for each field
    fetch(`/api/kv?key=${encodeURIComponent("travito:dm_secondary_fields")}`)
      .then(r=>r.json()).then(kv=>{
        const defs = Array.isArray(kv?.config) ? kv.config : (Array.isArray(kv) ? kv : []);
        const secFields = listing.generated?.secondaryFields || [];
        secFields.forEach(sf=>{
          // Find def to get wpMetaKey
          const def = defs.find(d=>d.id===sf.taxId||d.name===sf.taxName||d.name?.toLowerCase()===sf.taxName?.toLowerCase());
          const wpKey = def?.wpMetaKey || sf.wpMetaKey || "";
          const fieldType = def?.fieldType || sf.fieldType || "Global";
          const wpMetaType = def?.wpMetaType || sf.wpMetaType || "Taxonomie";
          if(!wpKey?.startsWith("listivo_")) return;
          if(fieldType === "Media" || fieldType === "Numeric") return;
          if(wpMetaType !== "Taxonomie") return;
          if(taxTermsCache[wpKey]) return;
          // Fetch WP terms for this taxonomy
          fetch(`/api/wordpress`,{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"get_terms",taxonomySlug:wpKey})})
          .then(r=>r.json()).then(d=>{
            if(d.success&&d.terms) setTaxTermsCache(p=>({...p,[wpKey]:[...d.terms].sort((a,b)=>a.name.localeCompare(b.name,"fr"))}));
          }).catch(()=>{});
        });
      }).catch(()=>{});
  },[listing.id]);

  const generateImage = async () => {
    setGeneratingImg(true); setGeneratedImg(null);
    let prompt = g.photoDescription;

    // If user uploaded a reference photo, send it to Claude for full analysis
    // Claude will generate a new optimized prompt based on the actual photo
    if(uploadedRefImg) {
      try {
        const base64Data = uploadedRefImg.split(",")[1];
        const mediaType  = uploadedRefImg.split(";")[0].split(":")[1] || "image/jpeg";
        const listingTitle = listing.generated?.title || listing.url;
        const r = await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({max_tokens:400,
            system:"You generate precise AI image prompts for product photography based on a reference photo. Analyze the image thoroughly — subject, colors, materials, condition, style — then generate a detailed prompt for recreating a professional product photo. Output ONLY the English prompt starting with 'Professional realistic photograph of'.",
            messages:[{role:"user",content:[
              {type:"image",source:{type:"base64",media_type:mediaType,data:base64Data}},
              {type:"text",text:"Analyze this reference photo of a product listed as: '"+listingTitle+"'\n\nGenerate a detailed AI image prompt that captures:\n1. Exact subject and category\n2. Precise colors and materials as seen in the photo\n3. Condition and quality\n4. Professional studio presentation (white backdrop, soft lighting)\n5. Commercial product photography style, 4K\n\nStart with: 'Professional realistic photograph of'"}
            ]}]})});
        const d = await r.json();
        const newPrompt = (d.content||[]).map(b=>b.text||"").join("").trim();
        if(newPrompt) {
          prompt = newPrompt;
          setG(p=>({...p,photoDescription:newPrompt}));
        }
      } catch(e) { console.error("Upload photo analysis failed:", e.message); }
    }

    // If no prompt yet, generate from listing text
    if(!prompt){
      try {
        const r=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({max_tokens:400,system:"Generate a detailed AI image prompt for product photography. Output ONLY the English prompt starting with 'Professional realistic photograph of'.",messages:[{role:"user",content:"Create a realistic product photo prompt for this listing: "+(listing.generated?.title||listing.url)+"\nDescription: "+(listing.generated?.description||"")}]})});
        const d=await r.json(); prompt=(d.content||[]).map(b=>b.text||"").join("").trim();
        if(prompt)setG(p=>({...p,photoDescription:prompt}));
      } catch {}
    }
    if(!prompt){alert("Prompt manquant.");setGeneratingImg(false);return;}
    try {
      const r=await fetch("/api/youtube",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"image_generate",prompt,listingId:listing.id,width:1344,height:768})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||"Échec génération");
      setGeneratedImg(d.imageUrl);
    } catch(e){alert("Erreur: "+e.message);}
    setGeneratingImg(false);
  };

  const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
  // Use auto-detected taxId from generated.type, or listing field, or first non-cat taxonomy
  const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);
  const subTaxId = listing.subCategoryTaxId || g.type?.taxId || "";
  const subTax = primaryFields.find(t=>t.id===subTaxId) || null;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:12,width:"min(1200px,97vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",borderBottom:`1px solid ${P.border}`,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:P.gold}}>🔍 Résultat généré</div>
            <div style={{fontSize:9,color:P.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"90%"}}>{listing.url}</div>
          </div>
          <button onClick={onClose} style={{...btn(P.muted,"transparent"),padding:"4px 12px",fontSize:14,flexShrink:0}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",flex:1,overflow:"hidden",minHeight:0}}>
          {/* LEFT */}
          <div style={{padding:14,overflowY:"auto",borderRight:`1px solid ${P.border}`,background:"rgba(255,245,150,0.04)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#C8972B",marginBottom:12,padding:"6px 10px",background:"rgba(255,235,59,0.10)",borderRadius:6,border:"1px solid rgba(255,235,59,0.25)"}}>📋 Champs proposés — éditable</div>
            {/* Vendeur + Phone — top of panel, required for Approuver */}
            <ApproveField label="👤 Vendeur (compte)" value={listing.username||""} found={!!listing.username}
              fieldState={fs["vendeur"]} onStateChange={v=>setFieldState("vendeur",v)}
              onValueChange={v=>{persist(listings.map(l=>l.id===listing.id?{...l,username:v}:l));}}/>
            <ApproveField label="📞 Téléphone" value={listing.phone||""} found={!!listing.phone}
              fieldState={fs["phone"]} onStateChange={v=>setFieldState("phone",v)}
              onValueChange={v=>{persist(listings.map(l=>l.id===listing.id?{...l,phone:v}:l));}}/>
            <div style={{marginBottom:10}}><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Aperçu</div><div style={{fontSize:12,color:P.text,padding:"7px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}>{g.title||"—"}</div></div>
            <div style={{marginBottom:14}}><div style={{fontSize:10,color:P.gold,marginBottom:3,fontWeight:600}}>📝 Description (publiée sur WP — modifier ici)</div>
              <textarea value={g.description||""} onChange={e=>setG(p=>({...p,description:e.target.value}))}
                rows={4} style={{...inp,width:"100%",fontSize:11,lineHeight:1.6,resize:"vertical",fontFamily:"inherit"}}/>
            </div>
            <div style={{borderTop:"1px solid rgba(255,235,59,0.15)",marginBottom:12}}/>
            {catTax&&(<ApproveField label="Catégorie" value={g.category?.termId||""} found={!!g.category?.name} fieldState={fs["category"]} onStateChange={v=>setFieldState("category",v)} onValueChange={v=>{const t=(catTax.terms||[]).find(t=>t.id===v);setG(p=>({...p,category:t?{taxId:catTax.id,termId:v,name:t.name}:null}));}} type="select" options={catTax.terms||[]}/>)}
            {typeTaxes.length>0&&(<>
            {/* Always show Type taxonomy selector + term selector */}
            <div style={{marginBottom:8}}>
              <div style={{fontSize:9,color:P.muted,marginBottom:3}}>Sous-catégorie (Type)</div>
              <select value={g.type?.taxId||subTaxId||""} onChange={e=>{const tx=typeTaxes.find(t=>t.id===e.target.value);setG(p=>({...p,type:tx?{taxId:tx.id,termId:"",name:""}:null}));}} style={{...inp,fontSize:11,cursor:"pointer",marginBottom:6}}>
                <option value="">— Choisir sous-catégorie —</option>
                {typeTaxes.map(tx=><option key={tx.id} value={tx.id}>{tx.name}</option>)}
              </select>
              {(()=>{const activeTax=typeTaxes.find(t=>t.id===(g.type?.taxId||subTaxId));return activeTax?(<ApproveField label={`Terme — ${activeTax.name}`} value={g.type?.termId||""} found={!!g.type?.name} fieldState={fs["type"]} onStateChange={v=>setFieldState("type",v)} onValueChange={v=>{const t=(activeTax.terms||[]).find(t=>t.id===v);setG(p=>({...p,type:t?{taxId:activeTax.id,termId:v,name:t.name}:null}));}} type="select" options={activeTax.terms||[]}/>):null;})()}
            </div>
          </>)}
            {(g.secondaryFields||[]).length>0&&(<><div style={{fontSize:9,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:4}}>Champs secondaires</div>{g.secondaryFields.map((sf,i)=>{
                // Find the field definition to check wpMetaType and get terms
                const secDef = primaryFields?.concat?.(
                  // secondaryFields definitions come from DataManager dm_secondary_fields
                  // We pass them via a prop or find them in the listing's taxonomy data
                  []
                );
                // Check if this field has taxonomy terms from the listing data
                // Ville and Quartier have wpMetaType=Taxonomie and terms from DataManager
                // Dropdown only for: Global fieldType + Taxonomie wpMetaType
                // Exclude: Media (Photo), Numeric (Prix), no wpMetaKey (Description)
                const isMedia = sf.fieldType === "Media";
                const isNumeric = sf.fieldType === "Numeric";
                const sfWpKey2 = sf.wpMetaKey || "";
                const hasCachedTerms = sfWpKey2 && !!taxTermsCache[sfWpKey2];
                const isTaxonomy = !isMedia && !isNumeric
                  && (sf.wpMetaType === "Taxonomie")
                  && (sf.fieldType === "Global" || !sf.fieldType || sf.fieldType === "Taxonomie");
                // Try to find terms by wpMetaKey or by name match in cache
                const sfWpKey = sf.wpMetaKey || "";
                const taxTerms = (sfWpKey && taxTermsCache[sfWpKey])
                  || sf.terms || [];
                const fieldType = (isTaxonomy || hasCachedTerms) ? "select" : "text";
                // If value is text (e.g. "Marrakech"), find matching term ID
                const resolvedValue = (() => {
                  if(!sf.value || !isTaxonomy || taxTerms.length === 0) return sf.value;
                  // Already an ID
                  if(taxTerms.find(t=>t.id===sf.value)) return sf.value;
                  // Match by name
                  const valLow = sf.value.toLowerCase().trim();
                  const match = taxTerms.find(t=>t.name?.toLowerCase()===valLow)
                    || taxTerms.find(t=>t.name?.toLowerCase().includes(valLow))
                    || taxTerms.find(t=>valLow.includes(t.name?.toLowerCase()));
                  return match ? match.id : ""; // empty if no match (user must select)
                })();
                return (
                  <ApproveField key={i}
                    label={`${sf.taxName}${sf.relation==="M"?" ★":""}`}
                    value={resolvedValue}
                    found={sf.found!==false}
                    fieldState={fs[`sec_${i}`]}
                    onStateChange={v=>setFieldState(`sec_${i}`,v)}
                    onValueChange={v=>updateSecField(i,v)}
                    type={fieldType}
                    options={taxTerms}
                  />
                );
              })}</>)}
            {/* Photo section */}
            {g.photoDescription!==undefined&&(<>
              <div style={{fontSize:9,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:4}}>Photo & Prompt IA</div>
              {/* Manual upload — bypasses AI prompt */}
              <div style={{marginBottom:10,padding:"8px 10px",borderRadius:8,background:"rgba(59,130,246,0.08)",border:`1px solid ${P.blue}40`}}>
                <div style={{fontSize:9,color:P.blue,marginBottom:6,fontWeight:600}}>📤 Upload photo réelle (remplace génération IA)</div>
                {generatedImg&&imgApproved?(
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <img src={generatedImg} alt="uploaded" style={{width:60,height:40,objectFit:"cover",borderRadius:4,border:`1px solid ${P.green}`}}/>
                    <span style={{fontSize:9,color:P.green,flex:1}}>✓ Photo — sera envoyée à WP</span>
                    <button onClick={()=>{setGeneratedImg(null);setImgApproved(false);}} style={{fontSize:8,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:P.redS,border:`1px solid ${P.red}`,color:P.red}}>✕</button>
                  </div>
                ):(
                  <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10,padding:"5px 12px",borderRadius:6,cursor:"pointer",background:P.blueS,border:`1px solid ${P.blue}`,color:P.blue}}>
                    📁 Choisir une photo
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                      const f=e.target.files?.[0];if(!f)return;
                      const reader=new FileReader();
                      reader.onload=ev=>{setGeneratedImg(ev.target.result);setImgApproved(true);};
                      reader.readAsDataURL(f);
                    }}/>
                  </label>
                )}
              </div>
              {src.photoUrl&&(<div style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <span style={{fontSize:9,color:P.muted}}>📸 Photo source originale</span>
                  <button onClick={()=>{
                    if(window.confirm("⚠️ La photo source peut être watermarkée. Utiliser quand même?"))
                      setGeneratedImg(src.photoUrl);
                  }} style={{fontSize:8,padding:"1px 8px",borderRadius:4,cursor:"pointer",
                    background:"rgba(245,158,11,0.12)",border:`1px solid ${P.amber}`,color:P.amber}}>
                    Utiliser cette photo
                  </button>
                </div>
                <img src={src.photoUrl} alt="source" style={{maxWidth:"100%",maxHeight:100,borderRadius:6,border:`1px solid ${P.border}`,objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>
              </div>)}
              <div style={{marginBottom:8,padding:"8px 10px",borderRadius:8,background:"rgba(255,235,59,0.07)",border:"1px solid rgba(255,235,59,0.25)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:10,color:P.muted}}>🤖 Prompt image IA</span>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button title="Générer une image IA depuis le prompt" onClick={generateImage} disabled={generatingImg} style={{fontSize:8,padding:"2px 10px",borderRadius:4,cursor:"pointer",background:generatingImg?"rgba(0,0,0,0.3)":"rgba(139,92,246,0.15)",border:`1px solid ${generatingImg?P.border:P.purple}`,color:generatingImg?P.muted:P.purple}}>{generatingImg?"⏳ Génération...":"✨ Générer"}</button>
                    {generatedImg&&(<button title="Générer une image IA depuis le prompt" onClick={generateImage} disabled={generatingImg} style={{fontSize:8,padding:"2px 10px",borderRadius:4,cursor:"pointer",background:"rgba(0,0,0,0.3)",border:`1px solid ${P.border}`,color:P.muted}}>🔄</button>)}
                    <label style={{fontSize:8,padding:"2px 10px",borderRadius:4,cursor:"pointer",background:"rgba(59,130,246,0.12)",border:`1px solid ${P.blue}`,color:P.blue,whiteSpace:"nowrap"}}>
                      📤 Upload<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=ev=>{setUploadedRefImg(ev.target.result);setG(p=>({...p,photoDescription:(p.photoDescription||"")+" Inspirer du style de reference."}));};reader.readAsDataURL(f);}}/>
                    </label>
                  </div>
                </div>
                {g.visionUsed===true&&<div style={{fontSize:9,color:"#16A34A",marginBottom:3}}>👁 Image réelle vue par Claude — couleurs exactes</div>}
                {g.visionUsed===false&&<div style={{fontSize:9,color:P.amber,marginBottom:3}}>⚠️ Image non disponible — couleurs estimées du texte</div>}
                <textarea value={g.photoDescription||""} onChange={e=>setG(p=>({...p,photoDescription:e.target.value}))} rows={3} style={{...inp,resize:"vertical",fontSize:10,lineHeight:1.5}}/>
                {uploadedRefImg&&(
                  <div style={{marginTop:8,padding:"8px",background:"rgba(59,130,246,0.08)",borderRadius:6,border:`1px solid ${P.blue}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:9,color:P.blue}}>📤 Photo uploadée — sera utilisée pour affiner le prompt couleur</span>
                      <button title="Supprimer cette photo" onClick={()=>setUploadedRefImg(null)}
                        style={{fontSize:9,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:"rgba(239,68,68,0.12)",border:`1px solid ${P.red}`,color:P.red}}>✕ Supprimer</button>
                    </div>
                    <img src={uploadedRefImg} alt="ref" style={{width:"100%",maxHeight:100,borderRadius:5,objectFit:"cover",display:"block"}}/>
                    <div style={{fontSize:8,color:P.muted,marginTop:3}}>Cliquer ⚡ Générer image pour utiliser cette photo dans le prompt</div>
                  </div>
                )}
              </div>
              {generatedImg&&(<div style={{marginBottom:10,padding:10,background:P.card,borderRadius:8,border:`1px solid ${P.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:9,color:P.muted}}>🖼 Image générée (16:9)</span>
                  <div style={{display:"flex",gap:5}}>
                    <a href={generatedImg} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 8px",borderRadius:4,cursor:"pointer",background:P.blueS,border:`1px solid ${P.blue}`,color:P.blue,textDecoration:"none"}}>⬇ Télécharger</a>
                    <button onClick={()=>setImgApproved(p=>!p)} style={{fontSize:8,padding:"2px 8px",borderRadius:4,cursor:"pointer",background:imgApproved?P.greenS:"rgba(0,0,0,0.3)",border:`1px solid ${imgApproved?P.green:P.border}`,color:imgApproved?P.green:P.muted}}>{imgApproved?"✓ Approuvée":"Approuver image"}</button>
                    <button onClick={async()=>{
                      setGeneratedImg(null);setImgApproved(false);
                      // Also clear from KV so it doesn't reload on reopen
                      const upd={...g,fieldStates:fs,photoDescription:g.photoDescription,approvedImageUrl:null};
                      onSave(upd,false);
                      // Delete from youtube/KV storage
                      fetch("/api/youtube",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"image_delete",listingId:listing.id})}).catch(()=>{});
                    }} style={{fontSize:8,padding:"2px 8px",borderRadius:4,cursor:"pointer",background:P.redS,border:`1px solid ${P.red}`,color:P.red}}>🗑</button>
                  </div>
                </div>
                <div style={{position:"relative",borderRadius:6,overflow:"hidden",border:`2px solid ${imgApproved?P.green:P.border}`}}>
                  <img src={generatedImg} alt="generated" style={{width:"100%",display:"block",objectFit:"cover"}}/>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",padding:"5px 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:10,color:"rgba(255,255,255,0.9)",fontStyle:"italic",letterSpacing:"0.3px"}}>✦ Image illustrative · Contactez-moi pour plus de photos</span>
                  </div>
                </div>
                {imgApproved&&<div style={{fontSize:9,color:P.green,textAlign:"center",marginTop:4}}>✓ Image approuvée — sera sauvegardée</div>}
              </div>)}
            </>)}
          </div>
          {/* RIGHT */}
          <div style={{padding:14,overflowY:"auto",background:P.bg}}>
            <div style={{fontSize:11,fontWeight:700,color:P.gold,marginBottom:12,padding:"6px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}>🌐 Source originale</div>
            {src.engine&&(<div style={{marginBottom:10,padding:"6px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}><div style={{fontSize:9,color:P.muted}}>Moteur · {fmtDate(src.fetchedAt)}</div><div style={{fontSize:11,color:P.blue,marginTop:2}}>{src.engine}</div></div>)}
            {src.photoUrl&&(<div style={{marginBottom:10}}><div style={{fontSize:10,color:P.muted,marginBottom:4}}>📸 Photo détectée</div><img src={src.photoUrl} alt="annonce" style={{maxWidth:"100%",maxHeight:150,borderRadius:8,border:`1px solid ${P.border}`,objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/></div>)}
            <div style={{marginBottom:10}}><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Titre original</div><div style={{fontSize:12,color:P.text,padding:"6px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}>{src.rawTitle||"—"}</div></div>
            <div style={{marginBottom:10}}><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Description originale</div><div style={{fontSize:11,color:P.muted,padding:"8px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`,maxHeight:150,overflowY:"auto",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{src.rawDescription||"Non disponible"}</div></div>
            {src.rawFields&&Object.keys(src.rawFields).length>0&&(<div><div style={{fontSize:10,color:P.muted,marginBottom:6}}>Champs détectés</div>{Object.entries(src.rawFields).map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",marginBottom:3,background:P.card,borderRadius:5,border:`1px solid ${P.border}`}}><span style={{fontSize:10,color:P.muted}}>{k}</span><span style={{fontSize:10,color:P.text,fontWeight:600}}>{String(v)}</span></div>))}</div>)}
          </div>
        </div>
        <div style={{display:"flex",gap:10,padding:"10px 18px",borderTop:`1px solid ${P.border}`,flexShrink:0,justifyContent:"flex-end",background:P.surface}}>
          <button title="Régénérer tous les champs non-approuvés depuis l URL" style={btn(P.amber,P.amberS)} onClick={()=>onRegenerate({...g,fieldStates:fs,photoDescription:g.photoDescription})}>🔄 Régénérer</button>
          <button title="Sauvegarder les champs éditables" style={btn(P.blue,P.blueS)} onClick={()=>onSave({...g,fieldStates:fs,photoDescription:g.photoDescription,...(imgApproved&&generatedImg?{approvedImageUrl:generatedImg}:{})},imgApproved)}>💾 Sauvegarder</button>
          <button title="Approuver l annonce — Vendeur doit être approuvé" style={btn(P.green,P.greenS)} onClick={()=>{
              if(fs["vendeur"]!=="approved") { alert("⚠️ Veuillez approuver le champ Vendeur avant d approuver l annonce"); return; }
              onApprove({...g,fieldStates:fs,photoDescription:g.photoDescription,...(imgApproved&&generatedImg?{approvedImageUrl:generatedImg}:{})},imgApproved);
            }}>✅ Approuver annonce</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ListingForm
// ══════════════════════════════════════════════════════════════════════════════
function ListingForm({initial,primaryFields,onSave,onCancel,mode,existingListings=[]}) {
  const [f,setF]=useState({url:"",username:"",phone:"",email:"",categoryTermId:"",subCategoryTaxId:"",subCategoryTermId:"",mode:mode||"manual",...(initial||{})});
  const [errors,setErrors]=useState({});
  const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
  const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);
  const selTypeTax=typeTaxes.find(t=>t.id===f.subCategoryTaxId)||null;
  const validate=()=>{
    const e={};
    if(!f.url.trim()) e.url="obligatoire";
    // Phone: required only. Uniqueness check is informational only (don't block)
    if(!f.phone.trim()) e.phone="obligatoire";
    setErrors(e);
    if(Object.keys(e).length) return false;
    // Non-blocking uniqueness warning
    const digits = p => (p||"").replace(/[^0-9]/g,"").slice(-9);
    const cleanP = digits(f.phone);
    if(cleanP.length >= 8) {
      const dup = existingListings.find(l => l.id !== f.id && digits(l.phone||"") === cleanP);
      if(dup) {
        const ok = window.confirm("Ce telephone existe deja. Sauvegarder quand meme?");
        if(!ok) return false;
      }
    }
    return true;
  };
  return (
    <div style={{padding:16,background:P.card,borderRadius:10,border:`1px solid ${P.gold}40`,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,color:P.gold,marginBottom:14}}>{initial?"✏️ Modifier":"➕ Nouvelle annonce"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[["url","URL *","url","https://..."],["username","Vendeur (optionnel)","text","Nom vendeur auto-détecté"],["phone","Téléphone *","phone","+212..."]].map(([field,label,errKey,ph])=>(
          <div key={field}><div style={{fontSize:10,color:errors[errKey]?P.red:P.muted,marginBottom:3}}>{label}{errors[errKey]&&<span style={{marginLeft:4}}>— {errors[errKey]}</span>}</div><input value={f[field]||""} onChange={e=>setF({...f,[field]:e.target.value})} placeholder={ph} style={{...inp,borderColor:errors[errKey]?P.red:P.border}}/></div>
        ))}
      </div>
      <div style={{borderTop:`1px solid ${P.border}`,paddingTop:12,marginBottom:12}}>
        <div style={{fontSize:10,color:P.muted,marginBottom:8}}>Taxonomies (optionnel)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Catégorie{catTax?` — ${catTax.name}`:""}</div><select value={f.categoryTermId||""} onChange={e=>setF({...f,categoryTermId:e.target.value})} style={{...inp,cursor:"pointer"}}><option value="">— Sélectionner —</option>{(catTax?.terms||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Sous-catégorie (Type)</div><select value={f.subCategoryTaxId||""} onChange={e=>setF({...f,subCategoryTaxId:e.target.value,subCategoryTermId:""})} style={{...inp,cursor:"pointer"}}><option value="">— Sélectionner —</option>{typeTaxes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><div style={{fontSize:10,color:P.muted,marginBottom:3}}>{selTypeTax?`Terme — ${selTypeTax.name}`:"Terme"}</div><select value={f.subCategoryTermId||""} onChange={e=>setF({...f,subCategoryTermId:e.target.value})} disabled={!selTypeTax} style={{...inp,cursor:selTypeTax?"pointer":"not-allowed",opacity:selTypeTax?1:0.5}}><option value="">— Sélectionner —</option>{(selTypeTax?.terms||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </div>
      </div>
      <div style={{display:"flex",gap:8}}><button style={btn(P.green,P.greenS)} onClick={()=>{if(validate())onSave({...f,mode:mode||"manual"});}}>✓ Sauvegarder</button><button style={btn(P.muted,"transparent")} onClick={onCancel}>✕ Fermer</button></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MultiSelectDropdown
// ══════════════════════════════════════════════════════════════════════════════
function MultiSelectDropdown({label,options,selected,onChange}) {
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const toggle=(id)=>onChange(selected.includes(id)?selected.filter(s=>s!==id):[...selected,id]);
  return (
    <div ref={ref} style={{position:"relative",minWidth:120}}>
      <button onClick={()=>setOpen(p=>!p)} style={{...btn(selected.length?P.blue:P.muted,selected.length?P.blueS:"transparent"),padding:"5px 10px",fontSize:10,width:"100%",textAlign:"left",display:"flex",justifyContent:"space-between"}}>
        <span>{selected.length?`${label} (${selected.length})`:label}</span>
        <span>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,minWidth:200,background:P.card,border:`1px solid ${P.border}`,borderRadius:8,zIndex:50,maxHeight:200,overflowY:"auto",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
          {options.map(o=>(
            <label key={o.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"pointer",borderBottom:`1px solid ${P.border}20`}}>
              <input type="checkbox" checked={selected.includes(o.id)} onChange={()=>toggle(o.id)} style={{accentColor:P.blue}}/>
              <span style={{fontSize:11,color:P.text}}>{o.name}</span>
            </label>
          ))}
          {options.length===0&&<div style={{padding:"10px 12px",fontSize:11,color:P.muted}}>Aucune option</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN — ProductManager
// ══════════════════════════════════════════════════════════════════════════════
export default function ProductManagerManuel() {
  const [listings,setListings]=useState([]);
  const [primaryFields,setPrimaryFields]=useState([]);
  const [secondaryFields,setSecondaryFields]=useState([]);
  const [mapping,setMapping]=useState({});
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editListing,setEditListing]=useState(null);
  const [viewListing,setViewListing]=useState(null);
  const [generating,setGenerating]=useState(null);
  const [saved,setSaved]=useState(false);

  // Filters
  const [filterStatus,setFilterStatus]=useState("all");
  const [filterWeek,  setFilterWeek]  =useState("all");
  const [filterCats,  setFilterCats]  =useState([]);
  const [filterTypes, setFilterTypes] =useState([]);


  useEffect(()=>{
    Promise.all([kvGet("travito:pm_listings"),kvGet("travito:dm_primary_fields"),kvGet("travito:dm_secondary_fields"),kvGet("travito:dm_mapping")])
    .then(([l,p,s,m])=>{
      console.log("[PM] KV load — listings:", Array.isArray(l)?l.length:"NOT ARRAY", typeof l);
      setListings(Array.isArray(l)?l:[]);
      setPrimaryFields(Array.isArray(p)?p:[]);
      setSecondaryFields(Array.isArray(s)?s:[]);
      setMapping(m&&typeof m==="object"?m:{});
      setLoading(false);
    });
  },[]);

  const persist=useCallback(async (next)=>{
    setListings(next); // update UI immediately
    const r = await kvSet("travito:pm_listings", next);
    if(r?.success===true||r?.success===undefined) {
      setSaved(true); setTimeout(()=>setSaved(false),1800);
    } else {
      console.error("persist failed, retrying...", r);
      // Retry once after 500ms
      await new Promise(res=>setTimeout(res,500));
      await kvSet("travito:pm_listings", next);
      setSaved(true); setTimeout(()=>setSaved(false),1800);
    }
  },[]);

  const saveListing=async(form)=>{
    if(editListing){
      await persist(listings.map(l=>l.id===editListing.id?{...l,...form}:l));
      setEditListing(null);setShowForm(false);
    } else {
      const dup=listings.find(l=>l.url.trim()===form.url.trim());
      if(dup){alert(`URL deja existante`);return;}
      await persist([{...form,
        email:form.email||generateEmail(form.username),
        id:uid(),status:"initial",createdAt:new Date().toISOString(),
        isoWeek:(()=>{const d=new Date();const t=new Date(d);t.setHours(0,0,0,0);t.setDate(t.getDate()+(4-(t.getDay()||7)));return Math.ceil(((t-new Date(t.getFullYear(),0,1))/86400000+1)/7);})(),
        mode:form.mode||"manual",generated:null
      },...listings]);
      setShowForm(false);
    }
  };

  const deleteListing=async(id)=>{
    if(window.confirm("Supprimer cette annonce?")){
      await persist(listings.filter(l=>l.id!==id));
      fetch("/api/youtube",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"image_delete",listingId:id})}).catch(()=>{});
    }
  };


  const approve=async(listingId,updatedGen,imgOk)=>{
    const upd=listings.map(l=>l.id===listingId?{
      ...l,status:"approved",approvedAt:new Date().toISOString(),generated:updatedGen||l.generated,
      hasImage:imgOk?true:l.hasImage,
      ...(imgOk&&updatedGen?.approvedImageUrl?{approvedImageUrl:updatedGen.approvedImageUrl}:{})
    }:l);
    await persist(upd);setListings(upd);setViewListing(null);
    // Auto-sync Comptes on approve
    const approved=upd.find(l=>l.id===listingId);
    if(approved) syncCompteFromListing(approved);
  };

  const syncCompteFromListing = async (listing) => {
    if(!listing.username || !listing.phone) return;
    try {
      const kv = await fetch(`/api/kv?key=${encodeURIComponent("travito:pm_comptes")}`).then(r=>r.json());
      const comptes = Array.isArray(kv?.config) ? kv.config : [];
      const existing = comptes.find(c=>c.username===listing.username);
      if(!existing) {
        // New compte — add it
        const newCompte = {
          id:`pm_${Date.now().toString(36)}`,
          username:listing.username, phone:listing.phone,
          email:listing.email||"", isoWeek:(()=>{const d=new Date();const t=new Date(d);t.setHours(0,0,0,0);t.setDate(t.getDate()+(4-(t.getDay()||7)));return Math.ceil(((t-new Date(t.getFullYear(),0,1))/86400000+1)/7);})(),
          createdAt:new Date().toISOString(), locked:false
        };
        const updated = [...comptes, newCompte];
        await kvSet("travito:pm_comptes", updated);
        console.log("Auto-synced new compte:", listing.username);
      } else if(existing.phone !== listing.phone) {
        // Update phone
        const updated = comptes.map(c=>c.id===existing.id?{...c,phone:listing.phone}:c);
        await kvSet("travito:pm_comptes", updated);
        console.log("Auto-updated compte phone:", listing.username);
      }
    } catch(e) { console.log("Auto-sync compte failed:", e.message); }
  };

  const saveFromPopup=async(listingId,updatedGen,imgOk)=>{
    const upd=listings.map(l=>l.id===listingId?{
      ...l,status:"saved",savedAt:new Date().toISOString(),generated:updatedGen,
      hasImage:imgOk?true:l.hasImage,
      ...(imgOk&&updatedGen?.approvedImageUrl?{approvedImageUrl:updatedGen.approvedImageUrl}:{})
    }:l);
    await persist(upd);setListings(upd);
    const saved=upd.find(l=>l.id===listingId);
    setViewListing(saved);
    // Auto-sync Comptes
    if(saved) syncCompteFromListing(saved);
  };


  // ── Publish to WordPress ──────────────────────────────────────────────────
  const publishListing = async (listing) => {
    // Get fresh listing from state (in case popup saved updates)
    const freshListing = listings.find(l=>l.id===listing.id) || listing;
    const gen = freshListing.generated || listing.generated || {};
    listing = freshListing; // use fresh data for all fields
    // primaryFields is available from component state
    const comptes = await fetch(`/api/kv?key=${encodeURIComponent("travito:pm_comptes")}`)
      .then(r=>r.json()).then(d=>Array.isArray(d.config)?d.config:[]).catch(()=>[]);
    const compte = comptes.find(c=>c.username===listing.username);

    // meta built server-side from secondaryFields + definitions

    // Use approved image saved directly on listing (set when approved in popup)
    const aiImageUrl = listing.approvedImageUrl || null;

    const body = {
      action:            listing.wpPostId ? "update_listing" : "publish_listing",
      postId:            listing.wpPostId || null,
      title:             gen.title || listing.url,
      content:           gen.description || "",
      authorId:          compte?.wpUserId || null,
      categoryTermId:    listing.categoryTermId    || gen.category?.termId || "",
      categoryTermName:  gen.category?.name || (() => {
        const catTx = primaryFields?.find(t=>t.name?.toLowerCase().includes("categ")||t.slug?.toLowerCase().includes("categ"));
        const termId = listing.categoryTermId || gen.category?.termId;
        const term = catTx?.terms?.find(t=>t.id===termId);
        return term?.name || gen.category?.name || "";
      })(),
      subCategoryTaxId:  listing.subCategoryTaxId  || gen.type?.taxId    || "",
      subCategoryTaxSlug: (()=>{ const tx = primaryFields?.find(t=>t.id===(listing.subCategoryTaxId||gen.type?.taxId)); return tx?.wpMetaKey||""; })(),
      subCategoryTermId: listing.subCategoryTermId  || gen.type?.termId   || "",
      subCategoryTermName: gen.type?.name || (() => {
        const subTaxId = listing.subCategoryTaxId || gen.type?.taxId;
        const subTx = primaryFields?.find(t=>t.id===subTaxId);
        const termId = listing.subCategoryTermId || gen.type?.termId;
        const term = subTx?.terms?.find(t=>t.id===termId);
        return term?.name || gen.type?.name || "";
      })(),
      primaryTaxSlug:    (()=>{ const tx = primaryFields?.find(t=>t.name?.toLowerCase().includes("categ")||t.slug?.toLowerCase().includes("categ")); return tx?.wpMetaKey||"listivo_23016"; })(),
      phone:             listing.phone || compte?.phone || "",
      email:             listing.email || generateEmail(listing.username),
      // Only use AI-generated approved image — never source photo (watermark risk)
      imageUrl:          aiImageUrl || null,
      secondaryFields:   (gen.secondaryFields || []).map((sf,i)=>({
        ...sf,
        fieldState: gen.fieldStates?.[`sec_${i}`] || null,
      })),
      fieldStates:       gen.fieldStates || {},

    };

    try {
      const r = await fetch("/api/wordpress", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if(d.success){
        const upd = listings.map(l=>l.id===listing.id?{...l,wpPostId:d.postId,wpPostedAt:new Date().toISOString()}:l);
        await persist(upd);
        // Build detailed confirmation
        const f = d.fields || {};
        const icon = v => v.sent ? "✅" : "❌";
        const confirmMsg = [
          `${listing.wpPostId?"🔄 Mis à jour":"📢 Publié"} — Post ID: ${d.postId}`,
          ``,
          `${icon(f.title||{})}  Titre:       ${f.title?.value||"—"}`,
          `${icon(f.description||{})}  Description: ${f.description?.value||"—"}`,
          `${icon(f.category||{})}  Catégorie:   ${f.category?.value||"—"}`,
          `${icon(f.type||{})}  Type:        ${f.type?.value||"—"}`,
          `${icon(f.ville||{})}  Ville:       ${f.ville?.value||"—"}`,
          `${icon(f.quartier||{})}  Quartier:    ${f.quartier?.value||"—"}`,
          `${icon(f.prix||{})}  Prix:        ${f.prix?.value||"—"}`,
          `${icon(f.adresse||{})}  Adresse:     ${f.adresse?.value||"—"}`,
          `${icon(f.phone||{})}  Téléphone:   ${f.phone?.value||"—"}`,
          `${icon(f.image||{})}  Photo:       ${f.image?.sent?"ID "+f.image?.value:"❌ non uploadée"}`,
        ].join("\n");
        alert(confirmMsg);
      } else {
        alert("❌ Échec: "+(d.error||d.message||JSON.stringify(d).slice(0,200)));
      }
    } catch(e) { alert("❌ "+e.message); }
  };

  // ── Generate ───────────────────────────────────────────────────────────────
  const generate=async(listing)=>{
    setGenerating(listing.id);setViewListing(null);
    try {
      let rawTitle="",rawDescription="",rawFields={},photoUrl="",engine="Claude";

      // Step 1: Fetch page
      try {
        const fr=await fetch(`/api/kv?action=fetch_url&url=${encodeURIComponent(listing.url)}`);
        const fd=await fr.json();
        const pageHtml=fd.html||"";
        const prompt=pageHtml
          ?"Voici le contenu complet de cette annonce (peut contenir du texte en arabe, français ou anglais):\n\n"+pageHtml+"\n\n"+
           "INSTRUCTIONS: Lis ATTENTIVEMENT tout le texte ci-dessus. "+
           "Cherche la section Description/وصف et extrais TOUS les détails mentionnés: "+
           "état, caractéristiques techniques, compteurs, accessoires, prix, négociabilité, etc. "+
           "Ne résume pas — garde tous les faits de la description originale."
          :"Annonce URL: "+listing.url+"\nAnalyse l'URL et déduis les informations disponibles.";
        const r1=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({max_tokens:2000,
            system:`Tu es un expert extraction d'annonces marocaines. L'annonce peut être en FR, AR ou EN — traite toutes les langues.

PRIORITÉ BREADCRUMB: Si tu vois une liste de navigation (Accueil > Région > Ville > Quartier > Catégorie), EXTRAIS-EN:
- ville = 3ème niveau (ex: Agadir, Casablanca)
- quartier = 4ème niveau (ex: Ben Serguaou, Hay Mohammadi)
- catégorie = avant-dernier niveau

PRIX: Cherche des patterns comme "2 499 DH", "١٥٠٠ درهم", "1500 MAD", "prix: X" — extrait le nombre seul sans espaces ni devise.

Extrais TOUT: titre (traduit en FR si arabe), description complète (traduis si arabe), prix (nombre seul), surface, ville, quartier, photo URL, vendeur.
JSON uniquement, pas de markdown.`,
            messages:[{role:"user",content:prompt+'\n\nJSON:\n{"title":"titre en français","description":"description en français","description_ar":"original arabe si dispo sinon null","price":"nombre seul ou null","surface":"","ville":"ville détectée","quartier":"quartier détecté","vendeur":"","photo_url":"url ou null","extra_fields":{},"engine":""}'}]})});
        const r1d=await r1.json();
        const raw1=(r1d.content||[]).map(b=>b.text||"").join("").trim();
        const s1=raw1.indexOf("{"),e1=raw1.lastIndexOf("}");
        if(s1>-1){const p1=JSON.parse(raw1.substring(s1,e1+1));rawTitle=p1.title||"";
          const descFr=p1.description||"";
          const descAr=p1.description_ar&&p1.description_ar!=="null"?p1.description_ar:"";
          rawDescription=descFr+(descAr?"\n\n---\n"+descAr:"");
          photoUrl=p1.photo_url||"";engine=p1.engine||"Claude";const af=p1.extra_fields||{};if(p1.price&&p1.price!=="null"&&p1.price!=="négociable"){
            const pc=String(p1.price).replace(/\s/g,"").replace(/[^\d.,]/g,"").replace(",",".");
            if(pc&&pc.length>=2)af["prix"]=pc;
          }
          // Also check extra_fields for a numeric prix key (not prix_negotiable)
          if(p1.extra_fields?.prix&&!af["prix"]){
            const pc2=String(p1.extra_fields.prix).replace(/\s/g,"").replace(/[^\d.,]/g,"").replace(",",".");
            if(pc2&&pc2.length>=2)af["prix"]=pc2;
          }if(p1.surface&&p1.surface!=="null")af["surface"]=p1.surface;if(p1.ville&&p1.ville!=="null")af["ville"]=p1.ville;if(p1.quartier&&p1.quartier!=="null")af["quartier"]=p1.quartier;
          // Auto-fill vendeur if detected, not set, and not already approved
          const vendeurApproved = listing.generated?.fieldStates?.vendeur === "approved";
          if(p1.vendeur&&p1.vendeur!=="null"&&!listing.username&&!vendeurApproved) {
            await persist(listings.map(l=>l.id===listing.id?{...l,username:p1.vendeur}:l));
          }
          rawFields=af;}
      } catch(e){console.error("Step1:",e.message);}

      // Step 1b: Auto-detect Category + Type taxonomy + Term
      // Always runs — fills any missing level from the 3-level hierarchy
      let detectedCatTermId=listing.categoryTermId||"";
      let detectedSubTaxId=listing.subCategoryTaxId||"";
      let detectedSubTermId=listing.subCategoryTermId||"";
      if(primaryFields.length>0){
        try {
          const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
          const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);

          // Build clear 3-level hierarchy for Claude
          const categoriesList=(catTax?.terms||[]).map(t=>`${t.name} (categoryTermId:"${t.id}")`).join(", ");
          const typesList=typeTaxes.map(tx=>`${tx.name} (subCategoryTaxId:"${tx.id}") → termes: ${(tx.terms||[]).map(t=>`${t.name} (subCategoryTermId:"${t.id}")`).join(", ")}`).join("\n");

          const r1b=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({max_tokens:400,
              system:"Tu identifies la catégorie, sous-catégorie et terme le plus proche pour une annonce marocaine. RÈGLES: 1) Choisis TOUJOURS le meilleur match même si pas exactement identique 2) Pour le terme: choisis le plus proche sémantiquement 3) Si un breadcrumb de navigation est présent (ex: Sport > Équipement Sportif), utilise-le en PRIORITÉ pour détecter catégorie et type 4) Réponds UNIQUEMENT en JSON valide sans markdown.",
              messages:[{role:"user",content:`URL: ${listing.url}\\nAnnonce: "${rawTitle}"\nDescription: "${rawDescription.slice(0,400)}"\n\nNIVEAU 1 — Catégories disponibles:\n${categoriesList}\n\nNIVEAU 2+3 — Types et leurs termes:\n${typesList}\n\nIdentifie le meilleur match pour cette annonce.\nJSON: {"categoryTermId":"id exact","subCategoryTaxId":"id exact","subCategoryTermId":"id exact"}`}]})});
          const r1bd=await r1b.json();
          const raw1b=(r1bd.content||[]).map(b=>b.text||"").join("").trim();
          const s1b=raw1b.indexOf("{"),e1b=raw1b.lastIndexOf("}");
          if(s1b>-1){
            const p1b=JSON.parse(raw1b.substring(s1b,e1b+1));
            // Fill only missing levels — don't override user input
            if(!detectedCatTermId&&p1b.categoryTermId)detectedCatTermId=p1b.categoryTermId;
            if(!detectedSubTermId&&p1b.subCategoryTermId){
              detectedSubTermId=p1b.subCategoryTermId;
              // subCategoryTaxId: use Claude result, or find parent of detected term
              detectedSubTaxId=p1b.subCategoryTaxId||
                typeTaxes.find(tx=>(tx.terms||[]).some(t=>t.id===p1b.subCategoryTermId))?.id||"";
            } else if(!detectedSubTaxId&&p1b.subCategoryTaxId){
              detectedSubTaxId=p1b.subCategoryTaxId;
            }
          }
        } catch(e){console.error("Step1b:",e.message);}
      }

      // Step 2: Rewrite
      let rewrittenTitle=rawTitle,rewrittenDesc=rawDescription;
      try {
        const fieldsStr=Object.entries(rawFields).map(([k,v])=>`${k}: ${v}`).join(", ");
        const r2=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({max_tokens:1200,
            system:"Tu réécris des annonces pour Travito Maroc. RÈGLES STRICTES: 1.N'invente ABSOLUMENT RIEN 2.Garde TOUS les faits de la description originale (état, compteurs, accessoires, prix négociable, caractéristiques techniques, etc.) 3.Si un détail est dans la description originale, il DOIT apparaître dans ta réécriture 4.SUPPRIME uniquement: Avito, Mubawab, OLX, numéros de réf #xxxxx, noms de plateformes 5.Style professionnel en français 6.JSON uniquement.",
            messages:[{role:"user",content:`Titre original: ${rawTitle||listing.url}\nDescription originale: "${rawDescription||""}"\nDonnées extraites: ${fieldsStr}\n\nRéécris en gardant TOUS les détails de la description originale.\nJSON: {"title":"titre professionnel","description":"description complète avec TOUS les faits originaux"}`}]})});
        const r2d=await r2.json();const raw2=(r2d.content||[]).map(b=>b.text||"").join("");const s2=raw2.indexOf("{"),e2=raw2.lastIndexOf("}");
        if(s2>-1){
          const p2=JSON.parse(raw2.substring(s2,e2+1));
          rewrittenTitle=p2.title||rawTitle;
          rewrittenDesc=p2.description||rawDescription;
          // Re-append Arabic original if it was in rawDescription
          const arSep = rawDescription.indexOf("\n\n---\n");
          if(arSep>-1) {
            const arPart = rawDescription.slice(arSep+5); // after separator
            if(arPart.trim() && !rewrittenDesc.includes(arPart.trim().slice(0,20))) {
              rewrittenDesc = rewrittenDesc + "\n\n---\n" + arPart.trim();
            }
          }
        }
      } catch(e){console.error("Step2:",e.message);}

      // Step 2b: Paraphrase Arabic portion if present (avoid 100% match to source)
      try {
        const arSep2 = rewrittenDesc.indexOf("\n\n---\n");
        if(arSep2 > -1) {
          const frPart = rewrittenDesc.slice(0, arSep2);
          const arOrig = rewrittenDesc.slice(arSep2 + 5);
          if(arOrig.trim()) {
            const r2b = await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({max_tokens:400,
                system:"You are an Arabic text rewriter. Rewrite the Arabic ad text in a different style while keeping all facts. Do not remove any detail. Reply with only the rewritten Arabic text, no comments.",
                messages:[{role:"user",content:"Rewrite this Arabic ad in a different style, keeping all details:\n\n"+arOrig.trim()}]})});
            const r2bd = await r2b.json();
            const arRewritten = (r2bd.content||[]).map(b=>b.text||"").join("").trim();
            if(arRewritten) rewrittenDesc = frPart + "\n\n---\n" + arRewritten;
          }
        }
      } catch(e){console.error("Step2b:",e.message);}

      // Step 3: Image prompt
      let photoDescription="";
      let visionUsed=false;
      try {
        const allInfo=[rawTitle,rawDescription,...Object.entries(rawFields).map(([k,v])=>`${k}: ${v}`)].filter(Boolean).join(" | ");
        // Extract colors from raw fields + description for accurate color detection
        const colorHints = Object.entries(rawFields)
          .filter(([k])=>k.toLowerCase().includes("couleur")||k.toLowerCase().includes("color")||k.toLowerCase().includes("teinte"))
          .map(([k,v])=>`${k}: ${v}`).join(", ");
        
        const photoUserMsg="Generate a highly detailed AI image prompt for this product listing.\n\n"+
          "LISTING DATA:\n"+allInfo+
          (colorHints?"\n\nCOLOR INFO FROM LISTING: "+colorHints:"")+
          "\n\nCRITICAL COLOR RULE: Extract the EXACT color of the subject from the listing title and description above."+
          " If the title/description mentions 'bleu', 'blue' → use blue. 'rouge', 'red' → use red."+
          " 'noir', 'black' → use black. 'blanc', 'white' → use white. 'marron', 'brun' → use brown."+
          " DO NOT invent colors. Use ONLY what is stated in the listing data.\n\n"+
          "The prompt MUST explicitly include:\n"+
          "1. EXACT subject: species/breed/model/property type\n"+
          "2. DOMINANT COLOR: extracted DIRECTLY from listing title/description (mandatory, no guessing)\n"+
          "3. Secondary colors if mentioned in listing\n"+
          "4. Physical details: size, condition, material/texture\n"+
          "5. Presentation: single item, clean studio, white backdrop\n"+
          "6. Lighting: professional studio photography, soft diffused light\n"+
          "7. Photo style: commercial product photography, sharp focus, 4K\n\n"+
          "Output ONLY the English prompt, starting with 'Professional realistic photograph of'";
        // Try to fetch image as base64 for Claude vision analysis
        let imageBase64 = null;
        let imageMediaType = "image/jpeg";
        if(photoUrl) {
          try {
            console.log("Step3: fetching image for vision:", photoUrl);
            const imgFetch = await fetch(photoUrl, {
              headers: { "User-Agent": "Mozilla/5.0", "Referer": new URL(listing.url||photoUrl).origin }
            });
            console.log("Step3: image fetch status:", imgFetch.status, imgFetch.headers.get("content-type"));
            if(imgFetch.ok) {
              const imgBuf = await imgFetch.arrayBuffer();
              const uint8 = new Uint8Array(imgBuf);
              let binary = "";
              for(let i=0;i<uint8.length;i++) binary += String.fromCharCode(uint8[i]);
              imageBase64 = btoa(binary);
              imageMediaType = imgFetch.headers.get("content-type")?.split(";")[0] || "image/jpeg";
            }
          } catch(e) { console.log("Step3: image fetch for vision FAILED:", e.message); imageBase64 = null; }
        }
        const r3=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({max_tokens:600,
            system:"You generate precise AI image prompts for product/listing photography. When given an image, analyze it carefully and describe EXACT colors, materials, and details you see. Color accuracy is CRITICAL. Output only the prompt text, nothing else. Start your response with [VISION] if you received an image, or [TEXT] if text-only.",
            messages:[{role:"user",content:imageBase64?[
              {type:"image",source:{type:"base64",media_type:imageMediaType,data:imageBase64}},
              {type:"text",text:"Analyze this image carefully. Identify the EXACT color(s) of the main subject. Then generate a detailed AI image prompt.\n\nLISTING CONTEXT:\n"+allInfo+"\n\nThe prompt MUST include:\n1. EXACT subject as visible in the image\n2. PRECISE COLOR(S) exactly as you see them in this image (critical - no guessing)\n3. Material/texture details from the image\n4. Condition and quality visible\n5. Professional studio white backdrop\n6. Commercial photography style, 4K"}
            ]:imageUrlSource?[
              {type:"image",source:{type:"url",url:imageUrlSource}},
              {type:"text",text:"Analyze this image. Identify EXACT color(s) of the main subject. Generate a detailed AI image prompt.\n\nLISTING CONTEXT:\n"+allInfo+"\n\nInclude: 1. Exact subject 2. Precise colors as seen 3. Material/texture 4. Condition 5. Studio white backdrop 6. Commercial photography 4K"}
            ]:[{type:"text",text:photoUserMsg}]}]})}); 
        const r3d=await r3.json();
        const rawPhotoDesc = (r3d.content||[]).map(b=>b.text||"").join("").trim();
          // Extract vision mode indicator and clean prompt
          visionUsed = rawPhotoDesc.startsWith("[VISION]");
          photoDescription = rawPhotoDesc.replace(/^\[(VISION|TEXT)\]\s*/,"");
          if(visionUsed) console.log("Step3: ✅ Claude VISION used — colors from actual image");
          else console.log("Step3: ⚠️ Claude TEXT only — image not available, colors from text");
      } catch(e){console.error("Step3:",e.message);}

      // Step 4: Secondary fields
      const subTermId=detectedSubTermId||listing.subCategoryTermId;
      const mappedSecondary=[];
      // Existing approved fields — do not overwrite on re-generate
      const existingFieldStates = listing.generated?.fieldStates || {};
      const existingSecFields   = listing.generated?.secondaryFields || [];
      if(subTermId&&Object.keys(mapping).length>0){
        for(const sec of secondaryFields){
          const relation=mapping[`${subTermId}|${sec.id}`];
          if(relation!=="M"&&relation!=="O")continue;
          // Find existing field by name — if approved, keep its value
          const existingIdx = existingSecFields.findIndex(sf=>sf.taxName===sec.name||sf.taxId===sec.id);
          const existingState = existingIdx>-1 ? existingFieldStates[`sec_${existingIdx}`] : null;
          if(existingState==="approved" && existingIdx>-1) {
            // Keep approved field as-is
            mappedSecondary.push({...existingSecFields[existingIdx]});
            continue;
          }
          let value="",found=false;
          try {
            const secNameLow=sec.name.toLowerCase();
            const isDescField=secNameLow.includes("descri")||secNameLow.includes("détail")||secNameLow.includes("detail");
            const isAddressField=secNameLow.includes("adress")||secNameLow.includes("adresse")||secNameLow.includes("address");
            if(isDescField&&rewrittenDesc){
              let cleanDesc=rewrittenDesc.replace(/\b(avito|mubawab|olx|marocannonces|sarouty|remax|century21)\b\.?\s*(ma|maroc)?/gi,"Travito").replace(/réf\.?\s*#?\d+/gi,"").replace(/annonce\s+publiée\s+par\s+[^,.]+/gi,"").replace(/\s{2,}/g," ").trim();
              value=cleanDesc;found=true;
            } else {
              const rk=Object.keys(rawFields).find(k=>k.toLowerCase()===secNameLow||secNameLow.includes(k.toLowerCase())||k.toLowerCase().includes(secNameLow.split(" ")[0]));
              if(rk&&rawFields[rk]!==undefined&&String(rawFields[rk]).trim()!==""){
                value=String(rawFields[rk]);found=true;
              } else {
                const r4=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({max_tokens:80,system:"Extrais valeur de champ depuis annonce. Valeur brute UNIQUEMENT. Prix: nombre seul. Si introuvable: NOTFOUND. JAMAIS: N/A, non mentionné, non disponible.",
                    messages:[{role:"user",content:`Annonce: "${rawTitle}"\nDescription: "${rawDescription}"\nDonnées: ${JSON.stringify(rawFields)}\nChamp: "${sec.name}"${sec.fieldType==="Numeric"?` (défaut: ${sec.conditionValue||0})`:""}\nValeur exacte:`}]})});
                const r4d=await r4.json();const v=(r4d.content||[]).map(b=>b.text||"").join("").trim();
                const bad=["NOTFOUND","N/A","null","undefined","non mentionné","non disponible","introuvable","aucun","pas de","absent"];
                const villeVal=rawFields["ville"]||"";const quartierVal=rawFields["quartier"]||"";
                const isJustVilleQuartier=isAddressField&&v&&(v.trim()===villeVal.trim()||v.trim()===quartierVal.trim()||v.trim()===`${quartierVal}, ${villeVal}`.trim()||v.trim()===`${villeVal}, ${quartierVal}`.trim());
                const isBad=!v||bad.some(b=>v.toLowerCase().includes(b.toLowerCase()))||isJustVilleQuartier;
                if(!isBad){value=v;found=true;}
                else if(sec.fieldType==="Numeric"&&sec.conditionValue!==undefined&&String(sec.conditionValue).trim()!==""){value=String(sec.conditionValue);found=false;}
                else{value="";found=false;}
              }
            }
          } catch(e){value="";found=false;}
          mappedSecondary.push({taxId:sec.id,taxName:sec.name,fieldType:sec.fieldType||"Global",condition:sec.conditionValue||(sec.conditionMedia||[]).join(","),relation,value,found,
            wpMetaKey:sec.wpMetaKey||"",wpMetaType:sec.wpMetaType||"Taxonomie"});
        }
      }

      // Post-process: if Ville or Quartier not matched, append raw value to Adresse
      const villeField    = mappedSecondary.find(sf=>sf.taxName==="Ville");
      const quartierField = mappedSecondary.find(sf=>sf.taxName==="Quartier");
      let   adresseField  = mappedSecondary.find(sf=>sf.taxName==="Adresse");
      const villeRaw    = rawFields["ville"]    || rawFields["Ville"]    || rawFields["city"]    || "";
      const quartierRaw = rawFields["quartier"] || rawFields["Quartier"] || rawFields["district"] || rawFields["neighbourhood"] || "";
      // Ensure Adresse field exists even if not mapped
      if(!adresseField) {
        const adresseDef = secondaryFields.find(sf=>sf.name==="Adresse");
        if(adresseDef) {
          adresseField = {taxId:adresseDef.id,taxName:"Adresse",fieldType:"Text",condition:"",relation:"O",value:"",found:false,wpMetaKey:adresseDef.wpMetaKey||"",wpMetaType:"Text"};
          mappedSecondary.push(adresseField);
        }
      }
      if(adresseField) {
        const parts = [];
        // Add ville raw if taxonomy value is empty
        if(villeRaw && (!villeField?.value || villeField.value==="")) parts.push(villeRaw);
        // Add quartier raw if taxonomy value is empty
        if(quartierRaw && (!quartierField?.value || quartierField.value==="")) parts.push(quartierRaw);
        if(parts.length > 0) {
          const suffix = [...new Set(parts)].join(", ");
          adresseField.value = adresseField.value ? adresseField.value+", "+suffix : suffix;
          adresseField.found = true;
        }
      }

      // Step 5: Resolve labels — use listing user-input as priority fallback
      const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
      // Priority: auto-detected → user-selected from form → empty
      const finalCatTermId   = detectedCatTermId   || listing.categoryTermId    || "";
      const finalSubTaxId    = detectedSubTaxId    || listing.subCategoryTaxId  || "";
      const finalSubTermId   = detectedSubTermId   || listing.subCategoryTermId || "";
      const catTerm  = (catTax?.terms||[]).find(t=>t.id===finalCatTermId);
      const subTax   = primaryFields.find(t=>t.id===finalSubTaxId);
      const subTerm  = (subTax?.terms||[]).find(t=>t.id===finalSubTermId);

      const generated={title:rewrittenTitle,description:rewrittenDesc,
        category:catTerm?{taxId:catTax.id,termId:catTerm.id,name:catTerm.name}:(finalCatTermId?{taxId:catTax?.id||"",termId:finalCatTermId,name:""}:null),
        type:subTerm?{taxId:subTax.id,termId:subTerm.id,name:subTerm.name}:(finalSubTermId?{taxId:finalSubTaxId,termId:finalSubTermId,name:""}:null),
        secondaryFields:mappedSecondary,photoDescription,photoDescriptionOriginal:photoDescription,visionUsed,fieldStates:{},
        sourceExtract:{rawTitle,rawDescription,rawFields,photoUrl,engine,fetchedAt:new Date().toISOString()}};

      // Update listing with detected taxonomy if auto-detected
      const updatedListing={...listing,status:"generated",generatedAt:new Date().toISOString(),generated,
        // Always update with best detected value (auto-detect wins over empty form field)
        ...(finalCatTermId ?{categoryTermId:finalCatTermId}:{}),
        ...(finalSubTaxId  ?{subCategoryTaxId:finalSubTaxId}:{}),
        ...(finalSubTermId ?{subCategoryTermId:finalSubTermId}:{}),
      };
      const upd=listings.map(l=>l.id===listing.id?updatedListing:l);
      await persist(upd);setListings(upd);setViewListing(upd.find(l=>l.id===listing.id));
    } catch(err){alert("Erreur: "+err.message);}
    setGenerating(null);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
  const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);

  // Filter listings (manual only — exclude auto)
  const isoWeeks=getISOWeeksList(10);
  const filtered=listings.filter(l=>l.mode!=="auto").filter(l=>{
    if(filterStatus!=="all"&&l.status!==filterStatus)return false;
    if(filterWeek!=="all"&&l.isoWeek!==filterWeek)return false;
    if(filterCats.length>0&&!filterCats.includes(l.categoryTermId))return false;
    if(filterTypes.length>0&&!filterTypes.includes(l.subCategoryTermId))return false;
    return true;
  });

  const resetFilters=()=>{setFilterStatus("all");setFilterWeek("all");setFilterCats([]);setFilterTypes([]);};
  const hasFilters=filterStatus!=="all"||filterWeek!=="all"||filterCats.length>0||filterTypes.length>0;

  const statusDate=(l)=>{if(l.status==="approved"&&l.approvedAt)return`Approuvé ${fmtDate(l.approvedAt)}`;if(l.status==="saved"&&l.savedAt)return`Sauvegardé ${fmtDate(l.savedAt)}`;if(l.status==="generated"&&l.generatedAt)return`Généré ${fmtDate(l.generatedAt)}`;return fmtDate(l.createdAt);};


  if(loading)return <div style={{padding:30,color:P.muted,background:P.bg,height:"100%"}}>Chargement...</div>;

  return (
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:P.bg,height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",color:P.text}}>
      {viewListing&&<ViewPopup listing={viewListing} primaryFields={primaryFields} secondaryFields={secondaryFields}
        onApprove={(g,imgOk)=>approve(viewListing.id,g,imgOk)}
        onRegenerate={async(g)=>{if(g){const upd=listings.map(l=>l.id===viewListing.id?{...l,generated:g}:l);setListings(upd);await kvSet("travito:pm_listings",upd).catch(()=>{});}setViewListing(null);generate(viewListing);}}
        onSave={(g,imgOk)=>saveFromPopup(viewListing.id,g,imgOk)}
        onClose={()=>setViewListing(null)}/>}

      {/* Header */}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${P.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,gap:8}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:P.gold}}>🏷 Product Manager Manuel</div>
          <div style={{fontSize:10,color:P.muted,marginTop:1}}>{filtered.length} annonces · {listings.filter(l=>l.status==="approved").length} approuvées</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {saved&&<span style={{fontSize:10,color:P.green}}>✓ sauvegardé</span>}
          <button style={btn(P.green,P.greenS,{padding:"5px 12px",fontSize:10})} onClick={()=>{setShowForm(!showForm);setEditListing(null);}}>{showForm?"✕ Annuler":"+ Nouvelle"}</button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
        {/* Form */}
          {(showForm||editListing)&&(
            <div style={{flexShrink:0,padding:"12px 16px",borderBottom:`1px solid ${P.border}`}}>
              <ListingForm initial={editListing} primaryFields={primaryFields} mode="manual"
                existingListings={listings}
                onSave={saveListing} onCancel={()=>{setShowForm(false);setEditListing(null);}}/>
            </div>
          )}

          {/* Filters bar */}
          <div style={{flexShrink:0,padding:"8px 16px",borderBottom:`1px solid ${P.border}`,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",background:P.surface}}>
            <div style={{display:"flex",gap:3}}>
              {[["all","Toutes"],...Object.entries(STATUS).map(([k,v])=>[k,v.label])].map(([k,label])=>(
                <button key={k} onClick={()=>setFilterStatus(k)} style={{...btn(filterStatus===k?P.gold:P.muted,filterStatus===k?P.goldS:"transparent"),padding:"3px 8px",fontSize:9}}>{label}</button>
              ))}
            </div>
            <select value={filterWeek} onChange={e=>setFilterWeek(e.target.value)} style={{...inp,width:"auto",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>
              <option value="all">Toutes semaines</option>
              {isoWeeks.map(w=><option key={w} value={w}>{w}</option>)}
            </select>
            <MultiSelectDropdown label="Catégorie" options={catTax?.terms||[]} selected={filterCats} onChange={setFilterCats}/>
            <MultiSelectDropdown label="Type" options={typeTaxes.flatMap(tx=>(tx.terms||[]).map(t=>({id:t.id,name:`${tx.name}: ${t.name}`})))} selected={filterTypes} onChange={setFilterTypes}/>
            {hasFilters&&<button style={btn(P.red,P.redS,{padding:"4px 10px",fontSize:9})} onClick={resetFilters}>✕ Reset</button>}
            <span style={{fontSize:9,color:P.muted,marginLeft:"auto"}}>{filtered.length} annonce{filtered.length!==1?"s":""}</span>
          </div>

          {/* Table */}
          <div style={{flex:1,overflowY:"auto",padding:"0 16px 16px"}}>
            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"40px 0",color:P.muted,fontSize:13}}>{listings.length===0?"Aucune annonce. Cliquez + Nouvelle.":"Aucune annonce pour ces filtres."}</div>
            ):(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead style={{position:"sticky",top:0,zIndex:2}}>
                  <tr style={{background:P.card}}>
                    {["URL / Contact","Taxonomies","WP","Status & Date","Actions"].map((h,i)=>(
                      <th key={i} style={{padding:"8px 10px",color:P.muted,fontWeight:600,textAlign:"left",borderBottom:`1px solid ${P.border}`,fontSize:10}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((listing,ri)=>{
                    const st=STATUS[listing.status]||STATUS.initial;
                    const isGen=generating===listing.id;
                    const catTerm=(catTax?.terms||[]).find(t=>t.id===listing.categoryTermId);
                    const subTax2=primaryFields.find(t=>t.id===listing.subCategoryTaxId);
                    const subTerm=(subTax2?.terms||[]).find(t=>t.id===listing.subCategoryTermId);
                    return (
                      <tr key={listing.id} style={{borderBottom:`1px solid ${P.border}`,background:ri%2===0?P.bg:P.surface}}>
                        <td style={{padding:"8px 10px",maxWidth:260}}>
                          <a href={listing.url} target="_blank" rel="noopener noreferrer" style={{color:P.blue,fontSize:11,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240,marginBottom:3}} title={listing.url}>🔗 {listing.url}</a>
                          <div style={{display:"flex",gap:8,fontSize:10,color:P.muted,flexWrap:"wrap"}}>
                            <span>👤 {listing.username}</span><span>📞 {listing.phone}</span>
                          </div>
                          <div style={{fontSize:9,color:P.muted,marginTop:1}}>
                            📧 {listing.email||generateEmail(listing.username)}
                          </div>
                        </td>
                        <td style={{padding:"8px 10px"}}>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {catTerm&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:P.blueS,color:P.blue}}>{catTerm.name}</span>}
                            {subTerm&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:P.purpleS,color:P.purple}}>{subTax2?.name}: {subTerm.name}</span>}
                            {!catTerm&&!subTerm&&<span style={{fontSize:9,color:P.muted}}>—</span>}
                          </div>
                        </td>

                        {/* WP Post ID column */}
                        <td style={{padding:"8px 10px",textAlign:"center"}}>
                          {listing.wpPostId?(
                            <a href={`https://travito.ma/wp-admin/post.php?post=${listing.wpPostId}&action=edit`}
                               target="_blank" rel="noopener noreferrer"
                               style={{fontSize:9,color:P.blue}}>
                               #{listing.wpPostId}
                            </a>
                          ):(
                            <span style={{fontSize:9,color:P.muted}}>—</span>
                          )}
                        </td>
                        <td style={{padding:"8px 10px"}}>
                          <span style={{fontSize:10,padding:"3px 10px",borderRadius:12,background:st.bg,color:st.color,fontWeight:600,display:"block",marginBottom:2}}>{isGen?"⏳ Génération...":st.label}</span>
                          <div style={{fontSize:9,color:P.muted}}>{statusDate(listing)}</div>
                        </td>
                        <td style={{padding:"8px 10px"}}>
                          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                            {listing.status!=="approved"&&<button disabled={isGen} onClick={()=>generate(listing)} style={btn(P.gold,P.goldS,{padding:"3px 8px",fontSize:10,opacity:isGen?.5:1})} title="Générer — extraire et réécrire les champs depuis l'URL">{isGen?"⏳":"⚡"}</button>}
                            {["generated","saved","approved"].includes(listing.status)&&<button onClick={()=>setViewListing(listing)} style={btn(listing.status==="approved"?P.green:P.purple,listing.status==="approved"?P.greenS:P.purpleS,{padding:"3px 8px",fontSize:10})} title="Voir le résultat généré — approuver, éditer, générer image">👁</button>}
                            {["generated","saved","approved"].includes(listing.status)&&<button onClick={async()=>{if(!window.confirm("Supprimer l'image?"))return;const upd=listings.map(l=>l.id===listing.id?{...l,hasImage:false}:l);await persist(upd);fetch("/api/youtube",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"image_delete",listingId:listing.id})}).catch(()=>{});}} title="Supprimer l'image IA générée (libère le stockage KV)" style={btn(P.amber,P.amberS,{padding:"3px 8px",fontSize:10})}>🖼🗑</button>}
                            <button onClick={()=>{setEditListing(listing);setShowForm(false);}} title="Modifier l'URL, contact ou taxonomies" style={btn(P.muted,"transparent",{padding:"3px 8px",fontSize:10})}>✏️</button>
                            {listing.status==="approved"&&(
                              <button
                                title={listing.wpPostId?"Mettre à jour l annonce sur WP":"Publier l annonce sur WP"}
                                onClick={()=>publishListing(listing)}
                                style={btn(listing.wpPostId?P.teal:P.green,listing.wpPostId?P.tealS:P.greenS,{padding:"3px 8px",fontSize:10})}>
                                {listing.wpPostId?"🔄":"📢"}
                              </button>
                            )}
                            <button onClick={()=>deleteListing(listing.id)} title="Supprimer cette annonce définitivement" style={btn(P.red,P.redS,{padding:"3px 8px",fontSize:10})}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
      </div>
    </div>
  );
}
