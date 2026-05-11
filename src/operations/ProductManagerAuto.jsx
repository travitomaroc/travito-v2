// ================================================================
//  PRODUCT MANAGER AUTO — 4 Tabs: Log | Config | Auto | Semaine
//  Reuses: generate(), publishListing(), syncCompteFromListing()
//          ApproveField, ViewPopup, ListingForm from PM Manual
// ================================================================
import { useState, useEffect, useCallback, useRef } from "react";

// ── KV helpers ──────────────────────────────────────────────────
const kvGet = async (key) => {
  try {
    const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    let val = d.config ?? null;

    if (typeof val === "string") {
      try { val = JSON.parse(val); } catch {}
    }

    return val;
  } catch {
    return null;
  }
};

const kvSet = async (key, value) => {
  const r = await fetch("/api/kv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      value: JSON.stringify(value)
    })
  });

  const text = await r.text();

  if (!r.ok) {
    throw new Error(`KV write failed (${r.status}): ${text.slice(0, 200)}`);
  }

  return text;
};

const kvDel = async (key) => {
  try { await fetch(`/api/kv?action=del&key=${encodeURIComponent(key)}`); } catch {}
};

const stripDataUrl = (v) =>
  typeof v === "string" && v.startsWith("data:") ? "" : v;

const sanitizeListingsForKV = (rows = []) =>
  rows.map(l => {
    const cleanGenerated = l.generated
      ? {
          ...l.generated,

          uploadedRefImg: null,
          imageBase64: null,
          imageBytes: null,
          rawGenerated: null,
          rawResponse: null,
          visionRaw: null,
          promptRaw: null,

          generatedImages: Array.isArray(l.generated.generatedImages)
            ? l.generated.generatedImages.map((img, i) => ({
                index: img?.index ?? i,
                sourceIndex: img?.sourceIndex ?? i,
                storedUrl: stripDataUrl(img?.storedUrl || ""),
                originalUrl: stripDataUrl(img?.originalUrl || ""),
                pathname: img?.pathname || ""
              }))
            : [],

          sourceImages: Array.isArray(l.generated.sourceImages)
            ? l.generated.sourceImages.map((img, i) => ({
                index: img?.index ?? i,
                storedUrl: stripDataUrl(img?.storedUrl || ""),
                originalUrl: stripDataUrl(img?.originalUrl || ""),
                pathname: img?.pathname || "",
                mimeType: img?.mimeType || ""
              }))
            : [],

          sourceExtract: l.generated.sourceExtract
            ? {
                rawTitle: l.generated.sourceExtract.rawTitle || "",
                rawDescription: l.generated.sourceExtract.rawDescription || "",
                rawFields: l.generated.sourceExtract.rawFields || {},
                photoUrl: stripDataUrl(l.generated.sourceExtract.photoUrl || ""),
                images: Array.isArray(l.generated.sourceExtract.images)
                  ? l.generated.sourceExtract.images.map(stripDataUrl).filter(Boolean)
                  : [],
                engine: l.generated.sourceExtract.engine || "",
                fetchedAt: l.generated.sourceExtract.fetchedAt || ""
              }
            : null
        }
      : null;

    return {
      ...l,
      generated: cleanGenerated
    };
  });

const uid = () => `pm_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
const generateEmail = (username) => {
  const u=(username||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
  if(!u) return "";
  return `${u[0]||""}travito${u[1]||""}maroc${u.slice(2)||""}@gmail.com`;
};
const fmtDate = (iso) => iso?new Date(iso).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
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
const getDayOfWeekISO = (iso) => { const d=new Date(iso); return d.getDay()===0?6:d.getDay()-1; };
const DAYS_ORDER = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const KV_KEYS = {
  listings:"travito:pm_listings",
  config:"travito:pm_auto_config2",
  adapters:"travito:pm_site_adapters",
  imggen:"travito:pm_imggen_registry",
  logs:"travito:pm_auto_log",
  comptes:"travito:pm_comptes",
  seenUrls:"travito:pm_seen_urls",
  searchUrlsPrefix:"travito:pm_search_urls",
};
const sleep = (ms) => new Promise(r=>setTimeout(r, ms));
const randomBetween = (min,max) => Math.floor(min + Math.random() * (max-min+1));
const normalizeText = (s="") => String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();

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

const extractFirstPhotoUrl = (pageHtml="") => {
  const decode = (s="") => s.replace(/\\u002F/g, "/").replace(/\\/g, "").replace(/&amp;/g, "&");

  const candidates = [];

  const og = pageHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
  if (og) candidates.push({ kind: "og:image", url: decode(og) });

  [...pageHtml.matchAll(/"fullHd":"(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi)]
    .forEach(m => candidates.push({ kind: "fullHd", url: decode(m[1]) }));

  [...pageHtml.matchAll(/"standard":"(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi)]
    .forEach(m => candidates.push({ kind: "standard", url: decode(m[1]) }));

  const anchorIdx =
    pageHtml.search(/<link\s+rel="canonical"/i) >= 0
      ? pageHtml.search(/<link\s+rel="canonical"/i)
      : pageHtml.search(/<meta\s+property="og:title"/i);

  const localWindow =
    anchorIdx >= 0
      ? pageHtml.slice(Math.max(0, anchorIdx - 25000), Math.min(pageHtml.length, anchorIdx + 120000))
      : pageHtml;

  [...localWindow.matchAll(/"fullHd":"(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi)]
    .forEach(m => candidates.push({ kind: "fullHd_local", url: decode(m[1]) }));

  [...localWindow.matchAll(/"standard":"(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi)]
    .forEach(m => candidates.push({ kind: "standard_local", url: decode(m[1]) }));

  const seen = new Set();
  const uniq = candidates.filter(c => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  return (
    uniq.find(x => x.kind === "fullHd")?.url ||
    uniq.find(x => x.kind === "og:image")?.url ||
    uniq.find(x => x.kind === "standard")?.url ||
    uniq[0]?.url ||
    ""
  );
};

const buildAutoImagePrompt = ({ basePrompt, referenceImageUrl, title, city, category }) => {
  const head = (basePrompt || "").trim() || `Create a realistic marketplace photo for: ${title || "pet listing"}.`;
  const context = [title ? `Title: ${title}` : "", city ? `City: ${city}` : "", category ? `Category: ${category}` : ""].filter(Boolean).join(" | ");
  return [
    head,
    context,
    "Use the original listing photo as visual reference for breed, age, pose and composition when relevant.",
    referenceImageUrl ? `Reference image URL: ${referenceImageUrl}` : "",
    "Generate a clean, realistic replacement photo suitable for a marketplace listing.",
    "Remove watermark, logo, text overlay, UI icons, collage marks, counters and marketplace branding.",
    "Keep the subject natural, centered and photorealistic on a clean neutral background.",
  ].filter(Boolean).join("\n");
};


// ── 🖼️ Extract all image URLs from HTML ─────────────────────
const extractPhotoUrlsFromHtml = (html = "") => {
  if (!html) return [];

  const src = String(html);

  const decode = (u = "") =>
    String(u)
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\\\/g, "\\");

  const normalizeImg = (u = "") => {
    const clean = decode(u).trim();
    if (!clean) return "";
    return clean.replace(/([?&])t=[^&]+/, "$1t=full_hd");
  };

  const isValidAvitoClassifiedImage = (u = "") =>
    /^https:\/\/content\.avito\.ma\/classifieds\/images\//i.test(u);

  const pickPath = (img) =>
    img?.paths?.fullHd ||
    img?.paths?.standard ||
    img?.fullHd ||
    img?.standard ||
    "";

  // ─────────────────────────────────────────────────────────────
  // 1) PRIMARY RULE: parse __NEXT_DATA__ and keep ONLY ad images
  //    Explicitly exclude seller.latestActiveAdsImages
  // ─────────────────────────────────────────────────────────────
  try {
    const nextDataMatch = src.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i
    );

    if (nextDataMatch?.[1]) {
      const nextData = JSON.parse(nextDataMatch[1]);

      const candidates = [];

      const walk = (node, path = []) => {
        if (!node) return;

        if (Array.isArray(node)) {
          const looksLikeAdImageArray =
            node.length > 0 &&
            node.every(item => {
              const p = pickPath(item);
              return !p || isValidAvitoClassifiedImage(normalizeImg(p));
            });

          const pathStr = path.join(".");

          // Exclude known intruder source
          if (
            looksLikeAdImageArray &&
            !pathStr.includes("latestActiveAdsImages")
          ) {
            const urls = node
              .map(item => normalizeImg(pickPath(item)))
              .filter(isValidAvitoClassifiedImage);

            if (urls.length) {
              candidates.push({
                path: pathStr,
                urls
              });
            }
          }

          for (let i = 0; i < node.length; i++) {
            walk(node[i], [...path, String(i)]);
          }
          return;
        }

        if (typeof node === "object") {
          for (const [key, value] of Object.entries(node)) {
            // Hard stop for intruder branch
            if (key === "latestActiveAdsImages") continue;
            walk(value, [...path, key]);
          }
        }
      };

      walk(nextData, []);

      // Prefer the most ad-like candidate paths first
      const scored = candidates
        .map(c => {
          let score = c.urls.length;

          if (c.path.includes("media.media.images")) score += 1000;
          if (c.path.includes("media.images")) score += 800;
          if (c.path.endsWith(".images")) score += 300;
          if (c.path.includes("defaultImage")) score -= 500;
          if (c.path.includes("seller")) score -= 1000;

          return { ...c, score };
        })
        .sort((a, b) => b.score - a.score);

      if (scored.length) {
        const best = scored[0];
        const uniq = [...new Set(best.urls)];

        console.log("[IMGDBG] __NEXT_DATA__ candidates", scored.map(c => ({
          path: c.path,
          count: c.urls.length,
          score: c.score
        })));
        console.log("[IMGDBG] using __NEXT_DATA__ ad images", best.path, uniq);

        if (uniq.length) return uniq.slice(0, 20);
      }
    }
  } catch (e) {
    console.log("[IMGDBG] __NEXT_DATA__ parse failed:", e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 2) FALLBACK: visible gallery HTML only
  //    This may return only 2 on partially hydrated pages
  // ─────────────────────────────────────────────────────────────
  const galleryBlockMatch = src.match(
    /<div class="sc-6006214c-2[\s\S]*?<div class="sc-91ce715c-11 cTxmAY">/i
  );

  const galleryHtml = galleryBlockMatch ? galleryBlockMatch[0] : "";

  const galleryMatches = [
    ...galleryHtml.matchAll(
      /id="imageSlide\d+"[\s\S]*?<img[^>]+src="(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi
    )
  ].map(m => m[1]);

  const galleryUrls = [...new Set(
    galleryMatches
      .map(normalizeImg)
      .filter(isValidAvitoClassifiedImage)
  )];

  if (galleryUrls.length) {
    console.log("[IMGDBG] fallback gallery HTML only", galleryUrls);
    return galleryUrls.slice(0, 20);
  }

  // ─────────────────────────────────────────────────────────────
  // 3) LAST RESORT: og:image only
  // ─────────────────────────────────────────────────────────────
  const ogImage =
    src.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || "";

  const fallback = [normalizeImg(ogImage)].filter(isValidAvitoClassifiedImage);

  console.log("[IMGDBG] fallback og:image only", fallback);
  return fallback.slice(0, 20);
};




// Generate placeholder phone — obviously fake, +212 600 000 000 + random suffix
const generatePlaceholderPhone = () => {
  const n = Math.floor(Math.random() * 1000000000000) + 9000000000000; // 13-digit number starting with 9
  return `+212${n}`;
};

const normalizeUsernameKey = (s="") =>
  String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();

const buildWpUsernameFromPhone = (name = "", phone = "") => {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);

  const digits = String(phone || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);

  if (!base && last4) return `user_${last4}`;
  if (!base) return "";
  if (!last4) return base;
  if (base.endsWith(`_${last4}`)) return base;

  return `${base}_${last4}`;
};

const normalizePhoneMA = (raw="") => {
  let s = String(raw || "").replace(/[^\d+]/g, "");

  if (!s) return "";

  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (s.startsWith("+2120")) s = "+212" + s.slice(5);
  else if (s.startsWith("+212")) s = "+212" + s.slice(4);
  else if (s.startsWith("2120")) s = "+212" + s.slice(4);
  else if (s.startsWith("212")) s = "+212" + s.slice(3);
  else if (s.startsWith("0")) s = "+212" + s.slice(1);

  return /^\+212[5-7]\d{8}$/.test(s) ? s : "";
};

const isRealPhoneMA = (phone="") => /^\+212[5-7]\d{8}$/.test(String(phone || ""));

const buildPhoneStatePatch = (listing) => {
  const normalizedPhone = normalizePhoneMA(listing.phone || "");
  const hasReal = isRealPhoneMA(normalizedPhone);

  return {
    ...listing,
    phone: hasReal ? normalizedPhone : (listing.phone || ""),
    phonePlaceholder: !hasReal,
    phoneStatus: hasReal ? "revealed" : "not_revealed",
    status: hasReal ? "phone_revealed" : "phone_not_revealed",
  };
};


const syncCompteAfterReveal = async (listing, addLog = () => {}) => {
  const normalizedPhone = normalizePhoneMA(listing.phone || "");
  if (!normalizedPhone) return { skip: true };

  try {
    const comptes = await kvGet(KV_KEYS.comptes).then(v => Array.isArray(v) ? v : []);
    const existing = comptes.find(c => normalizePhoneMA(c.phone || "") === normalizedPhone);

    if (!existing) {
      const newCompte = {
        id: uid(),
        username: listing.username || "",
        phone: normalizedPhone,
        email: listing.email || generateEmail(listing.username || uid()),
        createdAt: new Date().toISOString(),
        locked: false
      };
      await kvSet(KV_KEYS.comptes, [...comptes, newCompte]);
      addLog(`  → Compte créé: ${normalizedPhone}`, "success");
      return { created: true };
    }

    const updatedCompte = {
      ...existing,
      phone: normalizedPhone,
      username: listing.username || existing.username || "",
      email: listing.email || existing.email || generateEmail(listing.username || uid())
    };

    const updated = comptes.map(c => c.id === existing.id ? updatedCompte : c);
    await kvSet(KV_KEYS.comptes, updated);

    addLog(`  → Compte synchronisé par téléphone: ${normalizedPhone}`, "success");
    return { matched: true };
  } catch (e) {
    addLog(`  → Sync compte échouée: ${e.message}`, "error");
    return { error: e.message };
  }
};

// ── Design tokens ──────────────────────────────────────────────
const P = {
  bg:"#0E1117",surface:"#161B27",card:"#1C2333",border:"#2A3348",
  gold:"#C8972B",goldS:"rgba(200,151,43,0.12)",text:"#E8EAF0",
  muted:"#6B7A99",green:"#22C55E",greenS:"rgba(34,197,94,0.12)",
  red:"#EF4444",redS:"rgba(239,68,68,0.10)",blue:"#3B82F6",
  blueS:"rgba(59,130,246,0.12)",amber:"#F59E0B",amberS:"rgba(245,158,11,0.10)",
  purple:"#8B5CF6",purpleS:"rgba(139,92,246,0.12)",teal:"#14B8A6",tealS:"rgba(20,184,166,0.12)",
};

const STATUS_DEF = {
  initial:              { label:"Initial", color:P.muted, bg:"rgba(107,122,153,0.12)" },
  generated:            { label:"Généré", color:P.amber, bg:P.amberS },
  generate_failed:      { label:"Génération échouée", color:P.red, bg:P.redS },

  saved:                { label:"Sauvegardé", color:P.blue, bg:P.blueS },
  approved:             { label:"Approuvé", color:P.green, bg:P.greenS },

  key_approved:         { label:"Clés ✓", color:P.teal, bg:P.tealS },
  key_missing:          { label:"Champs clés manquants", color:P.red, bg:P.redS },

  fields_approved:      { label:"Champs ✓", color:P.teal, bg:P.tealS },
  fields_missing:       { label:"Champs cibles manquants", color:P.red, bg:P.redS },

  image_generated:      { label:"Image IA", color:P.purple, bg:P.purpleS },
  image_error:          { label:"Échec image IA", color:P.red, bg:P.redS },
  approve_img_failed:   { label:"Image rejetée", color:P.red, bg:P.redS },

  phone_revealed:       { label:"Tél révélé", color:P.green, bg:P.greenS },
  phone_not_revealed:   { label:"Tél non révélé", color:P.red, bg:P.redS },

  approval_ready:       { label:"Prête approbation", color:P.amber, bg:P.amberS },
  approve_all_failed:   { label:"Approbation finale échouée", color:P.red, bg:P.redS },

  user_ready:           { label:"Prête compte", color:P.blue, bg:P.blueS },
  create_user_failed:   { label:"Création compte échouée", color:P.red, bg:P.redS },

  publish_ready:        { label:"Prête publication", color:P.purple, bg:P.purpleS },
  published:            { label:"Publié", color:P.green, bg:P.greenS },
  publish_failed:       { label:"Publication échouée", color:P.red, bg:P.redS },
};




const inp={background:P.card,border:`1px solid ${P.border}`,borderRadius:6,color:P.text,padding:"7px 10px",fontSize:12,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
const btn=(color=P.gold,bg=P.goldS,extra={})=>({background:bg,border:`1px solid ${color}40`,borderRadius:6,color,padding:"6px 14px",fontSize:11,cursor:"pointer",fontWeight:600,transition:"all .15s",whiteSpace:"nowrap",...extra});

// ── Flow steps ─────────────────────────────────────────────────
const FLOW_STEPS = [
  {id:"search",       label:"Recherche Annonces",          icon:"🔍", targetStatus:null,            desc:"Scrape URLs depuis sites cibles"},
  {id:"create_url",   label:"Créer URL Records",           icon:"📋", targetStatus:"initial",       desc:"Créer enregistrements depuis URLs"},
  {id:"generate",     label:"Générer Annonce",             icon:"✍️", targetStatus:"generated",     desc:"Extraction + réécriture IA"},
  {id:"sync_user",    label:"Valider Username / Téléphone", icon:"👤", targetStatus:"phone_revealed", desc:"Révéler le téléphone, valider username et préparer la suite"},
  {id:"approve_key",  label:"Approuver Champs Clés",       icon:"✅", targetStatus:"key_approved",  desc:"Valider titre, desc, prix, ville"},
  {id:"approve_sec",  label:"Approuver Champs Cibles",     icon:"🎯", targetStatus:"fields_approved",desc:"Valider champs secondaires"},
  {id:"gen_image",    label:"Générer Image IA",            icon:"🖼️", targetStatus:"image_generated",desc:"Générer Image IA"},
  {id:"approve_img",  label:"Approuver Image IA",          icon:"🏷️", targetStatus:"image_generated",desc:"Valider image via Claude Vision"},
{id:"approve_all",  label:"Approuver Annonce",         icon:"📝", targetStatus:"approval_ready", desc:"Validation finale"},
{id:"create_user",  label:"Créer Username Travito.ma", icon:"🆕", targetStatus:"user_ready",     desc:"Créer compte WordPress"},
{id:"publish",      label:"Publier sur Travito.ma",    icon:"🚀", targetStatus:"publish_ready",  desc:"Publier sur WordPress"},
  {id:"delete",       label:"Supprimer depuis Agents",     icon:"🗑️", targetStatus:"published",     desc:"Nettoyer le dashboard"},
];

// ── MultiSelectDropdown — with search filter ──────────────────
function MultiSelectDropdown({label,options,selected,onChange,placeholder="Sélectionner..."}) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState("");
  const ref=useRef();
  const searchRef=useRef();
  useEffect(()=>{
    const h=(e)=>{if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setSearch("");}};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  useEffect(()=>{if(open&&searchRef.current)searchRef.current.focus();},[open]);
  const toggle=(id)=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  const labels=options.filter(o=>selected.includes(o.id||o)).map(o=>o.name||o);
  const filtered=search.trim()
    ?options.filter(o=>(o.name||o).toLowerCase().includes(search.toLowerCase()))
    :options;
  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      {/* Trigger */}
      <div onClick={()=>{setOpen(p=>!p);setSearch("");}}
        style={{...inp,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",minHeight:35}}>
        <span style={{color:labels.length?P.text:P.muted,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
          {labels.length
            ? labels.slice(0,3).join(", ")+(labels.length>3?` +${labels.length-3}`:"")
            : placeholder}
        </span>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          {selected.length>0&&(
            <span onClick={e=>{e.stopPropagation();onChange([]);}}
              style={{fontSize:9,color:P.muted,cursor:"pointer",padding:"1px 5px",borderRadius:3,
                background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)"}}>✕</span>
          )}
          <span style={{color:P.muted,fontSize:9}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {/* Dropdown */}
      {open&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:P.card,
          border:`1px solid ${P.border}`,borderRadius:6,zIndex:200,marginTop:2,
          boxShadow:"0 4px 20px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",maxHeight:260}}>
          {/* Search bar */}
          <div style={{padding:"7px 8px",borderBottom:`1px solid ${P.border}`,flexShrink:0}}>
            <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Rechercher..."
              onClick={e=>e.stopPropagation()}
              style={{...inp,fontSize:11,padding:"5px 8px",background:P.surface}}/>
          </div>
          {/* Selected summary */}
          {selected.length>0&&(
            <div style={{padding:"5px 8px",borderBottom:`1px solid ${P.border}`,flexShrink:0,
              display:"flex",flexWrap:"wrap",gap:3}}>
              {labels.map((l,i)=>(
                <span key={i} style={{fontSize:9,padding:"2px 6px",borderRadius:3,
                  background:P.blueS,color:P.blue,cursor:"pointer",border:`1px solid ${P.blue}33`}}
                  onClick={e=>{e.stopPropagation();toggle(options.find(o=>(o.name||o)===l)?.id||l);}}>
                  {l} ×
                </span>
              ))}
            </div>
          )}
          {/* Options list */}
          <div style={{overflowY:"auto",flex:1}}>
            {filtered.length===0&&(
              <div style={{padding:"12px",fontSize:11,color:P.muted,textAlign:"center"}}>
                {search?"Aucun résultat":"Aucune option"}
              </div>
            )}
            {filtered.map(o=>{
              const id=o.id||o; const name=o.name||o; const sel=selected.includes(id);
              return (
                <div key={id} onClick={e=>{e.stopPropagation();toggle(id);}}
                  style={{padding:"8px 10px",cursor:"pointer",display:"flex",gap:8,alignItems:"center",
                    background:sel?P.blueS:"transparent",borderBottom:`1px solid ${P.border}33`}}>
                  <span style={{fontSize:10,width:14,color:sel?P.blue:P.muted,flexShrink:0,fontWeight:700}}>{sel?"✓":""}</span>
                  <span style={{fontSize:11,color:sel?P.text:P.muted,
                    // Highlight search match
                    fontWeight:search&&name.toLowerCase().includes(search.toLowerCase())?600:400}}>
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Footer: count + clear */}
          <div style={{padding:"5px 10px",borderTop:`1px solid ${P.border}`,display:"flex",
            justifyContent:"space-between",alignItems:"center",flexShrink:0,
            background:P.surface,borderRadius:"0 0 6px 6px"}}>
            <span style={{fontSize:9,color:P.muted}}>
              {selected.length}/{options.length} sélectionné{selected.length!==1?"s":""}
            </span>
            {selected.length>0&&(
              <button onClick={e=>{e.stopPropagation();onChange([]);}}
                style={{fontSize:9,color:P.red,background:"none",border:"none",cursor:"pointer"}}>
                Tout effacer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KeywordsInput ─────────────────────────────────────────────
function KeywordsInput({value,onChange}) {
  const [newWord,setNewWord]=useState("");
  const items=value||[];
  const add=()=>{const w=newWord.trim();if(!w)return;onChange([...items,{word:w,mode:"O"}]);setNewWord("");};
  return (
    <div>
      <div style={{display:"flex",gap:4,marginBottom:5}}>
        <input value={newWord} onChange={e=>setNewWord(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
          placeholder="Mot-clé puis Entrée..." style={{...inp,flex:1,fontSize:11}}/>
        <button onClick={add} style={{...btn(P.green,P.greenS),padding:"4px 10px",fontSize:10}}>+</button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {items.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 7px",borderRadius:5,
            background:item.mode==="M"?P.blueS:P.goldS,border:`1px solid ${item.mode==="M"?P.blue:P.gold}44`}}>
            <span style={{fontSize:10,color:item.mode==="M"?P.blue:P.gold}}>{item.word}</span>
            <button onClick={()=>{const a=[...items];a[i]={...a[i],mode:a[i].mode==="M"?"O":"M"};onChange(a);}}
              style={{fontSize:8,padding:"1px 5px",borderRadius:3,border:`1px solid ${P.border}`,background:P.card,
                color:item.mode==="M"?P.blue:P.muted,cursor:"pointer",fontWeight:700}}>
              {item.mode}
            </button>
            <button onClick={()=>onChange(items.filter((_,j)=>j!==i))}
              style={{fontSize:10,color:P.muted,background:"none",border:"none",cursor:"pointer",lineHeight:1}}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SitesInput — comma-separated URLs with validation ─────────
function SitesInput({value,onChange}) {
  const [raw,setRaw]=useState((value||[]).join(", "));
  const [error,setError]=useState("");
  // Validate only on blur or Enter — never while typing
  const validate=(str)=>{
    const parts=str.split(",").map(s=>s.trim()).filter(Boolean);
    if(!parts.length){setError("");onChange([]);return;}
    const bad=parts.filter(p=>p&&!p.match(/^https?:\/\/.+/));
    if(bad.length>0){setError("Format invalide: "+bad.slice(0,2).join(", ")+" — doit commencer par https://");return;}
    setError("");onChange(parts);
  };
  const handleKeyDown=(e)=>{
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();validate(raw);}
  };
  return (
    <div>
      <textarea value={raw} rows={2}
        onChange={e=>setRaw(e.target.value)}
        onBlur={e=>validate(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://xxxxx.ma/fr/maroc/..., https://yyyy.ma/..."
        style={{...inp,resize:"vertical",fontSize:11,lineHeight:1.5,
          borderColor:error?P.red:P.border}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
        <div>
          {error&&<div style={{fontSize:9,color:P.red}}>⚠ {error}</div>}
          {!error&&(value||[]).filter(Boolean).length>0&&(
            <div style={{fontSize:9,color:P.green}}>
              ✓ {(value||[]).filter(Boolean).length} site{(value||[]).filter(Boolean).length>1?"s":""} valide{(value||[]).filter(Boolean).length>1?"s":""}
            </div>
          )}
          {!error&&!(value||[]).filter(Boolean).length&&raw.trim()&&(
            <div style={{fontSize:9,color:P.muted}}>Appuyer Entrée ou cliquer hors du champ pour valider</div>
          )}
        </div>
        <button onClick={()=>validate(raw)}
          style={{...btn(P.blue,P.blueS),padding:"2px 10px",fontSize:9}}>
          ✓ Confirmer
        </button>
      </div>
    </div>
  );
}

function LocalLanguagePicker({value,onCommit}) {
  const [langs,setLangs]=useState(Array.isArray(value)&&value.length?value:["FR"]);
  useEffect(()=>{setLangs(Array.isArray(value)&&value.length?value:["FR"]);},[JSON.stringify(value||[])]);
  const toggle=(l)=>{
    const next=langs.includes(l)?langs.filter(x=>x!==l):[...langs,l];
    setLangs(next);
    onCommit(next);
  };
  return <div style={{display:"flex",gap:6}}>{["FR","AR","EN"].map(l=>(
    <button key={l} onClick={()=>toggle(l)}
      style={{...btn(langs.includes(l)?P.blue:P.muted,langs.includes(l)?P.blueS:"transparent"),padding:"4px 12px",fontSize:11}}>{l}</button>
  ))}</div>;
}

function LocalTextAreaField({value,onCommit,rows=2,placeholder=""}) {
  const [val,setVal]=useState(value||"");
  useEffect(()=>{setVal(value||"");},[value]);
  return <textarea value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>onCommit(val)} rows={rows}
    placeholder={placeholder} style={{...inp,resize:"vertical",fontSize:11,lineHeight:1.5}}/>;
}

function LocalTimeField({value,onCommit}) {
  const [val,setVal]=useState(value||"09:00");
  useEffect(()=>{setVal(value||"09:00");},[value]);
  return <input type="time" value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>onCommit(val)}
    style={{...inp,fontSize:11,width:120}}/>;
}

// ── DayConfigPanel ────────────────────────────────────────────
const DEFAULT_DAY = {
  enabled:false,sites:[],keywords:[],
  prixDe:"",prixA:"",avecPrix:false,
  villes:[],categories:[],types:[],termes:[],
  minAds:0,maxAds:10,maxHitsPerSite:5,
  promptHelper:"",languages:["FR"],
  minDelayMs:350,withImage:true,startTime:"09:00",
  autoSteps: {
    search:true,
    create_url:true,
    generate:true,
    sync_user:true,
    approve_key:true,
    approve_sec:true,
    gen_image:true,
    approve_img:true,
    approve_all:true,
    create_user:true,
    publish:true,
    delete:false
  }
};

const DEFAULT_SITE_ADAPTERS = {
  avito: {
    site: "https://www.avito.ma",
    locale: "fr",
    defaultCountry: "maroc",
    mode: "direct_urls_from_raw_results",
    note: "Avito: fetch_raw sur page résultats, extraction directe des href .htm",
    hardcoded: {
      locale: "fr",
      titleSource: "results card title",
      locationSource: "results card location",
      urlPattern: "https://www.avito.ma/fr/{locationSlug}/{categorySlug}/{titleSlug}_{id}.htm",
    },
    typeMappings: {
      "Automotives": { adView:"", resultsPage:"" },
      "Motos et 2 Roues": { adView:"", resultsPage:"" },
      "Immobilier": { adView:"", resultsPage:"" },
      "Immobilier Vente": { adView:"", resultsPage:"" },
      "Immobilier Location": { adView:"", resultsPage:"" },
      "Immobilier Colocation": { adView:"", resultsPage:"" },
      "Location Vacances": { adView:"", resultsPage:"" },

      "Animalerie": {
        adView: "animaux_domestique,animaux_de_ferme,services_pour_animaux,accessoires_pour_animaux,alimentation_pour_animaux",
        resultsPage: "animaux-%C3%A0_vendre"
      },
      "Animaux Domestique": {
        adView: "animaux_domestique",
        resultsPage: "animaux-%C3%A0_vendre"
      },
      "Animaux De Ferme": {
        adView: "animaux_de_ferme",
        resultsPage: "animaux-%C3%A0_vendre"
      },
      "Services pour animaux": {
        adView: "services_pour_animaux",
        resultsPage: "animaux-%C3%A0_vendre"
      },
      "Accessoires pour animaux": {
        adView: "accessoires_pour_animaux",
        resultsPage: "animaux-%C3%A0_vendre"
      },
      "Alimentation pour animaux": {
        adView: "alimentation_pour_animaux",
        resultsPage: "animaux-%C3%A0_vendre"
      }
    }
  }
};


function DayConfigPanel({day,config,onChange,primaryFields,secondaryFields,allDays,onCopyFrom}) {
  const cfg={...DEFAULT_DAY,...config};
  const [showCopy,setShowCopy]=useState(false);
  const catTax=primaryFields.find(t=>t.name?.toLowerCase().includes("categ")||t.slug?.toLowerCase().includes("categ"))||primaryFields[0];
  const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);
  const villeTax=secondaryFields.find(t=>t.name?.toLowerCase().includes("ville"));
  const termeTax=secondaryFields.find(t=>!t.name?.toLowerCase().includes("ville")&&!t.name?.toLowerCase().includes("quartier")&&(t.name?.toLowerCase().includes("terme")||t.name?.toLowerCase().includes("état")||t.name?.toLowerCase().includes("etat")||t.name?.toLowerCase().includes("condition")));

useEffect(()=>{
  window.__pma_typeTaxes__ = typeTaxes;
  window.__pma_catTerms__ = catTax?.terms || [];
  window.__pma_villeTaxTerms__ = villeTax?.terms || [];
},[primaryFields, catTax, villeTax]);


const termeOptions = (()=>{
  if(!cfg.types?.length){
    return (termeTax?.terms||[]).map(t=>({id:t.id,name:t.name}));
  }
  const activeTaxes = typeTaxes.filter(tx=>
    (tx.terms||[]).some(t=>cfg.types.includes(t.id))
  );
  return activeTaxes.flatMap(tx=>
    (tx.terms||[]).map(t=>({
      id:t.id,
      name: typeTaxes.length>1
        ? `${tx.name.replace(/^Type\s+/i,"")}: ${t.name}`
        : t.name
    }))
  );
})();


  const set=(k,v)=>onChange({...cfg,[k]:v});

  const SL=({children})=>(
    <div style={{fontSize:9,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1,
      marginBottom:8,marginTop:16,paddingBottom:4,borderBottom:`1px solid ${P.border}`}}>{children}</div>
  );
  const Row=({label,children})=>(
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,color:P.muted,marginBottom:4}}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{padding:"14px 16px",background:P.surface,borderRadius:8,border:`1px solid ${P.border}`}}>
      {/* Sticky header: day name + copy + enable + save */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
        background:P.card,borderBottom:`1px solid ${P.border}`,
        position:"sticky",top:0,zIndex:10,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:700,color:P.text,flex:1}}>{day}</span>
        {/* Copy from */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowCopy(p=>!p)}
            style={{...btn(P.blue,P.blueS),padding:"4px 10px",fontSize:10}}>
            📋 Copier depuis...
          </button>
          {showCopy&&(
            <div style={{position:"absolute",right:0,top:"100%",background:P.card,border:`1px solid ${P.border}`,borderRadius:6,zIndex:200,minWidth:130,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",marginTop:2}}>
              {allDays.filter(d=>d!==day).map(d=>(
                <div key={d} onClick={()=>{onCopyFrom(d);setShowCopy(false);}}
                  style={{padding:"8px 12px",cursor:"pointer",fontSize:11,color:P.text,
                    borderBottom:`1px solid ${P.border}`}}
                  onMouseEnter={e=>e.target.style.background=P.blueS}
                  onMouseLeave={e=>e.target.style.background="transparent"}>
                  {d}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={()=>set("enabled",!cfg.enabled)}
          style={{...btn(cfg.enabled?P.green:P.muted,cfg.enabled?P.greenS:"transparent"),padding:"4px 14px",fontSize:11}}>
          {cfg.enabled?"✓ Actif":"Inactif"}
        </button>
        {cfg.enabled&&(
          <button onClick={()=>{ /* save triggered by parent */ document.dispatchEvent(new CustomEvent("pma_save")); }}
            style={{...btn(P.gold,P.goldS),padding:"4px 12px",fontSize:10,fontWeight:700}}>
            💾 Sauvegarder
          </button>
        )}
      </div>

      <div style={{padding:"14px 16px"}}>
      {!cfg.enabled&&<div style={{fontSize:11,color:P.muted,textAlign:"center",padding:"16px 0"}}>
        Désactivé — cliquer "Inactif" pour activer
      </div>}

      {cfg.enabled&&(<>
        <SL>Section A — Sources & Catégories</SL>

        <Row label="(a) Sites cibles — séparés par virgule, format https://...">
          <SitesInput value={cfg.sites} onChange={v=>set("sites",v)}/>
        </Row>
        <Row label="(e) Catégorie">
          <MultiSelectDropdown options={(catTax?.terms||[]).map(t=>({id:t.id,name:t.name}))}
            selected={cfg.categories} onChange={v=>set("categories",v)} placeholder="Toutes catégories..."/>
        </Row>
        <Row label="(f) Type">
          <MultiSelectDropdown
            options={typeTaxes.flatMap(tx=>(tx.terms||[]).map(t=>({
              id:t.id,
              // Show "Motos" not "Type Immobilier: Motos" — parent label adds no value in this context
              name:t.name,
              // Keep group hint if multiple type taxonomies exist and term names could clash
              ...(typeTaxes.length>1?{name:`${tx.name.replace(/^Type\s+/i,"")}: ${t.name}`}:{name:t.name}),
            })))}
            selected={cfg.types} onChange={v=>set("types",v)} placeholder="Tous types..."/>
        </Row>
        <Row label="(g) Terme">
          <MultiSelectDropdown options={termeOptions}
            selected={cfg.termes} onChange={v=>set("termes",v)} placeholder="Tous termes..."/>
        </Row>

        <SL>Section B — Filtres & Paramètres</SL>

        <Row label="(d) Villes">
          <MultiSelectDropdown options={(villeTax?.terms||[]).map(t=>({id:t.id,name:t.name}))||[]}
            selected={cfg.villes} onChange={v=>set("villes",v)} placeholder="Toutes villes..."/>
        </Row>

        <Row label="(x) Avec prix">
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <button onClick={()=>set("avecPrix",!cfg.avecPrix)}
              style={{...btn(cfg.avecPrix?P.green:P.muted,cfg.avecPrix?P.greenS:"transparent"),padding:"4px 14px",fontSize:11}}>
              {cfg.avecPrix?"ON":"OFF"}
            </button>
            {cfg.avecPrix&&(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,color:P.muted}}>(c) De</span>
                <input type="number" value={cfg.prixDe} onChange={e=>set("prixDe",e.target.value)}
                  placeholder="0" style={{...inp,width:90,fontSize:11}}/>
                <span style={{fontSize:10,color:P.muted}}>À</span>
                <input type="number" value={cfg.prixA} onChange={e=>set("prixA",e.target.value)}
                  placeholder="∞" style={{...inp,width:90,fontSize:11}}/>
                <span style={{fontSize:10,color:P.muted}}>MAD</span>
              </div>
            )}
          </div>
        </Row>

        <Row label="(b) Mots-clés — M=Obligatoire (tous requis) O=Optionnel (un suffit)">
          <KeywordsInput value={cfg.keywords} onChange={v=>set("keywords",v)}/>
        </Row>

        <Row label="(m) Avec image">
          <button onClick={()=>set("withImage",!cfg.withImage)}
            style={{...btn(cfg.withImage?P.green:P.muted,cfg.withImage?P.greenS:"transparent"),padding:"4px 14px",fontSize:11}}>
            {cfg.withImage?"ON — Image exist":"OFF"}
          </button>
        </Row>

        <Row label="(k) Langues ciblées">
          <div style={{display:"flex",gap:6}}>
            {["FR","AR","EN"].map(l=>(
              <button key={l} onClick={()=>{const ls=cfg.languages||[];set("languages",ls.includes(l)?ls.filter(x=>x!==l):[...ls,l]);}}
                style={{...btn((cfg.languages||[]).includes(l)?P.blue:P.muted,(cfg.languages||[]).includes(l)?P.blueS:"transparent"),padding:"4px 12px",fontSize:11}}>
                {l}
              </button>
            ))}
          </div>
        </Row>

        <Row label="(j) Prompt helper">
          <textarea value={cfg.promptHelper} onChange={e=>set("promptHelper",e.target.value)} rows={2}
            placeholder="Instructions supplémentaires pour l'IA..."
            style={{...inp,resize:"vertical",fontSize:11,lineHeight:1.5}}/>
        </Row>

        <SL>Section C — Exécution</SL>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Row label="(h) Min annonces cibles">
            <input type="number" min="0" value={cfg.minAds} onChange={e=>set("minAds",Number(e.target.value))} style={{...inp,fontSize:11}}/>
          </Row>
          <Row label="(h) Max annonces cibles">
            <input type="number" min="0" value={cfg.maxAds} onChange={e=>set("maxAds",Number(e.target.value))} style={{...inp,fontSize:11}}/>
          </Row>
          <Row label="(i) Max hits / site / jour">
            <input type="number" min="0" value={cfg.maxHitsPerSite} onChange={e=>set("maxHitsPerSite",Number(e.target.value))} style={{...inp,fontSize:11}}/>
          </Row>
          <Row label="(l) Délai entre ouvertures URL (ms, 0=smart)">
            <input type="number" min="0" step="50" value={cfg.minDelayMs ?? (cfg.minDelayMinutes?cfg.minDelayMinutes*60000:350)} onChange={e=>set("minDelayMs",Number(e.target.value||0))} style={{...inp,fontSize:11}}/>
          </Row>
        </div>

        <Row label="(y) Heure de début">
          <input type="time" value={cfg.startTime} onChange={e=>set("startTime",e.target.value)}
            style={{...inp,fontSize:11,width:120}}/>
        </Row>
      </>)}
      </div>
    </div>
  );
}

// ── Step execution engine ──────────────────────────────────────
// All step logic lives here — used by both TabSemaine (manual) and cron

const stepEngine = {


  // ── 🔍 RECHERCHE ANNONCES ──────────────────────────────────
  async search(dayConfig, listings, addLog, siteAdapters=DEFAULT_SITE_ADAPTERS) {

console.log("[SEARCH][INPUT]", {
  dayConfig,
  sites: dayConfig.sites,
  villes: dayConfig.villes,
  categories: dayConfig.categories,
  types: dayConfig.types,
  termes: dayConfig.termes,
});

    const sites = (dayConfig.sites||[]).filter(s=>s.trim());
    if(!sites.length){ addLog("❌ Aucun site configuré","error"); return {urls:[],log:[]}; }

    const keywords   = dayConfig.keywords||[];
    const mandatory  = keywords.filter(k=>k.mode==="M").map(k=>normalizeText(k.word));
    const optional   = keywords.filter(k=>k.mode==="O").map(k=>normalizeText(k.word));
    const avecPrix   = dayConfig.avecPrix||false;
    const prixDe     = Number(dayConfig.prixDe)||0;
    const prixA      = Number(dayConfig.prixA)||0;
    const maxAds     = Number(dayConfig.maxAds)||50;
    const maxPerSite = Number(dayConfig.maxHitsPerSite)||20;
const persistedSeen = await kvGet(KV_KEYS.seenUrls).then(v => Array.isArray(v) ? v : []);
const deletedUrls = await kvGet(DELETED_KEY).then(v => Array.isArray(v) ? v : []);
const deletedSet = new Set(deletedUrls.map(normalizeUrlKey));


const seenUrls = new Set([
  ...(listings || []).map(l => l.url).filter(Boolean).map(normalizeUrlKey),
  ...persistedSeen.map(normalizeUrlKey)
]);

    const configuredDelay = Number(dayConfig.minDelayMs ?? 0);
    const getDelayMs = () => configuredDelay>0 ? configuredDelay : randomBetween(220, 520);
    const found = [];
    const stepLog = [];


    addLog(`⚙️ Config: maxAds=${maxAds} maxPerSite=${maxPerSite} keywords=${keywords.length} avecPrix=${avecPrix} delay=${configuredDelay>0?configuredDelay+'ms':'smart'}`);

    for(const site of sites) {
      if(found.length >= maxAds) break;
      addLog(`🔍 Fetching: ${site}`);
      try {
        
const isAvito = /avito\.ma/i.test(site);
if(isAvito) {

console.log("[SEARCH][AVITO][GLOBALS]", {
  typeTaxes: window.__pma_typeTaxes__,
  catTerms: window.__pma_catTerms__,
  villeTerms: window.__pma_villeTaxTerms__,
});

  const adapter = siteAdapters?.avito || DEFAULT_SITE_ADAPTERS.avito;
  const typeMappings = adapter.typeMappings || {};

  // ── FIX A: flatMap through taxonomy.terms to find by term ID ──
  const allTypeTerms = (window.__pma_typeTaxes__||[]).flatMap(t=>t.terms||[]);

  const selectedTypeNames = new Set((dayConfig.types||[]).map(id=>{
    const term = allTypeTerms.find(t=>t.id===id);
    return normalizeText(term?.name?.replace(/^[^:]+:\s*/,"").replace(/^Type\s+/i,"")||"");
  }).filter(Boolean));

  const selectedCategoryNames = new Set((dayConfig.categories||[]).map(id=>{
    const term=(window.__pma_catTerms__||[]).find(t=>t.id===id);
    return normalizeText(term?.name||"");
  }).filter(Boolean));

  const allowedCats = new Set();
  const resultPageSlugs = new Set();

  const collectFromLabel = (labelNorm) => {
    Object.entries(typeMappings).forEach(([k, v]) => {
      if (normalizeText(k) === labelNorm) {
        const adRaw = v?.adView || "";
        adRaw.split(",").map(s=>s.trim()).filter(Boolean).forEach(x=>allowedCats.add(x));
        const rp = (v?.resultsPage || "").trim();
        if (rp) resultPageSlugs.add(rp);
      }
    });
  };

  [...selectedTypeNames].forEach(collectFromLabel);
  [...selectedCategoryNames].forEach(collectFromLabel);

  const baseSite = (adapter.site || "https://www.avito.ma").replace(/\/+$/,"");
  const locale   = (adapter.locale || "fr").trim();
  const country  = (adapter.defaultCountry || "maroc").trim();

  // ── FIX B: use selected villes to build per-city URLs ──


const selectedVilleSlugs = (dayConfig.villes || [])
  .map(id => {
    const v = (window.__pma_villeTaxTerms__ || []).find(t => t.id === id);
    return v?.slug || normalizeText(v?.name || "").replace(/\s+/g, "-");
  })
  .filter(Boolean);

console.log("[SEARCH][VILLES]", {
  rawIds: dayConfig.villes,
  selectedVilleSlugs
});

  const citiesToUse = selectedVilleSlugs.length>0 ? selectedVilleSlugs : [country];

  let resultPages = [];
  if(resultPageSlugs.size>0){
    for(const city of citiesToUse){
      for(const slug of [...resultPageSlugs]){
        resultPages.push(`${baseSite}/${locale}/${city}/${slug}`);
      }
    }
  } else {
    resultPages = [site];
  }

  addLog(`  → Pages résultats Avito: ${resultPages.length} (villes: ${citiesToUse.join(", ")})`);

console.log("[SEARCH][PAGES]", {
  citiesToUse,
  resultPages
});

  let urls = [];
  for (const resultPageUrl of resultPages) {
    addLog(`  → Fetch RAW results: ${resultPageUrl}`);
    const r = await fetch(`/api/kv?action=fetch_raw&url=${encodeURIComponent(resultPageUrl)}`);
    const d = await r.json();
    const html = d.html || "";
    addLog(`    → RAW HTML: ${html.length} chars`);
    if(!html){ addLog(`    ⚠ HTML brut vide`,"warn"); continue; }

    const extracted = [...new Set(
      [...html.matchAll(/href="(https:\/\/www\.avito\.ma\/fr\/[^"]+?_\d+\.htm)"/g)].map(m=>m[1])
    )].filter(u=>{
      try {
        const p = new URL(u).pathname;
        return p.startsWith('/fr/') && p.endsWith('.htm') && p.split('/').length >= 5 && !p.includes('/boutiques/') && !p.includes('/maroc/');
      } catch { return false; }
    });

    addLog(`    → ${extracted.length} URLs Avito candidates`);
    urls.push(...extracted);
  }

  urls = [...new Set(urls)];

  if(allowedCats.size>0) {
    urls = urls.filter(u=>{ 
      try { 
        return allowedCats.has(new URL(u).pathname.split('/').filter(Boolean)[2]||""); 
      } catch { 
        return false; 
      } 
    });
    addLog(`  → ${urls.length} après mapping Type→Avito`);
  }

const effectiveMandatory = [...mandatory];

// ── BUG #2 FIX: when adapter has no mapping for selected types, filter by type name as keyword ──
if (allowedCats.size === 0 && (dayConfig.types?.length > 0 || dayConfig.termes?.length > 0)) {
  const allTerms = (window.__pma_typeTaxes__ || []).flatMap(t => t.terms || []);
  const typeKeywords = [...new Set([
    ...(dayConfig.types || []),
    ...(dayConfig.termes || [])
  ])].map(id => {
    const term = allTerms.find(t => t.id === id);
    return normalizeText(
      term?.name?.replace(/^[^:]+:\s*/, "").replace(/^Type\s+/i, "") || ""
    );
  }).filter(Boolean);

  if (typeKeywords.length > 0) {
    addLog(`  → No adapter mapping — injecting type keywords as mandatory: [${typeKeywords.join(", ")}]`);
    effectiveMandatory.push(...typeKeywords);
  }
}

  let siteCount = 0;

console.log("[SEARCH][URLS BEFORE FILTER]", {
  totalExtracted: urls.length,
  seenUrlsSize: seenUrls.size
});

  for(const url of urls) {
  
          if(found.length >= maxAds || siteCount >= maxPerSite) break;

          const urlKey = normalizeUrlKey(url);

          if (deletedSet.has(urlKey)) continue;
          if (seenUrls.has(urlKey)) continue;

          try {
            const r2 = await fetch(`/api/kv?action=fetch_url&url=${encodeURIComponent(url)}`);
            const d2 = await r2.json();
            const pageHtml = d2.html || d2.content || "";
            const sample = normalizeText(pageHtml);
            if(!pageHtml || pageHtml.length < 900) continue;
            if (effectiveMandatory.length && !effectiveMandatory.every(w => sample.includes(w))) continue;
            if(optional.length && !optional.some(w=>sample.includes(w))) continue;
            if(avecPrix) {
              const m = pageHtml.match(/([0-9][0-9\s ]*)\s*DH/i);
              const p = m ? Number(String(m[1]).replace(/[^\d]/g,"")) : null;
              if(p!==null) {
                if(prixDe>0 && p<prixDe) continue;
                if(prixA>0 && p>prixA) continue;
              }
            }
            found.push(url);
            seenUrls.add(urlKey);
            siteCount++;
            const delayMs = getDelayMs();
            addLog(`    ✅ URL retenue (${delayMs}ms): ${url}`,"success");
            await sleep(delayMs);
          } catch {}

          }
          stepLog.push({site,rawFound:urls.length,kept:siteCount,mode:'fetch_raw'});
          addLog(`  → ✅ ${siteCount} URL(s) retenues depuis Avito`,"success");
        } else {
          const r = await fetch(`/api/kv?action=fetch_url&url=${encodeURIComponent(site)}`);
          const d = await r.json();
          const html = d.html || d.content || "";
          addLog(`  → HTML: ${html.length} chars`);
          if(!html){ addLog(`⚠ HTML vide — vérifier URL et accès site`,"warn"); continue; }
          const rawUrls = [];
          const baseUrl = new URL(site);
          const baseHost = baseUrl.hostname;
          const absPattern = /href="(https?:\/\/[^"#?]{20,}?)"/g;
          const relPattern = /href=['"](\/[^'"#?]{10,}?)['"]/g;
          let m;
          while((m=absPattern.exec(html))!==null) { try { const u=m[1]; if(new URL(u).hostname!==baseHost) continue; if(!rawUrls.includes(u)) rawUrls.push(u);} catch {} }
          while((m=relPattern.exec(html))!==null) { try { const u=baseUrl.origin+m[1]; if(!rawUrls.includes(u)) rawUrls.push(u);} catch {} }
          const skipPatterns = [/\/(search|recherche|categor|login|register|page|static|cdn|img|css|js|api)\//i,/\.(jpg|png|gif|svg|css|js|ico|woff)$/i];
          const listingUrls = rawUrls.filter(u => { const path = new URL(u).pathname; return path.length > 10 && !skipPatterns.some(p=>p.test(u)); });
          let siteCount = 0;
          for(const url of listingUrls) {
            if(found.length >= maxAds || siteCount >= maxPerSite) break;
            if(seenUrls.has(url)) continue;
            const idx = html.indexOf(url.replace(baseUrl.origin,""));
            const snippet = (idx>-1 ? html.substring(Math.max(0,idx-400),idx+400) : "").replace(/<[^>]+>/g," ").replace(/\s+/g," ").toLowerCase();
            if(mandatory.length>0 && !mandatory.every(w=>snippet.includes(w))) continue;
            if(optional.length>0  && !optional.some(w=>snippet.includes(w))) continue;
            found.push(url); siteCount++; seenUrls.add(url);
            const delayMs = getDelayMs();
            addLog(`    ✅ URL retenue (${delayMs}ms): ${url}`,"success");
            await sleep(delayMs);
          }
          stepLog.push({site,rawFound:rawUrls.length,kept:siteCount,mode:'fetch_url'});
          addLog(`  → ✅ ${siteCount} URL(s) retenues depuis ce site`,"success");
        }
      } catch(e) {
        addLog(`❌ Fetch error: ${e.message}`,"error");
        stepLog.push({site,error:e.message});
      }
    }

    if(found.length>0) await kvSet(KV_KEYS.seenUrls, [...seenUrls]);
    addLog(found.length>0 ? `✅ Total: ${found.length} URL(s) valides trouvées` : `⚠ 0 résultats — vérifier URL site et filtres`, found.length>0?"success":"warn");
    return {urls:found, log:stepLog};
  },



  // ── 📋 CRÉER URL RECORDS ───────────────────────────────────
  async createUrlRecords(urls, dayConfig, day, week, listings, persist, addLog) {
    const existing = new Set(listings.map(l=>l.url));
    const toCreate = urls.filter(u=>!existing.has(u));
    if(!toCreate.length){ addLog("ℹ Tous les URLs existent déjà","info"); return {created:0,skipped:urls.length}; }

    const newListings = toCreate.map(url => ({
      id: uid(),
      url,
      mode: "auto",
      status: "initial",
      isoWeek: week,
      createdAt: new Date().toISOString(),
      // Placeholder phone — obviously fake, will be replaced by real if found
      phone: generatePlaceholderPhone(),
      phonePlaceholder: true,
phoneStatus: "not_revealed",
phoneSource: "placeholder",
      username: "",
      email: "",
      dayConfig: {day, week},
      sourceConfig: {
        site: url,
        keywords: dayConfig.keywords||[],
        categories: dayConfig.categories||[],
        types: dayConfig.types||[],
        villes: dayConfig.villes||[],
        withImage: dayConfig.withImage,
      },
      generated: null,
      categoryTermId: (dayConfig.categories||[])[0]||"",
      subCategoryTaxId: "",
      subCategoryTermId: "",
    }));

    const updated = [...newListings, ...listings];
    await persist(updated);
    const seen = await kvGet(KV_KEYS.seenUrls).then(v=>Array.isArray(v)?v:[]);
    await kvSet(KV_KEYS.seenUrls, [...new Set([...seen, ...urls])]);
    addLog(`✅ ${toCreate.length} records créés · ${urls.length-toCreate.length} déjà existants`, "success");
    return {created:toCreate.length, skipped:urls.length-toCreate.length, newListings};
  },

  // ── ✍️ GENERATE (delegates to main generate fn) ─────────────
  // Called per-listing from TabSemaine with the generate() fn from main component

  // ── 👤 SYNC USERNAME ────────────────────────────────────────

async validateUsernamePhone(listing, addLog) {
  addLog(`👤 Validation username/téléphone: ${listing.url}`);

  const existingUsername = (listing.username || "").trim();

  let revealedPhone = "";
  let revealedUsername = existingUsername;
  let buttonType = "";
  let revealReason = "";

  try {
    const r = await fetch("/api/wordpress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "phone_reveal",
        url: listing.url,
        site: /avito\.ma/i.test(listing.url || "") ? "avito" : "generic"
      })
    });

    const raw = await r.text();

    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      throw new Error(`Réponse phone_reveal non JSON: ${raw.slice(0, 180)}`);
    }

    if (!r.ok) {
      throw new Error(d?.error || d?.message || `HTTP ${r.status}`);
    }


revealedPhone = normalizePhoneMA(d.phone || "");
revealedUsername = (d.username || existingUsername || "").trim();
buttonType = d.buttonType || "";
revealReason = d.reason || "";

const finalUsername = revealedUsername || listing.username || "";
const finalPhone = isRealPhoneMA(revealedPhone) ? revealedPhone : listing.phone || "";
const finalWpUsername = buildWpUsernameFromPhone(finalUsername, finalPhone);

const basePatch = {
  username: finalUsername,
  wpUsername: finalWpUsername,
  email: finalWpUsername
    ? (listing.email || generateEmail(finalWpUsername))
    : (listing.email || ""),

      phoneMeta: {
        ...(listing.phoneMeta || {}),
        checkedAt: new Date().toISOString(),
        source: d.revealed ? "auto_reveal" : "auto_reveal_failed",
        buttonType,
        reason: revealReason
      }
    };

    if (isRealPhoneMA(revealedPhone)) {
      const successPatch = buildPhoneStatePatch({
        ...listing,
        ...basePatch,
        phone: revealedPhone,
        phonePlaceholder: false,
        phoneSource: "auto_reveal",
        phoneStatus: "revealed",
        status: "phone_revealed",
        generated: {
          ...(listing.generated || {}),
          fieldStates: {
            ...(listing.generated?.fieldStates || {}),

vendeur: finalUsername ? "approved" : "draft",
username: finalUsername ? "approved" : "draft",
wpUsername: finalWpUsername ? "approved" : "draft",

            phone: "approved"
          }
        }
      });

      addLog(`  ✅ Téléphone révélé: ${revealedPhone}`, "success");
      return { pass: true, patch: successPatch };
    }

    const failPatch = {
      ...listing,
      ...basePatch,
      phoneStatus: "not_revealed",
      status: "phone_not_revealed",
      phoneSource: listing.phoneSource || "placeholder",
      generated: {
        ...(listing.generated || {}),
        fieldStates: {
          ...(listing.generated?.fieldStates || {}),

vendeur: finalUsername ? "approved" : "draft",
username: finalUsername ? "approved" : "draft",
wpUsername: finalWpUsername ? "approved" : "draft",

          phone: "draft"
        }
      }
    };

    addLog(`  ❌ Téléphone non révélé — ${revealReason || "raison inconnue"}`, "error");    return { pass: false, patch: failPatch };

  } catch (e) {
    const failPatch = {
      ...listing,
      phoneStatus: "not_revealed",
      status: "phone_not_revealed",
      phoneMeta: {
        ...(listing.phoneMeta || {}),
        checkedAt: new Date().toISOString(),
        source: "auto_reveal_failed",
        reason: e.message
      },
      generated: {
        ...(listing.generated || {}),
        fieldStates: {
          ...(listing.generated?.fieldStates || {}),
          vendeur: existingUsername ? "approved" : "draft",
          username: existingUsername ? "approved" : "draft",
          phone: "draft"
        }
      }
    };

    addLog(`  ❌ Erreur reveal phone: ${e.message}`, "error");
    return { pass: false, patch: failPatch };
  }
},



// ── ✅ APPROUVER CHAMPS CLÉS ──────────────────────────────
async approveKeyFields(listing, listings, villeTax, persist, addLog) {
  const gen = listing.generated || {};
  const fieldStates = { ...(gen.fieldStates || {}) };

  const categoryTermId =
    String(
      listing.categoryTermId ||
      gen.category?.termId ||
      ""
    ).trim();

  const typeTermId =
    String(
      listing.subCategoryTermId ||
      gen.type?.termId ||
      ""
    ).trim();

  const categoryOk = !!categoryTermId;
  const typeOk = !!typeTermId;

  fieldStates.category = categoryOk ? "approved" : "missing";
  fieldStates.type = typeOk ? "approved" : "missing";

  const results = {
    category: {
      pass: categoryOk,
      reason: categoryOk ? categoryTermId : "Catégorie manquante"
    },
    type: {
      pass: typeOk,
      reason: typeOk ? typeTermId : "Terme manquant"
    }
  };

  const allPass = categoryOk && typeOk;
  const newStatus = allPass ? "key_approved" : "key_missing";

  const newGen = {
    ...gen,
    fieldStates
  };

  const upd = listings.map(l =>
    l.id === listing.id
      ? {
          ...l,
          status: newStatus,
          generated: newGen,
          keyApprovalResult: results
        }
      : l
  );

  await persist(upd);

  Object.entries(results).forEach(([k, v]) =>
    addLog(
      `  ${v.pass ? "✅" : "❌"} ${k}: ${v.reason}`,
      v.pass ? "success" : "error"
    )
  );

  addLog(
    allPass
      ? "✅ Champs clés approuvés"
      : "⚠ Champs clés manquants — révision manuelle requise",
    allPass ? "success" : "warn"
  );

  return { pass: allPass, results };
},

// ── 🎯 APPROUVER CHAMPS CIBLES ────────────────────────────
async approveSecFields(listing, listings, mapping, secondaryFields, persist, addLog, wantsImage = false) {
  const gen = listing.generated || {};
  const secFields = [...(gen.secondaryFields || [])];
  const fieldStates = { ...(gen.fieldStates || {}) };

  const findIndexByName = (pred) =>
    secFields.findIndex(sf => pred(normalizeText(sf.taxName || ""), sf));

  const villeIndex = findIndexByName(n => n.includes("ville"));
  const quartierIndex = findIndexByName(n => n.includes("quartier"));
  const prixIndex = findIndexByName((n, sf) =>
    n.includes("prix") || String(sf.wpMetaKey || "").includes("listivo_13")
  );

  const descriptionVal = String(gen.description || "").trim();

const titleVal = String(gen.title || "").trim();

  const villeVal =
    villeIndex > -1 ? String(secFields[villeIndex]?.value || "").trim() : "";

  const quartierVal =
    quartierIndex > -1 ? String(secFields[quartierIndex]?.value || "").trim() : "";

  const prixRaw =
    prixIndex > -1 ? String(secFields[prixIndex]?.value ?? "").trim() : "";

const photoVal = String(
  gen.photoUrl ||
  gen.photos ||
  gen.sourceImages?.[0]?.storedUrl ||
  gen.sourceImages?.[0]?.url ||
  gen.sourceExtract?.photoUrl ||
  gen.sourceExtract?.imageUrl ||
  gen.sourceExtract?.images?.[0] ||
  listing.approvedImageUrl ||
  listing.generatedImg ||
  ""
).trim();

const addressSecondaryIndex = findIndexByName(n =>
  n.includes("address") || n.includes("adresse")
);

const addressSecondaryVal =
  addressSecondaryIndex > -1
    ? String(secFields[addressSecondaryIndex]?.value || "").trim()
    : "";

const addressVal = String(
  addressSecondaryVal ||
  gen.address ||
  gen.adresse ||
  gen.locationAddress ||
  gen.sourceExtract?.address ||
gen.sourceExtract?.rawFields?.address ||
  gen.sourceExtract?.rawFields?.adresse_boutique ||
  ""
).trim();

  const descriptionOk = !!descriptionVal;
const titleOk = !!titleVal;
  const villeOk = !!villeVal;
  const quartierOk = !!quartierVal;
  const prixOk =
    prixRaw !== "" &&
    !isNaN(Number(String(prixRaw).replace(/[^\d.-]/g, "")));
  const photoOk = !!photoVal;
  const addressOk = !!addressVal;

fieldStates.titre = titleOk ? "approved" : "missing";
  fieldStates.description = descriptionOk ? "approved" : "missing";

  if (villeIndex > -1) {
    fieldStates[`sec_${villeIndex}`] = villeOk ? "approved" : "missing";
  }

if (quartierIndex > -1) {
  fieldStates[`sec_${quartierIndex}`] = "approved";
}

  if (prixIndex > -1) {
    fieldStates[`sec_${prixIndex}`] = prixOk ? "approved" : "missing";
  }

fieldStates.photos = photoOk ? "approved" : "missing";

if (addressSecondaryIndex > -1) {
  fieldStates[`sec_${addressSecondaryIndex}`] = "approved";
}

fieldStates.address = "approved";

secFields.forEach((sf, i) => {
  const name = normalizeText(sf.taxName || "");
  const value = String(sf.value || "").trim();

  if (name.includes("description")) {
    fieldStates[`sec_${i}`] = value ? "approved" : "draft";
  }

  if (name.includes("photo")) {
    fieldStates[`sec_${i}`] = value ? "approved" : "draft";
  }
});

  const results = {
    ville: {
      pass: villeOk,
      reason: villeOk ? villeVal : "Ville manquante"
    },
    description: {
      pass: descriptionOk,
      reason: descriptionOk ? "OK" : "Description manquante"
    },
    prix: {
      pass: prixOk,
      reason: prixOk ? prixRaw : "Prix manquant"
    },

quartier: {
  pass: true,
  reason: quartierOk ? quartierVal : "Optionnel vide"
},
address: {
  pass: true,
  reason: addressOk ? addressVal : "Optionnelle vide"
},

    photos: {
      pass: photoOk,
      reason: photoOk ? "Photo détectée" : "Photo manquante"
    }
  };

  const allPass =
    results.ville.pass &&
    results.description.pass &&
    results.prix.pass &&
    results.photos.pass;

  const newStatus = allPass
    ? (wantsImage ? "fields_approved" : "approval_ready")
    : "fields_missing";

  const newGen = {
    ...gen,
    secondaryFields: secFields,
    fieldStates
  };

  const upd = listings.map(l =>
    l.id === listing.id
      ? {
          ...l,
          status: newStatus,
          generated: newGen,
          secApprovalResult: results
        }
      : l
  );

  await persist(upd);


Object.entries(results).forEach(([k, v]) => {
  const isOptional = k === "quartier" || k === "address";
  const isOptionalEmpty =
    isOptional && (v.reason === "Optionnel vide" || v.reason === "Optionnelle vide");

  addLog(
    `  ${v.pass ? "✅" : "❌"} ${k}: ${v.reason}`,
    isOptionalEmpty ? "info" : (v.pass ? "success" : "error")
  );
});


  addLog(
    allPass
      ? "✅ Champs cibles approuvés"
      : "⚠ Champs cibles manquants — révision manuelle requise",
    allPass ? "success" : "warn"
  );

  return { pass: allPass, results };
},


// ── 🏷️  APPROUVER IMAGE IA ──────────────────────────────────
async approveImage(listing, listings, persist, addLog) {
  const generatedImages = Array.isArray(listing?.generated?.generatedImages)
    ? listing.generated.generatedImages.filter(img =>
        (img?.storedUrl || img?.originalUrl || img?.url || "").trim()
      )
    : [];

  const previewUrl =
    generatedImages[0]?.storedUrl ||
    generatedImages[0]?.originalUrl ||
    generatedImages[0]?.url ||
    listing.generatedImg ||
    "";

  console.log("[approveImage] start", {
    id: listing?.id,
    generatedImagesCount: generatedImages.length,
    hasGeneratedImg: !!listing?.generatedImg,
    hasApprovedImageUrl: !!listing?.approvedImageUrl
  });

  if (!previewUrl) {
    addLog("⚠ Aucune image à approuver", "warn");
    return { pass: false, reason: "no_image" };
  }

  if (listing.imgApproved && listing.imgScore) {
    addLog("ℹ Image déjà approuvée — skip", "info");
    return { pass: true, score: listing.imgScore, reason: "cached" };
  }

  addLog(
    `✅ Approbation image${generatedImages.length > 1 ? `s (${generatedImages.length})` : ""} sans analyse Claude`,
    "info"
  );

  const upd = listings.map(l =>
    l.id === listing.id
      ? {
          ...l,
          approvedImageUrl: previewUrl,
          generatedImg: previewUrl,
          imgApproved: true,
          imgScore: 100,
          generated: {
            ...(l.generated || {}),
            generatedImages: generatedImages.length
              ? generatedImages.map((img, i) => ({
                  index: i,
                  sourceIndex: img.sourceIndex ?? i,
                  storedUrl: img.storedUrl || "",
                  originalUrl: img.originalUrl || "",
                  pathname: img.pathname || ""
                }))
              : (l.generated?.generatedImages || [])
          },
          imageMeta: {
            ...(l.imageMeta || {}),
            generatedCount: generatedImages.length || 1,
            approvedCount: generatedImages.length || 1,
            reviewMode: "auto_skip_claude",
            reviewedAt: new Date().toISOString(),
            reviewReason: "Image(s) auto-approuvée(s)"
          },
          status: "approval_ready"
        }
      : l
  );

  await persist(upd);

  return {
    pass: true,
    score: 100,
    reason: "Image(s) auto-approuvée(s)"
  };
},

// ── 📝 APPROUVER ANNONCE ──────────────────────────────────
async approveAll(listing, listings, persist, addLog) {
  const gen = listing.generated || {};

  const fs = gen.fieldStates || {};

  const secFields = Array.isArray(gen.secondaryFields) ? gen.secondaryFields : [];

  const titleApproved = fs.titre === "approved";
  const descriptionApproved = fs.description === "approved";
  const categoryApproved = fs.category === "approved";
  const typeApproved = fs.type === "approved";

  const usernameOk = !!String(listing.username || "").trim();
  const phoneRevealed =
    !!String(listing.phone || "").trim() &&
    String(listing.phoneStatus || "") === "revealed";

  const phoneApproved = fs.phone === "approved";

  const secChecks = secFields.map((sf, i) => {
    const relation = String(sf?.relation || "").trim().toUpperCase();
    const isMandatory = relation === "M";
    const state = fs[`sec_${i}`] || "draft";
    const label = sf?.taxName || sf?.label || `Champ ${i + 1}`;

    return {
      index: i,
      label,
      mandatory: isMandatory,
      state,
      pass: isMandatory ? state === "approved" : true
    };
  });

  const mandatorySecFails = secChecks.filter(c => c.mandatory && !c.pass);

  const generatedImagesCount = Array.isArray(gen.generatedImages)
  ? gen.generatedImages.length
  : 0;

const photosOk =
  (fs.photos === "approved" || fs.photos === "draft") &&
  (
    generatedImagesCount > 0 ||
    !!listing.generatedImg ||
    !!listing.approvedImageUrl
  );

  const addressOk =
    !fs.address ||
    fs.address === "initial" ||
    fs.address === "draft" ||
    fs.address === "approved";

  const checks = [
    { k: "titre", pass: titleApproved, label: "Titre approuvé" },
    { k: "description", pass: descriptionApproved, label: "Description approuvée" },
    { k: "category", pass: categoryApproved, label: "Catégorie approuvée" },
    { k: "type", pass: typeApproved, label: "Type / Terme approuvé" },
    { k: "username", pass: usernameOk, label: "Username valide" },
    { k: "phone_revealed", pass: phoneRevealed, label: "Téléphone révélé" },
    { k: "phone_approved", pass: phoneApproved, label: "Téléphone approuvé" },
    { k: "photos", pass: photosOk, label: "Photo détectée" },
    { k: "address", pass: addressOk, label: "Adresse cohérente" },
    {
      k: "mandatory_secondary",
      pass: mandatorySecFails.length === 0,
      label: "Champs secondaires obligatoires approuvés"
    }
  ];

  const fails = checks.filter(c => !c.pass);

  checks.forEach(c =>
    addLog(`  ${c.pass ? "✅" : "❌"} ${c.label}`, c.pass ? "success" : "error")
  );

  if (mandatorySecFails.length) {
    mandatorySecFails.forEach(c =>
      addLog(`    ❌ Secondaire obligatoire non approuvé: ${c.label}`, "error")
    );
  }

  const optionalDrafts = secChecks.filter(c => !c.mandatory && c.state !== "approved");
  if (optionalDrafts.length) {
    optionalDrafts.forEach(c =>
      addLog(`    ℹ Optionnel laissé en brouillon: ${c.label}`, "info")
    );
  }

  const pass = fails.length === 0;

  if (pass) {
    const upd = listings.map(l =>
      l.id === listing.id
        ? {
            ...l,
            status: "user_ready",
            approvedAt: new Date().toISOString()
          }
        : l
    );

    await persist(upd);
    addLog("✅ Annonce approuvée — prête pour création compte", "success");
  } else {
    addLog(`⚠ ${fails.length} condition(s) non remplies — révision manuelle requise`, "warn");
  }

console.log("[approveAll][debug]", {
  id: listing.id,
  url: listing.url,
  fieldStates: fs,
  titleApproved,
  descriptionApproved,
  categoryApproved,
  typeApproved,
  usernameOk,
  phoneRevealed,
  phoneApproved,
  photosOk,
  addressOk,
  secChecks,
  mandatorySecFails
});

  return {
    pass,
    fails: fails.map(c => c.label)
  };

},


// ── 🆕 CRÉER USERNAME WP ──────────────────────────────────
async createWpUser(listing, listings, persist, addLog) {
  const normalizeCompteUsername = (s = "") =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

  const username = String(listing.username || "").trim();
  const exactLastName = username;
  const phone = String(listing.phone || "").trim();

  if (!username) {
    addLog("❌ Username manquant", "error");
    return { pass: false, error: "username_missing" };
  }

  const cleanUsername = normalizeCompteUsername(username);
  const normalizedPhone = normalizePhoneMA(phone || "");

  const comptes = await kvGet(KV_KEYS.comptes).then(v => Array.isArray(v) ? v : []);

  const existingCompteByPhone = comptes.find(c =>
    normalizePhoneMA(c.phone || "") === normalizedPhone
  );

  const existingCompteByUsername = comptes.find(c =>
    normalizeCompteUsername(c.username || "") === cleanUsername
  );

  const existingCompte = existingCompteByPhone || existingCompteByUsername || null;

  const patchListing = (l, extra = {}) => ({
    ...l,
    ...extra,
    generated: {
      ...(l.generated || {}),
      fieldStates: {
        ...(l.generated?.fieldStates || {}),
        username: "approved",
        phone: "approved"
      }
    }
  });

  if (listing.wpUserId) {
    const upd = listings.map(l =>
      l.id === listing.id
        ? patchListing(l, { status: "publish_ready" })
        : l
    );

    await persist(upd);
    addLog(`ℹ Listing déjà lié: wpUserId=${listing.wpUserId}`, "info");

    return { pass: true, mode: "linked", existing: true, wpUserId: listing.wpUserId };
  }

  if (existingCompte?.wpUserId) {
    const email = existingCompte.email || listing.email || generateEmail(cleanUsername);
    const password = existingCompte.password || listing.password || "Travito@123";

    const upd = listings.map(l =>
      l.id === listing.id
        ? patchListing(l, {
            wpUserId: existingCompte.wpUserId,
            email,
            status: "publish_ready",
            wpCreatedAt: existingCompte.wpCreatedAt || new Date().toISOString()
          })
        : l
    );

    await persist(upd);

    const nextComptes = comptes.map(c =>
      c.id === existingCompte.id
        ? {
            ...c,
            email,
            password,
            wpUserId: existingCompte.wpUserId,
            wpCreatedAt: c.wpCreatedAt || new Date().toISOString(),
            locked: true
          }
        : c
    );

    await kvSet(KV_KEYS.comptes, nextComptes);

    addLog(
      `✅ Compte WP réutilisé depuis KV: ${cleanUsername} (ID ${existingCompte.wpUserId})`,
      "success"
    );

    return { pass: true, mode: "linked", existing: true, wpUserId: existingCompte.wpUserId };
  }

const wpUsername = buildWpUsernameFromPhone(
  cleanUsername || listing.username || "",
  normalizedPhone || phone || listing.phone || ""
);

addLog(`🆕 Création nouveau compte WP: ${wpUsername}`);

try {
  const email = listing.email || existingCompte?.email || generateEmail(wpUsername);
  const password = existingCompte?.password || listing.password || "Travito@123";

  const r = await fetch("/api/wordpress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_user",
      username: wpUsername,
      password,
      phone: normalizedPhone || phone || "",
      lastName: exactLastName
    })
  });

  const d = await r.json();

  if (!d.success && !d.existing) {
    throw new Error(d.error || d.message || "Échec création");
  }

  const wpUserId = d.userId || d.id;
  const isExisting = !!(d.existing || d.reused);

  const upd = listings.map(l =>
    l.id === listing.id
      ? patchListing(l, {
          wpUserId,
          username: cleanUsername,
          wpUsername: d.username || wpUsername,
          email,
          status: "publish_ready",
          wpCreatedAt: new Date().toISOString()
        })
      : l
  );

    await persist(upd);

    let nextComptes;
    if (existingCompte) {
      nextComptes = comptes.map(c =>
        c.id === existingCompte.id
          ? {
              ...c,
              username: cleanUsername,
              phone: normalizedPhone || c.phone || "",
              email,
              password,
              wpUserId,
              wpCreatedAt: c.wpCreatedAt || new Date().toISOString(),
              locked: true
            }
          : c
      );
    } else {
      nextComptes = [
        ...comptes,
        {
          id: uid(),
          username: cleanUsername,
          phone: normalizedPhone,
          email,
          password,
          wpUserId,
          wpCreatedAt: new Date().toISOString(),
          locked: true,
          createdAt: new Date().toISOString()
        }
      ];
    }

    await kvSet(KV_KEYS.comptes, nextComptes);

    addLog(
      isExisting
        ? `✅ Compte déjà existant dans WP — lié: ${cleanUsername} (WP ID ${wpUserId})`
        : `✅ Compte créé: ${cleanUsername} (WP ID ${wpUserId})`,
      "success"
    );

    return {
      pass: true,
      mode: isExisting ? "linked" : "created",
      existing: isExisting,
      wpUserId
    };
  } catch (e) {
    addLog(`❌ Erreur création compte: ${e.message}`, "error");
    return { pass: false, error: e.message };
  }
},



// ── 📢 PUBLIER SUR TRAVITO.MA ──────────────────────────────────

async publishToTravito(listing, listings, persist, addLog, primaryFields) {
  const freshListing = listings.find(l => l.id === listing.id) || listing;
  const gen = freshListing.generated || {};

  const comptes = await kvGet(KV_KEYS.comptes).then(v => Array.isArray(v) ? v : []);

  const cleanUsername = String(freshListing.username || "").trim().toLowerCase();
  const compte = comptes.find(
    c => String(c.username || "").trim().toLowerCase() === cleanUsername
  );

  const generatedImages = Array.isArray(freshListing.generated?.generatedImages)
    ? freshListing.generated.generatedImages
        .map(img => img?.storedUrl || img?.originalUrl || img?.url || "")
        .filter(Boolean)
    : [];

  const aiImageUrl =
    freshListing.approvedImageUrl ||
    generatedImages[0] ||
    null;

  const aiImageUrls =
    generatedImages.length > 0
      ? generatedImages
      : (aiImageUrl ? [aiImageUrl] : []);

  const catTax =
    primaryFields.find(
      t =>
        t.name?.toLowerCase().includes("categ") ||
        t.slug?.toLowerCase().includes("categ")
    ) || primaryFields[0];

  const subTaxId = freshListing.subCategoryTaxId || gen.type?.taxId || "";
  const subTx = primaryFields.find(t => t.id === subTaxId);

  const categoryTermId = freshListing.categoryTermId || gen.category?.termId || "";
  const categoryTerm = catTax?.terms?.find(t => t.id === categoryTermId);

  const subCategoryTermId = freshListing.subCategoryTermId || gen.type?.termId || "";
  const subCategoryTerm = subTx?.terms?.find(t => t.id === subCategoryTermId);

  const secFields = Array.isArray(gen.secondaryFields) ? gen.secondaryFields : [];

  const findSecondaryField = (namePart) =>
    secFields.find(sf => String(sf?.taxName || "").toLowerCase().includes(namePart));

  const villeField = findSecondaryField("ville");
  const quartierField = findSecondaryField("quart");

  const slugify = (s = "") =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");

  const typeSlug = slugify(subTx?.slug || subTx?.name || "");
  const termSlug = slugify(subCategoryTerm?.slug || subCategoryTerm?.name || categoryTerm?.slug || categoryTerm?.name || "");
  const villeSlug = slugify(villeField?.value || "");
  const quartierSlug = slugify(quartierField?.value || "");

  const customSlug = [
    typeSlug,
    termSlug,
    villeSlug,
    quartierSlug
  ].filter(Boolean).join("-");

  const body = {
    action: freshListing.wpPostId ? "update_listing" : "publish_listing",
    postId: freshListing.wpPostId || null,

    ...(customSlug ? { slug: customSlug } : {}),
    content: gen.description || "",

    authorId: compte?.wpUserId || freshListing.wpUserId || null,

    categoryTermId: categoryTermId,
    categoryTermName:
      gen.category?.name ||
      categoryTerm?.name ||
      "",

    subCategoryTaxId: subTaxId,
    subCategoryTaxSlug: (() => {
      const tx = primaryFields.find(
        t => t.id === subTaxId
      );
      return tx?.wpMetaKey || "";
    })(),
    subCategoryTermId: subCategoryTermId,
    subCategoryTermName:
      gen.type?.name ||
      subCategoryTerm?.name ||
      "",

    primaryTaxSlug: (() => {
      const tx = primaryFields.find(
        t =>
          t.name?.toLowerCase().includes("categ") ||
          t.slug?.toLowerCase().includes("categ")
      );
      return tx?.wpMetaKey || "listivo_23016";
    })(),

    phone: freshListing.phone || compte?.phone || "",
    email: freshListing.email || generateEmail(freshListing.username),

    imageUrl: aiImageUrl || null,
    imageUrls: aiImageUrls,

    secondaryFields: secFields.map((sf, i) => ({
      taxName: sf.taxName || "",
      taxId: sf.taxId || "",
      wpMetaKey: sf.wpMetaKey || "",
      wpMetaType: sf.wpMetaType || "",
      fieldType: sf.fieldType || "",
      value: sf.value ?? "",
      fieldState: gen.fieldStates?.[`sec_${i}`] || null,
    })),

    fieldStates: gen.fieldStates || {},
  };

  if (!body.authorId) {
    addLog(`❌ Aucun wpUserId pour publier: ${freshListing.username || freshListing.id}`, "error");
    return { pass: false, error: "missing_wpUserId" };
  }

  try {
    addLog(`📢 Publication Travito: ${freshListing.url}`);

    const payload = JSON.stringify(body);

    console.log("📦 publish payload size:", new Blob([payload]).size, "bytes");
    console.log("📦 publish payload preview:", {
      secondaryFieldsCount: Array.isArray(body.secondaryFields) ? body.secondaryFields.length : 0,
      fieldStatesCount: body.fieldStates ? Object.keys(body.fieldStates).length : 0,
      imageUrlsCount: Array.isArray(body.imageUrls) ? body.imageUrls.length : 0,
      slug: body.slug || "",
      contentLen: (body.content || "").length,
    });

    const r = await fetch("/api/wordpress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    const raw = await r.text();

    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      throw new Error(`/api/wordpress returned non-JSON (${r.status}): ${raw.slice(0, 200)}`);
    }

    if (!d.success) {
      throw new Error(d.error || d.message || `Échec publication (${r.status})`);
    }

    const upd = listings.map(l =>
      l.id === freshListing.id
        ? {
            ...l,
            wpUserId: body.authorId,
            wpPostId: d.postId,
            wpPostedAt: new Date().toISOString(),
            status: "published"
          }
        : l
    );

    await persist(upd);

    addLog(
      `${freshListing.wpPostId ? "🔄 Annonce mise à jour" : "✅ Annonce publiée"} — Post ID ${d.postId}`,
      "success"
    );

    return {
      pass: true,
      postId: d.postId,
      updated: !!freshListing.wpPostId,
      fields: d.fields || {}
    };
  } catch (e) {
    addLog(`❌ Erreur publication: ${e.message}`, "error");
    return { pass: false, error: e.message };
  }
},

// ── SUPPRIMER DEPUIS AGENTS TRAVITO ─────────────────────
async deleteFromAgents(listing, listings, persist, addLog) {
  return await hardDeleteListing(listing, listings, persist, addLog);
},

};



// ── Tab: Log (AGGREGATED FROM pm_listings) ─────────────────────
function TabLog({ logs, onClear }) {

const [listings, setListings] = useState([]);
const [seenUrls, setSeenUrls] = useState([]);
const [selectedWeek, setSelectedWeek] = useState("auto");
const [loading, setLoading] = useState(true);

useEffect(() => {
    Promise.all([
      kvGet("travito:pm_listings"),
      kvGet("travito:pm_seen_urls"),
    ]).then(([l, s]) => {
      setListings(Array.isArray(l) ? l : []);
      setSeenUrls(Array.isArray(s) ? s : []);
      setLoading(false);
    });
  }, []);

  const seenSet = new Set(seenUrls);

  const isoWeeks = [...new Set(
    listings.map(l => l.isoWeek).filter(Boolean)
  )].sort().reverse();

  const currentWeek = isoWeeks[0] || "all";

  const effectiveWeek = selectedWeek === "auto" ? currentWeek : selectedWeek;

  const filteredListings = listings.filter(l => {
    if (effectiveWeek === "all") return true;
    return l.isoWeek === effectiveWeek;
  });

  const grouped = new Map();

  for (const l of filteredListings) {
    const day = l?.dayConfig?.day || "Sans jour";

    if (!grouped.has(day)) {
      grouped.set(day, {
        day,
        seen: 0,
        urls: 0,
        records: 0,
        generated: 0,
        approveKey: 0,
        approveSec: 0,
        images: 0,
        published: 0,
        errors: 0,
        users: new Set(), // 👈 NEW metric
      });
    }

    const g = grouped.get(day);

    if (l.url && seenSet.has(l.url)) g.seen++;
    if (l.url) g.urls++;
    if (l.id) g.records++;
    if (l.generatedAt || l.generated) g.generated++;
    if (l.keyApprovalResult) g.approveKey++;
    if (l.secApprovalResult) g.approveSec++;
    if (l.approvedImageUrl || l.imgApproved) g.images++;
    if (l.status === "published" || l.wpPostId) g.published++;

    // 👇 UNIQUE USERS CREATED
    if (l.wpUserId) g.users.add(l.wpUserId);

    if (
      l.status === "error" ||
      l.phoneStatus === "failed"
    ) {
      g.errors++;
    }
  }

  const rows = [...grouped.values()].sort((a, b) => {
    const ai = DAYS_ORDER.indexOf(a.day);
    const bi = DAYS_ORDER.indexOf(b.day);
    return ai - bi;
  });

  const totals = rows.reduce((acc, r) => {
    acc.seen += r.seen;
    acc.urls += r.urls;
    acc.records += r.records;
    acc.generated += r.generated;
    acc.approveKey += r.approveKey;
    acc.approveSec += r.approveSec;
    acc.images += r.images;
    acc.published += r.published;
    acc.errors += r.errors;
    acc.users += r.users.size;
    return acc;
  }, {
    seen:0, urls:0, records:0, generated:0,
    approveKey:0, approveSec:0, images:0,
    published:0, errors:0, users:0
  });

  if (loading) {
    return <div style={{padding:20,color:P.muted}}>Chargement...</div>;
  }

  return (
    <div style={{padding:"16px"}}>

      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:P.text}}>
            Journal d'exécution (agrégé)
          </div>
          <div style={{fontSize:10,color:P.muted}}>
            Source: pm_listings
          </div>
        </div>

        <select
          value={selectedWeek}
          onChange={e=>setSelectedWeek(e.target.value)}
          style={{...inp,fontSize:11}}
        >
          <option value="auto">Semaine actuelle ({currentWeek})</option>
          <option value="all">All</option>
          {isoWeeks.map(w => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      {/* TABLE */}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",fontSize:11}}>
          <thead>
            <tr style={{background:P.card}}>
              {[
                "Jour",
                "Seen",
                "URLs",
                "Records",
                "Générées",
                "ApprouveKey",
                "ApprouveSec",
                "Images",
                "Users", // 👈 NEW
                "Publiées",
                "Erreurs",
              ].map(h=>(
                <th key={h} style={{padding:8,color:P.muted}}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map(r=>(
              <tr key={r.day} style={{borderBottom:`1px solid ${P.border}`}}>
                <td style={{padding:8,fontWeight:700}}>{r.day}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.seen}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.urls}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.records}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.generated}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.approveKey}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.approveSec}</td>
                <td style={{padding:8,textAlign:"center"}}>{r.images}</td>
                <td style={{padding:8,textAlign:"center",color:P.gold,fontWeight:700}}>
                  {r.users.size}
                </td>
                <td style={{padding:8,textAlign:"center",color:P.green,fontWeight:700}}>
                  {r.published}
                </td>
                <td style={{padding:8,textAlign:"center",color:r.errors?P.red:P.muted}}>
                  {r.errors}
                </td>
              </tr>
            ))}

            {/* TOTAL */}
            <tr style={{background:P.card}}>
              <td style={{padding:8,fontWeight:700,color:P.gold}}>Total</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.seen}</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.urls}</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.records}</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.generated}</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.approveKey}</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.approveSec}</td>
              <td style={{padding:8,textAlign:"center"}}>{totals.images}</td>
              <td style={{padding:8,textAlign:"center",color:P.gold}}>
                {totals.users}
              </td>
              <td style={{padding:8,textAlign:"center",color:P.green}}>
                {totals.published}
              </td>
              <td style={{padding:8,textAlign:"center"}}>{totals.errors}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}




// ── Tab: Config ────────────────────────────────────────────────
function TabConfig({config,onChange,primaryFields,secondaryFields,onSave,onReset}) {
  const [activeDay,setActiveDay]=useState("Lundi");
  useEffect(()=>{
    const h=()=>onSave();
    document.addEventListener("pma_save",h);
    return()=>document.removeEventListener("pma_save",h);
  },[onSave]);
  const cfg=config||{};
  const setDay=(day,val)=>onChange({...cfg,[day]:val});
  const copyFrom=(fromDay)=>{
    const src=cfg[fromDay];
    if(src) setDay(activeDay,{...src, enabled:cfg[activeDay]?.enabled??false});
  };

  return (
    <div style={{display:"flex",flex:1,minHeight:0,overflow:"hidden"}}>
      {/* Day selector */}
      <div style={{width:150,flexShrink:0,borderRight:`1px solid ${P.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"10px",borderBottom:`1px solid ${P.border}`,fontSize:10,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
          Planning
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {DAYS_FR.map(day=>{
            const dc=cfg[day]; const active=activeDay===day; const enabled=dc?.enabled;
            return (
              <div key={day} onClick={()=>setActiveDay(day)}
                style={{padding:"10px 12px",cursor:"pointer",borderBottom:`1px solid ${P.border}`,
                  background:active?P.blueS:"transparent",borderLeft:`3px solid ${active?P.blue:"transparent"}`}}>
                <div style={{fontSize:11,fontWeight:600,color:active?P.blue:P.text}}>{day}</div>
                <div style={{fontSize:9,marginTop:2,color:enabled?P.green:P.muted}}>
                  {enabled?"● Actif":"○ Inactif"}
                </div>
                {enabled&&dc?.sites?.filter(s=>s.trim()).length>0&&(
                  <div style={{fontSize:8,color:P.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {dc.sites.filter(s=>s.trim()).length} site{dc.sites.filter(s=>s.trim()).length>1?"s":""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{padding:10,borderTop:`1px solid ${P.border}`,display:"flex",flexDirection:"column",gap:6}}>
          <button onClick={onSave} style={{...btn(P.green,P.greenS),fontSize:10,textAlign:"center"}}>💾 Sauvegarder</button>
          <button onClick={onReset} style={{...btn(P.red,P.redS),fontSize:10,textAlign:"center"}}>🗑️ Effacer tout</button>
        </div>
      </div>
      {/* Config panel */}
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{flex:1,overflowY:"auto",padding:"16px 16px 56px"}}>
          <DayConfigPanel day={activeDay} config={cfg[activeDay]}
            onChange={val=>setDay(activeDay,val)}
            primaryFields={primaryFields} secondaryFields={secondaryFields}
            allDays={DAYS_FR} onCopyFrom={copyFrom}/>
          <div style={{height:40,flexShrink:0}}/>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Adapters ───────────────────────────────────────────────
function TabAdapters({siteAdapters,onChange,onSave,typeTaxes}) {
  const [local,setLocal]=useState(siteAdapters||DEFAULT_SITE_ADAPTERS);
  useEffect(()=>setLocal(siteAdapters||DEFAULT_SITE_ADAPTERS),[JSON.stringify(siteAdapters||{})]);
  

const avito = local.avito || DEFAULT_SITE_ADAPTERS.avito;

const update = (patch) =>
  setLocal(p => ({
    ...p,
    avito: {
      ...(p.avito || DEFAULT_SITE_ADAPTERS.avito),
      ...patch
    }
  }));

const validLabels = new Set(
  (typeTaxes || [])
    .map(tx => tx.name?.replace(/^Type\s+/i, "") || "")
    .filter(Boolean)
);

const updateMapField = (label, field, val) =>
  setLocal(p => {
    const currentAvito = p.avito || DEFAULT_SITE_ADAPTERS.avito;
    const currentMappings = currentAvito.typeMappings || {};

    const cleanedMappings = Object.fromEntries(
      Object.entries(currentMappings).filter(([k]) => validLabels.has(k))
    );

    return {
      ...p,
      avito: {
        ...currentAvito,
        typeMappings: {
          ...cleanedMappings,
          [label]: {
            ...(cleanedMappings[label] || { adView: "", resultsPage: "" }),
            [field]: val
          }
        }
      }
    };
  });

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,overflow:"hidden"}}>
      <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"10px 16px",borderBottom:`1px solid ${P.border}`,background:P.card}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:P.text}}>Site Adapters</div>
          <div style={{fontSize:10,color:P.muted,marginTop:2}}>Instructions site-spécifiques pour discovery et mapping</div>
        </div>
        <div style={{marginLeft:"auto"}}>

<button
  onClick={()=>{
    const validLabels = new Set(
      (typeTaxes || [])
        .map(tx => tx.name?.replace(/^Type\s+/i, "") || "")
        .filter(Boolean)
    );

    const currentAvito = local.avito || DEFAULT_SITE_ADAPTERS.avito;
    const cleanedMappings = Object.fromEntries(
      Object.entries(currentAvito.typeMappings || {}).filter(([k]) => validLabels.has(k))
    );

    const cleaned = {
      ...local,
      avito: {
        ...currentAvito,
        typeMappings: cleanedMappings
      }
    };

    setLocal(cleaned);
    onChange(cleaned);
    onSave && onSave(cleaned);
  }}
  style={{...btn(P.green,P.greenS),padding:"4px 12px",fontSize:10,fontWeight:700}}
>
       

💾 Sauvegarder</button>
        </div>
      </div>
      <div style={{height:"100%",minHeight:0,overflowY:"auto",padding:"16px 16px 56px"}}>
        <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:P.gold,marginBottom:10}}>Avito.ma</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:10,color:P.muted,marginBottom:4}}>site</div><input value={avito.site||""} onChange={e=>update({site:e.target.value})} style={{...inp,fontSize:11}}/></div>
            <div><div style={{fontSize:10,color:P.muted,marginBottom:4}}>locale hardcodée</div><input value={avito.locale||"fr"} onChange={e=>update({locale:e.target.value})} style={{...inp,fontSize:11}}/></div>
            <div><div style={{fontSize:10,color:P.muted,marginBottom:4}}>country défaut</div><input value={avito.defaultCountry||"maroc"} onChange={e=>update({defaultCountry:e.target.value})} style={{...inp,fontSize:11}}/></div>
            <div><div style={{fontSize:10,color:P.muted,marginBottom:4}}>mode</div><input value={avito.mode||""} onChange={e=>update({mode:e.target.value})} style={{...inp,fontSize:11}}/></div>
          </div>
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:P.muted,marginBottom:4}}>Note adapter</div>
            <textarea value={avito.note||""} onChange={e=>update({note:e.target.value})} rows={2} style={{...inp,resize:"vertical",fontSize:11,lineHeight:1.5}}/>
          </div>
          <div style={{marginTop:12,padding:"8px 10px",borderRadius:8,background:P.card,border:`1px solid ${P.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:P.blue,marginBottom:6}}>Hardcoded Avito</div>
            <div style={{fontSize:10,color:P.muted,lineHeight:1.7}}>
              <div>locale: <span style={{color:P.text}}>fr</span></div>
              <div>title source: <span style={{color:P.text}}>results card title</span></div>
              <div>URL discovery: <span style={{color:P.text}}>fetch_raw + href .htm extraction</span></div>
            </div>
          </div>
	  
        </div>

        <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:14}}>
<div style={{fontSize:12,fontWeight:700,color:P.text,marginBottom:8}}>Mapping Types internes → Avito</div>
<div style={{fontSize:10,color:P.muted,marginBottom:12}}>
  Colonne 1 = slug(s) catégorie pour pages annonce directes. Colonne 2 = slug page résultats. 
  L’URL finale est construite comme: site / locale hardcodée / country défaut / resultsPage
</div>

<div style={{display:"grid",gap:8}}>
  <div
    style={{
      display:"grid",
      gridTemplateColumns:"260px 1fr 1fr",
      gap:8,
      alignItems:"center",
      padding:"0 0 6px",
      borderBottom:`1px solid ${P.border}`
    }}
  >
    <div style={{fontSize:10,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
      Type interne
    </div>
    <div style={{fontSize:10,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
      Ad View page
    </div>
    <div style={{fontSize:10,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
      Results Page
    </div>
  </div>

{(typeTaxes||[])
  .map(tx=>tx.name?.replace(/^Type\s+/i,"")||"")
  .filter(Boolean)
  .map(label => {

    const row = avito.typeMappings?.[label] || { adView:"", resultsPage:"" };
    return (
      <div
        key={label}
        style={{
          display:"grid",
          gridTemplateColumns:"260px 1fr 1fr",
          gap:8,
          alignItems:"center"
        }}
      >
        <div style={{fontSize:11,color:P.text}}>
          {label}
        </div>

        <input
          value={row.adView || ""}
          onChange={e=>updateMapField(label,"adView",e.target.value)}
          style={{...inp,fontSize:11}}
          placeholder="animaux_domestique, services_pour_animaux"
        />

        <input
          value={row.resultsPage || ""}
          onChange={e=>updateMapField(label,"resultsPage",e.target.value)}
          style={{...inp,fontSize:11}}
          placeholder="https://www.avito.ma/fr/maroc/animaux-%C3%A0_vendre"
        />
      </div>
    );
  })}
</div>

        </div>
	
	<div style={{height:56,flexShrink:0}} />

      </div>
    </div>
  );
}

// ── Tab: Auto ──────────────────────────────────────────────────
function TabAuto({config,onChange,onSave}) {
  const enabledDays = DAYS_FR.filter(d=>config?.[d]?.enabled);

  const toggleStep = (day, stepId) => {
    const dayCfg = {...DEFAULT_DAY, ...(config?.[day]||{})};
    const next = {
      ...config,
      [day]: {
        ...dayCfg,
        autoSteps: {
          ...(dayCfg.autoSteps || DEFAULT_DAY.autoSteps),
          [stepId]: !(dayCfg.autoSteps || DEFAULT_DAY.autoSteps)[stepId]
        }
      }
    };
    onChange(next);
onSave && onSave(next);
  };

  return (
    <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"16px 16px 56px"}}>
      <div style={{fontSize:13,fontWeight:700,color:P.text,marginBottom:4}}>Pipeline Automatique</div>
      <div style={{fontSize:10,color:P.muted,marginBottom:20}}>
        {enabledDays.length} jour{enabledDays.length!==1?"s":""} configuré{enabledDays.length!==1?"s":""}
        {enabledDays.length>0&&<span style={{color:P.green,marginLeft:6}}>{enabledDays.join(" · ")}</span>}
      </div>

      {enabledDays.map(day=>{
        const dayCfg = {...DEFAULT_DAY, ...(config?.[day]||{})};
        const autoSteps = {...DEFAULT_DAY.autoSteps, ...(dayCfg.autoSteps||{})};

        return (
          <div key={day} style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,color:P.gold,marginBottom:8}}>{day}</div>

            <div style={{position:"relative"}}>
              {FLOW_STEPS.map((step,i)=>(
                <div key={step.id} style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:0}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,width:36}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:P.card,border:`2px solid ${P.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                      {step.icon}
                    </div>
                    {i<FLOW_STEPS.length-1&&<div style={{width:2,height:20,background:P.border,margin:"2px 0"}}/>}
                  </div>

                  <div style={{flex:1}}>
                    <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:P.text}}>{step.label}</div>
                          <div style={{fontSize:10,color:P.muted,marginTop:2}}>{step.desc}</div>
                        </div>

                        <button
                          onClick={()=>toggleStep(day, step.id)}
                          style={{
                            ...btn(autoSteps[step.id]?P.green:P.muted, autoSteps[step.id]?P.greenS:"transparent"),
                            padding:"4px 12px",
                            fontSize:10,
                            flexShrink:0
                          }}
                        >
                          {autoSteps[step.id] ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>

                    {i<FLOW_STEPS.length-1&&<div style={{height:20}}/>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {enabledDays.length===0&&(
        <div style={{background:P.amberS,border:`1px solid ${P.amber}44`,borderRadius:8,padding:"12px 16px",marginTop:16,fontSize:11,color:P.amber}}>
          ⚠️ Aucun jour configuré — allez dans Config pour activer au moins un jour
        </div>
      )}

      <div style={{height:56,flexShrink:0}} />
    </div>
  );
}


function ManualUrlPopup({
  open,
  onClose,
  onSave,
  primaryFields,
  initialDayConfig
}) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open) return;

    setRows([
      {
        id: uid(),
        url: "",
        categoryTermId: (initialDayConfig?.categories || [])[0] || "",
        subCategoryTaxId: "",
        subCategoryTermId: ""
      }
    ]);
  }, [open, JSON.stringify(initialDayConfig || {})]);

  if (!open) return null;

  const catTax =
    primaryFields.find(
      t =>
        t.name?.toLowerCase().includes("categ") ||
        t.slug?.toLowerCase().includes("categ")
    ) || primaryFields[0];

  const typeTaxes = primaryFields.filter(t => t.id !== catTax?.id);

  const getTypeOptionsForRow = (row) => {
    if (!row.categoryTermId) {
      return typeTaxes.map(tx => ({
        id: tx.id,
        name: tx.name
      }));
    }

    // for now keep all type taxonomies visible
    // hierarchy enforcement can be strengthened later
    return typeTaxes.map(tx => ({
      id: tx.id,
      name: tx.name
    }));
  };

  const getTermOptionsForRow = (row) => {
    const tx = typeTaxes.find(t => t.id === row.subCategoryTaxId);
    return (tx?.terms || []).map(term => ({
      id: term.id,
      name: term.name
    }));
  };

  const updateRow = (rowId, patch) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;

        const next = { ...r, ...patch };

        if (patch.subCategoryTaxId !== undefined) {
          next.subCategoryTermId = "";
        }

        return next;
      })
    );
  };

  const addEmptyRow = () => {
    setRows(prev => [
      ...prev,
      {
        id: uid(),
        url: "",
        categoryTermId: (initialDayConfig?.categories || [])[0] || "",
        subCategoryTaxId: "",
        subCategoryTermId: ""
      }
    ]);
  };

  const removeRow = (rowId) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
  };

  const parseBulkUrls = (raw) => {
    return String(raw || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);
  };

  const addBulkRows = (raw) => {
    const urls = parseBulkUrls(raw);
    if (!urls.length) return;

    setRows(prev => [
      ...prev,
      ...urls.map(url => ({
        id: uid(),
        url,
        categoryTermId: (initialDayConfig?.categories || [])[0] || "",
        subCategoryTaxId: "",
        subCategoryTermId: ""
      }))
    ]);
  };

  const validRows = rows.filter(r => String(r.url || "").trim());

  const canSave =
    validRows.length > 0 &&
    validRows.every(r => r.categoryTermId && r.subCategoryTaxId && r.subCategoryTermId);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
    >
      <div
        style={{
          width: "min(1200px, 96vw)",
          maxHeight: "90vh",
          overflow: "hidden",
          background: P.surface,
          border: `1px solid ${P.border}`,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${P.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: P.text }}>
              + URL(s) manuel(s)
            </div>
            <div style={{ fontSize: 10, color: P.muted, marginTop: 2 }}>
              Coller plusieurs URLs puis choisir Catégorie / Type / Terme pour chaque ligne
            </div>
          </div>

          <button onClick={onClose} style={btn(P.muted, "transparent")}>
            Fermer
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <BulkPasteBox onAdd={addBulkRows} />

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {rows.map((row, idx) => {
              const typeOptions = getTypeOptionsForRow(row);
              const termOptions = getTermOptionsForRow(row);

              return (
                <div
                  key={row.id}
                  style={{
                    border: `1px solid ${P.border}`,
                    borderRadius: 8,
                    padding: 12,
                    background: P.card
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.7fr 1fr 1fr 1fr auto",
                      gap: 8,
                      alignItems: "start"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>
                        URL #{idx + 1}
                      </div>
                      <input
                        value={row.url}
                        onChange={e => updateRow(row.id, { url: e.target.value })}
                        placeholder="https://www.avito.ma/fr/..."
                        style={{ ...inp, fontSize: 11 }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>
                        Catégorie
                      </div>
                      <select
                        value={row.categoryTermId}
                        onChange={e => updateRow(row.id, { categoryTermId: e.target.value })}
                        style={{ ...inp, fontSize: 11 }}
                      >
                        <option value="">Choisir...</option>
                        {(catTax?.terms || []).map(term => (
                          <option key={term.id} value={term.id}>
                            {term.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>
                        Type taxonomy
                      </div>
                      <select
                        value={row.subCategoryTaxId}
                        onChange={e => updateRow(row.id, { subCategoryTaxId: e.target.value })}
                        style={{ ...inp, fontSize: 11 }}
                      >
                        <option value="">Choisir...</option>
                        {typeOptions.map(tx => (
                          <option key={tx.id} value={tx.id}>
                            {tx.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>
                        Terme
                      </div>
                      <select
                        value={row.subCategoryTermId}
                        onChange={e => updateRow(row.id, { subCategoryTermId: e.target.value })}
                        style={{ ...inp, fontSize: 11 }}
                      >
                        <option value="">Choisir...</option>
                        {termOptions.map(term => (
                          <option key={term.id} value={term.id}>
                            {term.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ paddingTop: 22 }}>
                      <button
                        onClick={() => removeRow(row.id)}
                        style={btn(P.red, P.redS)}
                        title="Supprimer la ligne"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={addEmptyRow} style={btn(P.blue, P.blueS)}>
              + Ligne
            </button>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${P.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10
          }}
        >
          <div style={{ fontSize: 10, color: P.muted }}>
            {validRows.length} URL(s) prête(s) · statut enregistré: <b>initial</b>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btn(P.muted, "transparent")}>
              Annuler
            </button>

            <button
              onClick={() => onSave(validRows)}
              style={btn(P.green, P.greenS)}
              disabled={!canSave}
            >
              Sauvegarder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkPasteBox({ onAdd }) {
  const [bulk, setBulk] = useState("");

  return (
    <div
      style={{
        background: P.card,
        border: `1px solid ${P.border}`,
        borderRadius: 8,
        padding: 12
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: P.text, marginBottom: 6 }}>
        Coller plusieurs URLs
      </div>

      <textarea
        value={bulk}
        onChange={e => setBulk(e.target.value)}
        rows={4}
        placeholder={"https://www.avito.ma/fr/...\nhttps://www.avito.ma/fr/..."}
        style={{ ...inp, resize: "vertical", fontSize: 11, lineHeight: 1.5 }}
      />

      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => {
            onAdd(bulk);
            setBulk("");
          }}
          style={btn(P.blue, P.blueS)}
        >
          + Ajouter ces URLs
        </button>
      </div>
    </div>
  );
}

// ── Tab: Semaine ───────────────────────────────────────────────
function TabSemaine({config,primaryFields,secondaryFields,listings,onListingsChange,mapping,logs,onAddLog,siteAdapters,imgGenRegistry}) {

const [selectedDay,setSelectedDay]=useState(null);
const [stepResults,setStepResults]=useState({});
const [running,setRunning]=useState(null);
const [sessionLog,setSessionLog]=useState([]);
const [foundUrls,setFoundUrls]=useState([]);
const [showSessionLog,setShowSessionLog]=useState(false);
const [openStepDetails,setOpenStepDetails]=useState({});
const [viewingListing,setViewingListing]=useState(null);
const [editingListing,setEditingListing]=useState(null);
const [semaineHydrated, setSemaineHydrated] = useState(false);
const [relaunchSelection, setRelaunchSelection] = useState({});
const [deleteSelection, setDeleteSelection] = useState({});
const [showManualUrlPopup, setShowManualUrlPopup] = useState(false);
const [manualUrlSaving, setManualUrlSaving] = useState(false);

// week selection (persistent per session)
const [selectedWeek, setSelectedWeek] = useState(() => getISOWeek());
const weekOptions = getISOWeeksList(16);
const week = selectedWeek;

const addLog=(msg,type="info")=>{
  const entry={msg,type,at:new Date().toISOString()};
  setSessionLog(p=>[entry,...p.slice(0,199)]);
};


const openListingUrl = (url) => {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};




const getRowsForStep = (stepId) => {
  switch (stepId) {
    case "search":
      return [];

    case "create_url":
      return dayListings.filter(l => l.status === "initial");

    case "generate":
      return dayListings.filter(l =>
        ["generated", "generate_failed"].includes(l.status)
      );

    case "sync_user":
      return dayListings.filter(l =>
        ["phone_revealed", "phone_not_revealed"].includes(l.status)
      );

    case "approve_key":
      return dayListings.filter(l =>
        ["key_approved", "key_missing"].includes(l.status)
      );

case "approve_sec":
  return dayConfig?.withImage
    ? dayListings.filter(l =>
        ["fields_missing", "fields_approved"].includes(l.status)
      )
    : dayListings.filter(l =>
        ["fields_missing", "approval_ready"].includes(l.status)
      );

    case "gen_image":
      return dayConfig?.withImage
        ? dayListings.filter(l =>
            ["image_generated", "image_error"].includes(l.status)
          )
        : [];

case "approve_img":
  return dayListings.filter(l =>
    ["approval_ready", "approve_img_failed"].includes(l.status)
  );

case "approve_all":
  return dayListings.filter(l =>
    ["user_ready", "approve_all_failed"].includes(l.status)
  );

case "create_user":
  return dayListings.filter(l =>
    ["publish_ready", "create_user_failed"].includes(l.status)
  );

case "publish":
  return dayListings.filter(l =>
    ["published", "publish_failed"].includes(l.status)
  );

    case "delete":
      return dayListings.filter(l =>
        l.status === "published"
      );

    default:
      return [];
  }
};




const getStepRowBadge = (stepId, row) => {
  switch (stepId) {
    case "search":
      return { label: "URL trouvée", color: P.blue, bg: P.blueS };

    case "create_url":
      return { label: "Record créée", color: P.blue, bg: P.blueS };

    case "generate":
      return row.status === "generated"
        ? { label: "Générée", color: P.blue, bg: P.blueS }
        : { label: "Échec génération", color: P.red, bg: P.redS };

    case "sync_user":
      return row.status === "phone_revealed"
        ? { label: "Téléphone révélé", color: P.blue, bg: P.blueS }
        : { label: "Téléphone non révélé", color: P.red, bg: P.redS };

    case "approve_key":
      return row.status === "key_approved"
        ? { label: "Clés OK", color: P.blue, bg: P.blueS }
        : { label: "Clés manquantes", color: P.red, bg: P.redS };

    case "approve_sec":
      return row.status === "fields_approved" || row.status === "approval_ready"
        ? { label: "Champs OK", color: P.blue, bg: P.blueS }
        : { label: "Champs manquants", color: P.red, bg: P.redS };

    case "gen_image":
      return row.status === "image_generated"
        ? { label: row.imageMeta?.label || "Image générée", color: P.blue, bg: P.blueS }
        : { label: "Échec image IA", color: P.red, bg: P.redS };

    case "approve_img":
      return row.imgApproved
        ? { label: "Image approuvée", color: P.blue, bg: P.blueS }
        : { label: "Image rejetée", color: P.red, bg: P.redS };

    case "approve_all":
      return row.status === "user_ready"
        ? { label: "Annonce approuvée", color: P.blue, bg: P.blueS }
        : { label: "Annonce non approuvée", color: P.red, bg: P.redS };

    case "create_user":
      return row.wpUserId || row.status === "publish_ready"
        ? { label: "Compte créé", color: P.blue, bg: P.blueS }
        : { label: "Échec création compte", color: P.red, bg: P.redS };

    case "publish":
      return row.wpPostId || row.status === "published"
        ? { label: "Publiée", color: P.blue, bg: P.blueS }
        : { label: "Échec publication", color: P.red, bg: P.redS };

    case "delete":
      return { label: "Publiée", color: P.blue, bg: P.blueS };

    default:
      return { label: row.status || "—", color: P.muted, bg: P.card };
  }
};



const renderStepRows = (stepId, title) => {
  const rows = getRowsForStep(stepId);
  if (!rows.length) return null;

  return (
    <div style={{marginTop:8,borderTop:`1px solid ${P.border}`,paddingTop:8}}>
      <div style={{fontSize:9,color:P.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>
        {title}
      </div>

      <div style={{display:"grid",gap:6}}>
        {rows.map((row) => {
          const badge = getStepRowBadge(stepId, row);
          const fresh = listings.find(l => l.id === row.id) || row;

          return (
            <div
              key={row.id}
              style={{
                display:"grid",
                gridTemplateColumns:"1fr auto",
                gap:10,
                alignItems:"center",
                padding:"8px 10px",
                background:badge.bg,
                border:`1px solid ${badge.color}`,
                borderRadius:6
              }}
            >
              <div style={{minWidth:0}}>
                <div style={{fontSize:10,color:P.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {row.generated?.title || row.url}
                </div>

                <div style={{fontSize:9,color:P.blue,marginTop:3,wordBreak:"break-all"}}>
                  {row.url}
                </div>

                <div style={{fontSize:9,color:P.muted,marginTop:3}}>
                  {row.username || "—"} {row.phone ? `· ${row.phone}` : ""}
                </div>
              </div>

              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                <span
                  style={{
                    fontSize:9,
                    fontWeight:700,
                    color: badge.color,
                    padding:"2px 8px",
                    borderRadius:10,
                    background: P.card,
                    border:`1px solid ${badge.color}55`
                  }}
                >
                  {badge.label}
                </span>

                <button
                  onClick={() => setViewingListing(fresh)}
                  style={{...btn(P.green,P.greenS),padding:"3px 8px",fontSize:9}}
                  title="Ouvrir popup"
                >
                  👁
                </button>

                <button
                  onClick={() => openListingUrl(row.url)}
                  style={{...btn(P.blue,P.blueS),padding:"3px 8px",fontSize:9}}
                  title="Ouvrir URL source"
                >
                  ↗
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


const semaineStateKey = `travito:pm_semaine_state:${week}:${selectedDay || "none"}`;

const semaineSelectionKey = `travito:pm_semaine_selection`;

const getFailedRowsForStep = (stepId) => {
  switch (stepId) {
    case "generate":
      return dayListings.filter(l => l.status === "generate_failed");

    case "sync_user":
      return dayListings.filter(l => l.status === "phone_not_revealed");

    case "approve_key":
      return dayListings.filter(l => l.status === "key_missing");

    case "approve_sec":
      return dayListings.filter(l => l.status === "fields_missing");

    case "gen_image":
      return dayListings.filter(l => l.status === "image_error");

case "approve_img":
  return dayListings.filter(l => l.status === "approve_img_failed");

    case "approve_all":
      return dayListings.filter(l => l.status === "approve_all_failed");

    case "create_user":
      return dayListings.filter(l => l.status === "create_user_failed");

    case "publish":
      return dayListings.filter(l => l.status === "publish_failed");

    default:
      return [];
  }
};

const getEffectiveRelaunchIds = (stepId) => {
  const selected = Array.isArray(relaunchSelection[stepId]) ? relaunchSelection[stepId] : [];
  if (selected.length) return selected;
  return getFailedRowsForStep(stepId).map(r => r.id);
};


const renderRelaunchSelection = (stepId, title) => {
  const rows = getFailedRowsForStep(stepId);
  if (!rows.length) return null;

  return (
    <div style={{marginTop:8,padding:"8px 10px",background:P.surface,borderRadius:6,border:`1px solid ${P.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:10,color:P.muted}}>
          {title}
        </div>

        <div style={{display:"flex",gap:6}}>
          <button
            onClick={() => setRelaunchSelection(prev => ({ ...prev, [stepId]: rows.map(r => r.id) }))}
            style={{...btn(P.blue,P.blueS),padding:"2px 8px",fontSize:9}}
          >
            Tout cocher
          </button>
          <button
            onClick={() => setRelaunchSelection(prev => ({ ...prev, [stepId]: [] }))}
            style={{...btn(P.muted,P.card),padding:"2px 8px",fontSize:9}}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div style={{display:"grid",gap:6}}>
        {rows.map(row => {
          const checked = (relaunchSelection[stepId] || []).includes(row.id);

          return (
            <label
              key={row.id}
              style={{
                display:"flex",
                alignItems:"center",
                gap:8,
                padding:"6px 8px",
                borderRadius:6,
                background:checked ? P.blueS : P.card,
                border:`1px solid ${checked ? P.blue : P.border}`,
                cursor:"pointer"
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleRelaunchSelection(stepId, row.id)}
                style={{accentColor:P.blue}}
              />

              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:10,color:P.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {row.generated?.title || row.url}
                </div>
                <div style={{fontSize:9,color:P.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {row.url}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};


const RELAUNCH_TITLES = {
  generate: "Sélection pour relance — cochez les annonces en échec à re-générer",
  sync_user: "Sélection pour relance — cochez les annonces téléphone non révélé",
  approve_key: "Sélection pour relance — cochez les annonces avec champs clés manquants",
  approve_sec: "Sélection pour relance — cochez les annonces avec champs cibles manquants",
  gen_image: "Sélection pour relance — cochez les images en échec",
  approve_img: "Sélection pour relance — cochez les images rejetées",
  approve_all: "Sélection pour relance — cochez les annonces non approuvées",
  create_user: "Sélection pour relance — cochez les comptes en échec",
  publish: "Sélection pour relance — cochez les publications en échec",
};



useEffect(() => {
  const catTax =
    primaryFields.find(
      t =>
        t.name?.toLowerCase().includes("categ") ||
        t.slug?.toLowerCase().includes("categ")
    ) || primaryFields[0];

  const villeTax = secondaryFields.find(
    t => t.name?.toLowerCase().includes("ville")
  );

  window.__pma_typeTaxes__ = primaryFields.filter(t => t.id !== catTax?.id);
  window.__pma_catTerms__ = catTax?.terms || [];
  window.__pma_villeTaxTerms__ = villeTax?.terms || [];
}, [primaryFields, secondaryFields]);

useEffect(() => {
  kvGet(semaineSelectionKey).then(saved => {
    if (saved && typeof saved === "object") {
      if (saved.week) setSelectedWeek(saved.week);
      if (saved.day) setSelectedDay(saved.day);
    }
  });
}, []);

useEffect(() => {
  kvSet(semaineSelectionKey, {
    week,
    day: selectedDay
  });
}, [week, selectedDay]);

useEffect(() => {
  if (!selectedDay) return;

  setSemaineHydrated(false);

  kvGet(semaineStateKey).then(saved => {
    if (saved && typeof saved === "object") {
      setStepResults(saved.stepResults || {});
      setOpenStepDetails(saved.openStepDetails || {});
      setFoundUrls(saved.foundUrls || []);
    }
    setSemaineHydrated(true);
  });
}, [semaineStateKey, selectedDay]);

useEffect(() => {
  if (!selectedDay || !semaineHydrated) return;

  kvSet(semaineStateKey, {
    stepResults,
    openStepDetails,
    foundUrls
  });
}, [semaineStateKey, selectedDay, semaineHydrated, stepResults, openStepDetails, foundUrls]);

const dayConfig = selectedDay ? (config?.[selectedDay] || {}) : null;

useEffect(() => {
  if (!selectedDay || !semaineHydrated) return;

  const rows = listings.filter(
    l => l.mode === "auto" &&
         l.dayConfig?.day === selectedDay &&
         l.dayConfig?.week === week
  );

  const rebuilt = buildStepResultsFromListings(rows);

  setStepResults(rebuilt);

  setOpenStepDetails(prev => {
    const nextOpen = { ...prev };
    Object.keys(nextOpen).forEach(k => {
      nextOpen[k] = !!rebuilt[k];
    });
    if (rebuilt.create_url) nextOpen.create_url = true;
    return nextOpen;
  });
}, [selectedDay, semaineHydrated, week, listings]);



// KV cache key for search results (per week + day)
const searchCacheKey = `${KV_KEYS.searchUrlsPrefix}:${week}:${selectedDay || "none"}`;

const persist = useCallback(async (next) => {
  const cleanNext = sanitizeListingsForKV(next);

  onListingsChange(cleanNext);

  try {
    await kvSet(KV_KEYS.listings, cleanNext);
  } catch (e) {
    console.error("[persist][kv failed]", e.message);
    throw e;
  }
}, [onListingsChange]);


const saveManualUrls = async (rows) => {
  if (!selectedDay || !dayConfig) return;
  if (!Array.isArray(rows) || !rows.length) return;

  setManualUrlSaving(true);

  try {
    const existingByKey = new Set(
      (listings || []).map(l => normalizeUrlKey(l.url)).filter(Boolean)
    );

    const now = new Date().toISOString();

    const toCreate = rows
      .map(r => ({
        ...r,
        url: String(r.url || "").trim()
      }))
      .filter(r => r.url)
      .filter(r => !existingByKey.has(normalizeUrlKey(r.url)));

    if (!toCreate.length) {
      addLog("ℹ Toutes les URLs manuelles existent déjà", "info");
      setShowManualUrlPopup(false);
      return;
    }

    const newListings = toCreate.map(r => ({
      id: uid(),
      url: r.url,
      mode: "auto",
      sourceMode: "manual_url",
      status: "initial",
      isoWeek: week,
      createdAt: now,

      phone: generatePlaceholderPhone(),
      phonePlaceholder: true,
      phoneStatus: "not_revealed",
      phoneSource: "placeholder",

      username: "",
      email: "",

      dayConfig: { day: selectedDay, week },

      sourceConfig: {
        site: r.url,
        keywords: dayConfig.keywords || [],
        categories: [r.categoryTermId].filter(Boolean),
        types: [r.subCategoryTaxId].filter(Boolean),
        termes: [r.subCategoryTermId].filter(Boolean),
        villes: dayConfig.villes || [],
        withImage: dayConfig.withImage
      },

      generated: null,

      categoryTermId: r.categoryTermId || "",
      subCategoryTaxId: r.subCategoryTaxId || "",
      subCategoryTermId: r.subCategoryTermId || ""
    }));

    const updated = [...newListings, ...listings];
    await persist(updated);

    const seen = await kvGet(KV_KEYS.seenUrls).then(v => Array.isArray(v) ? v : []);
    await kvSet(KV_KEYS.seenUrls, [...new Set([...seen, ...newListings.map(x => x.url)])]);

    const rebuilt = buildStepResultsFromListings(
      updated.filter(
        l =>
          l.mode === "auto" &&
          l.dayConfig?.day === selectedDay &&
          l.dayConfig?.week === week
      )
    );

    setStepResults(rebuilt);
    setOpenStepDetails(prev => ({
      ...prev,
      create_url: true
    }));

    addLog(`✅ ${newListings.length} URL(s) manuelle(s) ajoutée(s)`, "success");
    setShowManualUrlPopup(false);
  } catch (e) {
    addLog(`❌ Erreur ajout URLs manuelles: ${e.message}`, "error");
  } finally {
    setManualUrlSaving(false);
  }
};


  const villeTax=secondaryFields.find(t=>t.name?.toLowerCase().includes("ville"));
  const catTax=primaryFields.find(t=>t.name?.toLowerCase().includes("categ")||t.slug?.toLowerCase().includes("categ"))||primaryFields[0];
  useEffect(()=>{ window.__pma_typeTaxes__ = primaryFields.filter(t=>t.id!==catTax?.id); },[primaryFields,catTax]);

  // Listings for this day/week
  const dayListings=listings.filter(l=>l.mode==="auto"&&l.dayConfig?.day===selectedDay&&l.dayConfig?.week===week);


const buildStepResultsFromListings = (rows) => {
  const rebuilt = {};

  const initialRows = rows.filter(l => l.status === "initial");
  if (initialRows.length > 0) {
    rebuilt.create_url = {
      status: "success",
      data: {
        created: initialRows.length,
        skipped: 0,
        newListings: initialRows,
        count: initialRows.length,
        message: `${initialRows.length} record(s) en attente de génération`
      }
    };
  }

const generatedRows = rows.filter(l => l.status === "generated");
const generateFailedRows = rows.filter(l => l.status === "generate_failed");

if (generatedRows.length > 0 || generateFailedRows.length > 0) {
  rebuilt.generate = {
    status: generatedRows.length > 0
      ? (generateFailedRows.length > 0 ? "partial" : "success")
      : "error",
    data: {
      count: generatedRows.length,
      errors: generateFailedRows.length,
      generatedListings: generatedRows,
      failedListings: generateFailedRows,
      message: `${generatedRows.length} annonce(s) générée(s) · ${generateFailedRows.length} échec(s)`
    }
  };
}

  const phoneRows = rows.filter(l => ["phone_revealed", "phone_not_revealed"].includes(l.status));
  if (phoneRows.length > 0) {
    const ok = phoneRows.filter(l => l.status === "phone_revealed").length;
    const ko = phoneRows.filter(l => l.status === "phone_not_revealed").length;

    rebuilt.sync_user = {
      status: ok > 0 ? "success" : "partial",
      data: {
        count: ok,
        errors: ko,
        phoneListings: phoneRows,
        message: `${ok} téléphone(s) révélés · ${ko} non révélés`
      }
    };
  }

  const keyRows = rows.filter(l => ["key_missing", "key_approved"].includes(l.status));
  if (keyRows.length > 0) {
    const pass = keyRows.filter(l => l.status === "key_approved").length;
    const fail = keyRows.filter(l => l.status === "key_missing").length;

    rebuilt.approve_key = {
      status: pass > 0 ? "success" : (fail > 0 ? "partial" : "pending"),
      data: {
        pass,
        fail,
        count: pass + fail,
        message: `${pass} champs clés approuvés · ${fail} champs clés manquants`
      }
    };
  }

  const secRows = rows.filter(l => ["fields_missing", "fields_approved"].includes(l.status));
  if (secRows.length > 0) {
    const pass = secRows.filter(l => l.status === "fields_approved").length;
    const fail = secRows.filter(l => l.status === "fields_missing").length;

    rebuilt.approve_sec = {
      status: pass > 0 ? "success" : (fail > 0 ? "partial" : "pending"),
      data: {
        pass,
        fail,
        count: pass + fail,
        message: `${pass} champs cibles approuvés · ${fail} champs cibles manquants`
      }
    };
  }

  const imageRows = rows.filter(l => l.status === "image_generated");
  if (imageRows.length > 0) {
    rebuilt.gen_image = {
      status: "success",
      data: {
        count: imageRows.length,
        errors: 0,
        message: `${imageRows.length} image(s) générée(s)`
      }
    };
  }

  const imgReviewRows = rows.filter(l => l.status === "image_generated");
  if (imgReviewRows.length > 0) {
    rebuilt.approve_img = {
      status: "success",
      data: {
        pass: imgReviewRows.filter(l => !!l.imgApproved).length,
        fail: imgReviewRows.filter(l => !l.imgApproved).length,
        count: imgReviewRows.length,
        message: `${imgReviewRows.length} image(s) à valider`
      }
    };
  }

  const approvalRows = rows.filter(l => l.status === "approval_ready");
  if (approvalRows.length > 0) {
    rebuilt.approve_all = {
      status: "success",
      data: {
        count: approvalRows.length,
        message: `${approvalRows.length} annonce(s) prêtes pour approbation`
      }
    };
  }

  const userRows = rows.filter(l => l.status === "user_ready");
  if (userRows.length > 0) {
    rebuilt.create_user = {
      status: "success",
      data: {
        count: userRows.length,
        message: `${userRows.length} compte(s) à créer`
      }
    };
  }

  const publishRows = rows.filter(l => l.status === "publish_ready");
  if (publishRows.length > 0) {
    rebuilt.publish = {
      status: "success",
      data: {
        count: publishRows.length,
        message: `${publishRows.length} annonce(s) prêtes à publier`
      }
    };
  }

  return rebuilt;
};

  const getStatus=(stepId)=>stepResults[stepId]?.status||"pending";
  const stepColor=(s)=>({pending:P.muted,running:P.amber,success:P.green,error:P.red,skipped:P.muted,partial:P.purple}[s]||P.muted);

const toggleRelaunchSelection = (stepId, listingId) => {
  setRelaunchSelection(prev => {
    const current = Array.isArray(prev[stepId]) ? prev[stepId] : [];
    const next = current.includes(listingId)
      ? current.filter(id => id !== listingId)
      : [...current, listingId];

    return {
      ...prev,
      [stepId]: next
    };
  });
};


const toggleDeleteSelection = (stepId, listingId) => {
  setDeleteSelection(prev => {
    const current = prev[stepId] || [];
    const exists = current.includes(listingId);

    const next = {
      ...prev,
      [stepId]: exists
        ? current.filter(id => id !== listingId)
        : [...current, listingId]
    };

    console.log("[DELETE][toggle]", {
      stepId,
      listingId,
      before: current,
      after: next[stepId]
    });

    return next;
  });
};


// ------------------- LANCER SUPPRIMER DEPUIS AGENTS TRAVIO------------------

async function hardDeleteListing(listing, listings, persist, addLog) {
  const listingId = listing.id;
  const listingUrl = listing.url || "";

  try {
    addLog(`🗑️ Suppression: ${listingUrl}`);

    // 1) delete blob images linked to this listing
    try {
      const blobUrls = [
        ...(Array.isArray(listing.generated?.generatedImages)
          ? listing.generated.generatedImages.flatMap(img => [
              img?.storedUrl || "",
              img?.originalUrl || ""
            ])
          : []),
        ...(Array.isArray(listing.generated?.sourceImages)
          ? listing.generated.sourceImages.flatMap(img => [
              img?.storedUrl || "",
              img?.originalUrl || ""
            ])
          : []),
        listing.approvedImageUrl || "",
        listing.generatedImg || ""
      ]
        .filter(Boolean)
        .filter(u => /^https?:\/\/.+blob\.vercel-storage\.com\//i.test(u));

      if (blobUrls.length) {
        await fetch("/api/wordpress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete_blob_images",
            urls: [...new Set(blobUrls)]
          })
        });
      }
    } catch (e) {
      addLog(`⚠ Blob delete failed: ${e.message}`, "warn");
    }

    // 2) delete old KV image cache key if it exists
    try {
      await kvDel(`travito:pm_image:${listingId}`);
    } catch (e) {
      addLog(`⚠ KV image delete failed: ${e.message}`, "warn");
    }

    // 3) remove from PM Auto listings only
    const next = listings.filter(l => l.id !== listingId);
    await persist(next);

    // 4) KEEP seenUrls intact on purpose
    // 5) KEEP Data Manager state intact on purpose

    return { pass: true, next };
  } catch (e) {
    addLog(`❌ Delete error: ${e.message}`, "error");
    return { pass: false };
  }
}

//----------------------------manual bulk delete (selection-based) tied to a step-------------------

const deleteSelectedListingsForStep = async (stepId) => {
  const selectedIds = deleteSelection[stepId] || [];
  if (!selectedIds.length) return;

  const removedRows = listings.filter(l => selectedIds.includes(l.id));
  console.log("[DELETE][hard wipe][start]", {
    stepId,
    selectedIds,
    beforeCount: listings.length,
    afterCount: listings.length - selectedIds.length,
    removedRows: removedRows.map(l => ({
      id: l.id,
      status: l.status,
      url: l.url,
      day: l.dayConfig?.day,
      week: l.dayConfig?.week
    }))
  });

  let workingListings = [...listings];
  let deleted = 0;

  for (const id of selectedIds) {
    const listing = workingListings.find(l => l.id === id);
    if (!listing) continue;

    const r = await hardDeleteListing(
      listing,
      workingListings,

async (next) => {
  const cleanNext = sanitizeListingsForKV(next);
  workingListings = cleanNext;
  onListingsChange(cleanNext);
  await kvSet(KV_KEYS.listings, cleanNext);
},

      addLog
    );

    if (r.pass) deleted++;
  }

  await kvDel(semaineStateKey);
  await kvDel(searchCacheKey);

  const remainingDayRows = workingListings.filter(
    l => l.mode === "auto" &&
         l.dayConfig?.day === selectedDay &&
         l.dayConfig?.week === week
  );

  const rebuilt = buildStepResultsFromListings(remainingDayRows);

  setStepResults(rebuilt);

setOpenStepDetails(() => {
  const nextOpen = {};
  Object.keys(rebuilt).forEach(k => {
    nextOpen[k] = true;
  });
  if (rebuilt.create_url) nextOpen.create_url = true;
  return nextOpen;
});

  setDeleteSelection(prev => ({
    ...prev,
    [stepId]: []
  }));

  if (viewingListing && selectedIds.includes(viewingListing.id)) setViewingListing(null);
  if (editingListing && selectedIds.includes(editingListing.id)) setEditingListing(null);

  addLog(`🗑️ ${deleted} supprimé(s) définitivement`, "success");
};


const selectSourceImagesForGeneration = (listing, activeImgEngine) => {
  const sourceImages = Array.isArray(listing?.generated?.sourceImages)
    ? listing.generated.sourceImages
    : [];

  const setting = String(activeImgEngine?.source_images_count || "all");

  let selected = [];
  if (setting === "0") {
    selected = [];
  } else if (setting === "all") {
    selected = sourceImages;
  } else {
    const n = Math.max(0, Math.min(20, Number(setting) || 0));
    selected = sourceImages.slice(0, n);
  }

  return selected.map((img, i) => ({
    index: i,
    sourceIndex: img?.index ?? i,
    originalUrl: img?.originalUrl || img?.url || "",
    referenceImageUrl: img?.storedUrl || img?.url || ""
  })).filter(x => x.referenceImageUrl);
};

const cacheGeneratedImagesToBlob = async (listingId, generatedImages = []) => {
  const cached = [];

  for (const img of generatedImages) {
    try {
      const r = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cache_blob_image",
          imageUrl: img.url,
          listingId,
          index: img.index,
          kind: "generated"
        })
      });

      const d = await r.json();

      if (d?.success && d?.storedUrl) {
        cached.push({
          index: img.index,
          sourceIndex: img.sourceIndex,
          originalUrl: img.url,
          storedUrl: d.storedUrl,
          pathname: d.pathname,
          mimeType: d.mimeType || "image/webp",
          approved: false
        });
      } else {
        cached.push({
          index: img.index,
          sourceIndex: img.sourceIndex,
          originalUrl: img.url,
          storedUrl: img.url,
          pathname: "",
          mimeType: "image/webp",
          approved: false
        });
      }
    } catch (e) {
      console.log("[AUTO][cache generated image failed]", {
        listingId,
        index: img.index,
        url: img.url,
        error: e.message
      });

      cached.push({
        index: img.index,
        sourceIndex: img.sourceIndex,
        originalUrl: img.url,
        storedUrl: img.url,
        pathname: "",
        mimeType: "image/webp",
        approved: false
      });
    }
  }

  return cached;
};


  // Run a single step
const runStep = async (step, opts = {}) => {
  const mode = opts.mode || "launch";

setRunning(step.id);
setShowSessionLog(true);
setStepResults(p=>({...p,[step.id]:{status:"running",data:null}}));
addLog(`▶ Lancement: ${step.label}`);
    const t0=Date.now();

    try {
      let result={};


if(step.id==="search") {
  result = await stepEngine.search(dayConfig, listings, addLog, siteAdapters);
  const urls = result.urls || [];
  await kvSet(searchCacheKey, urls);
  setFoundUrls(urls);
  result.count = urls.length || 0;
  result.message = `${result.count} URL(s) trouvées`;
}


else if(step.id==="create_url") {
  const cachedUrls = await kvGet(searchCacheKey).then(v=>Array.isArray(v)?v:[]);
  const urls = foundUrls.length > 0 ? foundUrls : cachedUrls;

  const existingInitialManual = dayListings.filter(
    l =>
      l.status === "initial" &&
      l.mode === "auto" &&
      l.sourceMode === "manual_url"
  );

  if (!urls.length && !existingInitialManual.length) {
    addLog("⚠ Lancer d'abord Recherche Annonces ou ajouter URLs manuellement", "warn");
    result = { skip:true, message:"Pas d'URLs — lancer Recherche ou utiliser + URL" };
  } else if (!urls.length && existingInitialManual.length) {
    result = {
      created: 0,
      skipped: existingInitialManual.length,
      message: `${existingInitialManual.length} URL(s) manuelle(s) déjà enregistrée(s)`
    };
  } else {
    setFoundUrls(urls);
    result = await stepEngine.createUrlRecords(urls, dayConfig, selectedDay, week, listings, persist, addLog);
    result.message = `${result.created||0} créés · ${result.skipped||0} existants`;
    await kvDel(searchCacheKey);
    setFoundUrls([]);
  }
}


else if(step.id==="generate") {
  const effectiveIds = getEffectiveRelaunchIds("generate");

const limit = dayConfig?.maxAds || 10;

const pending = mode === "relaunch"
  ? dayListings
      .filter(l => l.status === "generate_failed" && effectiveIds.includes(l.id))
      .slice(0, limit)
  : dayListings
      .filter(l => l.status === "initial")
      .slice(0, limit);

  if(!pending.length){

addLog(
  mode === "relaunch"
    ? "ℹ Aucune annonce en échec sélectionnée à relancer"
    : "ℹ Aucune annonce initiale à générer",
  "info"
);
result = {
  skip:true,
  message: mode === "relaunch"
    ? "Aucun échec sélectionné"
    : "Rien à générer"
};

  } else {
    let done = 0, failed = 0;
    const generatedIds = [];

    for (const listing of pending) {
      try {
        addLog(
          mode === "relaunch"
            ? `  🔄 Relance génération: ${listing.url.substring(0,50)}...`
            : `  ✍️ Génération: ${listing.url.substring(0,50)}...`
        );


let success = false;

const waitForGenerate = new Promise(resolve => {
  const onDone = (ev) => {
    if (ev?.detail?.listingId !== listing.id) return;

    clearTimeout(timeout);
    window.removeEventListener("pm_auto_generate_done", onDone);
    resolve({
      success: !!ev?.detail?.success,
      error: ev?.detail?.error || null
    });
  };

  const timeout = setTimeout(() => {
    window.removeEventListener("pm_auto_generate_done", onDone);
    resolve({ success: false, timeout: true });
  }, 90000);

  window.addEventListener("pm_auto_generate_done", onDone);
});

window.dispatchEvent(new CustomEvent("pm_auto_generate", {
  detail: { listingId: listing.id, openPopup: false }
}));

const waitResult = await waitForGenerate;


console.log("[SEMAINE][generate wait result]", {
  id: listing.id,
  mode,
  waitResult
});

if (waitResult.success) {
  success = true;
  generatedIds.push(listing.id);
} else {
  const finalListings = await kvGet(KV_KEYS.listings).then(v => Array.isArray(v) ? v : []);
  const finalUpdated = finalListings.find(l => l.id === listing.id);

  console.log("[SEMAINE][final check]", {
    id: listing.id,
    status: finalUpdated?.status,
    hasGenerated: !!finalUpdated?.generated,
    mode
  });

  if (finalUpdated?.status === "generated" && finalUpdated?.generated) {
    success = true;
    generatedIds.push(listing.id);
  }
}


        if (success) {
          done++;
          addLog(
            mode === "relaunch"
              ? `  ✅ Relancée: ${listing.url.substring(0,50)}...`
              : `  ✅ Générée: ${listing.url.substring(0,50)}...`,
            "success"
          );
        } else {
          failed++;
          addLog(
            mode === "relaunch"
              ? `  ❌ Timeout / relance incomplète: ${listing.url.substring(0,50)}...`
              : `  ❌ Timeout / génération incomplète: ${listing.url.substring(0,50)}...`,
            "error"
          );
        }
      } catch(e) {
        failed++;
        addLog(`  ❌ Erreur: ${e.message}`,"error");
      }
    }

    const latestListings = await kvGet(KV_KEYS.listings).then(v => Array.isArray(v) ? v : []);
    const refreshed = latestListings.filter(l => generatedIds.includes(l.id));

    result = {
      done,
      failed,
      generatedListings: refreshed,
      message: mode === "relaunch"
        ? `${done} relancées · ${failed} échecs`
        : `${done} générées · ${failed} échecs`
    };

    if (mode === "relaunch") {
      setRelaunchSelection(prev => ({ ...prev, generate: [] }));
    }
  }
}



else if(step.id==="sync_user") {

const limit = dayConfig?.maxAds || 10;
const effectiveIds = getEffectiveRelaunchIds("sync_user");

const toProcess = mode === "relaunch"
  ? dayListings
      .filter(l => l.status === "phone_not_revealed" && effectiveIds.includes(l.id))
      .slice(0, limit)
  : dayListings
      .filter(l => l.status === "generated")
      .slice(0, limit);

  if(!toProcess.length){
    result = {
      skip:true,
      message: mode === "relaunch"
        ? "Aucune annonce en échec sélectionnée à relancer"
        : "Aucune annonce générée à valider téléphone"
    };
  } else {
    let revealed = 0, failed = 0;
    let workingListings = [...listings];

    for (const l of toProcess) {
      const currentListing =
        workingListings.find(x => x.id === l.id) || l;

      const r = await stepEngine.validateUsernamePhone(currentListing, addLog);

      workingListings = workingListings.map(item =>
        item.id === currentListing.id ? r.patch : item
      );

      if (r.pass) {
        revealed++;

        if (r.patch?.status === "phone_revealed") {
          await syncCompteAfterReveal(r.patch, addLog);
        }
      } else {
        failed++;
      }
    }

    await persist(workingListings);

    const refreshedPhoneRows = workingListings.filter(l =>
      l.dayConfig?.day === selectedDay &&
      l.dayConfig?.week === week &&
      ["phone_revealed","phone_not_revealed"].includes(l.status)
    );

    result = {
      count: revealed,
      errors: failed,
      phoneListings: refreshedPhoneRows,
      message: `${revealed} téléphone(s) révélés · ${failed} non révélés`
    };
  }
}

else if(step.id==="approve_key") {

const limit = dayConfig?.maxAds || 10;
const effectiveIds = getEffectiveRelaunchIds("approve_key");

const toApprove = mode === "relaunch"
  ? dayListings
      .filter(l => l.status === "key_missing" && effectiveIds.includes(l.id))
      .slice(0, limit)
  : dayListings
      .filter(l => l.status === "phone_revealed")
      .slice(0, limit);

  if(!toApprove.length){
    result = {
      skip:true,
      message: mode === "relaunch"
        ? "Aucune annonce en échec sélectionnée à relancer"
        : "Aucune annonce téléphone révélé à valider"
    };
  } else {
    let pass = 0, fail = 0;
    let workingListings = [...listings];

    for (const l of toApprove) {
      const currentListing =
        workingListings.find(x => x.id === l.id) || l;

      const r = await stepEngine.approveKeyFields(
        currentListing,
        workingListings,
        villeTax,
        async(next) => { workingListings = next; },
        addLog
      );

      r.pass ? pass++ : fail++;
    }

    await persist(workingListings);

    const keyListings = workingListings.filter(l =>
      l.dayConfig?.day === selectedDay &&
      l.dayConfig?.week === week &&
      ["key_approved", "key_missing"].includes(l.status)
    );

    result = {
      pass,
      fail,
      count: pass + fail,
      keyListings,
      message: `${pass} champs clés approuvés · ${fail} champs clés manquants`
    };
  }
}


else if(step.id==="approve_sec") {

const limit = dayConfig?.maxAds || 10;
const effectiveIds = getEffectiveRelaunchIds("approve_sec");

const toApprove = mode === "relaunch"
  ? dayListings
      .filter(l => l.status === "fields_missing" && effectiveIds.includes(l.id))
      .slice(0, limit)
  : dayListings
      .filter(l => l.status === "key_approved")
      .slice(0, limit);
  if(!toApprove.length){
    result = {
      skip:true,
      message: mode === "relaunch"
        ? "Aucune annonce en échec sélectionnée à relancer"
        : "Aucune annonce champs clés approuvés à valider"
    };
  } else {
    let pass = 0, fail = 0;
    let workingListings = [...listings];

    for (const l of toApprove) {
      const currentListing =
        workingListings.find(x => x.id === l.id) || l;

      const r = await stepEngine.approveSecFields(
        currentListing,
        workingListings,
        mapping,
        secondaryFields,
        async(next) => { workingListings = next; },
        addLog,
        !!dayConfig?.withImage
      );

      r.pass ? pass++ : fail++;
    }

    await persist(workingListings);

    const secListings = workingListings.filter(l =>
      l.dayConfig?.day === selectedDay &&
      l.dayConfig?.week === week &&
      ["fields_approved", "fields_missing", "approval_ready"].includes(l.status)
    );

    result = {
      pass,
      fail,
      count: pass + fail,
      secListings,
      message: `${pass} champs cibles approuvés · ${fail} champs cibles manquants`
    };
  }
}




// GENERER IMAGE

else if(step.id==="gen_image") {
  const limit = dayConfig?.maxAds || 10;
  const effectiveIds = getEffectiveRelaunchIds("gen_image");
  const activeImgEngine = getActiveImgGenEngine(imgGenRegistry || []);

  const toProcess = mode === "relaunch"
    ? dayListings
        .filter(l =>
          l.status === "image_error" &&
          effectiveIds.includes(l.id)
        )
        .slice(0, limit)
    : dayListings
        .filter(l => l.status === "fields_approved")
        .slice(0, limit);

  if (!toProcess.length) {
    result = {
      skip: true,
      message: mode === "relaunch"
        ? "Aucune image en échec sélectionnée à relancer"
        : "Aucune annonce prête pour génération image"
    };
  } else {
    let done = 0, failed = 0;
    let workingListings = [...listings];

    for (const l of toProcess) {
      const current = workingListings.find(x => x.id === l.id) || l;

      try {
        const sourceItems = selectSourceImagesForGeneration(current, activeImgEngine);

addLog(
  `  🔎 Sources détectées: ${sourceItems.length} [${sourceItems.map(s => s.sourceIndex).join(", ")}]`,
  "info"
);

console.log("[GEN_IMAGE] listing", current.id, current.url);
console.log("[GEN_IMAGE] sourceItems count =", sourceItems.length);
console.log("[GEN_IMAGE] sourceItems =", sourceItems.map(x => ({
  sourceIndex: x.sourceIndex,
  referenceImageUrl: x.referenceImageUrl?.slice(0, 120)
})));

        addLog(
          mode === "relaunch"
            ? `  🔄 Relance images IA: ${current.url.substring(0,50)}...`
            : `  🖼️ Génération images IA: ${current.url.substring(0,50)}...`,
          "info"
        );

        if (!sourceItems.length) {
          workingListings = workingListings.map(x =>
            x.id === current.id
              ? { ...x, status: "image_error", imageError: "Aucune image source sélectionnée" }
              : x
          );

          failed++;
          addLog("  ❌ Aucune image source sélectionnée", "error");
          continue;
        }

        const basePrompt =
          current.generated?.photoDescription ||
          current.generated?.photoDescriptionOriginal ||
          "";

        if (!basePrompt) {
          workingListings = workingListings.map(x =>
            x.id === current.id
              ? { ...x, status: "image_error", imageError: "Prompt image manquant" }
              : x
          );

          failed++;
          addLog("  ❌ Prompt image manquant", "error");
          continue;
        }

        const rawGenerated = [];

        for (const srcImg of sourceItems) {
          let imageResp = null;

          if (!activeImgEngine || activeImgEngine.provider_key === "claude_vision") {
            const r = await fetch("/api/youtube", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "image_generate_auto_ref",
                prompt: basePrompt,
                listingId: `${current.id}_${srcImg.sourceIndex}`,
                referenceImageUrl: srcImg.referenceImageUrl
              })
            });

            imageResp = await r.json();

          } else if (activeImgEngine.provider_key === "openai_gpt_image") {
            const gptPrompt =
              String(activeImgEngine.default_prompt || "").trim() ||
              "Use the attached image as the primary source. Create the exact same image without any watermark or marketplace overlay. Preserve the exact subject, composition, framing, colors, proportions, count of items, background, and aspect ratio. Do not redesign, restyle, replace, crop, expand, or reinterpret the image. Only remove the watermark and make minimal clarity improvements if needed.";

            const outputFormat = mapImgOutputFormatForOpenAI(activeImgEngine.output_format || "webp");
            const fallbackFormat = activeImgEngine.fallback_format || "jpg";
            const size = getOpenAIImageSize(activeImgEngine);
            const engineMode = activeImgEngine.default_mode || "edit";

            const r = await fetch("/api/youtube", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "image_generate_openai_ref",
                listingId: `${current.id}_${srcImg.sourceIndex}`,
                prompt: gptPrompt,
                referenceImageUrl: srcImg.referenceImageUrl,
                outputFormat,
                fallbackFormat,
                size,
                mode: engineMode,
                preserveRatio: !!activeImgEngine.preserve_ratio
              })
            });

            const raw = await r.text();
            try {
              imageResp = JSON.parse(raw);
            } catch {
              throw new Error(`Réponse API non JSON: ${raw.slice(0, 180)}`);
            }

          } else {
            throw new Error(`Engine non supporté: ${activeImgEngine.provider_key}`);
          }

          if (!imageResp?.success || !imageResp?.imageUrl) {
            throw new Error(imageResp?.error || `Échec génération image source #${srcImg.sourceIndex}`);
          }

          rawGenerated.push({
            index: rawGenerated.length,
            sourceIndex: srcImg.sourceIndex,
            url: imageResp.imageUrl
          });

console.log("[GEN_IMAGE] pushed raw image", {
  sourceIndex: srcImg.sourceIndex,
  imageUrl: imageResp.imageUrl
});

        }

console.log("[GEN_IMAGE] rawGenerated count before cache =", rawGenerated.length);
console.log("[GEN_IMAGE] rawGenerated urls =", rawGenerated.map(x => x.url));

addLog(
  `  🔎 Raw générées avant cache: ${rawGenerated.length}`,
  "info"
);

        const cachedGenerated = await cacheGeneratedImagesToBlob(current.id, rawGenerated);

addLog(
  `  🔎 Images après cache blob: ${cachedGenerated.length}`,
  "info"
);

console.log("[GEN_IMAGE] cachedGenerated count =", cachedGenerated.length);
console.log("[GEN_IMAGE] cachedGenerated =", cachedGenerated.map(x => ({
  storedUrl: x.storedUrl,
  originalUrl: x.originalUrl,
  sourceIndex: x.sourceIndex
})));

        if (!cachedGenerated.length) {
          throw new Error("Aucune image générée mise en cache");
        }

        const firstGeneratedUrl = cachedGenerated[0]?.storedUrl || cachedGenerated[0]?.originalUrl || "";

        workingListings = workingListings.map(x =>
          x.id === current.id
            ? {
                ...x,
                status: "image_generated",
                generatedImg: firstGeneratedUrl,

generated: {
  ...(x.generated || {}),
  generatedImages: cachedGenerated.map((img, i) => ({
    index: i,
    sourceIndex: img.sourceIndex ?? i,
    storedUrl: img.storedUrl || "",
    originalUrl: String(img.originalUrl || "").startsWith("data:") ? "" : (img.originalUrl || ""),
    pathname: img.pathname || ""
  }))
},

                imageMeta: {
                  ...(x.imageMeta || {}),
                  generatedCount: cachedGenerated.length,
                  engine: activeImgEngine?.provider_key || "claude_vision",
                  generatedAt: new Date().toISOString()
                }
              }
            : x
        );

        done++;
        addLog(`  ✅ ${cachedGenerated.length} image(s) générée(s)`, "success");
      } catch (e) {
        workingListings = workingListings.map(x =>
          x.id === current.id
            ? {
                ...x,
                status: "image_error",
                imageError: e.message
              }
            : x
        );

        failed++;
        addLog(`  ❌ ${e.message}`, "error");
      }
    }

const persistPayload = JSON.stringify(workingListings);
console.log("[GEN_IMAGE] persist payload chars =", persistPayload.length);

    await persist(workingListings);

    if (mode === "relaunch") {
      setRelaunchSelection(prev => ({ ...prev, gen_image: [] }));
    }

    result = {
      done,
      failed,
      message: mode === "relaunch"
        ? `${done} relancées · ${failed} échecs`
        : `${done} images générées · ${failed} échecs`
    };
  }
}






// APPROUVER IMAGE

else if(step.id==="approve_img") {
  const limit = dayConfig?.maxAds || 10;
  const effectiveIds = getEffectiveRelaunchIds("approve_img");

  const toApprove = mode === "relaunch"
    ? dayListings
        .filter(l =>
          l.status === "approve_img_failed" &&
          effectiveIds.includes(l.id)
        )
        .slice(0, limit)
: dayListings
    .filter(l => {
      const generatedCount =
        Array.isArray(l.generated?.generatedImages)
          ? l.generated.generatedImages.length
          : 0;

      const hasGenerated = generatedCount > 0 || !!l.generatedImg;

      return (
        l.status === "image_generated" &&
        hasGenerated &&
        !l.imgApproved
      );
    })
    .slice(0, limit);

  if(!toApprove.length){
    result = {
      skip:true,
      message: mode === "relaunch"
        ? "Aucune image en échec sélectionnée à relancer"
        : "Aucune image à approuver"
    };
  } else {
    let pass = 0, fail = 0;
    let workingListings = [...listings];

    for(const l of toApprove){
      const current = workingListings.find(x => x.id === l.id) || l;
      const r = await stepEngine.approveImage(current, workingListings, async(next) => {
        workingListings = next;
      }, addLog);

      if (r.pass) {
        pass++;
      } else {
        fail++;
        workingListings = workingListings.map(x =>
          x.id === current.id
            ? {
                ...x,
                status: "approve_img_failed"
              }
            : x
        );
      }
    }

    await persist(workingListings);

    if (mode === "relaunch") {
      setRelaunchSelection(prev => ({ ...prev, approve_img: [] }));
    }

    result = {
      pass,
      fail,
      message: `${pass} approuvées · ${fail} rejetées`
    };
  }
}    


// APPROUVE ALL

      else if(step.id==="approve_all") {
        const limit = dayConfig?.maxAds || 10;
        const effectiveIds = getEffectiveRelaunchIds("approve_all");

        const toApprove = mode === "relaunch"
          ? dayListings
              .filter(l =>
                l.status === "approve_all_failed" &&
                effectiveIds.includes(l.id)
              )
              .slice(0, limit)
          : dayListings
              .filter(l => l.status === "approval_ready")
              .slice(0, limit);

        if(!toApprove.length){
          result = {
            skip:true,
            message: mode === "relaunch"
              ? "Aucune annonce en échec sélectionnée à relancer"
              : "Aucune annonce à approuver"
          };
        } else {
          let pass = 0, fail = 0;
          let workingListings = [...listings];

          for(const l of toApprove){
            const current = workingListings.find(x => x.id === l.id) || l;

            const r = await stepEngine.approveAll(
              current,
              workingListings,
              async (next) => {
                workingListings = next;
              },
              addLog
            );

            if (r.pass) {
              pass++;
            } else {
              fail++;

              workingListings = workingListings.map(x =>
                x.id === current.id
                  ? {
                      ...x,
                      status: "approve_all_failed",
                      approveAllMeta: {
                        ...(x.approveAllMeta || {}),
                        failedAt: new Date().toISOString(),
                        fails: Array.isArray(r.fails) ? r.fails : []
                      }
                    }
                  : x
              );
            }
          }

          await persist(workingListings);

          if (mode === "relaunch") {
            setRelaunchSelection(prev => ({ ...prev, approve_all: [] }));
          }

          result = {
            pass,
            fail,
            message: `${pass} approuvées · ${fail} avec problèmes`
          };
        }
      }


// CREER USER WP

else if(step.id==="create_user") {
  const limit = dayConfig?.maxAds || 10;
  const effectiveIds = getEffectiveRelaunchIds("create_user");

  const toCreate = mode === "relaunch"
    ? dayListings
        .filter(l =>
          l.status === "create_user_failed" &&
          effectiveIds.includes(l.id)
        )
        .slice(0, limit)
    : dayListings
        .filter(l => l.status === "user_ready")
        .slice(0, limit);

  if (!toCreate.length) {
    result = {
      skip: true,
      message: mode === "relaunch"
        ? "Aucun compte en échec sélectionné à relancer"
        : "Aucun compte à créer"
    };
  } else {
    let done = 0, failed = 0;
    let workingListings = [...listings];

    for (const l of toCreate) {
      const current = workingListings.find(x => x.id === l.id) || l;

      const r = await stepEngine.createWpUser(
        current,
        workingListings,
        async (next) => {
          workingListings = next;
        },
        addLog
      );

      if (r.pass) {
        done++;
      } else {
        failed++;

        workingListings = workingListings.map(x =>
          x.id === current.id
            ? {
                ...x,
                status: "create_user_failed",
                createUserMeta: {
                  ...(x.createUserMeta || {}),
                  failedAt: new Date().toISOString(),
                  error: r.error || "create_user_failed"
                }
              }
            : x
        );
      }
    }

    await persist(workingListings);

    if (mode === "relaunch") {
      setRelaunchSelection(prev => ({ ...prev, create_user: [] }));
    }

    result = {
      count: done,
      errors: failed,
      message: `${done} comptes créés/liés · ${failed} échecs`
    };
  }
}


// PUBLIER ANNONCE WP

else if(step.id==="publish") {
  const limit = dayConfig?.maxAds || 10;
  const effectiveIds = getEffectiveRelaunchIds("publish");

  const toPublish = mode === "relaunch"
    ? dayListings
        .filter(l =>
          l.status === "publish_failed" &&
          effectiveIds.includes(l.id)
        )
        .slice(0, limit)
    : dayListings
        .filter(l => l.status === "publish_ready")
        .slice(0, limit);

  if (!toPublish.length) {
    result = {
      skip: true,
      message: mode === "relaunch"
        ? "Aucune annonce en échec sélectionnée à relancer"
        : "Aucune annonce prête à publier"
    };
  } else {
    let done = 0;
    let failed = 0;
    let workingListings = [...listings];

    for (const l of toPublish) {
      const current = workingListings.find(x => x.id === l.id) || l;

      const r = await stepEngine.publishToTravito(
        current,
        workingListings,
        async (next) => {
          workingListings = next;
        },
        addLog,
        primaryFields
      );

      if (r.pass) {
        done++;
      } else {
        failed++;

        workingListings = workingListings.map(x =>
          x.id === current.id
            ? {
                ...x,
                status: "publish_failed",
                publishMeta: {
                  ...(x.publishMeta || {}),
                  failedAt: new Date().toISOString(),
                  error: r.error || "publish_failed"
                }
              }
            : x
        );
      }
    }

    await persist(workingListings);

    if (mode === "relaunch") {
      setRelaunchSelection(prev => ({ ...prev, publish: [] }));
    }

    result = {
      count: done,
      errors: failed,
      message: `${done} annonce(s) publiées · ${failed} échec(s)`
    };
  }
}


else if (step.id === "delete") {
  const r = await cleanupPublishedForSelectedPeriod();

  result = {
    count: r?.deletedCount || 0,
    message: r?.deletedCount
      ? `${r.deletedCount} annonce(s) publiée(s) nettoyée(s)`
      : "Aucune annonce publiée à nettoyer pour ce jour/semaine"
  };
}
      

const dur=Math.round((Date.now()-t0)/1000);
const finalStatus = result.skip ? "skipped" : "success";

setStepResults(p=>({...p,[step.id]:{status:finalStatus,data:{...result,durationSec:dur}}}));
setOpenStepDetails(p=>({...p,[step.id]:true}));
addLog(`✅ ${step.label} terminé (${dur}s): ${result.message||"OK"}`,result.skip?"info":"success");

if (onAddLog) {
  onAddLog({
    status: finalStatus,
    startedAt: new Date(Date.now() - dur * 1000).toISOString(),
    day: selectedDay,
    week,
    stepId: step.id,
    stepLabel: step.label,

    urlsFound: step.id==="search" ? (result.count||0) : "—",
    recordsCreated: step.id==="create_url" ? (result.created||0) : "—",
    generated: step.id==="generate" ? (result.count||0) : "—",

    approved: ["approve_key","approve_sec","approve_all"].includes(step.id)
      ? (result.pass||result.count||0)
      : "—",

    imagesGen: ["gen_image","approve_img"].includes(step.id)
      ? (result.count||result.pass||0)
      : "—",

    published: step.id==="publish"
      ? (result.count||0)
      : "—",

    errors: result.errors || result.fail || 0,

    message: result.message || `${step.label} terminé`,  // ✅ ADD THIS LINE

    durationSec: dur,

    messages: [...sessionLog]
      .slice(0,20)
      .map(m=>({at:m.at,text:m.msg,type:m.type}))
  });
}

    } catch(e) {
setStepResults(p=>({...p,[step.id]:{status:"error",data:{error:e.message}}}));
setOpenStepDetails(p=>({...p,[step.id]:true}));
addLog(`❌ ${step.label} erreur: ${e.message}`,"error");

if (onAddLog) {
  onAddLog({
    status: "error",
    startedAt: new Date().toISOString(),
    day: selectedDay,
    week,
    stepId: step.id,
    stepLabel: step.label,
    urlsFound: "—",
    recordsCreated: "—",
    generated: "—",
    approved: "—",
    imagesGen: "—",
    published: "—",
    errors: 1,
    durationSec: Math.round((Date.now()-t0)/1000),
    messages: [{at:new Date().toISOString(),text:e.message,type:"error"}]
  });
}
    }
    setRunning(null);
  };

  const deleteStep=(stepId)=>{
    setStepResults(p=>{const n={...p};delete n[stepId];return n;});
    addLog(`🗑️ Résultat effacé: ${FLOW_STEPS.find(f=>f.id===stepId)?.label||stepId}`);
  };


//------------------------PURGER DEPUIS AGENT TRAVITO KV and Blob
// HELPER
const collectListingBlobUrls = (listing) => {
  const urls = [
    ...(Array.isArray(listing.generated?.generatedImages)
      ? listing.generated.generatedImages.flatMap(img => [
          img?.storedUrl || "",
          img?.originalUrl || ""
        ])
      : []),

    ...(Array.isArray(listing.generated?.sourceImages)
      ? listing.generated.sourceImages.flatMap(img => [
          img?.storedUrl || "",
          img?.originalUrl || ""
        ])
      : []),

    listing.approvedImageUrl || "",
    listing.generatedImg || ""
  ]
    .filter(Boolean)
    .filter(u => /^https?:\/\/.+blob\.vercel-storage\.com\//i.test(u));

  return [...new Set(urls)];
};

// ---------CLEANUP PUBLISHED rECORDS------
const cleanupPublishedForSelectedPeriod = async () => {
  if (!selectedDay) return { deletedCount: 0 };

  const toRemove = listings.filter(
    l =>
      l.mode === "auto" &&
      l.dayConfig?.day === selectedDay &&
      l.dayConfig?.week === week &&
      l.status === "published"
  );

  if (!toRemove.length) {
    addLog("ℹ Aucune annonce publiée à nettoyer pour ce jour/semaine", "info");
    return { deletedCount: 0 };
  }

  const removeIds = new Set(toRemove.map(l => l.id));

  const blobUrls = [
    ...new Set(
      toRemove.flatMap(l => collectListingBlobUrls(l))
    )
  ];

  if (blobUrls.length) {
    try {
      await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_blob_images",
          urls: blobUrls
        })
      });
    } catch (e) {
      addLog(`⚠ Suppression Blob échouée: ${e.message}`, "warn");
    }
  }

  for (const l of toRemove) {
    try {
      for (let i = 0; i < 10; i++) {
  try {
    await kvDel(`travito:pm_image:${l.id}_${i}`);
  } catch {}
}
    } catch {}
  }

  const nextListings = listings.filter(l => !removeIds.has(l.id));
  await persist(nextListings);

  await kvDel(semaineStateKey);
  await kvDel(searchCacheKey);

  const remainingDayRows = nextListings.filter(
    l =>
      l.mode === "auto" &&
      l.dayConfig?.day === selectedDay &&
      l.dayConfig?.week === week
  );

  const rebuilt = buildStepResultsFromListings(remainingDayRows);
  setStepResults(rebuilt);

  setOpenStepDetails(() => {
    const nextOpen = {};
    Object.keys(rebuilt).forEach(k => {
      nextOpen[k] = true;
    });
    if (rebuilt.create_url) nextOpen.create_url = true;
    return nextOpen;
  });

  if (viewingListing && removeIds.has(viewingListing.id)) setViewingListing(null);
  if (editingListing && removeIds.has(editingListing.id)) setEditingListing(null);

  addLog(
    `🗑️ Nettoyage publié: ${toRemove.length} annonce(s) publiée(s) supprimée(s) du dashboard + Blob + KV image cache`,
    "success"
  );

  return { deletedCount: toRemove.length };
};





const purgeSelectedDayStorage = async () => {
  if (!selectedDay) return;

  const toRemove = listings.filter(
    l =>
      l.mode === "auto" &&
      l.dayConfig?.day === selectedDay &&
      l.dayConfig?.week === week
  );

  if (!toRemove.length) {
    addLog("ℹ Aucun stockage à purger pour ce jour/semaine", "info");
    return;
  }

  const removeIds = new Set(toRemove.map(l => l.id));

  const blobUrls = [
    ...new Set(
      toRemove.flatMap(l => collectListingBlobUrls(l))
    )
  ];

  if (blobUrls.length) {
    try {
      await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_blob_images",
          urls: blobUrls
        })
      });
    } catch (e) {
      addLog(`⚠ Suppression Blob purge échouée: ${e.message}`, "warn");
    }
  }

  for (const l of toRemove) {
    try {
      for (let i = 0; i < 10; i++) {
  try {
    await kvDel(`travito:pm_image:${l.id}_${i}`);
  } catch {}
}
    } catch {}
  }

  const nextListings = listings.filter(l => !removeIds.has(l.id));
  await persist(nextListings);

  await kvDel(semaineStateKey);
  await kvDel(searchCacheKey);

  setFoundUrls([]);
  setStepResults({});
  setOpenStepDetails({});
  setRelaunchSelection({});
  setDeleteSelection({});

  if (viewingListing && removeIds.has(viewingListing.id)) setViewingListing(null);
  if (editingListing && removeIds.has(editingListing.id)) setEditingListing(null);

  addLog(
    `🧹 Purge jour/semaine: ${toRemove.length} annonce(s) supprimée(s) tous états confondus + Blob + KV image cache`,
    "success"
  );
};


//------------------------------------------

const saveListingFromSemaine = async (updated) => {
  const next = listings.map(l => l.id === updated.id ? {
    ...l,
    ...updated,
    status: l.status,
    phoneStatus: l.phoneStatus,
    phonePlaceholder: l.phonePlaceholder,
    phoneSource: l.phoneSource,
    phoneMeta: l.phoneMeta,
    wpUserId: l.wpUserId,
    wpPostId: l.wpPostId
  } : l);

  await persist(next);
  setEditingListing(null);
};


const deleteListingFromSemaine = async (id) => {
  const removed = listings.find(l => l.id === id);
  const next = listings.filter(l => l.id !== id);

  await persist(next);

  if (removed?.url) {
    setFoundUrls(prev => prev.filter(u => u !== removed.url));
  }

  const remainingDayRows = next.filter(
    l => l.mode === "auto" &&
         l.dayConfig?.day === selectedDay &&
         l.dayConfig?.week === week
  );

  const rebuilt = buildStepResultsFromListings(remainingDayRows);
  setStepResults(rebuilt);

  setOpenStepDetails(prev => {
    const nextOpen = { ...prev };
    Object.keys(nextOpen).forEach(k => {
      nextOpen[k] = !!rebuilt[k];
    });
    if (rebuilt.create_url) nextOpen.create_url = true;
    return nextOpen;
  });

  if (viewingListing?.id === id) setViewingListing(null);
  if (editingListing?.id === id) setEditingListing(null);

  addLog(`🗑️ Annonce supprimée définitivement`, "success");
};



const savePopupFromSemaine = async (generated, imgApproved, uploadedRefImgArg = null) => {
  if (!viewingListing) return;

  const currentListing = listings.find(l => l.id === viewingListing.id) || viewingListing;

  const patched = {
    ...currentListing,
    generated: {
      ...(generated || {})
    },
    approvedImageUrl: imgApproved
      ? (generated?.approvedImageUrl || currentListing.approvedImageUrl || null)
      : (generated?.approvedImageUrl || null),
    imgApproved: !!imgApproved
  };

  const next = listings.map(l => l.id === currentListing.id ? patched : l);
  await persist(next);

  setViewingListing(null);
};

const approvePopupFromSemaine = async (generated, imgApproved, uploadedRefImgArg = null) => {
  if (!viewingListing) return;

  const currentListing = listings.find(l => l.id === viewingListing.id) || viewingListing;

  const patched = {
    ...currentListing,
    generated: {
      ...(generated || {})
    },
    approvedImageUrl: imgApproved
      ? (generated?.approvedImageUrl || currentListing.approvedImageUrl || null)
      : (generated?.approvedImageUrl || null),
    imgApproved: !!imgApproved
  };

  const next = listings.map(l => l.id === currentListing.id ? patched : l);
  await persist(next);

  setViewingListing(null);
};

  // Count listings per status for header
  const statusCounts={};
  dayListings.forEach(l=>{statusCounts[l.status]=(statusCounts[l.status]||0)+1;});

  return (
    <div style={{display:"flex",flex:1,minHeight:0,overflow:"hidden"}}>
      {/* Day selector */}
      <div style={{width:160,flexShrink:0,borderRight:`1px solid ${P.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"8px 10px",borderBottom:`1px solid ${P.border}`,fontSize:10,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
          Semaine
        </div>
        <div style={{padding:8,borderBottom:`1px solid ${P.border}`}}>
  <select
    value={week}
    onChange={e=>{
      setSelectedWeek(e.target.value);
      setStepResults({});
      setSessionLog([]);
      setFoundUrls([]);
    }}
    style={{...inp,fontSize:11,cursor:"pointer",padding:"6px 8px"}}
  >
    {weekOptions.map(w=><option key={w} value={w}>{w}</option>)}
  </select>
</div>
        <div style={{flex:1,overflowY:"auto"}}>
          {DAYS_FR.map(day=>{
            const dc=config?.[day]; const active=selectedDay===day;
            const dl=listings.filter(l=>l.mode==="auto"&&l.dayConfig?.day===day&&l.dayConfig?.week===week);
            return (
              <div key={day} onClick={()=>{setSelectedDay(day);setSessionLog([]);}}
                style={{padding:"10px 12px",cursor:"pointer",borderBottom:`1px solid ${P.border}`,
                  background:active?P.blueS:"transparent",borderLeft:`3px solid ${active?P.blue:"transparent"}`}}>
                <div style={{fontSize:11,fontWeight:600,color:active?P.blue:P.text}}>{day}</div>
                <div style={{fontSize:9,marginTop:2,color:dc?.enabled?P.green:P.muted}}>
                  {dc?.enabled?"● Configuré":"○ Non configuré"}
                </div>
                {dl.length>0&&<div style={{fontSize:8,color:P.blue,marginTop:1}}>{dl.length} annonce{dl.length>1?"s":""}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {!selectedDay ? (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:P.muted}}>
            <div style={{fontSize:36}}>📅</div>
            <div style={{fontSize:12}}>Sélectionnez un jour dans le panneau gauche</div>
          </div>
        ) : (<>
          {/* Header */}
          <div style={{padding:"10px 16px",borderBottom:`1px solid ${P.border}`,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:P.text}}>{selectedDay} — {week}</div>
                <div style={{fontSize:10,color:P.muted,marginTop:2,display:"flex",gap:10,flexWrap:"wrap"}}>
                  <span style={{color:dayConfig?.enabled?P.green:P.amber}}>
                    {dayConfig?.enabled?"● Config active":"⚠ Jour non configuré"}
                  </span>
                  {dayConfig?.startTime&&<span>Début: {dayConfig.startTime}</span>}
                  {dayListings.length>0&&<span style={{color:P.blue}}>{dayListings.length} annonce{dayListings.length>1?"s":""} ce jour</span>}
                </div>
              </div>
              {/* Status summary chips */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {Object.entries(statusCounts).map(([s,n])=>{
                  const sd=STATUS_DEF[s]||{color:P.muted,bg:"transparent",label:s};
                  return <span key={s} style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:sd.bg,color:sd.color,border:`1px solid ${sd.color}33`}}>{sd.label}: {n}</span>;
                })}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 14px 40px"}}>
            {FLOW_STEPS.map((step,i)=>{
              const status=getStatus(step.id);
              const result=stepResults[step.id];
              const sc=stepColor(status);
              const isRunning=running===step.id;
              return (
                <div key={step.id} style={{marginBottom:10}}>
                  <div style={{background:P.surface,
                    border:`1px solid ${status==="success"?P.green:status==="error"?P.red:status==="skipped"?P.muted:P.border}`,
                    borderRadius:8,padding:"10px 14px"}}>

<div style={{display:"flex",alignItems:"center",gap:10}}>
  <div style={{width:30,height:30,borderRadius:"50%",background:P.card,border:`2px solid ${sc}`,
    display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
    {isRunning?"⏳":status==="success"?"✅":status==="error"?"❌":status==="skipped"?"⏭":step.icon}
  </div>
  <div style={{flex:1}}>
    <div style={{fontSize:11,fontWeight:600,color:P.text}}>{step.label}</div>
    <div style={{fontSize:9,color:P.muted,marginTop:1}}>{step.desc}</div>
    {isRunning&&(
      <div style={{fontSize:9,color:P.amber,marginTop:4}}>
        ⏳ Exécution en cours...
      </div>
    )}
  </div>

<div style={{display:"flex",gap:5,flexShrink:0}}>



  {result && !isRunning && (
    <button
      onClick={()=>setOpenStepDetails(p=>({...p,[step.id]:!p[step.id]}))}
      style={{...btn(P.muted,P.card),padding:"3px 8px",fontSize:9}}
    >
      {openStepDetails[step.id] ? "▾" : "▸"}
    </button>
  )}


{result && !isRunning && openStepDetails[step.id] && (
  <button

onClick={async () => {
  console.log("[DELETE][button click]", {
    stepId: step.id,
    selectedIds: deleteSelection[step.id] || []
  });

  if (step.id !== "sync_user") {
    deleteStep(step.id);
    return;
  }

  const selectedIds = deleteSelection[step.id] || [];
  if (!selectedIds.length) {
    console.log("[DELETE][button click] no selected ids for sync_user");
    return;
  }

  await deleteSelectedListingsForStep(step.id);
}}

    style={{...btn(P.muted,P.card),padding:"3px 7px",fontSize:9}}
    title={
      step.id === "sync_user"
        ? ((deleteSelection[step.id] || []).length
            ? "Supprimer définitivement les éléments cochés"
            : "Aucun élément coché")
        : "Fermer / vider le résultat"
    }
  >
    🗑️
  </button>
)}


{step.id === "search" && (
  <button
    onClick={() => setShowManualUrlPopup(true)}
    disabled={!!running}
    style={{
      ...btn(P.blue, P.blueS),
      padding: "4px 10px",
      fontSize: 10,
      opacity: running ? 0.5 : 1
    }}
  >
    + URL
  </button>
)}

{result && !isRunning && (
  <button
    onClick={() => runStep(step, { mode: "relaunch" })}
    disabled={!!running || (step.id === "generate" && !(relaunchSelection.generate || []).length)}
    style={{
      ...btn(P.blue, P.blueS),
      padding: "4px 10px",
      fontSize: 10,
      opacity: (running || (step.id === "generate" && !(relaunchSelection.generate || []).length)) ? 0.5 : 1
    }}
  >
    🔄 Relancer
  </button>
)}



{/* Purger button (ONLY for delete step) */}
{step.id === "delete" && (
  <button
    onClick={purgeSelectedDayStorage}
    disabled={!!running}
    style={{
      ...btn(P.red, P.redS),
      padding: "4px 10px",
      fontSize: 10,
      opacity: running ? 0.5 : 1,
      marginRight: 6
    }}
  >
    🧹 Purger stockage
  </button>
)}

{/* Lancer button */}
<button
  onClick={() =>
    step.id === "delete"
      ? cleanupPublishedForSelectedPeriod()
      : runStep(step, { mode: "launch" })
  }
  disabled={!!running}
  style={{
    ...btn(isRunning ? P.amber : P.gold, isRunning ? P.amberS : P.goldS),
    padding: "4px 12px",
    fontSize: 10,
    opacity: running && !isRunning ? 0.5 : 1
  }}
>
  {isRunning ? "⏳ En cours..." : "▶ Lancer"}
</button>



                      </div>
                    </div>


                    {/* Result */}
                    {result && !isRunning && openStepDetails[step.id] && (
                      <div style={{marginTop:8,padding:"7px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}>
                        <div style={{fontSize:10,color:status==="error"?P.red:status==="skipped"?P.muted:P.green}}>
                          {status==="error"?"❌ ":status==="skipped"?"⏭ ":"✅ "}
                          {result.data?.message||result.data?.error||"Terminé"}
                          {result.data?.durationSec&&<span style={{color:P.muted,marginLeft:8,fontSize:9}}>{result.data.durationSec}s</span>}
                        </div>


{result.data?.count!==undefined&&(
  <div style={{fontSize:9,color:P.muted,marginTop:3}}>
    {result.data.count} élément{result.data.count!==1?"s":""}
    {result.data.errors>0&&<span style={{color:P.red,marginLeft:6}}>{result.data.errors} erreur{result.data.errors!==1?"s":""}</span>}
  </div>
)}

{step.id==="generate" && (() => {
  const rows = dayListings.filter(l => l.status === "generate_failed");

  if (!rows.length) return null;

  return (
    <div style={{marginTop:8,padding:"8px 10px",background:P.surface,borderRadius:6,border:`1px solid ${P.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:10,color:P.muted}}>
          Sélection pour relance — cochez les annonces en échec à re-générer
        </div>

        <div style={{display:"flex",gap:6}}>
          <button
            onClick={()=>setRelaunchSelection(prev => ({ ...prev, generate: rows.map(r => r.id) }))}
            style={{...btn(P.blue,P.blueS),padding:"2px 8px",fontSize:9}}
          >
            Tout cocher
          </button>
          <button
            onClick={()=>setRelaunchSelection(prev => ({ ...prev, generate: [] }))}
            style={{...btn(P.muted,P.card),padding:"2px 8px",fontSize:9}}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div style={{display:"grid",gap:6}}>
        {rows.map(row => {
          const checked = (relaunchSelection.generate || []).includes(row.id);

          return (
            <label
              key={row.id}
              style={{
                display:"flex",
                alignItems:"center",
                gap:8,
                padding:"6px 8px",
                borderRadius:6,
                background:checked ? P.blueS : P.card,
                border:`1px solid ${checked ? P.blue : P.border}`,
                cursor:"pointer"
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={()=>toggleRelaunchSelection("generate", row.id)}
                style={{accentColor:P.blue}}
              />
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:10,color:P.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {row.generated?.title || row.url}
                </div>
                <div style={{fontSize:9,color:P.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {row.url}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
})()}


{step.id==="search" && foundUrls.length>0 && (

      <div style={{marginTop:8,borderTop:`1px solid ${P.border}`,paddingTop:8}}>
        <div style={{fontSize:9,color:P.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>
          URLs trouvées
        </div>

        <div style={{display:"grid",gap:6}}>
          {foundUrls.map((url,idx)=>(
            <div key={url} style={{display:"grid",gridTemplateColumns:"32px 1fr auto",gap:8,alignItems:"center",padding:"7px 8px",background:P.surface,border:`1px solid ${P.border}`,borderRadius:6}}>
              <div style={{fontSize:9,color:P.muted}}>{idx+1}</div>

              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize:10,
                  color:P.blue,
                  textDecoration:"underline",
                  wordBreak:"break-all",
                  lineHeight:1.4
                }}
              >
                {url}
              </a>

              <button
                onClick={()=>window.open(url,"_blank")}
                style={{...btn(P.blue,P.blueS),padding:"3px 8px",fontSize:9}}
              >
                Ouvrir
              </button>
            </div>
          ))}
        </div>

        <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
          <button
            onClick={()=>runStep(FLOW_STEPS.find(s=>s.id==="create_url"))}
            disabled={!!running}
            style={{...btn(P.green,P.greenS),padding:"5px 10px",fontSize:10,opacity:running?0.5:1}}
          >
            📋 Créer URL Records
          </button>
        </div>
      </div>
    )}




{step.id==="create_url" && (() => {
  const createRows = dayListings.filter(l => !l.generated && l.status === "initial");

  if (!createRows.length) return null;

  return (
    <div style={{marginTop:8,borderTop:`1px solid ${P.border}`,paddingTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:9,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
          Records créés
        </div>

        <div style={{display:"flex",gap:6}}>
          <button
            onClick={()=>setDeleteSelection(prev => ({ ...prev, create_url: createRows.map(r => r.id) }))}
            style={{...btn(P.red,P.redS),padding:"2px 8px",fontSize:9}}
          >
            Tout cocher
          </button>
          <button
            onClick={()=>setDeleteSelection(prev => ({ ...prev, create_url: [] }))}
            style={{...btn(P.muted,P.card),padding:"2px 8px",fontSize:9}}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div style={{display:"grid",gap:6}}>
        {createRows.map((row)=>{
          const checked = (deleteSelection.create_url || []).includes(row.id);

          return (
            <label
              key={row.id}
              style={{
                display:"grid",
                gridTemplateColumns:"22px 1fr auto",
                gap:10,
                alignItems:"center",
                padding:"8px 10px",
                background:checked ? P.redS : P.surface,
                border:`1px solid ${checked ? P.red : P.border}`,
                borderRadius:6,
                cursor:"pointer"
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={()=>toggleDeleteSelection("create_url", row.id)}
                style={{accentColor:P.red}}
              />

              <div style={{minWidth:0}}>
                <div style={{fontSize:10,color:P.blue,wordBreak:"break-all"}}>
                  {row.url}
                </div>
                <div style={{fontSize:9,color:P.muted,marginTop:3}}>
                  {row.phone || "—"} {row.phonePlaceholder ? "· placeholder" : ""}
                </div>
              </div>

              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                <button
                  onClick={(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    setViewingListing(fresh);
                  }}
                  style={{...btn(P.green,P.greenS),padding:"3px 8px",fontSize:9}}
                >
                  👁
                </button>

                <button
                  onClick={(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    setEditingListing(fresh);
                  }}
                  style={{...btn(P.amber,P.amberS),padding:"3px 8px",fontSize:9}}
                >
                  ✏️
                </button>

                <button
                  onClick={async(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    await saveListingFromSemaine(row);
                  }}
                  style={{...btn(P.blue,P.blueS),padding:"3px 8px",fontSize:9}}
                >
                  💾
                </button>

                <button
                  onClick={async(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    await deleteListingFromSemaine(row.id);
                  }}
                  style={{...btn(P.red,P.redS),padding:"3px 8px",fontSize:9}}
                >
                  🗑️
                </button>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
})()}


{step.id==="generate" && (() => {
  const generatedRows = dayListings.filter(l => l.status === "generated" && l.generated);
  console.log("[UI][generateRows]", generatedRows.length, generatedRows.map(x => x.id));

  if (!generatedRows.length) return null;

  return (
    <div style={{marginTop:8,borderTop:`1px solid ${P.border}`,paddingTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:9,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
          Annonces générées
        </div>

        <div style={{display:"flex",gap:6}}>
          <button
            onClick={()=>setDeleteSelection(prev => ({ ...prev, generate: generatedRows.map(r => r.id) }))}
            style={{...btn(P.red,P.redS),padding:"2px 8px",fontSize:9}}
          >
            Tout cocher
          </button>
          <button
            onClick={()=>setDeleteSelection(prev => ({ ...prev, generate: [] }))}
            style={{...btn(P.muted,P.card),padding:"2px 8px",fontSize:9}}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div style={{display:"grid",gap:6}}>
        {generatedRows.map((row)=>{
          const checked = (deleteSelection.generate || []).includes(row.id);

          return (
            <label
              key={row.id}
              style={{
                display:"grid",
                gridTemplateColumns:"22px 1fr auto",
                gap:10,
                alignItems:"center",
                padding:"8px 10px",
                background:checked ? P.redS : P.surface,
                border:`1px solid ${checked ? P.red : P.border}`,
                borderRadius:6,
                cursor:"pointer"
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={()=>toggleDeleteSelection("generate", row.id)}
                style={{accentColor:P.red}}
              />

              <div style={{minWidth:0}}>
                <div style={{fontSize:10,color:P.blue,wordBreak:"break-all"}}>
                  {row.url}
                </div>

                <div style={{fontSize:10,color:P.text,marginTop:4}}>
                  {row.generated?.title || "Titre non généré"}
                </div>

                <div style={{fontSize:9,color:P.muted,marginTop:3}}>
                  {row.username || "—"} {row.phone ? `· ${row.phone}` : ""}
                </div>
              </div>

              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                <button
                  onClick={(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    setViewingListing(fresh);
                  }}
                  style={{...btn(P.green,P.greenS),padding:"3px 8px",fontSize:9}}
                >
                  👁
                </button>

                <button
                  onClick={(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    setEditingListing(fresh);
                  }}
                  style={{...btn(P.amber,P.amberS),padding:"3px 8px",fontSize:9}}
                >
                  ✏️
                </button>

                <button
                  onClick={async(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    await saveListingFromSemaine(fresh);
                  }}
                  style={{...btn(P.blue,P.blueS),padding:"3px 8px",fontSize:9}}
                >
                  💾
                </button>

                <button
                  onClick={async(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    await deleteListingFromSemaine(row.id);
                  }}
                  style={{...btn(P.red,P.redS),padding:"3px 8px",fontSize:9}}
                >
                  🗑️
                </button>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
})()}

{step.id==="sync_user" && (() => {
  const rows = dayListings.filter(l => ["phone_revealed","phone_not_revealed"].includes(l.status));

  if (!rows.length) return null;

  return (
    <div style={{marginTop:8,borderTop:`1px solid ${P.border}`,paddingTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:9,color:P.muted,textTransform:"uppercase",letterSpacing:1}}>
          Validation Username / Téléphone
        </div>

        <div style={{display:"flex",gap:6}}>
          <button
            onClick={()=>setDeleteSelection(prev => ({ ...prev, sync_user: rows.map(r => r.id) }))}
            style={{...btn(P.red,P.redS),padding:"2px 8px",fontSize:9}}
          >
            Tout cocher
          </button>
          <button
            onClick={()=>setDeleteSelection(prev => ({ ...prev, sync_user: [] }))}
            style={{...btn(P.muted,P.card),padding:"2px 8px",fontSize:9}}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div style={{display:"grid",gap:6}}>
        {rows.map(row => {
          const ok = row.status === "phone_revealed";
          const phoneBadgeColor = ok ? P.green : P.red;
          const phoneBadgeBg = ok ? P.greenS : P.redS;
          const checked = (deleteSelection.sync_user || []).includes(row.id);

          return (
            <label
              key={row.id}
              style={{
                display:"grid",
                gridTemplateColumns:"22px 1fr auto",
                gap:10,
                alignItems:"center",
                padding:"8px 10px",
                background:checked ? P.redS : P.surface,
                border:`1px solid ${checked ? P.red : P.border}`,
                borderRadius:6,
                cursor:"pointer"
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={()=>toggleDeleteSelection("sync_user", row.id)}
                style={{accentColor:P.red}}
              />

              <div style={{minWidth:0}}>
                <div style={{fontSize:10,color:P.blue,wordBreak:"break-all"}}>
                  {row.url}
                </div>

                <div style={{fontSize:10,color:P.text,marginTop:4}}>
                  {row.username || "Username non trouvé"}
                </div>

                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:phoneBadgeBg,color:phoneBadgeColor,border:`1px solid ${phoneBadgeColor}33`}}>
                    {ok ? "Téléphone valide" : "Téléphone non révélé"}
                  </span>

                  <span style={{fontSize:9,color:P.muted}}>
                    {row.phone || "—"}
                  </span>
                </div>
              </div>

              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                <button
                  onClick={(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    setViewingListing(fresh);
                  }}
                  style={{...btn(P.green,P.greenS),padding:"3px 8px",fontSize:9}}
                >
                  👁
                </button>

                <button
                  onClick={(e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    const fresh = listings.find(l=>l.id===row.id) || row;
                    setEditingListing(fresh);
                  }}
                  style={{...btn(P.amber,P.amberS),padding:"3px 8px",fontSize:9}}
                >
                  ✏️
                </button>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
})()}



{step.id==="approve_key" && (
  <>
    {renderRelaunchSelection("approve_key", "Sélection pour relance — cochez les annonces avec champs clés manquants")}
    {renderStepRows("approve_key", "Validation champs clés")}
  </>
)}

{step.id==="approve_sec" && (
  <>
    {renderRelaunchSelection("approve_sec", "Sélection pour relance — cochez les annonces avec champs cibles manquants")}
    {renderStepRows("approve_sec", "Validation champs cibles")}
  </>
)}

{step.id==="gen_image" && (
  <>
    {renderRelaunchSelection("gen_image", "Sélection pour relance — cochez les images en échec")}
    {renderStepRows("gen_image", "Génération image IA")}
  </>
)}

{step.id==="approve_img" && (
  <>
    {renderRelaunchSelection("approve_img", "Sélection pour relance — cochez les images rejetées")}
    {renderStepRows("approve_img", "Validation image IA")}
  </>
)}

{step.id==="approve_all" && (
  <>
    {renderRelaunchSelection("approve_all", "Sélection pour relance — cochez les annonces non approuvées")}
    {renderStepRows("approve_all", "Validation annonce")}
  </>
)}

{step.id==="create_user" && (
  <>
    {renderRelaunchSelection("create_user", "Sélection pour relance — cochez les comptes en échec")}
    {renderStepRows("create_user", "Création username Travito")}
  </>
)}

{step.id==="publish" && (
  <>
    {renderRelaunchSelection("publish", "Sélection pour relance — cochez les publications en échec")}
    {renderStepRows("publish", "Publier sur Travito.ma")}
  </>
)}


                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{height:56,flexShrink:0}} />

          </div>




          {/* Session log */}



{sessionLog.length>0&&(
  <div style={{borderTop:`1px solid ${P.border}`,flexShrink:0,background:P.bg}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px"}}>
      <button
        onClick={()=>setShowSessionLog(p=>!p)}
        style={{fontSize:9,color:P.muted,background:"none",border:"none",cursor:"pointer",textTransform:"uppercase",letterSpacing:1}}
      >
        {showSessionLog?"▼":"▶"} Journal session
      </button>
      <button
        onClick={()=>setSessionLog([])}
        style={{fontSize:8,color:P.muted,background:"none",border:"none",cursor:"pointer"}}
      >
        ✕
      </button>
    </div>

    {showSessionLog&&(
      <div style={{height:150,padding:"0 12px 8px",overflowY:"auto"}}>
        {sessionLog.map((l,i)=>(
          <div
            key={i}
            style={{
              fontSize:9,
              fontFamily:"monospace",
              lineHeight:1.5,
              color:l.type==="error"?P.red:l.type==="success"?P.green:l.type==="warn"?P.amber:P.muted
            }}
          >
            <span style={{opacity:.5,marginRight:6}}>{fmtDate(l.at)}</span>{l.msg}
          </div>
        ))}
      </div>
    )}
  </div>
)}

      {editingListing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{width:"min(980px,96vw)",maxHeight:"90vh",overflowY:"auto",background:P.surface,border:`1px solid ${P.border}`,borderRadius:12,padding:16}}>
            <ListingForm
              initial={editingListing}
              primaryFields={primaryFields}
              onSave={saveListingFromSemaine}
              onCancel={()=>setEditingListing(null)}
              mode="auto"
            />
          </div>
        </div>
      )}

      {viewingListing && (
        <ViewPopup
          listing={viewingListing}
          primaryFields={primaryFields}
          secondaryFields={secondaryFields}
          onApprove={approvePopupFromSemaine}
          onRegenerate={()=>{
            window.dispatchEvent(new CustomEvent("pm_auto_generate",{detail:{listingId:viewingListing.id,force:true}}));
          }}
          onSave={savePopupFromSemaine}
          onClose={()=>setViewingListing(null)}
        />
      )}

<ManualUrlPopup
  open={showManualUrlPopup}
  onClose={() => {
    if (!manualUrlSaving) setShowManualUrlPopup(false);
  }}
  onSave={saveManualUrls}
  primaryFields={primaryFields}
  initialDayConfig={dayConfig}
/>

        </>)}
      </div>
    </div>
  );
}
// ── Reused components from ProductManagerManuel ──────────────

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
  ...listing.generated?.fieldStates,
  vendeur: listing.generated?.fieldStates?.vendeur || (listing.username ? "approved" : "draft"),
  phone:   listing.generated?.fieldStates?.phone   || (listing.phone   ? "approved" : "draft"),
});
  const [generatingImg,setGeneratingImg] = useState(false);

const [generatedImg,setGeneratedImg] = useState(listing.approvedImageUrl||null);
const [imgApproved,setImgApproved] = useState(!!listing.approvedImageUrl);
const [uploadedRefImg,setUploadedRefImg] = useState(null);
const src = g.sourceExtract||{};

const popupGeneratedImages = (() => {
  const fromGeneratedArray = Array.isArray(g.generatedImages)
    ? g.generatedImages.map(img =>
        img?.storedUrl ||
        img?.url ||
        img?.originalUrl ||
        ""
      )
    : [];

  const legacySingles = [
    listing.approvedImageUrl,
    listing.generatedImg,
    generatedImg
  ].filter(Boolean);

  return [...new Set(
    [...fromGeneratedArray, ...legacySingles]
      .map(u => String(u || "").trim())
      .filter(Boolean)
  )];
})();

console.log("[POPUP UI] popupGeneratedImages count =", popupGeneratedImages.length);
console.log("[POPUP UI] popupGeneratedImages =", popupGeneratedImages);

// ✅ ADD HERE
useEffect(() => {
  const nextGenerated = JSON.parse(JSON.stringify(listing.generated || {}));

  if (!nextGenerated.photoDescription) {
    nextGenerated.photoDescription = nextGenerated.photoDescriptionOriginal || "";
  }

  setG(nextGenerated);

  setFs({
    ...listing.generated?.fieldStates,
    vendeur: listing.generated?.fieldStates?.vendeur || (listing.username ? "approved" : "draft"),
    phone: listing.generated?.fieldStates?.phone || (listing.phone ? "approved" : "draft"),
  });

  const nextGeneratedImg =
    listing.approvedImageUrl ||
    listing.generated?.generatedImages?.[0]?.storedUrl ||
    listing.generated?.generatedImages?.[0]?.url ||
    listing.generatedImg ||
    null;

  setGeneratedImg(nextGeneratedImg);
  setSelectedGeneratedImage(nextGeneratedImg || "");
  setImgApproved(!!listing.approvedImageUrl);
  setUploadedRefImg(null);

}, [listing.id]);

  const popupSourceImages = (() => {
    const fromGenerated = Array.isArray(g.sourceImages)
      ? g.sourceImages.map(img =>
          img?.storedUrl ||
          img?.url ||
          img?.originalUrl ||
          ""
        )
      : [];

    const fromSourceExtract = Array.isArray(src.images)
      ? src.images.map(img => String(img || "").trim())
      : [];

    const legacySingles = [
      src.photoUrl,
      src.imageUrl
    ].filter(Boolean);

    return [...new Set(
      [...fromGenerated, ...fromSourceExtract, ...legacySingles]
        .map(u => String(u || "").trim())
        .filter(Boolean)
    )];
  })();

  const [selectedSourceImage, setSelectedSourceImage] = useState(
    popupSourceImages[0] || ""
  );


const [selectedGeneratedImage, setSelectedGeneratedImage] = useState(
  popupGeneratedImages[0] || listing.approvedImageUrl || listing.generatedImg || ""
);

  const setFieldState=(k,v)=>setFs(p=>({...p,[k]:v}));
  const updateSecField=(i,value)=>{const u=[...(g.secondaryFields||[])];u[i]={...u[i],value};setG(p=>({...p,secondaryFields:u}));};

  // Load existing image from KV on mount
  // Load WP taxonomy terms for Taxonomy secondary fields (Ville, Quartier)
  const [taxTermsCache, setTaxTermsCache] = useState({});

useEffect(() => {
  window.__popupListing = listing;
  window.__popupGenerated = g;
  window.__popupFieldStates = fs;
}, [listing, g, fs]);

useEffect(() => {
  const firstImg = popupSourceImages[0] || "";
  if (!firstImg) {
    if (selectedSourceImage) setSelectedSourceImage("");
    return;
  }

  if (!selectedSourceImage || !popupSourceImages.includes(selectedSourceImage)) {
    setSelectedSourceImage(firstImg);
  }
}, [popupSourceImages.join("||"), selectedSourceImage]);


useEffect(() => {
  const firstGen = popupGeneratedImages[0] || "";

  if (!firstGen) {
    if (selectedGeneratedImage) setSelectedGeneratedImage("");
    return;
  }

  if (!selectedGeneratedImage || !popupGeneratedImages.includes(selectedGeneratedImage)) {
    setSelectedGeneratedImage(firstGen);
  }

  if (!generatedImg || !popupGeneratedImages.includes(generatedImg)) {
    setGeneratedImg(firstGen);
  }
}, [popupGeneratedImages.join("||"), selectedGeneratedImage, generatedImg]);


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


// ✅ ADD HERE (outside generate, top-level of file)

const normalizeLoose = (s="") =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const orderedSimilarity = (needle="", haystack="") => {
  const a = normalizeLoose(needle);
  const b = normalizeLoose(haystack);
  if (!a || !b) return 0;

  let i = 0;
  let matched = 0;
  for (const ch of b) {
    if (i < a.length && ch === a[i]) {
      matched++;
      i++;
    }
  }
  return matched / a.length;
};

const bestTermMatch = (rawValue="", terms=[], threshold=0.8) => {
  const normValue = normalizeLoose(rawValue);
  if (!normValue || !Array.isArray(terms) || terms.length === 0) return null;

  const exact =
    terms.find(t => normalizeLoose(t.name) === normValue) ||
    terms.find(t => normalizeLoose(t.name).includes(normValue)) ||
    terms.find(t => normValue.includes(normalizeLoose(t.name)));

  if (exact) return exact;

  let best = null;
  let bestScore = 0;

  for (const t of terms) {
    const score = orderedSimilarity(normValue, t.name);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return bestScore >= threshold ? best : null;
};



// START Generate Image AI

const generateImage = async () => {
  setGeneratingImg(true);
  setGeneratedImg(null);

  let prompt = g.photoDescription;

  if (!prompt) {
    try {
      const r = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 300,
          system: "Generate a concise AI image prompt in English.",
          messages: [
            {
              role: "user",
              content: "Create a realistic photo prompt for: " + (listing.generated?.title || listing.url)
            }
          ]
        })
      });

      const raw = await r.text();
      let d;
      try {
        d = JSON.parse(raw);
      } catch {
        throw new Error(`Réponse API non JSON: ${raw.slice(0, 180)}`);
      }

      prompt = (d.content || []).map(b => b.text || "").join("").trim();

      if (prompt) {
        setG(p => ({ ...p, photoDescription: prompt }));
      }
    } catch {}
  }

  if (!prompt) {
    alert("Prompt manquant.");
    setGeneratingImg(false);
    return;
  }

  try {
    const sourceItems = uploadedRefImg
      ? [{ sourceIndex: 0, referenceImageUrl: uploadedRefImg }]
      : popupSourceImages.map((img, i) => ({
          sourceIndex: i,
          referenceImageUrl: img
        }));

    if (!sourceItems.length) {
      alert("Aucune image source disponible.");
      setGeneratingImg(false);
      return;
    }

    const rawGenerated = [];

    for (const srcImg of sourceItems) {
      const finalPrompt = buildAutoImagePrompt({
        basePrompt: prompt,
        referenceImageUrl: srcImg.referenceImageUrl,
        title: g.title || src.rawTitle || listing.url,
        city: g.ville || src.rawFields?.ville || "",
        category: g.categoryName || ""
      });

      let imageResp = null;

      if (!activeImgEngine || activeImgEngine.provider_key === "claude_vision") {
        const r = await fetch("/api/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "image_generate_auto_ref",
            prompt: finalPrompt,
            listingId: `${listing.id}_${srcImg.sourceIndex}`,
            referenceImageUrl: srcImg.referenceImageUrl
          })
        });

        imageResp = await r.json();

      } else if (activeImgEngine.provider_key === "openai_gpt_image") {
        const gptPrompt =
          String(activeImgEngine.default_prompt || "").trim() ||
          "Use the attached image as the primary source. Create the exact same image without any watermark or marketplace overlay. Preserve the exact subject, composition, framing, colors, proportions, count of items, background, and aspect ratio. Do not redesign, restyle, replace, crop, expand, or reinterpret the image. Only remove the watermark and make minimal clarity improvements if needed.";

        const outputFormat = mapImgOutputFormatForOpenAI(activeImgEngine.output_format || "webp");
        const fallbackFormat = activeImgEngine.fallback_format || "jpg";
        const size = getOpenAIImageSize(activeImgEngine);
        const engineMode = activeImgEngine.default_mode || "edit";

        const r = await fetch("/api/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "image_generate_openai_ref",
            listingId: `${listing.id}_${srcImg.sourceIndex}`,
            prompt: gptPrompt,
            referenceImageUrl: srcImg.referenceImageUrl,
            outputFormat,
            fallbackFormat,
            size,
            mode: engineMode,
            preserveRatio: !!activeImgEngine.preserve_ratio
          })
        });

        const raw = await r.text();
        try {
          imageResp = JSON.parse(raw);
        } catch {
          throw new Error(`Réponse API non JSON: ${raw.slice(0, 180)}`);
        }

      } else {
        throw new Error(`Engine non supporté: ${activeImgEngine.provider_key}`);
      }

      if (!imageResp?.success || !imageResp?.imageUrl) {
        throw new Error(imageResp?.error || `Échec génération image source #${srcImg.sourceIndex}`);
      }

      rawGenerated.push({
        index: rawGenerated.length,
        sourceIndex: srcImg.sourceIndex,
        storedUrl: imageResp.imageUrl,
        url: imageResp.imageUrl,
        originalUrl: imageResp.imageUrl
      });
    }

console.log("[POPUP GEN] rawGenerated count =", rawGenerated.length);
console.log("[POPUP GEN] rawGenerated urls =", rawGenerated.map(x => x.url || x.storedUrl || x.originalUrl));

if (!rawGenerated.length) {
  throw new Error("Aucune image générée");
}

    const firstGeneratedUrl =
      rawGenerated[0]?.storedUrl ||
      rawGenerated[0]?.url ||
      "";

    setG(p => ({
      ...p,
      generatedImages: rawGenerated
    }));

    setGeneratedImg(firstGeneratedUrl);
    setSelectedGeneratedImage(firstGeneratedUrl);
    setImgApproved(false);

  } catch (e) {
    alert("Erreur: " + e.message);
  }

  setGeneratingImg(false);
};

// END Generate Image AI





const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);

const effectiveCategoryTermId =
  g.category?.termId ||
  listing.categoryTermId ||
  "";

const effectiveCategoryTerm =
  (catTax?.terms || []).find(t => t.id === effectiveCategoryTermId) || null;

const subTaxId =
  g.type?.taxId ||
  listing.subCategoryTaxId ||
  "";

const subTax =
  primaryFields.find(t=>t.id===subTaxId) || null;

const effectiveTypeTermId =
  g.type?.termId ||
  listing.subCategoryTermId ||
  "";

const effectiveTypeTerm =
  (subTax?.terms || []).find(t => t.id === effectiveTypeTermId) || null;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:12,width:"min(1200px,97vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",borderBottom:`1px solid ${P.border}`,flexShrink:0}}>
          <div><div style={{fontSize:14,fontWeight:700,color:P.gold}}>🔍 Résultat généré</div><div style={{fontSize:10,color:P.muted,marginTop:1}}>{listing.url}</div></div>
          <button onClick={onClose} style={{...btn(P.muted,"transparent"),padding:"3px 10px"}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",flex:1,overflow:"hidden",minHeight:0}}>
          {/* LEFT */}
          <div style={{padding:14,overflowY:"auto",borderRight:`1px solid ${P.border}`,background:"rgba(255,245,150,0.04)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#C8972B",marginBottom:12,padding:"6px 10px",background:"rgba(255,235,59,0.10)",borderRadius:6,border:"1px solid rgba(255,235,59,0.25)"}}>📋 Champs proposés — éditable</div>
            {/* Vendeur + Phone — top of panel, required for Approuver */}
            <ApproveField label="👤 Vendeur (compte)" value={listing.username||""} found={!!listing.username}
              fieldState={fs["vendeur"]} onStateChange={v=>setFieldState("vendeur",v)}
              onValueChange={v=>persist(listings.map(l=>l.id===listing.id?{...l,username:v}:l))}/>
<ApproveField label="📞 Téléphone" value={listing.phone||""} found={!!listing.phone}
  fieldState={fs["phone"]} onStateChange={v=>setFieldState("phone",v)}
  onValueChange={v=>{
    const normalized = normalizePhoneMA(v);
    const updated = buildPhoneStatePatch({
      ...listing,
      phone: normalized || v
    });
    persist(listings.map(l=>l.id===listing.id?updated:l));
  }}/>


<div style={{marginBottom:10}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
    <div style={{fontSize:10,color:P.muted}}>Aperçu / Titre</div>
    <span
      style={{
        fontSize:9,
        padding:"2px 8px",
        borderRadius:10,
        background:
          fs["titre"]==="approved" ? P.greenS :
          fs["titre"]==="missing" ? P.redS :
          P.card,
        color:
          fs["titre"]==="approved" ? P.green :
          fs["titre"]==="missing" ? P.red :
          P.muted,
        border:`1px solid ${
          fs["titre"]==="approved" ? `${P.green}55` :
          fs["titre"]==="missing" ? `${P.red}55` :
          P.border
        }`
      }}
    >
      {fs["titre"]==="approved"
        ? "Approuvé"
        : fs["titre"]==="missing"
          ? "Manquant"
          : "Brouillon"}
    </span>
  </div>

  <div
    style={{
      fontSize:12,
      color:P.text,
      padding:"7px 10px",
      background:P.card,
      borderRadius:6,
      border:`1px solid ${
        fs["titre"]==="approved" ? P.green :
        fs["titre"]==="missing" ? P.red :
        P.border
      }`
    }}
  >
    {g.title||"—"}
  </div>
</div>

<div style={{marginBottom:14}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
    <div style={{fontSize:10,color:P.gold,fontWeight:600}}>
      📝 Description (publiée sur WP — modifier ici)
    </div>
    <span
      style={{
        fontSize:9,
        padding:"2px 8px",
        borderRadius:10,
        background:
          fs["description"]==="approved" ? P.greenS :
          fs["description"]==="missing" ? P.redS :
          P.card,
        color:
          fs["description"]==="approved" ? P.green :
          fs["description"]==="missing" ? P.red :
          P.muted,
        border:`1px solid ${
          fs["description"]==="approved" ? `${P.green}55` :
          fs["description"]==="missing" ? `${P.red}55` :
          P.border
        }`
      }}
    >
      {fs["description"]==="approved"
        ? "Approuvé"
        : fs["description"]==="missing"
          ? "Manquant"
          : "Brouillon"}
    </span>
  </div>

  <textarea
    value={g.description||""}
    onChange={e=>setG(p=>({...p,description:e.target.value}))}
    rows={4}
    style={{
      ...inp,
      width:"100%",
      fontSize:11,
      lineHeight:1.6,
      resize:"vertical",
      fontFamily:"inherit",
      borderColor:
        fs["description"]==="approved" ? P.green :
        fs["description"]==="missing" ? P.red :
        P.border
    }}
  />
</div>

            <div style={{borderTop:"1px solid rgba(255,235,59,0.15)",marginBottom:12}}/>

{catTax&&(
  <ApproveField
    label="Catégorie"
    value={effectiveCategoryTermId}
    found={!!effectiveCategoryTerm}
    fieldState={fs["category"]}
    onStateChange={v=>setFieldState("category",v)}
    onValueChange={v=>{
      const t=(catTax.terms||[]).find(t=>t.id===v);
      setG(p=>({
        ...p,
        category:t?{taxId:catTax.id,termId:v,name:t.name}:null
      }));
    }}
    type="select"
    options={catTax.terms||[]}
  />
)}

{typeTaxes.length>0&&(<>
  <div style={{marginBottom:8}}>
    <div style={{fontSize:9,color:P.muted,marginBottom:3}}>Sous-catégorie (Type)</div>
    <select
      value={subTaxId || ""}
      onChange={e=>{
        const tx=typeTaxes.find(t=>t.id===e.target.value);
        setG(p=>({
          ...p,
          type:tx?{taxId:tx.id,termId:"",name:""}:null
        }));
      }}
      style={{...inp,fontSize:11,cursor:"pointer",marginBottom:6}}
    >
      <option value="">— Choisir sous-catégorie —</option>
      {typeTaxes.map(tx=><option key={tx.id} value={tx.id}>{tx.name}</option>)}
    </select>

    {(()=>{
      const activeTax=typeTaxes.find(t=>t.id===subTaxId);
      return activeTax ? (
        <ApproveField
          label={`Terme — ${activeTax.name}`}
          value={effectiveTypeTermId}
          found={!!effectiveTypeTerm}
          fieldState={fs["type"]}
          onStateChange={v=>setFieldState("type",v)}
          onValueChange={v=>{
            const t=(activeTax.terms||[]).find(t=>t.id===v);
            setG(p=>({
              ...p,
              type:t?{taxId:activeTax.id,termId:v,name:t.name}:null
            }));
          }}
          type="select"
          options={activeTax.terms||[]}
        />
      ) : null;
    })()}
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

const sfNameNorm = normalizeText(sf.taxName || "");
const isDescriptionField = sfNameNorm.includes("description");
const isPhotoField = sfNameNorm.includes("photo");

const effectiveFieldState = (() => {
  if (isDescriptionField) {
    return String(sf.value || "").trim() ? "approved" : "initial";
  }
  if (isPhotoField) {
    return String(sf.value || "").trim() ? "approved" : "initial";
  }
  return fs[`sec_${i}`];
})();

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
                    found={
  isDescriptionField || isPhotoField
    ? !!String(sf.value || "").trim()
    : sf.found !== false
}
                    fieldState={effectiveFieldState}
                    onStateChange={v=>setFieldState(`sec_${i}`,v)}
                    onValueChange={v=>updateSecField(i,v)}
                    type={fieldType}
                    options={taxTerms}
                  />
                );
              })}</>)}


<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
  <div
    style={{
      padding:"8px 10px",
      borderRadius:6,
      background:
        fs["address"]==="approved" ? P.greenS :
        fs["address"]==="missing" ? P.redS :
        P.card,
      border:`1px solid ${
        fs["address"]==="approved" ? P.green :
        fs["address"]==="missing" ? P.red :
        P.border
      }`
    }}
  >
    <div style={{fontSize:9,color:P.muted,marginBottom:3}}>Adresse</div>
    <div style={{
      fontSize:10,
      color:
        fs["address"]==="approved" ? P.green :
        fs["address"]==="missing" ? P.red :
        P.text,
      fontWeight:600
    }}>
      {fs["address"]==="approved"
        ? "Approuvée"
        : fs["address"]==="missing"
          ? "Manquante"
          : "Brouillon"}
    </div>
  </div>

  <div
    style={{
      padding:"8px 10px",
      borderRadius:6,
      background:
        fs["photos"]==="approved" ? P.greenS :
        fs["photos"]==="missing" ? P.redS :
        P.card,
      border:`1px solid ${
        fs["photos"]==="approved" ? P.green :
        fs["photos"]==="missing" ? P.red :
        P.border
      }`
    }}
  >
    <div style={{fontSize:9,color:P.muted,marginBottom:3}}>Photos</div>
    <div style={{
      fontSize:10,
      color:
        fs["photos"]==="approved" ? P.green :
        fs["photos"]==="missing" ? P.red :
        P.text,
      fontWeight:600
    }}>
      {fs["photos"]==="approved"
        ? "Approuvées"
        : fs["photos"]==="missing"
          ? "Manquantes"
          : "Brouillon"}
    </div>
  </div>
</div>

            {/* Photo section */}
            {g.photoDescription!==undefined&&(<>
              <div style={{fontSize:9,fontWeight:700,color:P.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:4}}>Photo & Prompt IA</div>

              {(popupSourceImages.length > 0 || src.photoUrl) && (
                <div style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                    <span style={{fontSize:9,color:P.muted}}>
                      📸 Photo source originale{popupSourceImages.length > 1 ? ` (${popupSourceImages.length})` : ""}
                    </span>
                    <button
                      onClick={()=>{
                        const imgToUse = selectedSourceImage || popupSourceImages[0] || src.photoUrl;
                        if (!imgToUse) return;
                        if (window.confirm("⚠️ La photo source peut être watermarkée. Utiliser quand même?")) {
                          setGeneratedImg(imgToUse);
                        }
                      }}
                      style={{
                        fontSize:8,
                        padding:"1px 8px",
                        borderRadius:4,
                        cursor:"pointer",
                        background:"rgba(245,158,11,0.12)",
                        border:`1px solid ${P.amber}`,
                        color:P.amber
                      }}
                    >
                      Utiliser cette photo
                    </button>
                  </div>

                  <img
                    src={selectedSourceImage || popupSourceImages[0] || src.photoUrl}
                    alt="source"
                    style={{
                      width:"100%",
                      maxHeight:160,
                      borderRadius:6,
                      border:`1px solid ${P.border}`,
                      objectFit:"contain",
                      background:P.card
                    }}
                    onError={e=>{e.target.style.display="none";}}
                  />

                  {popupSourceImages.length > 1 && (
                    <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:6,paddingBottom:2}}>
                      {popupSourceImages.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`thumb-${i}`}
                          onClick={()=>setSelectedSourceImage(img)}
                          style={{
                            width:52,
                            height:52,
                            objectFit:"cover",
                            borderRadius:6,
                            cursor:"pointer",
                            flexShrink:0,
                            background:P.card,
                            border:`2px solid ${selectedSourceImage === img ? P.blue : P.border}`
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

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

{g.visionUsed===true && (
  <div style={{fontSize:9,color:"#16A34A",marginBottom:3}}>
    👁 Vision Claude: OUI — image source réellement lue
  </div>
)}
{g.visionUsed===false && (
  <div style={{fontSize:9,color:P.amber,marginBottom:3}}>
    ⚠️ Vision Claude: NON — prompt généré depuis le texte seulement (image non lue par Claude)
  </div>
)}
{g.visionUsed!==true && g.visionUsed!==false && (
  <div style={{fontSize:9,color:P.muted,marginBottom:3}}>
    • Vision Claude: inconnue
  </div>
)}

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
              
{(popupGeneratedImages.length > 0 || generatedImg) && (
  <div style={{marginBottom:10,padding:10,background:P.card,borderRadius:8,border:`1px solid ${P.border}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <span style={{fontSize:9,color:P.muted}}>
        🖼 Images générées{popupGeneratedImages.length > 1 ? ` (${popupGeneratedImages.length})` : ""}
      </span>

      <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
        <a
          href={selectedGeneratedImage || generatedImg}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize:8,
            padding:"2px 8px",
            borderRadius:4,
            cursor:"pointer",
            background:P.blueS,
            border:`1px solid ${P.blue}`,
            color:P.blue,
            textDecoration:"none"
          }}
        >
          ⬇ Télécharger
        </a>

        <button
          onClick={()=>setImgApproved(p=>!p)}
          style={{
            fontSize:8,
            padding:"2px 8px",
            borderRadius:4,
            cursor:"pointer",
            background:imgApproved?P.greenS:"rgba(0,0,0,0.3)",
            border:`1px solid ${imgApproved?P.green:P.border}`,
            color:imgApproved?P.green:P.muted
          }}
        >
          {imgApproved?"✓ Approuvée":"Approuver image"}
        </button>

        <button
          onClick={()=>{
            setGeneratedImg(null);
            setSelectedGeneratedImage("");
            setG(p => ({ ...p, generatedImages: [] }));
            setImgApproved(false);
          }}
          style={{
            fontSize:8,
            padding:"2px 8px",
            borderRadius:4,
            cursor:"pointer",
            background:P.redS,
            border:`1px solid ${P.red}`,
            color:P.red
          }}
        >
          🗑
        </button>
      </div>
    </div>

    <div style={{position:"relative",borderRadius:6,overflow:"hidden",border:`2px solid ${imgApproved?P.green:P.border}`}}>
      <img
        src={selectedGeneratedImage || generatedImg}
        alt="generated"
        style={{width:"100%",display:"block",objectFit:"cover"}}
      />
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",padding:"5px 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.9)",fontStyle:"italic",letterSpacing:"0.3px"}}>
          ✦ Contactez-moi pour pus d'informations
        </span>
      </div>
    </div>

    {popupGeneratedImages.length > 1 && (
      <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:8,paddingBottom:2}}>
        {popupGeneratedImages.map((img, i) => (
          <img
            key={i}
            src={img}
            alt={`generated-${i}`}
            onClick={()=>{
              setSelectedGeneratedImage(img);
              setGeneratedImg(img);
            }}
            style={{
              width:56,
              height:56,
              objectFit:"cover",
              borderRadius:6,
              cursor:"pointer",
              flexShrink:0,
              background:P.card,
              border:`2px solid ${selectedGeneratedImage === img ? P.blue : P.border}`
            }}
          />
        ))}
      </div>
    )}

    {imgApproved && (
      <div style={{fontSize:9,color:P.green,textAlign:"center",marginTop:4}}>
        ✓ Image approuvée — sera sauvegardée
      </div>
    )}
  </div>
)}

            </>)}
          </div>
          {/* RIGHT */}
          <div style={{padding:14,overflowY:"auto",background:P.bg}}>
            <div style={{fontSize:11,fontWeight:700,color:P.gold,marginBottom:12,padding:"6px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}>🌐 Source originale</div>
            {src.engine&&(<div style={{marginBottom:10,padding:"6px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}><div style={{fontSize:9,color:P.muted}}>Moteur · {fmtDate(src.fetchedAt)}</div><div style={{fontSize:11,color:P.blue,marginTop:2}}>{src.engine}</div></div>)}

            {(popupSourceImages.length > 0 || src.photoUrl) && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:P.muted,marginBottom:4}}>
                  📸 Photos détectées{popupSourceImages.length > 1 ? ` (${popupSourceImages.length})` : ""}
                </div>

                <img
                  src={selectedSourceImage || popupSourceImages[0] || src.photoUrl}
                  alt="annonce"
                  style={{
                    width:"100%",
                    maxHeight:180,
                    borderRadius:8,
                    border:`1px solid ${P.border}`,
                    objectFit:"contain",
                    background:P.card
                  }}
                  onError={e=>{e.target.style.display="none";}}
                />

                {popupSourceImages.length > 1 && (
                  <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:8,paddingBottom:2}}>
                    {popupSourceImages.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`source-${i}`}
                        onClick={()=>setSelectedSourceImage(img)}
                        style={{
                          width:56,
                          height:56,
                          objectFit:"cover",
                          borderRadius:6,
                          cursor:"pointer",
                          flexShrink:0,
                          background:P.card,
                          border:`2px solid ${selectedSourceImage === img ? P.blue : P.border}`
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{marginBottom:10}}><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Titre original</div><div style={{fontSize:12,color:P.text,padding:"6px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`}}>{src.rawTitle||"—"}</div></div>
            <div style={{marginBottom:10}}><div style={{fontSize:10,color:P.muted,marginBottom:3}}>Description originale</div><div style={{fontSize:11,color:P.muted,padding:"8px 10px",background:P.card,borderRadius:6,border:`1px solid ${P.border}`,maxHeight:150,overflowY:"auto",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{src.rawDescription||"Non disponible"}</div></div>
            {src.rawFields&&Object.keys(src.rawFields).length>0&&(<div><div style={{fontSize:10,color:P.muted,marginBottom:6}}>Champs détectés</div>{Object.entries(src.rawFields).map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",marginBottom:3,background:P.card,borderRadius:5,border:`1px solid ${P.border}`}}><span style={{fontSize:10,color:P.muted}}>{k}</span><span style={{fontSize:10,color:P.text,fontWeight:600}}>{String(v)}</span></div>))}</div>)}
          </div>
        </div>
        <div style={{display:"flex",gap:10,padding:"10px 18px",borderTop:`1px solid ${P.border}`,flexShrink:0,justifyContent:"flex-end",background:P.surface}}>
          <button title="Régénérer tous les champs non-approuvés depuis l URL" style={btn(P.amber,P.amberS)} onClick={()=>onRegenerate({...g,fieldStates:fs,photoDescription:g.photoDescription})}>🔄 Régénérer</button>
          <button title="Sauvegarder les champs éditables" style={btn(P.blue,P.blueS)} onClick={()=>onSave(
  {
    ...g,
    fieldStates: fs,
    photoDescription: g.photoDescription,
    ...(imgApproved && (selectedGeneratedImage || generatedImg)
  ? { approvedImageUrl: selectedGeneratedImage || generatedImg }
  : {})
  },
  imgApproved,
  uploadedRefImg
)}>💾 Sauvegarder</button>
          <button title="Approuver l annonce — Vendeur et Téléphone doivent être approuvés" style={btn(P.green,P.greenS)}
onClick={()=>{
  if (fs["vendeur"] !== "approved") {
    alert("⚠️ Veuillez approuver le champ Vendeur avant d approuver l annonce");
    return;
  }

  if (fs["phone"] !== "approved") {
    alert("⚠️ Veuillez approuver le champ Téléphone avant d approuver l annonce");
    return;
  }

  onApprove(
    {
      ...g,
      fieldStates: fs,
      photoDescription: g.photoDescription,
      ...(imgApproved && (selectedGeneratedImage || generatedImg)
  ? { approvedImageUrl: selectedGeneratedImage || generatedImg }
  : {})
    },
    imgApproved,
    uploadedRefImg
  );
}}
              
            >✅ Approuver annonce</button>
        </div>
      </div>
    </div>
  );
}



// ══════════════════════════════════════════════════════════════════════════════
//  ListingForm
// ══════════════════════════════════════════════════════════════════════════════

function ListingForm({initial,primaryFields,onSave,onCancel,mode}) {
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
      const dup = listings.find(l => l.id !== f.id && digits(l.phone||"") === cleanP);
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
//  ImgGen — Config Engines Initial Seed
// ══════════════════════════════════════════════════════════════════════════════

const makeImgGenId = () =>
  `IMGGEN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

const buildDefaultImgGenRegistry = () => {
  const now = new Date().toISOString();

  const base = {
    description: "",
    default_prompt: "",
    default_negative_prompt: "",
    default_mode: "edit",
    preserve_ratio: true,
    output_format: "webp",
    fallback_format: "jpg",
    size_policy: "source_ratio",
    source_images_count: "all",
    generated_images_count: "1",
    provider_config: {},
    created_at: now,
    updated_at: now
  };

  return [
    {
      id: makeImgGenId(),
      name: "Claude Vision",
      provider_key: "claude_vision",
      engine_type: "vision_workflow",
      is_active: true,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "OpenAI GPT Image",
      provider_key: "openai_gpt_image",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "FLUX Kontext",
      provider_key: "flux_kontext",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "Leonardo AI",
      provider_key: "leonardo_ai",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "Fal.ai",
      provider_key: "fal_ai",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "Stability AI",
      provider_key: "stability_ai",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "Replicate",
      provider_key: "replicate",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "Seedream 4.5",
      provider_key: "seedream_4_5",
      engine_type: "image_generation",
      is_active: false,
      ...base
    },
    {
      id: makeImgGenId(),
      name: "black-forest-labs/flux-1.1-pro",
      provider_key: "flux_1_1_pro",
      engine_type: "image_generation",
      is_active: false,
      ...base
    }
  ];
};



// ══════════════════════════════════════════════════════════════════════════════
//  ImgGen — Image Generation Engines settings
// ══════════════════════════════════════════════════════════════════════════════

const IMG_COUNT_OPTIONS = [
  { value: "0", label: "0 — none / skip" },
  { value: "all", label: "All" },
  ...Array.from({ length: 20 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1)
  }))
];

function TabImgGen({ registry, onChange, onSave }) {
  const rows = Array.isArray(registry) ? registry : [];

  const updateRow = (id, patch) => {
    const now = new Date().toISOString();
    onChange(
      rows.map(r =>
        r.id === id
          ? { ...r, ...patch, updated_at: now }
          : r
      )
    );
  };

  const setActive = (id) => {
    const now = new Date().toISOString();
    onChange(
      rows.map(r => ({
        ...r,
        is_active: r.id === id,
        updated_at: now
      }))
    );
  };

  const removeRow = (id) => {
    const next = rows.filter(r => r.id !== id);
    if (!next.some(r => r.is_active) && next.length > 0) {
      next[0] = {
        ...next[0],
        is_active: true,
        updated_at: new Date().toISOString()
      };
    }
    onChange(next);
  };

  const addRow = () => {
    const now = new Date().toISOString();
    onChange([
      ...rows,
      {
        id: makeImgGenId(),
        name: "Nouvel engine",
        provider_key: "",
        engine_type: "image_generation",
        description: "",
        is_active: rows.length === 0,
        default_prompt: "",
        default_negative_prompt: "",
        default_mode: "edit",
        preserve_ratio: true,
        output_format: "webp",
        fallback_format: "jpg",
        size_policy: "source_ratio",
        source_images_count: "all",
        generated_images_count: "1",
        provider_config: {},
        created_at: now,
        updated_at: now
      }
    ]);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 140px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.text }}>ImgGen</div>
          <div style={{ fontSize: 10, color: P.muted, marginTop: 2 }}>
            Registre des moteurs de génération d’image — un seul actif
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addRow} style={{ ...btn(P.blue, P.blueS), fontSize: 10 }}>
            + Ajouter
          </button>
          <button onClick={() => onSave(rows)} style={{ ...btn(P.green, P.greenS), fontSize: 10 }}>
            💾 Sauvegarder
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(row => (
          <div
            key={row.id}
            style={{
              background: P.surface,
              border: `1px solid ${row.is_active ? P.green : P.border}`,
              borderRadius: 10,
              padding: 12
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr auto", gap: 10, alignItems: "start" }}>
              <div style={{ paddingTop: 24 }}>
                <input
                  type="radio"
                  name="imggen_active"
                  checked={!!row.is_active}
                  onChange={() => setActive(row.id)}
                />
              </div>

              <div>
                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Nom</div>
                <input
                  value={row.name || ""}
                  onChange={e => updateRow(row.id, { name: e.target.value })}
                  style={{ ...inp, fontSize: 11, marginBottom: 8 }}
                />

                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Provider Key</div>
                <input
                  value={row.provider_key || ""}
                  onChange={e => updateRow(row.id, { provider_key: e.target.value })}
                  placeholder="claude_vision / openai_gpt_image / flux_1_1_pro"
                  style={{ ...inp, fontSize: 11, marginBottom: 8 }}
                />

                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Type</div>
                <select
                  value={row.engine_type || "image_generation"}
                  onChange={e => updateRow(row.id, { engine_type: e.target.value })}
                  style={{ ...inp, fontSize: 11, marginBottom: 8 }}
                >
                  <option value="vision_workflow">vision_workflow</option>
                  <option value="image_generation">image_generation</option>
                  <option value="image_to_image">image_to_image</option>
                </select>

                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>
                  Générer Annonce — Source Images count
                </div>
                <select
                  value={row.source_images_count || "all"}
                  onChange={e => updateRow(row.id, { source_images_count: e.target.value })}
                  style={{ ...inp, fontSize: 11, marginBottom: 8 }}
                >
                  {IMG_COUNT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>
                  Générer Image IA — Images count
                </div>
                <select
                  value={row.generated_images_count || "1"}
                  onChange={e => updateRow(row.id, { generated_images_count: e.target.value })}
                  style={{ ...inp, fontSize: 11 }}
                >
                  {IMG_COUNT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Description</div>
                <textarea
                  value={row.description || ""}
                  onChange={e => updateRow(row.id, { description: e.target.value })}
                  rows={2}
                  style={{ ...inp, fontSize: 11, resize: "vertical", marginBottom: 8 }}
                />

                <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Prompt par défaut</div>
                <textarea
                  value={row.default_prompt || ""}
                  onChange={e => updateRow(row.id, { default_prompt: e.target.value })}
                  rows={3}
                  style={{ ...inp, fontSize: 11, resize: "vertical", marginBottom: 8 }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Format</div>
                    <select
                      value={row.output_format || "webp"}
                      onChange={e => updateRow(row.id, { output_format: e.target.value })}
                      style={{ ...inp, fontSize: 11 }}
                    >
                      <option value="webp">webp</option>
                      <option value="jpg">jpg</option>
                      <option value="png">png</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Fallback</div>
                    <select
                      value={row.fallback_format || "jpg"}
                      onChange={e => updateRow(row.id, { fallback_format: e.target.value })}
                      style={{ ...inp, fontSize: 11 }}
                    >
                      <option value="jpg">jpg</option>
                      <option value="png">png</option>
                      <option value="webp">webp</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: P.muted, marginBottom: 4 }}>Mode</div>
                    <select
                      value={row.default_mode || "edit"}
                      onChange={e => updateRow(row.id, { default_mode: e.target.value })}
                      style={{ ...inp, fontSize: 11 }}
                    >
                      <option value="edit">edit</option>
                      <option value="generate">generate</option>
                      <option value="variation">variation</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: P.muted }}>
                    <input
                      type="checkbox"
                      checked={!!row.preserve_ratio}
                      onChange={e => updateRow(row.id, { preserve_ratio: e.target.checked })}
                    />
                    Préserver ratio
                  </label>

                  <div style={{ fontSize: 10, color: P.muted }}>
                    Size policy: <b style={{ color: P.text }}>{row.size_policy || "source_ratio"}</b>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                <div
                  style={{
                    fontSize: 10,
                    color: row.is_active ? P.green : P.muted,
                    padding: "3px 8px",
                    borderRadius: 12,
                    background: row.is_active ? P.greenS : P.card,
                    border: `1px solid ${row.is_active ? P.green : P.border}`
                  }}
                >
                  {row.is_active ? "ACTIF" : "inactif"}
                </div>

                <div style={{ fontSize: 9, color: P.muted, textAlign: "right", maxWidth: 180 }}>
                  <div>ID: <span style={{ color: P.text }}>{row.id}</span></div>
                  <div>Créé: {row.created_at ? fmtDate(row.created_at) : "—"}</div>
                  <div>MAJ: {row.updated_at ? fmtDate(row.updated_at) : "—"}</div>
                </div>

                <button
                  onClick={() => removeRow(row.id)}
                  style={{ ...btn(P.red, P.redS), fontSize: 10 }}
                >
                  🗑 Supprimer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            background: P.surface,
            border: `1px solid ${P.border}`,
            borderRadius: 10,
            textAlign: "center",
            color: P.muted,
            fontSize: 11
          }}
        >
          Aucun engine enregistré
        </div>
      )}
    </div>
  );
}

const getActiveImgGenEngine = (registry = []) =>
  Array.isArray(registry) ? registry.find(r => r.is_active) || null : null;

const mapImgOutputFormatForOpenAI = (fmt = "webp") => {
  if (fmt === "jpg") return "jpeg";
  if (fmt === "jpeg") return "jpeg";
  if (fmt === "png") return "png";
  return "webp";
};

const getOpenAIImageSize = (engine) => {
  if (engine?.preserve_ratio) return "auto";
  return "1024x1024";
};



// ══════════════════════════════════════════════════════════════════════════════
//  AutoConfig — schedule + flow settings
// ══════════════════════════════════════════════════════════════════════════════

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function ProductManagerAuto() {
  const [tab,setTab]                    = useState("log");
  const [primaryFields,setPrimaryFields]    = useState([]);
  const [secondaryFields,setSecondaryFields]= useState([]);
  const [mapping,setMapping]            = useState({});
  const [listings,setListings]          = useState([]);
  const [config,setConfig]              = useState({});
  const [siteAdapters,setSiteAdapters]  = useState(DEFAULT_SITE_ADAPTERS);
  const [imgGenRegistry, setImgGenRegistry] = useState([]);
  const [logs,setLogs]                  = useState([]);
  const [loading,setLoading]            = useState(true);
  const [saving,setSaving]              = useState(false);
  const [saved,setSaved]                = useState(false);
  const [viewListing,setViewListing]    = useState(null);
  const [generating,setGenerating]      = useState(null);
  const rootRef                         = useRef(null);
  const [availableHeight,setAvailableHeight] = useState(null);

useEffect(()=>{
  Promise.all([
    kvGet("travito:dm_primary_fields"),
    kvGet("travito:dm_secondary_fields"),
    kvGet("travito:dm_mapping"),
    kvGet(KV_KEYS.listings),
    kvGet(KV_KEYS.config),
    kvGet(KV_KEYS.adapters),
    kvGet(KV_KEYS.imggen),
    kvGet(KV_KEYS.logs),
  ]).then(([pf,sf,mp,lst,cfg,adp,imgg,lg])=>{
    setPrimaryFields(Array.isArray(pf)?pf:[]);
    setSecondaryFields(Array.isArray(sf)?sf:[]);
    setMapping(mp&&typeof mp==="object"?mp:{});
    setListings(Array.isArray(lst)?lst:[]);
    setConfig(cfg&&typeof cfg==="object"?cfg:{});
    setSiteAdapters(adp&&typeof adp==="object"?{...DEFAULT_SITE_ADAPTERS,...adp}:DEFAULT_SITE_ADAPTERS);

    const seededImgGen =
      Array.isArray(imgg) && imgg.length > 0
        ? imgg
        : buildDefaultImgGenRegistry();

    setImgGenRegistry(seededImgGen);

    if (!Array.isArray(imgg) || imgg.length === 0) {
      kvSet(KV_KEYS.imggen, seededImgGen).catch(()=>{});
    }

    setLogs(Array.isArray(lg)?lg:[]);
    setLoading(false);
  });
},[]);


const saveImgGen = async (nextRegistry = imgGenRegistry) => {
  try {
    setSaving(true);

    await kvSet(KV_KEYS.imggen, nextRegistry);

    const fresh = await kvGet(KV_KEYS.imggen);
    const normalized = Array.isArray(fresh) ? fresh : nextRegistry;

    setImgGenRegistry(normalized);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  } catch (e) {
    console.log("ImgGen save failed:", e.message);
  } finally {
    setSaving(false);
  }
};

  useEffect(()=>{
    const updateHeight=()=>{
      const top = rootRef.current?.getBoundingClientRect?.().top || 0;
      const next = Math.max(420, Math.floor(window.innerHeight - top - 10));
      setAvailableHeight(next);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return ()=>window.removeEventListener("resize", updateHeight);
  },[]);




  const addJobLog=(entry)=>{
    setLogs(p=>{
      const updated=[entry,...p.slice(0,499)];
      kvSet(KV_KEYS.logs,updated).catch(()=>{});
      return updated;
    });
  };

  const saveConfig=async()=>{
    setSaving(true);
    await kvSet(KV_KEYS.config,config);
    setSaved(true);setSaving(false);
    setTimeout(()=>setSaved(false),2000);
  };

  const saveAdapters=async(next)=>{
    const val = next || siteAdapters;
    setSaving(true);
    setSiteAdapters(val);
    await kvSet(KV_KEYS.adapters,val);
    setSaved(true);setSaving(false);
    setTimeout(()=>setSaved(false),2000);
  };

  const clearConfig=async()=>{
    if(!window.confirm("Effacer toute la configuration?"))return;
    setConfig({});
    await kvSet(KV_KEYS.config,{});
    setSaved(true);setTimeout(()=>setSaved(false),2000);
  };

  const clearLogs=async()=>{
    if(!window.confirm("Effacer le journal?"))return;
    setLogs([]);
    await kvSet(KV_KEYS.logs,[]);
  };

  // Listen for generate/publish events from TabSemaine steps
  useEffect(()=>{
const onGenerate = async (e) => {
  const { listingId, openPopup = false } = e.detail || {};
  console.log("[AUTO][onGenerate] start", { listingId });

  const listing = listings.find(l => l.id === listingId);
  if (!listing) {
    console.log("[AUTO][onGenerate] listing not found", { listingId });
    return;
  }

  setGenerating(listingId);

  try {
    console.log("[AUTO][onGenerate] before generate()", {
      id: listing.id,
      url: listing.url,
      status: listing.status
    });

    await generate(listing, { openPopup });

    console.log("[AUTO][onGenerate] after generate()", {
      id: listing.id
    });
  } catch (err) {
    console.error("[AUTO][onGenerate] FAILED", err);
    alert("onGenerate error: " + err.message);
  } finally {
    setGenerating(null);
    console.log("[AUTO][onGenerate] end", { listingId });
  }
};
    const onPublish=async(e)=>{
      const {listingId}=e.detail;
      const listing=listings.find(l=>l.id===listingId);
      if(!listing)return;
      await publishListing(listing);
    };
    window.addEventListener("pm_auto_generate",onGenerate);
    window.addEventListener("pm_auto_publish",onPublish);
    return()=>{
      window.removeEventListener("pm_auto_generate",onGenerate);
      window.removeEventListener("pm_auto_publish",onPublish);
    };
  },[listings]);

  const catTax=primaryFields.find(t=>t.name?.toLowerCase().includes("categ")||t.slug?.toLowerCase().includes("categ"))||primaryFields[0];
  const typeTaxes=primaryFields.filter(t=>t.id!==catTax?.id);

const cacheSourceImagesToBlob = async (listingId, sourceImages = []) => {
  const cached = [];

  for (const img of sourceImages) {
    try {
      const r = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cache_blob_image",
          imageUrl: img.url,
          listingId,
          index: img.index,
          kind: "source"
        })
      });

      const d = await r.json();

      if (d?.success && d?.storedUrl) {
        cached.push({
          index: img.index,
          originalUrl: img.url,
          storedUrl: d.storedUrl,
          pathname: d.pathname,
          mimeType: d.mimeType || "image/jpeg"
        });
      } else {
        cached.push({
          index: img.index,
          originalUrl: img.url,
          storedUrl: img.url,
          pathname: "",
          mimeType: "image/jpeg"
        });
      }
    } catch (e) {
      console.log("[AUTO][cache blob failed]", {
        listingId,
        index: img.index,
        url: img.url,
        error: e.message
      });

      cached.push({
        index: img.index,
        originalUrl: img.url,
        storedUrl: img.url,
        pathname: "",
        mimeType: "image/jpeg"
      });
    }
  }

  return cached;
};

  // ── GENERER ANNONCE ──────────────────────────────────

const generate = async (listing, { openPopup = true } = {}) => {

console.log("[AUTO][generate] START", {
  id: listing.id,
  url: listing.url,
  status: listing.status
});

    setGenerating(listing.id);setViewListing(null);
    try {
      let rawTitle="",rawDescription="",rawFields={},photoUrl="",engine="Claude";
let pageHtml = "";
let detectedVendeur = "";
let allSourceImages = [];

      // Step 1: Fetch page
      try {

const isAvitoPage = /avito\.ma/i.test(listing.url || "");
const fetchAction = isAvitoPage ? "fetch_raw" : "fetch_url";

const fr = await fetch(`/api/kv?action=${fetchAction}&url=${encodeURIComponent(listing.url)}`);
const fd = await fr.json();
pageHtml = fd.html || fd.content || "";

console.log("[HTMLDBG] pageHtmlLen", pageHtml.length);
console.log("[HTMLDBG] fullHd matches", [...pageHtml.matchAll(/"fullHd":"(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi)].map(m => m[1]));
console.log("[HTMLDBG] standard matches", [...pageHtml.matchAll(/"standard":"(https:\/\/content\.avito\.ma\/classifieds\/images\/[^"]+)"/gi)].map(m => m[1]));
console.log("[HTMLDBG] direct image matches", [...pageHtml.matchAll(/https:\/\/content\.avito\.ma\/classifieds\/images\/[^\s"'<>\\]+/gi)].map(m => m[0]));

console.log("[AUTO][generate] STEP1 fetch source", {
  url: listing.url,
  fetchAction,
  pageHtmlLen: pageHtml.length
});

const fallbackPhotoUrl = extractFirstPhotoUrl(pageHtml);
const fallbackImages = Array.isArray(extractPhotoUrlsFromHtml?.(pageHtml))
  ? extractPhotoUrlsFromHtml(pageHtml)
  : (fallbackPhotoUrl ? [fallbackPhotoUrl] : []);

const prompt = pageHtml
  ? "Voici le contenu complet de cette annonce (peut contenir du texte en arabe, français ou anglais):\n\n" + pageHtml + "\n\n" +
    "INSTRUCTIONS: Lis ATTENTIVEMENT tout le texte ci-dessus. " +
    "Cherche la section Description/وصف et extrais TOUS les détails mentionnés: " +
    "état, caractéristiques techniques, compteurs, accessoires, prix, négociabilité, etc. " +
    "Ne résume pas — garde tous les faits de la description originale."
  : "Annonce URL: " + listing.url + "\nAnalyse l'URL et déduis les informations disponibles.";
        const r1=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({max_tokens:2000,
            system:`Tu es un expert extraction d'annonces marocaines. L'annonce peut être en FR, AR ou EN — traite toutes les langues.

PRIORITÉ BREADCRUMB: Si tu vois une liste de navigation (Accueil > Région > Ville > Quartier > Catégorie), EXTRAIS-EN:
- ville = 3ème niveau
- quartier = 4ème niveau
- catégorie = avant-dernier niveau

DESCRIPTION:
- Cherche la section Description / وصف / Description
- Extrais TOUS les détails sans rien perdre
- Si le texte source est en arabe, traduis en français dans "description"
- Mets le texte arabe original dans "description_ar" si présent
- Si le texte est déjà en français ou anglais, "description_ar" = null

PRIX:
- Cherche TOUS les prix mentionnés dans l'annonce.
- Si un prix est marqué comme "ancien", "avant", "barré", "au lieu de", IGNORE-LE.
- Privilégie le prix actuel / final / affiché maintenant.
- Si plusieurs prix actuels existent, retourne le plus bas.
- Extrait uniquement le nombre sans devise ni espaces.

Extrais TOUT: titre (traduit en FR si arabe), description complète, prix (nombre seul), surface, ville, quartier, vendeur, photo URL.
JSON uniquement, pas de markdown.`,
            messages:[{role:"user",content:prompt+'\n\nJSON:\n{"title":"titre en français","description":"description en français","description_ar":"original arabe si dispo sinon null","price":"nombre seul ou null","surface":"","ville":"ville détectée","quartier":"quartier détecté","vendeur":"","photo_url":"url ou null","extra_fields":{},"engine":""}'}]})});

        const r1d=await r1.json();
        const raw1=(r1d.content||[]).map(b=>b.text||"").join("").trim();
        const s1=raw1.indexOf("{"),e1=raw1.lastIndexOf("}");
if(s1>-1){
  const p1=JSON.parse(raw1.substring(s1,e1+1));
  rawTitle = p1.title || "";

  const descFr = p1.description || "";
  const descAr = p1.description_ar && p1.description_ar !== "null" ? p1.description_ar : "";
  rawDescription = descFr + (descAr ? "\n\n---\n" + descAr : "");

photoUrl =
  (p1.photo_url && p1.photo_url.includes("content.avito.ma")
    ? p1.photo_url.replace(/t=[^&]+/, "t=full_hd")
    : "") ||
  fallbackPhotoUrl ||
  "";

const isSameAvitoFamily = (u = "") => {
  const s = String(u || "").trim();
  return /^https:\/\/content\.avito\.ma\/classifieds\/images\//i.test(s);
};

allSourceImages = [
  ...(photoUrl ? [photoUrl] : []),
  ...fallbackImages
]
  .filter(Boolean)
  .map(u => String(u).trim())
  .filter(isSameAvitoFamily)
  .filter((u, i, arr) => arr.indexOf(u) === i)
  .slice(0, 20);

  if(!p1.photo_url && fallbackPhotoUrl){
  console.log("Step1: using fallback photo from HTML");
}
  engine = p1.engine || "Claude";

  const af = p1.extra_fields || {};


const normalizePrix = (v) => {
  const s = String(v ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d.,]/g, "")
    .replace(",", ".");

  if (!s || s === "." || s.length < 2) return "";
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
};

const prixFromPrice = (
  p1.price &&
  p1.price !== "null" &&
  p1.price !== "négociable"
)
  ? normalizePrix(p1.price)
  : "";

const prixFromExtra = normalizePrix(p1.extra_fields?.prix);

if (prixFromPrice && prixFromExtra) {
  af["prix"] = String(Math.min(Number(prixFromPrice), Number(prixFromExtra)));
} else if (prixFromPrice) {
  af["prix"] = prixFromPrice;
} else if (prixFromExtra) {
  af["prix"] = prixFromExtra;
}



  if(p1.surface && p1.surface !== "null") af["surface"] = p1.surface;
  if(p1.ville && p1.ville !== "null") af["ville"] = p1.ville;
  if(p1.quartier && p1.quartier !== "null") af["quartier"] = p1.quartier;

  if (p1.vendeur && p1.vendeur !== "null") {
    detectedVendeur = String(p1.vendeur).trim();
  }

  rawFields = af;
}
      } catch(e){console.error("Step1:",e.message);}

console.log("[AUTO][generate] STEP1 DONE", {
  rawTitle,
  photoUrl,
  rawFieldsKeys: Object.keys(rawFields || {})
});

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
              system:`Tu identifies la catégorie, sous-catégorie et terme le plus proche pour une annonce marocaine.

RÈGLES:
1) Choisis TOUJOURS le meilleur match même si pas exactement identique
2) Pour le terme: choisis le plus proche sémantiquement
3) Si un breadcrumb de navigation est présent (ex: Accueil > Ville > Quartier > Catégorie), utilise-le en PRIORITÉ pour identifier la catégorie et le type
4) L'annonce peut être en FR, AR ou EN
5) Réponds UNIQUEMENT en JSON valide sans markdown.`,
              messages:[{role:"user",content:`URL: ${listing.url}
Annonce: "${rawTitle}"
Description: "${rawDescription.slice(0,800)}"

IMPORTANT:
- L'annonce peut contenir du FR, AR ou EN
- Si un breadcrumb de navigation est présent (ex: Accueil > Ville > Quartier > Catégorie), utilise-le en PRIORITÉ pour identifier la catégorie et le type

NIVEAU 1 — Catégories disponibles:
${categoriesList}

NIVEAU 2+3 — Types et leurs termes:
${typesList}

Identifie le meilleur match pour cette annonce.

RÈGLES:
1) Choisis TOUJOURS le meilleur match même si pas exact
2) Utilise le breadcrumb en priorité si présent
3) Utilise la description complète si pas de breadcrumb clair
4) Réponds UNIQUEMENT en JSON valide

JSON: {"categoryTermId":"id exact","subCategoryTaxId":"id exact","subCategoryTermId":"id exact"}`}]})});
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

console.log("[AUTO][generate] STEP1b DONE", {
  detectedCatTermId,
  detectedSubTaxId,
  detectedSubTermId
});

      }

      // Step 2: Rewrite
      let rewrittenTitle=rawTitle,rewrittenDesc=rawDescription;
      try {
        const fieldsStr=Object.entries(rawFields).map(([k,v])=>`${k}: ${v}`).join(", ");
        const r2=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({max_tokens:1200,
            system:"Tu réécris des annonces pour Travito Maroc. RÈGLES STRICTES: 1. N'invente ABSOLUMENT RIEN 2. L'annonce source peut contenir du FR, AR ou EN 3. Garde TOUS les faits de la description originale (état, caractéristiques techniques, accessoires, prix négociable, vaccins, pedigree, sexe, âge, surface, etc.) 4. Si un détail est présent dans le texte source, il DOIT apparaître dans la réécriture 5. SUPPRIME uniquement: Avito, Mubawab, OLX, numéros de réf #xxxxx, noms de plateformes ou boutiques 6. Style professionnel en français 7. JSON uniquement.",
            messages:[{role:"user",content:`Titre original: ${rawTitle||listing.url}
Description originale: "${rawDescription||""}"
Données extraites: ${fieldsStr}

Réécris en français professionnel en gardant TOUS les détails de la description originale.
JSON: {"title":"titre professionnel","description":"description complète avec TOUS les faits originaux"}`}]})});
        const r2d=await r2.json();const raw2=(r2d.content||[]).map(b=>b.text||"").join("");const s2=raw2.indexOf("{"),e2=raw2.lastIndexOf("}");
        if(s2>-1){const p2=JSON.parse(raw2.substring(s2,e2+1));rewrittenTitle=p2.title||rawTitle;rewrittenDesc=p2.description||rawDescription;}
      } catch(e){console.error("Step2:",e.message);}

console.log("[AUTO][generate] STEP2 DONE", {
  rewrittenTitle,
  descLen: (rewrittenDesc || "").length
});

      // Step 3: Image prompt

let photoDescription = "";
let visionUsed = false;

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

if (!imageBase64 && photoUrl) {
  console.log("Step3: browser fetch failed, falling back to Claude URL vision:", photoUrl);
}

const visionInstruction =
  "Analyze this image carefully. Identify the EXACT color(s) of the main subject. " +
  "Then generate a detailed AI image prompt.\n\n" +
  "LISTING CONTEXT:\n" + allInfo + "\n\n" +
  "The prompt MUST include:\n" +
  "1. EXACT subject as visible in the image\n" +
  "2. PRECISE COLOR(S) exactly as you see them in this image (critical - no guessing)\n" +
  "3. Material/texture details from the image\n" +
  "4. Condition and quality visible\n" +
  "5. Professional studio white backdrop\n" +
  "6. Commercial photography style, 4K";

const r3Content = imageBase64
  ? [
      { type:"image", source:{ type:"base64", media_type:imageMediaType, data:imageBase64 } },
      { type:"text", text: visionInstruction }
    ]
  : photoUrl
    ? [
        { type:"image", source:{ type:"url", url: photoUrl } },
        { type:"text", text: visionInstruction }
      ]
    : [
        { type:"text", text: photoUserMsg }
      ];

console.log("Step3: Claude input mode =", imageBase64 ? "base64" : (photoUrl ? "url" : "text"));

const r3 = await fetch("/api/claude", {
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({
    max_tokens:600,
    system:"You generate precise AI image prompts for product/listing photography. When given an image, analyze it carefully and describe EXACT colors, materials, and details you see. Color accuracy is CRITICAL. Output only the prompt text, nothing else. Start your response with [VISION] if you received an image, or [TEXT] if text-only.",
    messages:[{ role:"user", content:r3Content }]
  })
}); 
        const r3d=await r3.json();
        const rawPhotoDesc = (r3d.content||[]).map(b=>b.text||"").join("").trim();
          // Extract vision mode indicator and clean prompt
          visionUsed = rawPhotoDesc.startsWith("[VISION]");
          photoDescription = rawPhotoDesc.replace(/^\[(VISION|TEXT)\]\s*/,"");
          if(visionUsed) console.log("Step3: ✅ Claude VISION used — colors from actual image");
          else console.log("Step3: ⚠️ Claude TEXT only — image not available, colors from text");
console.log("[AUTO][generate] STEP3 DONE", {
  visionUsed,
  photoDescriptionLen: (photoDescription || "").length
});
      } catch(e){console.error("Step3:",e.message);}






      // Step 4: Secondary fields
const subTermId=detectedSubTermId||listing.subCategoryTermId;
const mappedSecondary=[];
let unmatchedQuartierText = "";
      // Existing approved fields — do not overwrite on re-generate
      const existingFieldStates = listing.generated?.fieldStates || {};
      const existingSecFields   = listing.generated?.secondaryFields || [];
      if(subTermId&&Object.keys(mapping).length>0){


for(const sec of secondaryFields){
  const relation=mapping[`${subTermId}|${sec.id}`];
  if(relation!=="M"&&relation!=="O") continue;

  const existingIdx = existingSecFields.findIndex(sf=>sf.taxName===sec.name||sf.taxId===sec.id);
  const existingState = existingIdx>-1 ? existingFieldStates[`sec_${existingIdx}`] : null;

  if(existingState==="approved" && existingIdx>-1) {
    mappedSecondary.push({...existingSecFields[existingIdx]});
    continue;
  }

  let value="",found=false;
  const secNameLow=sec.name.toLowerCase();
  const isDescField=secNameLow.includes("descri")||secNameLow.includes("détail")||secNameLow.includes("detail");
  const isAddressField=secNameLow.includes("adress")||secNameLow.includes("adresse")||secNameLow.includes("address");
  const isQuartierField=secNameLow.includes("quartier");
  const isVilleField=secNameLow.includes("ville");
//  const isPhotoField=secNameLow.includes("photo")||secNameLow.includes("image")||secNameLow.includes("galerie");

const isPhotoField =
  secNameLow.includes("photo") ||
  secNameLow.includes("photos") ||
  secNameLow.includes("image") ||
  secNameLow.includes("images") ||
  secNameLow.includes("galerie") ||
  secNameLow.includes("gallery");

// ✅ ADD HERE
if (secNameLow.includes("photo") || secNameLow.includes("image")) {
  console.log("[AUTO][photo field check]", {
    field: sec.name,
    isPhotoField,
    photoUrl
  });
}

  try {
    if(isPhotoField && photoUrl){
      value = photoUrl;
      found = true;
    }

  if(isPhotoField){
    value = photoUrl || "";
    found = !!photoUrl;

  } else if(isDescField&&rewrittenDesc){
      let cleanDesc = rewrittenDesc
        .replace(/\b(avito|mubawab|olx|marocannonces|sarouty|remax|century21)\b\.?\s*(ma|maroc)?/gi,"Travito")
        .replace(/réf\.?\s*#?\d+/gi,"")
        .replace(/annonce\s+publiée\s+par\s+[^,.]+/gi,"")
        .replace(/\s{2,}/g," ")
        .trim();
      value = cleanDesc;
      found = true;
    } else {
      const rk=Object.keys(rawFields).find(k =>
        k.toLowerCase()===secNameLow ||
        secNameLow.includes(k.toLowerCase()) ||
        k.toLowerCase().includes(secNameLow.split(" ")[0])
      );

      if(rk && rawFields[rk]!==undefined && String(rawFields[rk]).trim()!==""){
        value = String(rawFields[rk]);
        found = true;
      } else {
        const r4 = await fetch("/api/claude", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            max_tokens:80,
            system:"Extrais valeur de champ depuis annonce. Valeur brute UNIQUEMENT. Prix: nombre seul. Si introuvable: NOTFOUND. JAMAIS: N/A, non mentionné, non disponible.",
            messages:[{
              role:"user",
              content:`Annonce: "${rawTitle}"\nDescription: "${rawDescription}"\nDonnées: ${JSON.stringify(rawFields)}\nChamp: "${sec.name}"${sec.fieldType==="Numeric"?` (défaut: ${sec.conditionValue||0})`:""}\nValeur exacte:`
            }]
          })
        });

        const r4d = await r4.json();
        const v = (r4d.content||[]).map(b=>b.text||"").join("").trim();
        const bad = ["NOTFOUND","N/A","null","undefined","non mentionné","non disponible","introuvable","aucun","pas de","absent"];
        const villeVal = rawFields["ville"]||"";
        const quartierVal = rawFields["quartier"]||"";
        const isJustVilleQuartier =
          isAddressField &&
          v &&
          (
            v.trim()===villeVal.trim() ||
            v.trim()===quartierVal.trim() ||
            v.trim()===`${quartierVal}, ${villeVal}`.trim() ||
            v.trim()===`${villeVal}, ${quartierVal}`.trim()
          );

        const isBad = !v || bad.some(b=>v.toLowerCase().includes(b.toLowerCase())) || isJustVilleQuartier;

        if(!isBad){
          value = v;
          found = true;
        } else if(sec.fieldType==="Numeric" && sec.conditionValue!==undefined && String(sec.conditionValue).trim()!==""){
          value = String(sec.conditionValue);
          found = false;
        } else {
          value = "";
          found = false;
        }
      }
    }
  } catch(e) {
    value = "";
    found = false;
  }


if ((isQuartierField || isVilleField) && value) {
  const rawDetected = String(value).trim();
  const normDetected = normalizeText(rawDetected);
  const terms = Array.isArray(sec.terms) ? sec.terms : [];

  console.log("[AUTO][match input]", {
    field: sec.name,
    detectedValue: rawDetected,
    hasTerms: Array.isArray(sec.terms),
    termsCount: terms.length,
    sampleTerms: terms.slice(0, 10).map(t => t.name)
  });

  const matchedTerm =
    terms.find(t => normalizeText(t.name) === normDetected) ||
    terms.find(t => normalizeText(t.name).includes(normDetected)) ||
    terms.find(t => normDetected.includes(normalizeText(t.name)));

  console.log("[AUTO][match result]", {
    field: sec.name,
    detectedValue: rawDetected,
    matchedTerm: matchedTerm ? { id: matchedTerm.id, name: matchedTerm.name } : null
  });

  if (matchedTerm) {
    value = matchedTerm.name;   // IMPORTANT: name, not id
    found = true;
  } else {
    if (isQuartierField) {
      unmatchedQuartierText = rawDetected;
      value = "";
      found = false;
    } else if (isVilleField) {
      value = rawDetected;      // keep raw ville text
      found = true;
    }
  }
}

  if (isAddressField && !value && unmatchedQuartierText) {
    value = unmatchedQuartierText;
    found = true;
  }

  if (isVilleField || isQuartierField || isAddressField || isPhotoField) {
    console.log("[AUTO][field match]", {
      field: sec.name,
      rawValue: value,
      found,
      unmatchedQuartierText,
      photoUrl
    });
  }

  mappedSecondary.push({
    taxId:sec.id,
    taxName:sec.name,
    fieldType:sec.fieldType||"Global",
    condition:sec.conditionValue||(sec.conditionMedia||[]).join(","),
    relation,
    value,
    found,
    wpMetaKey:sec.wpMetaKey||"",
    wpMetaType:sec.wpMetaType||"Taxonomie"
  });
}


console.log("[AUTO][generate] STEP4 DONE", {
  mappedSecondaryCount: mappedSecondary.length
});

      }



      // Step 5: Resolve labels — use listing user-input as priority fallback
      const catTax=primaryFields.find(t=>t.name.toLowerCase().includes("categ")||t.slug.toLowerCase().includes("categ"))||primaryFields[0];
      const finalCatTermId   = detectedCatTermId   || listing.categoryTermId    || "";
      const finalSubTaxId    = detectedSubTaxId    || listing.subCategoryTaxId  || "";
      const finalSubTermId   = detectedSubTermId   || listing.subCategoryTermId || "";
      const catTerm  = (catTax?.terms||[]).find(t=>t.id===finalCatTermId);
      const subTax   = primaryFields.find(t=>t.id===finalSubTaxId);
      const subTerm  = (subTax?.terms||[]).find(t=>t.id===finalSubTermId);

const activeImgEngine = getActiveImgGenEngine(imgGenRegistry || []);
const sourceCountSetting = String(activeImgEngine?.source_images_count || "all");

let limitedSourceImages = [...allSourceImages];

if (sourceCountSetting === "0") {
  limitedSourceImages = [];
} else if (sourceCountSetting !== "all") {
  const n = Math.max(0, Math.min(20, Number(sourceCountSetting) || 0));
  limitedSourceImages = limitedSourceImages.slice(0, n);
}

const normalizedSourceImages = limitedSourceImages.map((url, index) => ({
  url,
  index
}));

console.log(`[AUTO][images] count=${normalizedSourceImages.length}`);
normalizedSourceImages.slice(0, 10).forEach((img, i) => {
  console.log(`[AUTO][images][${i}] ${img.url}`);
});

if (normalizedSourceImages.length > 10) {
  console.log(`[AUTO][images] ... +${normalizedSourceImages.length - 10} autres`);
}

const cachedSourceImages = await cacheSourceImagesToBlob(listing.id, normalizedSourceImages);

console.log("[AUTO][cached source images]", {
  count: cachedSourceImages.length,
  first: cachedSourceImages[0],
  last: cachedSourceImages[cachedSourceImages.length - 1]
});

const primarySourceImageUrl =
  cachedSourceImages[0]?.storedUrl ||
  normalizedSourceImages[0]?.url ||
  photoUrl ||
  "";


const generated = {
  title: rewrittenTitle,
  description: rewrittenDesc,

  category: catTerm
    ? { taxId: catTax.id, termId: catTerm.id, name: catTerm.name }
    : (finalCatTermId ? { taxId: catTax?.id || "", termId: finalCatTermId, name: "" } : null),

  type: subTerm
    ? { taxId: subTax.id, termId: subTerm.id, name: subTerm.name }
    : (finalSubTermId ? { taxId: finalSubTaxId, termId: finalSubTermId, name: "" } : null),

  secondaryFields: mappedSecondary,
  photoDescription,
  photoDescriptionOriginal: photoDescription,
  visionUsed,
  fieldStates: {},

  // NEW
  sourceImages: cachedSourceImages,

  // compatibility
  photoUrl: primarySourceImageUrl,

  sourceExtract: {
    rawTitle,
    rawDescription,
    rawFields,
    photoUrl: primarySourceImageUrl,
    images: cachedSourceImages.map(x => x.storedUrl),
    pageHtml,
    engine,
    fetchedAt: new Date().toISOString()
  }
};

      // Update listing with detected taxonomy if auto-detected

const updatedListing = {
  ...listing,
  status: "generated",
  phoneStatus: listing.phoneStatus || "not_revealed",
  phoneSource: listing.phoneSource || "placeholder",
  generatedAt: new Date().toISOString(),
  generated,
  ...(detectedVendeur && !listing.username ? { username: detectedVendeur } : {}),
  ...(finalCatTermId ? { categoryTermId: finalCatTermId } : {}),
  ...(finalSubTaxId ? { subCategoryTaxId: finalSubTaxId } : {}),
  ...(finalSubTermId ? { subCategoryTermId: finalSubTermId } : {}),
};

const upd = listings.map(l => l.id === listing.id ? updatedListing : l);

console.log("[AUTO][generate] BEFORE persist", {
  id: listing.id,
  status: updatedListing.status,
  hasGenerated: !!updatedListing.generated
});


console.log("[AUTO][generate] READY TO SAVE", {
  id: listing.id,
  status: updatedListing.status,
  hasGenerated: !!updatedListing.generated,
  sourceImagesCount: updatedListing.generated?.sourceImages?.length || 0
});

const cleanUpd = sanitizeListingsForKV(upd);
setListings(cleanUpd);
await kvSet(KV_KEYS.listings, cleanUpd);

console.log("[AUTO][generate] SAVED", {
  id: listing.id,
  status: updatedListing.status,
  hasGenerated: !!updatedListing.generated,
  sourceImagesCount: updatedListing.generated?.sourceImages?.length || 0
});

if (openPopup) {
  setViewListing(cleanUpd.find(l => l.id === listing.id));
}

window.dispatchEvent(new CustomEvent("pm_auto_generate_done", {
  detail: {
    listingId: listing.id,
    success: true
  }
}));

} catch(err) {
  console.error("[AUTO][generate] FAILED", err);

  const failedListing = {
    ...listing,
    status: "generate_failed",
    generateError: err.message || "Erreur inconnue",
    generateFailedAt: new Date().toISOString()
  };

  const upd = listings.map(l => l.id === listing.id ? failedListing : l);

const cleanUpd = sanitizeListingsForKV(upd);
setListings(cleanUpd);
await kvSet(KV_KEYS.listings, cleanUpd);

  console.error("[AUTO][generate] FAILED SAVE", {
    id: listing.id,
    error: err.message || "Erreur inconnue"
  });

window.dispatchEvent(new CustomEvent("pm_auto_generate_done", {
  detail: {
    listingId: listing.id,
    success: false,
    error: err.message || "Erreur inconnue"
  }
}));

  alert("Erreur generate v2: " + err.message);
} finally {

  setGenerating(null);
  console.log("[AUTO][generate] END", { id: listing.id });
}

  };

  const publishListing = async (listing) => {
    // Get fresh listing from state (in case popup saved updates)
    const freshListing = listings.find(l=>l.id===listing.id) || listing;
    const gen = freshListing.generated || listing.generated || {};
    listing = freshListing; // use fresh data for all fields
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
        persist(upd);
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



  // ── SYNC COMPTE FROM LISTING ───────────────────────────────────────────────────────────────
const normalizeCompteUsername = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

const syncCompteFromListing = async (listing) => {
  if (!listing.username || !listing.phone) return;

  try {
    const kv = await fetch(`/api/kv?key=${encodeURIComponent("travito:pm_comptes")}`)
      .then(r => r.json());

    const comptes = Array.isArray(kv?.config) ? kv.config : [];

    const listingUsernameKey = normalizeCompteUsername(listing.username || "");
    const existing = comptes.find(c =>
      normalizeCompteUsername(c.username || "") === listingUsernameKey
    );

    if (!existing) {
      const newCompte = {
        id: `pm_${Date.now().toString(36)}`,
        username: listing.username,
        phone: listing.phone,
        email: listing.email || "",
        isoWeek: (() => {
          const d = new Date();
          const t = new Date(d);
          t.setHours(0, 0, 0, 0);
          t.setDate(t.getDate() + (4 - (t.getDay() || 7)));
          return Math.ceil(((t - new Date(t.getFullYear(), 0, 1)) / 86400000 + 1) / 7);
        })(),
        createdAt: new Date().toISOString(),
        locked: false
      };

      const updated = [...comptes, newCompte];

      await fetch("/api/kv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "travito:pm_comptes",
          value: updated
        })
      });

      console.log("Auto-synced new compte:", listing.username);
    } else if ((existing.phone || "") !== (listing.phone || "")) {
      const updated = comptes.map(c =>
        c.id === existing.id
          ? { ...c, phone: listing.phone }
          : c
      );

      await fetch("/api/kv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "travito:pm_comptes",
          value: updated
        })
      });

      console.log("Auto-updated compte phone:", listing.username);
    }
  } catch (e) {
    console.log("Auto-sync compte failed:", e.message);
  }
};

const approve = (listingId, updatedGen, imgOk) => {
  const upd = listings.map(l =>
    l.id === listingId
      ? {
          ...l,
          status: "approved",
          approvedAt: new Date().toISOString(),
          generated: updatedGen || l.generated,
          hasImage: imgOk ? true : l.hasImage,
          ...(imgOk && updatedGen?.approvedImageUrl
            ? { approvedImageUrl: updatedGen.approvedImageUrl }
            : {})
        }
      : l
  );

  persist(upd);
  setListings(upd);
  setViewListing(null);

  // Auto-sync Comptes on approve
  const approved = upd.find(l => l.id === listingId);
  if (approved) syncCompteFromListing(approved);
};



//--------------------------------------------------------------------

const TABS=[
  {id:"semaine",label:"📅 Semaine"},
  {id:"config",label:"⚙️ Config"},
  {id:"imggen",label:"🖼️ ImgGen"},
  {id:"adapters",label:"🧩 Adapters"},
  {id:"auto",label:"🤖 Auto"},
  {id:"log",label:"📋 Log"}
];

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",background:P.bg,color:P.muted,fontSize:12}}>
      Chargement...
    </div>
  );

return (
  <div
    ref={rootRef}
    style={{
      display: "flex",
      flexDirection: "column",
      height: availableHeight ? `${availableHeight}px` : "calc(100vh - 140px)",
      minHeight: 0,
      background: P.bg,
      overflow: "hidden"
    }}
  >
      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"0 12px",borderBottom:`1px solid ${P.border}`,background:P.surface,flexShrink:0,height:40}}>
        <div style={{width:22,height:22,borderRadius:6,background:`linear-gradient(135deg,${P.gold},${P.amber})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>🤖</div>
        <span style={{fontSize:11,fontWeight:700,color:P.gold,marginRight:8,flexShrink:0}}>PM Auto</span>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{fontSize:9,padding:"3px 10px",borderRadius:8,
              background:tab===t.id?P.blueS:"transparent",
              border:`1px solid ${tab===t.id?P.blue:P.border}`,
              color:tab===t.id?P.blue:P.muted,cursor:"pointer",whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
        {saved&&<span style={{fontSize:9,color:P.green,marginLeft:4}}>✅ Sauvegardé</span>}
        {saving&&<span style={{fontSize:9,color:P.amber,marginLeft:4}}>⏳...</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:12,flexShrink:0}}>
          {[[DAYS_FR.filter(d=>config?.[d]?.enabled).length+" jours",P.green],
            [logs.length+" jobs",P.blue],
            [listings.filter(l=>l.mode==="auto").length+" annonces",P.gold],
          ].map(([label,c])=>(
            <span key={label} style={{fontSize:9,color:c,fontFamily:"monospace"}}>{label}</span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{overflow:"hidden",display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
        {tab==="log"    &&<TabLog logs={logs} onClear={clearLogs}/>}
        {tab==="config" &&<TabConfig config={config} onChange={setConfig} primaryFields={primaryFields} secondaryFields={secondaryFields} onSave={saveConfig} onReset={clearConfig}/>}
        {tab==="adapters"&&<TabAdapters siteAdapters={siteAdapters} onChange={setSiteAdapters} onSave={saveAdapters} typeTaxes={typeTaxes}/>}
        {tab==="auto"   &&<TabAuto config={config} onChange={setConfig} onSave={saveConfig}/>}
        {tab==="semaine"&&<TabSemaine config={config} primaryFields={primaryFields} secondaryFields={secondaryFields} listings={listings} onListingsChange={setListings} mapping={mapping} logs={logs} onAddLog={addJobLog} siteAdapters={siteAdapters} imgGenRegistry={imgGenRegistry}/>}
{tab==="imggen" && (
  <TabImgGen
    registry={imgGenRegistry}
    onChange={setImgGenRegistry}
    onSave={saveImgGen}
  />
)}
      </div>

      {/* ViewPopup for inspecting listings */}
      {viewListing&&(
        <ViewPopup listing={viewListing} primaryFields={primaryFields} secondaryFields={secondaryFields}
          onApprove={(gen,imgOk)=>{
            const upd=listings.map(l=>l.id===viewListing.id?{...l,status:"approved",approvedAt:new Date().toISOString(),generated:gen,hasImage:imgOk,...(imgOk&&gen?.approvedImageUrl?{approvedImageUrl:gen.approvedImageUrl}:{})}:l);
            persist(upd);setViewListing(null);
          }}
          

onRegenerate={(g) => {
  if (g) {
    const upd = listings.map(l =>
      l.id === viewListing.id ? { ...l, generated: g } : l
    );
    const cleanUpd = sanitizeListingsForKV(upd);
    setListings(cleanUpd);
    kvSet(KV_KEYS.listings, cleanUpd).catch(() => {});
  }
  setViewListing(null);
  generate(viewListing);
}}

          onSave={(gen,imgOk)=>{
            const upd=listings.map(l=>l.id===viewListing.id?{...l,status:"saved",savedAt:new Date().toISOString(),generated:gen,hasImage:imgOk}:l);
            persist(upd);setListings(upd);setViewListing(upd.find(l=>l.id===viewListing.id));
          }}
          onClose={()=>setViewListing(null)}/>
      )}
    </div>
  );
}
