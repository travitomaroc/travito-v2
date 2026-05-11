// ================================================================
//  CFO — Chief Financial Officer
//  Manages: Finance Account Agent, Finance Analyst, Finance Planner
// ================================================================
import React, { useState, useEffect, useRef } from "react";
import { callClaude } from "../config/agentConfig";

// ================================================================
//  DATA PROTECTION RULES — DO NOT MODIFY BELOW MARKERS
//  User data lives in localStorage — code updates NEVER erase it.
//  Seed data only loads when localStorage is empty (first run).
//  Future updates: touch UI/features only, never seed arrays.
// ================================================================

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(212,175,55,0.18)",
  gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  green:"#10b981", red:"#ef4444", blue:"#1DA1F2",
  amber:"#f59e0b", purple:"#8b5cf6", card:"rgba(20,28,48,0.9)",
};

// ── Currency config ────────────────────────────────────────────
const BASE_RATES = { USD:1, SAR:3.75, MAD:10.1 }; // MAD updated monthly
const CURRENCIES = ["USD","MAD","SAR"];

const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const store = (k,v) => { try{localStorage.setItem(k,JSON.stringify(v));}catch{} };
const load  = (k,d) => { try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;} };

const convertAmount = (amount, fromCur, toCur, rates=BASE_RATES) => {
  if(fromCur===toCur) return amount;
  const inUSD = amount / (rates[fromCur]||1);
  return inUSD * (rates[toCur]||1);
};

const fmtAmount = (amount, currency) =>
  new Intl.NumberFormat("fr-MA",{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount) + " " + currency;

const STATUS_COLORS = {
  Draft:    C.amber,
  Approved: C.green,
  Cancelled:C.red,
  Active:   C.blue,
};

const EXPENSE_CATS = ["Logiciels & Abonnements","Marketing","Hébergement","Salaires","Services","Équipement","Taxes","Autre"];
const REVENUE_CATS = ["Ventes","Commissions","Services","Publicité","Partenariats","Autre"];
const PAY_METHODS  = ["Virement bancaire","Carte","Espèces","Paiement en ligne","Portefeuille","Autre"];

// ================================================================
//  FINANCE ACCOUNT AGENT — Ledgers
// ================================================================
function FinanceAccount({ currency }) {
  const [ledger, setLedger]   = useState("expenses");
  const [expenses, setExp]    = useState(()=>{ const saved=load("fin_expenses",null); if(saved&&saved.length>0) return saved; return [{"id": "seed1001", "date": "2026-03-01", "description": "ElevenLabs - Voiceover AI (AR/FR/EN)", "category": "Logiciels & Abonnements", "vendor": "ElevenLabs", "gross": "11.00", "tax": "0", "total": "11.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Starter plan - voiceover generation", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1002", "date": "2026-03-01", "description": "Shotstack - Video Assembly Production", "category": "Logiciels & Abonnements", "vendor": "Shotstack", "gross": "19.00", "tax": "0", "total": "19.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Production plan - 5.85 credits remaining", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1003", "date": "2026-03-01", "description": "fal.ai - Veo 3 Fast Video Generation", "category": "Logiciels & Abonnements", "vendor": "fal.ai", "gross": "20.00", "tax": "0", "total": "20.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Pay-as-you-go credits - $0.64/clip - $20 initial credits", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1004", "date": "2026-03-01", "description": "Anthropic Claude API - AI Agent Engine", "category": "Logiciels & Abonnements", "vendor": "Anthropic", "gross": "5.00", "tax": "0", "total": "5.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Pay-as-you-go ~$0.02/article est. $5/month", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1005", "date": "2026-03-01", "description": "X/Twitter API - Pay-per-use", "category": "Logiciels & Abonnements", "vendor": "X Corp", "gross": "3.00", "tax": "0", "total": "3.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Pay-per-use $0.01/tweet est. ~300 tweets/month", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1006", "date": "2026-03-01", "description": "Vercel - Hosting & Serverless", "category": "Logiciels & Abonnements", "vendor": "Vercel", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free Hobby plan - no cost currently", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1007", "date": "2026-03-01", "description": "Pexels API - Stock Images", "category": "Logiciels & Abonnements", "vendor": "Pexels", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free tier - 200 requests/hour", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1008", "date": "2026-03-01", "description": "Tavily Search API", "category": "Logiciels & Abonnements", "vendor": "Tavily", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free tier - events checker + self-improve", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed1009", "date": "2026-03-01", "description": "Upstash Redis KV Storage", "category": "Logiciels & Abonnements", "vendor": "Upstash", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free tier - KV storage for agent memory", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}]; });
  const [revenues, setRev]    = useState(()=>load("fin_revenues",[]));
  const [editEntry, setEdit]  = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(()=>store("fin_expenses",expenses),[expenses]);
  useEffect(()=>store("fin_revenues",revenues),[revenues]);

  const entries   = ledger==="expenses" ? expenses : revenues;
  const setEntries= ledger==="expenses" ? setExp    : setRev;
  const cats      = ledger==="expenses" ? EXPENSE_CATS : REVENUE_CATS;

  const saveEntry = (form) => {
    const entry = { ...form, updatedAt: new Date().toISOString() };
    if(entry.id) setEntries(p=>p.map(e=>e.id===entry.id?entry:e));
    else setEntries(p=>[...p,{...entry, id:uid(), status:"Draft", createdAt:new Date().toISOString()}]);
    setEdit(null);
  };

  const approve = (id) => setEntries(p=>p.map(e=>e.id===id?{...e,status:"Approved",approvedAt:new Date().toISOString()}:e));
  const cancel  = (id) => setEntries(p=>p.map(e=>e.id===id?{...e,status:"Cancelled"}:e));

  // Upload + Claude extraction
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setUploading(true);
    try {
      const base64 = await new Promise((res,rej)=>{
        const r = new FileReader();
        r.onload = ()=>res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      const isImage = file.type.startsWith("image/");
      const isPDF   = file.type==="application/pdf";

      let extractedText = "";
      if(isImage || isPDF) {
        const response = await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            model:"claude-sonnet-4-6",
            max_tokens:1000,
            messages:[{
              role:"user",
              content:[
                { type: isImage?"image":"document",
                  source:{ type:"base64", media_type:file.type, data:base64 }},
                { type:"text", text:`Extract financial data from this document and return ONLY valid JSON:
{
  "date": "YYYY-MM-DD",
  "description": "brief description",
  "vendor": "vendor or client name",
  "gross": 0,
  "tax": 0,
  "total": 0,
  "currency": "USD|MAD|SAR",
  "paymentMethod": "",
  "paymentRef": "",
  "category": "",
  "notes": ""
}` }
              ]
            }]
          })
        });
        const d = await response.json();
        extractedText = d.content?.[0]?.text || "";
      }

      let extracted = {};
      try {
        const start = extractedText.indexOf("{");
        const end   = extractedText.lastIndexOf("}");
        if(start>-1) extracted = JSON.parse(extractedText.substring(start,end+1));
      } catch{}

      setEdit({
        ...extracted,
        sourceDoc: file.name,
        sourceName: file.name,
        status:"Draft",
      });
    } catch(err) {
      setEdit({ sourceDoc:file.name, sourceName:file.name, status:"Draft" });
    }
    setUploading(false);
    e.target.value="";
  };

  const displayAmt = (entry) => {
    if(!entry.total) return "—";
    if(entry.currency===currency) return fmtAmount(entry.total, currency);
    const converted = convertAmount(parseFloat(entry.total)||0, entry.currency||"USD", currency);
    return fmtAmount(converted, currency) + (entry.currency!==currency?` (${entry.total} ${entry.currency})` : "");
  };

  const totals = entries.reduce((acc,e)=>{
    if(e.status==="Cancelled") return acc;
    const amt = convertAmount(parseFloat(e.total)||0, e.currency||"USD", currency);
    acc.total += amt;
    if(e.status==="Approved") acc.approved += amt;
    if(e.status==="Draft")    acc.draft    += amt;
    return acc;
  },{total:0,approved:0,draft:0});

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Ledger selector + actions */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:"wrap" }}>
        {[["expenses","💸 Charges"],["revenues","💰 Revenus"]].map(([id,label])=>(
          <button key={id} onClick={()=>setLedger(id)}
            style={{ fontSize:9, padding:"4px 12px", borderRadius:7, cursor:"pointer",
              background:ledger===id?(id==="expenses"?`${C.red}18`:`${C.green}18`):"transparent",
              border:`1px solid ${ledger===id?(id==="expenses"?C.red:C.green):C.border}`,
              color:ledger===id?(id==="expenses"?C.red:C.green):C.muted, fontWeight:700 }}>
            {label}
          </button>
        ))}

        {/* Totals */}
        <div style={{ display:"flex", gap:10, marginLeft:10, fontSize:8 }}>
          <span style={{ color:C.green }}>✅ {fmtAmount(totals.approved,currency)}</span>
          <span style={{ color:C.amber }}>📋 {fmtAmount(totals.draft,currency)}</span>
        </div>

        <div style={{ marginLeft:"auto", display:"flex", gap:5 }}>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display:"none" }} onChange={handleUpload}/>
          <button onClick={()=>fileRef.current.click()} disabled={uploading}
            style={{ fontSize:9, padding:"4px 10px", background:`${C.purple}18`, border:`1px solid ${C.purple}`, borderRadius:7, color:C.purple, cursor:"pointer" }}>
            {uploading?"⏳ Extraction...":"📎 Importer document"}
          </button>
          <button onClick={()=>setEdit({})}
            style={{ fontSize:9, padding:"4px 10px", background:`${C.green}18`, border:`1px solid ${C.green}`, borderRadius:7, color:C.green, cursor:"pointer", fontWeight:700 }}>
            + Saisir manuellement
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowX:"auto", overflowY:"auto" }}>
        {entries.length===0 ? (
          <div style={{ textAlign:"center", paddingTop:40, color:C.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>{ledger==="expenses"?"💸":"💰"}</div>
            <div>Aucune écriture</div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:8.5, minWidth:900 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:"rgba(12,18,35,0.98)", zIndex:1 }}>
                {["Date","Description","Catégorie","Fournisseur","Montant TTC","Taxe","Total","Devise","Paiement","Réf.","Statut","Source","Actions"].map(h=>(
                  <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:7.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e=>(
                <tr key={e.id} style={{ borderBottom:`1px solid ${C.border}22`, opacity:e.status==="Cancelled"?0.4:1 }}>
                  <td style={{ padding:"6px 8px", color:C.muted, whiteSpace:"nowrap" }}>{e.date}</td>
                  <td style={{ padding:"6px 8px", color:C.text, maxWidth:180 }}>{e.description}</td>
                  <td style={{ padding:"6px 8px", color:C.muted }}>{e.category}</td>
                  <td style={{ padding:"6px 8px", color:C.muted }}>{e.vendor}</td>
                  <td style={{ padding:"6px 8px", color:C.text, fontFamily:"monospace" }}>{e.gross}</td>
                  <td style={{ padding:"6px 8px", color:C.muted, fontFamily:"monospace" }}>{e.tax}</td>
                  <td style={{ padding:"6px 8px", color:ledger==="expenses"?C.red:C.green, fontFamily:"monospace", fontWeight:700 }}>
                    {displayAmt(e)}
                  </td>
                  <td style={{ padding:"6px 8px", color:C.muted }}>{e.currency}</td>
                  <td style={{ padding:"6px 8px", color:C.muted }}>{e.paymentMethod}</td>
                  <td style={{ padding:"6px 8px", color:C.muted, fontSize:7.5, maxWidth:100 }}>{e.paymentRef}</td>
                  <td style={{ padding:"6px 8px" }}>
                    <span style={{ fontSize:7, padding:"2px 7px", borderRadius:10, whiteSpace:"nowrap",
                      background:`${STATUS_COLORS[e.status]||C.muted}18`,
                      color:STATUS_COLORS[e.status]||C.muted,
                      border:`1px solid ${STATUS_COLORS[e.status]||C.muted}44` }}>
                      {e.status}
                    </span>
                  </td>
                  <td style={{ padding:"6px 8px" }}>
                    {e.sourceName && (
                      <span style={{ fontSize:7, color:C.blue, cursor:"pointer" }} title={e.sourceName}>
                        📎 {e.sourceName.length>12?e.sourceName.slice(0,12)+"...":e.sourceName}
                      </span>
                    )}
                  </td>
                  <td style={{ padding:"6px 8px" }}>
                    <div style={{ display:"flex", gap:3, whiteSpace:"nowrap" }}>
                      <button onClick={()=>setEdit(e)}
                        style={{ fontSize:7, padding:"2px 5px", background:`${C.blue}12`, border:`1px solid ${C.blue}44`, borderRadius:3, color:C.blue, cursor:"pointer" }}>✏️</button>
                      {e.status==="Draft" && <>
                        <button onClick={()=>approve(e.id)}
                          style={{ fontSize:7, padding:"2px 5px", background:`${C.green}12`, border:`1px solid ${C.green}44`, borderRadius:3, color:C.green, cursor:"pointer" }}>✅</button>
                        <button onClick={()=>cancel(e.id)}
                          style={{ fontSize:7, padding:"2px 5px", background:`${C.red}12`, border:`1px solid ${C.red}44`, borderRadius:3, color:C.red, cursor:"pointer" }}>🚫</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editEntry!==null && <LedgerForm initial={editEntry} cats={cats} ledger={ledger} onSave={saveEntry} onClose={()=>setEdit(null)} C={C}/>}
    </div>
  );
}

function LedgerForm({ initial, cats, ledger, onSave, onClose, C }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description:"", category:"", vendor:"", gross:"", tax:"0", total:"",
    currency:"USD", paymentMethod:"", paymentRef:"", notes:"", sourceDoc:"", sourceName:"", status:"Draft",
    ...initial
  });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  // Auto-calc total
  useEffect(()=>{
    const g = parseFloat(form.gross)||0;
    const t = parseFloat(form.tax)||0;
    if(!form.total || form.total===(g+t).toString()) {
      set("total", (g+t).toFixed(2));
    }
  },[form.gross, form.tax]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
      <div style={{ background:"rgba(15,22,40,0.99)", border:`1px solid ${C.gold}`, borderRadius:12, padding:24, width:540, maxHeight:"88vh", overflowY:"auto" }}>
        <div style={{ fontSize:11, color:C.gold, fontFamily:"monospace", marginBottom:16 }}>
          {form.id?"✏️ Modifier écriture":"➕ Nouvelle écriture — " + (ledger==="expenses"?"Charges":"Revenus")}
        </div>
        {form.sourceName && (
          <div style={{ fontSize:8, color:C.purple, marginBottom:10, padding:"4px 8px", background:`${C.purple}12`, borderRadius:5 }}>
            📎 Source: {form.sourceName}
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[["date","Date","date"],["vendor","Fournisseur / Client","text"],["gross","Montant HT","number"],["tax","Taxe","number"],["total","Total TTC","number"]].map(([k,l,t])=>(
            <div key={k} style={{ marginBottom:6 }}>
              <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
              <input type={t} value={form[k]||""} onChange={e=>set(k,e.target.value)}
                style={{ width:"100%", padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", boxSizing:"border-box" }}/>
            </div>
          ))}
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Devise</div>
            <select value={form.currency} onChange={e=>set("currency",e.target.value)}
              style={{ width:"100%", padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none" }}>
              {CURRENCIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Catégorie</div>
            <select value={form.category} onChange={e=>set("category",e.target.value)}
              style={{ width:"100%", padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none" }}>
              <option value="">-- Sélectionner --</option>
              {cats.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Mode de paiement</div>
            <select value={form.paymentMethod} onChange={e=>set("paymentMethod",e.target.value)}
              style={{ width:"100%", padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none" }}>
              <option value="">-- Sélectionner --</option>
              {PAY_METHODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Description *</div>
          <input value={form.description||""} onChange={e=>set("description",e.target.value)}
            style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", boxSizing:"border-box" }}/>
        </div>
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Référence paiement</div>
          <input value={form.paymentRef||""} onChange={e=>set("paymentRef",e.target.value)}
            placeholder="ID transaction, réf. virement, n° chèque, note interne..."
            style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", boxSizing:"border-box" }}/>
        </div>
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Notes / commentaires</div>
          <textarea value={form.notes||""} onChange={e=>set("notes",e.target.value)} rows={2}
            style={{ width:"100%", padding:"6px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none", resize:"vertical", boxSizing:"border-box" }}/>
        </div>
        {form.id && (
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>Statut</div>
            <select value={form.status} onChange={e=>set("status",e.target.value)}
              style={{ padding:"5px 8px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:9, outline:"none" }}>
              {["Draft","Approved","Cancelled","Active"].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div style={{ fontSize:8, color:C.amber, marginBottom:12 }}>
          ⚠️ Toute nouvelle écriture commence en statut <strong>Draft</strong> — approbation requise
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"6px 14px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", fontSize:9 }}>Annuler</button>
          <button onClick={()=>onSave(form)} disabled={!form.description}
            style={{ padding:"6px 14px", background:`${C.green}18`, border:`1px solid ${C.green}`, borderRadius:7, color:C.green, cursor:"pointer", fontSize:9, fontWeight:700 }}>
            💾 Enregistrer (Draft)
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  FINANCE ANALYST AGENT
// ================================================================
function FinanceAnalyst({ currency }) {
  const expenses = load("fin_expenses",[]);
  const revenues = load("fin_revenues",[]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer]     = useState(null);
  const [loading, setLoading]   = useState(false);

  const SUGGESTED = [
    "Charges par catégorie ce mois-ci",
    "Top 5 fournisseurs par montant",
    "Comparer revenus vs charges par mois",
    "Méthodes de paiement les plus utilisées",
    "Total taxes par mois",
    "Charges récurrentes logiciels",
    "Évolution mensuelle des revenus",
  ];

  const ask = async (q) => {
    if(!q) return;
    setLoading(true);
    setAnswer(null);
    try {
      const context = JSON.stringify({
        currency,
        expenses: expenses.filter(e=>e.status!=="Cancelled").slice(0,100),
        revenues: revenues.filter(r=>r.status!=="Cancelled").slice(0,50),
        totalExpenses: expenses.filter(e=>e.status==="Approved").reduce((s,e)=>s+convertAmount(parseFloat(e.total)||0,e.currency||"USD",currency),0).toFixed(2),
        totalRevenues: revenues.filter(r=>r.status==="Approved").reduce((s,r)=>s+convertAmount(parseFloat(r.total)||0,r.currency||"USD",currency),0).toFixed(2),
      });
      const raw = await callClaude(
        `Tu es l'agent Finance Analyste de Travito Maroc. Analyse les données financières et réponds en français.
Devise d'affichage: ${currency}. Données: ${context}`,
        q
      );
      setAnswer(raw);
    } catch(e) { setAnswer("Erreur: "+e.message); }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", padding:"12px" }}>
      <div style={{ fontSize:10, color:C.gold, fontFamily:"monospace", marginBottom:12 }}>📊 FINANCE ANALYST — Q&A sur vos données</div>

      {/* Suggested questions */}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:12 }}>
        {SUGGESTED.map(s=>(
          <button key={s} onClick={()=>{setQuestion(s);ask(s);}}
            style={{ fontSize:8, padding:"3px 9px", borderRadius:10, cursor:"pointer", background:`${C.gold}12`, border:`1px solid ${C.gold}44`, color:C.gold }}>
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        <input value={question} onChange={e=>setQuestion(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&ask(question)}
          placeholder="Posez votre question financière... (ex: Quelles sont mes charges ce mois?)"
          style={{ flex:1, padding:"7px 12px", background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:10, outline:"none" }}/>
        <button onClick={()=>ask(question)} disabled={loading||!question}
          style={{ padding:"7px 16px", background:`${C.blue}18`, border:`1px solid ${C.blue}`, borderRadius:8, color:C.blue, cursor:"pointer", fontSize:10, fontWeight:700 }}>
          {loading?"⏳":"🔍"}
        </button>
      </div>

      {/* Answer */}
      <div style={{ flex:1, overflowY:"auto", background:"rgba(0,0,0,0.2)", borderRadius:10, padding:14 }}>
        {!answer && !loading && (
          <div style={{ color:C.muted, fontSize:9, textAlign:"center", paddingTop:30 }}>
            Posez une question sur vos données financières
          </div>
        )}
        {loading && (
          <div style={{ color:C.amber, fontSize:9, textAlign:"center", paddingTop:30 }}>
            ⏳ Analyse en cours...
          </div>
        )}
        {answer && (
          <div style={{ fontSize:10, color:C.text, lineHeight:1.7, whiteSpace:"pre-wrap" }}>
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
//  FINANCE PLANNER & FORECASTER — Enhanced with P&L table
// ================================================================
function FinancePlanner({ currency }) {
  // Always reload fresh from localStorage when component opens
  const [expenses, setExpenses] = React.useState(()=>{ const s=load("fin_expenses",null); return (s&&s.length>0)?s:[{"id": "seed1", "date": "2026-03-01", "description": "ElevenLabs Starter - Voiceover AI AR/FR/EN", "category": "Logiciels & Abonnements", "vendor": "ElevenLabs", "gross": "11.00", "tax": "0", "total": "11.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Starter plan - monthly voiceover generation", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed2", "date": "2026-03-01", "description": "Shotstack Production - Video Assembly", "category": "Logiciels & Abonnements", "vendor": "Shotstack", "gross": "19.00", "tax": "0", "total": "19.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Production plan - 5.85 credits remaining", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed3", "date": "2026-03-01", "description": "fal.ai Credits - Veo 3 Fast Video Generation", "category": "Logiciels & Abonnements", "vendor": "fal.ai", "gross": "20.00", "tax": "0", "total": "20.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Pay-as-you-go - $0.64/clip - $20 initial load", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed4", "date": "2026-03-01", "description": "Anthropic Claude API - AI Agents Engine", "category": "Logiciels & Abonnements", "vendor": "Anthropic", "gross": "5.00", "tax": "0", "total": "5.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Pay-as-you-go ~$0.02/article - est. $5/month", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed5", "date": "2026-03-01", "description": "X Twitter API - Pay per use", "category": "Logiciels & Abonnements", "vendor": "X Corp", "gross": "3.00", "tax": "0", "total": "3.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "$0.01/tweet - est. 300 tweets/month @TravitoMaroc", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed6", "date": "2026-03-01", "description": "Vercel Hobby - Hosting & Serverless", "category": "Logiciels & Abonnements", "vendor": "Vercel", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free plan - serverless + cron jobs + deploys", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed7", "date": "2026-03-01", "description": "Pexels API - Stock Images", "category": "Logiciels & Abonnements", "vendor": "Pexels", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free tier 200 req/hour", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed8", "date": "2026-03-01", "description": "Tavily Search API", "category": "Logiciels & Abonnements", "vendor": "Tavily", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free tier - events checker + self-improve", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed9", "date": "2026-03-01", "description": "Upstash Redis KV - Agent Memory", "category": "Logiciels & Abonnements", "vendor": "Upstash", "gross": "0", "tax": "0", "total": "0", "currency": "USD", "paymentMethod": "", "paymentRef": "", "notes": "Free tier - KV storage for cron stats", "sourceName": "", "status": "Draft", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed10", "date": "2026-03-01", "description": "Google Cloud - YouTube Data API v3 + OAuth", "category": "Logiciels & Abonnements", "vendor": "Google Cloud", "gross": "0.00", "tax": "0", "total": "0.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Free tier. YouTube uploads via OAuth (travito.snet@gmail.com). ENV: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN", "sourceName": "console.cloud.google.com", "status": "Active", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed11", "date": "2026-03-01", "description": "Google Cloud - SC API + GA4 API + YouTube API v3", "category": "Logiciels & Abonnements", "vendor": "Google Cloud", "gross": "0.00", "tax": "0", "total": "0.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Free tier: Search Console API (keyword data), Analytics Data API (GA4 traffic), YouTube Data API v3 (uploads). Service account auth. ENV: GOOGLE_SC_CLIENT_EMAIL, GOOGLE_SC_PRIVATE_KEY, GA4_PROPERTY_ID, YOUTUBE_CLIENT_ID, YOUTUBE_REFRESH_TOKEN", "sourceName": "console.cloud.google.com", "status": "Active", "createdAt": "2026-03-01T00:00:00.000Z"}, {"id": "seed12", "date": "2026-03-01", "description": "RankMath SEO Plugin - WordPress SEO (Free)", "category": "Logiciels & Abonnements", "vendor": "RankMath", "gross": "0.00", "tax": "0", "total": "0.00", "currency": "USD", "paymentMethod": "Carte", "paymentRef": "", "notes": "Free version on travito.ma. Manages: SEO titles, meta descriptions, schema markup, XML sitemap, robots.txt, redirects, 404 monitoring. Integrated with Listivo theme and Elementor.", "sourceName": "rankmath.com", "status": "Active", "createdAt": "2026-03-01T00:00:00.000Z"}]; });
  const [revenues, setRevenues] = React.useState(()=>load("fin_revenues",[]));

  // Refresh on mount
  React.useEffect(()=>{
    setExpenses(load("fin_expenses",[]));
    setRevenues(load("fin_revenues",[]));
  },[]);

  const approvedExp = expenses.filter(e=>e.status==="Approved");
  const approvedRev = revenues.filter(r=>r.status==="Approved");
  const allExp = expenses.filter(e=>e.status!=="Cancelled");
  const allRev = revenues.filter(r=>r.status!=="Cancelled");

  // Build monthly data for full year 2026
  const year = new Date().getFullYear().toString();
  const currentMonth = new Date().toISOString().substring(0,7);
  const months = Array.from({length:12},(_,i)=>{
    const m = (i+1).toString().padStart(2,"0");
    return year+"-"+m;
  });

  const getMonthData = (month) => {
    const isActual = month <= currentMonth;
    const expEntries = (isActual ? approvedExp : allExp).filter(e=>(e.date||"").startsWith(month));
    const revEntries = (isActual ? approvedRev : allRev).filter(r=>(r.date||"").startsWith(month));
    const rev  = revEntries.reduce((s,r)=>s+convertAmount(parseFloat(r.total)||0,r.currency||"USD",currency),0);
    const exp  = expEntries.reduce((s,e)=>s+convertAmount(parseFloat(e.total)||0,e.currency||"USD",currency),0);
    return { month, rev, exp, net: rev-exp, isActual, isCurrent: month===currentMonth };
  };

  // Forecast: avg of available months
  const actualMonths = months.filter(m=>m<currentMonth).map(getMonthData).filter(m=>m.rev>0||m.exp>0);
  const avgRev = actualMonths.length ? actualMonths.reduce((s,m)=>s+m.rev,0)/actualMonths.length : 0;
  const avgExp = actualMonths.length ? actualMonths.reduce((s,m)=>s+m.exp,0)/actualMonths.length : 58; // known ~$58/mo

  const plData = months.map(month=>{
    const data = getMonthData(month);
    const isFuture = month > currentMonth;
    if(isFuture) {
      return { ...data, rev: avgRev, exp: avgExp, net: avgRev-avgExp, isForecast: true };
    }
    return { ...data, isForecast: false };
  });

  const ytdMonths = plData.filter(m=>m.month<=currentMonth&&!m.isForecast);
  const ytdRev = ytdMonths.reduce((s,m)=>s+m.rev,0);
  const ytdExp = ytdMonths.reduce((s,m)=>s+m.exp,0);
  const ytdNet = ytdRev - ytdExp;

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflowY:"auto",padding:"12px"}}>
      <div style={{fontSize:10,color:C.gold,fontFamily:"monospace",marginBottom:12}}>P&L PLANNER & FORECASTER</div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          ["Revenue YTD", fmtAmount(ytdRev,currency), C.green],
          ["Charges YTD", fmtAmount(ytdExp,currency), C.red],
          ["Net YTD", fmtAmount(ytdNet,currency), ytdNet>=0?C.green:C.red],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:C.card,border:"1px solid rgba(212,175,55,0.18)",borderRadius:10,padding:"12px",textAlign:"center"}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:15,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{background:"rgba(212,175,55,0.06)",border:"1px solid rgba(212,175,55,0.3)",borderRadius:8,padding:"10px 12px",marginBottom:16}}>
        <div style={{fontSize:8,color:C.gold,fontFamily:"monospace",marginBottom:8}}>FORECAST MENSUEL SUIVANT</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div><div style={{fontSize:8,color:C.muted}}>Revenue prevu</div><div style={{fontSize:12,fontWeight:700,color:C.green,fontFamily:"monospace"}}>{fmtAmount(avgRev,currency)}</div></div>
          <div><div style={{fontSize:8,color:C.muted}}>Charges prevues</div><div style={{fontSize:12,fontWeight:700,color:C.red,fontFamily:"monospace"}}>{fmtAmount(avgExp,currency)}</div></div>
          <div><div style={{fontSize:8,color:C.muted}}>Net prevu</div><div style={{fontSize:12,fontWeight:700,color:(avgRev-avgExp)>=0?C.green:C.red,fontFamily:"monospace"}}>{fmtAmount(avgRev-avgExp,currency)}</div></div>
        </div>
      </div>

      <div style={{fontSize:8,color:C.gold,fontFamily:"monospace",marginBottom:8}}>
        P&L {year} — Vert=Revenue / Rouge=Charges / Gris=Previsions
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:8.5,minWidth:700}}>
          <thead>
            <tr style={{borderBottom:"1px solid rgba(212,175,55,0.18)"}}>
              {["Mois","Revenue","Charges","Net","Marge","Statut"].map(h=>(
                <th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontSize:7.5,textTransform:"uppercase",fontWeight:700}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plData.map((m,i)=>{
              const name = monthNames[i];
              const margin = m.rev>0 ? ((m.net/m.rev)*100) : (m.exp>0 ? -100 : 0);
              const isCurrent = m.isCurrent;
              const isForecast = m.isForecast;
              const netColor = m.net>=0 ? C.green : C.red;
              const revColor = isForecast ? "#4a5568" : C.green;
              const expColor = isForecast ? "#4a5568" : C.red;
              const rowBg = isCurrent ? "rgba(212,175,55,0.08)" : isForecast ? "rgba(0,0,0,0.1)" : "transparent";
              return (
                <tr key={m.month} style={{borderBottom:"1px solid rgba(212,175,55,0.08)",background:rowBg,opacity:isForecast?0.6:1}}>
                  <td style={{padding:"7px 10px",color:isCurrent?C.gold:C.text,fontWeight:isCurrent?"700":"400",fontFamily:"monospace"}}>
                    {name} {isCurrent?"TODAY":""}
                  </td>
                  <td style={{padding:"7px 10px",color:revColor,fontFamily:"monospace"}}>
                    {m.rev>0||!isForecast ? fmtAmount(m.rev,currency) : "-"}
                  </td>
                  <td style={{padding:"7px 10px",color:expColor,fontFamily:"monospace"}}>
                    {fmtAmount(m.exp,currency)}
                  </td>
                  <td style={{padding:"7px 10px",color:isForecast?"#4a5568":netColor,fontFamily:"monospace",fontWeight:700}}>
                    {fmtAmount(m.net,currency)}
                  </td>
                  <td style={{padding:"7px 10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{height:5,width:50,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:Math.min(Math.abs(margin),100)+"%",background:isForecast?"#4a5568":m.net>=0?C.green:C.red,borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:7,color:isForecast?"#4a5568":m.net>=0?C.green:C.red,fontFamily:"monospace"}}>{margin.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{padding:"7px 10px"}}>
                    <span style={{fontSize:7,padding:"1px 6px",borderRadius:8,
                      background:isForecast?"rgba(74,85,104,0.2)":isCurrent?"rgba(212,175,55,0.15)":"rgba(255,255,255,0.04)",
                      color:isForecast?"#4a5568":isCurrent?C.gold:C.muted,
                      border:"1px solid "+(isForecast?"#4a5568":isCurrent?C.gold:"rgba(255,255,255,0.1)")}}>
                      {isForecast?"Prevision":isCurrent?"Actuel":"Reel"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{borderTop:"2px solid rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.05)"}}>
              <td style={{padding:"8px 10px",color:C.gold,fontWeight:700,fontSize:9}}>TOTAL {year}</td>
              <td style={{padding:"8px 10px",color:C.green,fontFamily:"monospace",fontWeight:700}}>{fmtAmount(plData.reduce((s,m)=>s+m.rev,0),currency)}</td>
              <td style={{padding:"8px 10px",color:C.red,fontFamily:"monospace",fontWeight:700}}>{fmtAmount(plData.reduce((s,m)=>s+m.exp,0),currency)}</td>
              <td style={{padding:"8px 10px",fontFamily:"monospace",fontWeight:700,color:plData.reduce((s,m)=>s+m.net,0)>=0?C.green:C.red}}>{fmtAmount(plData.reduce((s,m)=>s+m.net,0),currency)}</td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>

      {expenses.filter(e=>e.status==="Draft").length>0&&(
        <div style={{marginTop:12,padding:"8px 10px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:6,fontSize:8,color:C.amber}}>
          {expenses.filter(e=>e.status==="Draft").length} ecritures en Draft - approuvez-les pour les inclure dans les Actuals
        </div>
      )}
    </div>
  );
}
// ================================================================
//  CFO MAIN
// ================================================================
const AGENTS = [
  { id:"account",  icon:"📒", label:"Finance Account",   sub:"Ledgers & Approbations", color:"#10b981" },
  { id:"analyst",  icon:"📊", label:"Finance Analyst",   sub:"Q&A & Analyses",         color:"#1DA1F2" },
  { id:"planner",  icon:"📈", label:"Planner & Forecast",sub:"P&L & Prévisions",       color:"#8b5cf6" },
];

export default function CFO() {
  const [agent, setAgent]     = useState("account");
  const [currency, setCurrency] = useState("USD");

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Agent tabs + currency */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {AGENTS.map(a=>(
          <button key={a.id} onClick={()=>setAgent(a.id)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 12px", borderRadius:8, cursor:"pointer",
              background:agent===a.id?`${a.color}18`:"transparent",
              border:`1px solid ${agent===a.id?a.color:C.border}`,
              color:agent===a.id?a.color:C.muted }}>
            <span style={{ fontSize:10 }}>{a.icon}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:9, fontWeight:700 }}>{a.label}</div>
              <div style={{ fontSize:7 }}>{a.sub}</div>
            </div>
          </button>
        ))}

        {/* Currency switcher */}
        <div style={{ marginLeft:"auto", display:"flex", gap:3 }}>
          <span style={{ fontSize:8, color:C.muted, marginRight:4, alignSelf:"center" }}>Devise:</span>
          {CURRENCIES.map(c=>(
            <button key={c} onClick={()=>setCurrency(c)}
              style={{ fontSize:8, padding:"3px 8px", borderRadius:6, cursor:"pointer",
                background:currency===c?`${C.gold}18`:"transparent",
                border:`1px solid ${currency===c?C.gold:C.border}`,
                color:currency===c?C.gold:C.muted, fontWeight:currency===c?"700":"400" }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflow:"hidden" }}>
        {agent==="account" && <FinanceAccount currency={currency}/>}
        {agent==="analyst" && <FinanceAnalyst currency={currency}/>}
        {agent==="planner" && <FinancePlanner currency={currency}/>}
      </div>
    </div>
  );
}
