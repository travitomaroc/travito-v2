// ================================================================
//  AUDIT DIRECTOR — Under COO
//  Compliance, control, audit trails, IT/Finance cross-checking
// ================================================================
import { useState, useEffect } from "react";

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(212,175,55,0.18)",
  gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  green:"#10b981", red:"#ef4444", blue:"#1DA1F2",
  amber:"#f59e0b", purple:"#8b5cf6", card:"rgba(20,28,48,0.9)",
};

const load = (k,d) => { try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;} };

export default function AuditDirectorCOO() {
  const [tab, setTab] = useState("overview");

  // Load data from other modules for cross-checks
  const software   = load("it_software",[]);
  const subs       = load("it_subs",[]);
  const apis       = load("it_apis",[]);
  const expenses   = load("fin_expenses",[]);
  const revenues   = load("fin_revenues",[]);

  // Cross-check: subs without matching finance entry
  const subsWithoutFinance = subs.filter(s=>{
    const softName = s.software?.toLowerCase();
    return !expenses.some(e=>e.description?.toLowerCase().includes(softName) || e.vendor?.toLowerCase().includes(softName));
  });

  // Finance entries still in Draft
  const draftEntries = [...expenses,...revenues].filter(e=>e.status==="Draft");

  // Cancelled records
  const cancelledEntries = [...expenses,...revenues].filter(e=>e.status==="Cancelled");

  // Disabled software
  const disabledSW = software.filter(s=>s.status==="Disabled");

  const TABS = [
    ["overview","🔎 Vue d'ensemble"],
    ["itfinance","🔗 IT ↔ Finance"],
    ["approvals","✅ Approbations"],
    ["history","📜 Historique"],
    ["future","🔮 À venir"],
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Header */}
      <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ fontSize:11, color:C.gold, fontFamily:"monospace", fontWeight:700 }}>🔎 AUDIT DIRECTOR — CONTRÔLE & CONFORMITÉ</div>
        <div style={{ fontSize:8, color:C.muted, marginTop:2 }}>Source de vérité interne — traçabilité complète</div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, padding:"5px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {TABS.map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ fontSize:8, padding:"3px 10px", borderRadius:7, cursor:"pointer",
              background:tab===id?`${C.amber}18`:"transparent",
              border:`1px solid ${tab===id?C.amber:C.border}`,
              color:tab===id?C.amber:C.muted }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px" }}>

        {/* OVERVIEW */}
        {tab==="overview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:16 }}>
              {[
                ["💾 Logiciels actifs",   software.filter(s=>s.status==="Active").length,  C.green],
                ["🚫 Logiciels désactivés", disabledSW.length,                              C.red],
                ["📋 Abonnements actifs", subs.filter(s=>s.status==="Active").length,      C.blue],
                ["🔌 APIs enregistrées",  apis.length,                                      C.purple],
                ["📝 Écritures Draft",    draftEntries.length,                              C.amber],
                ["🚫 Écritures annulées", cancelledEntries.length,                          C.red],
                ["⚠️ Abonnements sans entrée finance", subsWithoutFinance.length,            C.amber],
                ["✅ Écritures approuvées", [...expenses,...revenues].filter(e=>e.status==="Approved").length, C.green],
              ].map(([l,v,c])=>(
                <div key={l} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 12px" }}>
                  <div style={{ fontSize:18, fontWeight:700, color:c, fontFamily:"monospace" }}>{v}</div>
                  <div style={{ fontSize:8, color:C.muted, marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Alerts */}
            {(draftEntries.length>0 || subsWithoutFinance.length>0) && (
              <div>
                <div style={{ fontSize:9, color:C.amber, fontFamily:"monospace", marginBottom:8 }}>⚠️ ALERTES D'AUDIT</div>
                {draftEntries.length>0 && (
                  <div style={{ padding:"8px 12px", background:`${C.amber}10`, border:`1px solid ${C.amber}44`, borderRadius:7, marginBottom:6, fontSize:9, color:C.amber }}>
                    {draftEntries.length} écriture(s) financière(s) en attente d'approbation
                  </div>
                )}
                {subsWithoutFinance.length>0 && (
                  <div style={{ padding:"8px 12px", background:`${C.red}10`, border:`1px solid ${C.red}44`, borderRadius:7, marginBottom:6, fontSize:9, color:C.red }}>
                    {subsWithoutFinance.length} abonnement(s) sans entrée comptable correspondante
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* IT ↔ FINANCE */}
        {tab==="itfinance" && (
          <div>
            <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", marginBottom:12 }}>🔗 CONSISTANCE IT ↔ FINANCE</div>
            {subsWithoutFinance.length===0 ? (
              <div style={{ padding:"10px 14px", background:`${C.green}10`, border:`1px solid ${C.green}44`, borderRadius:8, fontSize:9, color:C.green }}>
                ✅ Tous les abonnements IT ont une entrée comptable correspondante
              </div>
            ) : (
              <div>
                <div style={{ fontSize:9, color:C.amber, marginBottom:8 }}>
                  ⚠️ {subsWithoutFinance.length} abonnement(s) sans entrée comptable:
                </div>
                {subsWithoutFinance.map(s=>(
                  <div key={s.id} style={{ padding:"8px 12px", background:C.card, border:`1px solid ${C.amber}44`, borderRadius:7, marginBottom:6 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:C.text }}>{s.software} — {s.plan}</div>
                    <div style={{ fontSize:8, color:C.muted }}>Coût: {s.cost} {s.currency} / {s.cycle}</div>
                    <div style={{ fontSize:8, color:C.amber, marginTop:4 }}>Aucune écriture Finance trouvée pour ce logiciel</div>
                  </div>
                ))}
              </div>
            )}

            {/* Software cost summary */}
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", marginBottom:8 }}>💰 COÛTS IT PLANIFIÉS</div>
              {subs.filter(s=>s.status==="Active").map(s=>(
                <div key={s.id} style={{ display:"flex", justifyContent:"space-between", padding:"6px 10px", background:"rgba(0,0,0,0.2)", borderRadius:5, marginBottom:4 }}>
                  <span style={{ fontSize:9, color:C.text }}>{s.software} — {s.plan}</span>
                  <span style={{ fontSize:9, color:C.green, fontFamily:"monospace" }}>{s.cost} {s.currency}/{s.cycle}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* APPROVALS */}
        {tab==="approvals" && (
          <div>
            <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", marginBottom:12 }}>✅ REGISTRE D'APPROBATIONS</div>
            {draftEntries.length===0 && (
              <div style={{ padding:"10px 14px", background:`${C.green}10`, border:`1px solid ${C.green}44`, borderRadius:8, fontSize:9, color:C.green }}>
                ✅ Aucune écriture en attente d'approbation
              </div>
            )}
            {draftEntries.length>0 && (
              <div>
                <div style={{ fontSize:9, color:C.amber, marginBottom:8 }}>📋 En attente: {draftEntries.length}</div>
                {draftEntries.map(e=>(
                  <div key={e.id} style={{ padding:"8px 12px", background:C.card, border:`1px solid ${C.amber}44`, borderRadius:7, marginBottom:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.text }}>{e.description}</div>
                      <div style={{ fontSize:9, color:C.amber }}>DRAFT</div>
                    </div>
                    <div style={{ fontSize:8, color:C.muted }}>{e.date} · {e.total} {e.currency} · {e.vendor}</div>
                    {e.sourceName && <div style={{ fontSize:7, color:C.purple, marginTop:2 }}>📎 {e.sourceName}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Approved entries */}
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:9, color:C.green, fontFamily:"monospace", marginBottom:8 }}>
                ✅ Approuvées: {[...expenses,...revenues].filter(e=>e.status==="Approved").length}
              </div>
              {[...expenses,...revenues].filter(e=>e.status==="Approved").slice(0,10).map(e=>(
                <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 10px", background:"rgba(0,0,0,0.15)", borderRadius:5, marginBottom:3 }}>
                  <span style={{ fontSize:8, color:C.text }}>{e.date} · {e.description}</span>
                  <span style={{ fontSize:8, color:C.green, fontFamily:"monospace" }}>{e.total} {e.currency}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {tab==="history" && (
          <div>
            <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", marginBottom:12 }}>📜 HISTORIQUE COMPLET — Aucun enregistrement supprimé</div>

            {/* Disabled software */}
            {disabledSW.length>0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:9, color:C.red, marginBottom:6 }}>🚫 Logiciels désactivés ({disabledSW.length})</div>
                {disabledSW.map(s=>(
                  <div key={s.id} style={{ padding:"6px 10px", background:"rgba(239,68,68,0.05)", border:`1px solid ${C.red}22`, borderRadius:6, marginBottom:4 }}>
                    <span style={{ fontSize:9, color:C.text }}>{s.icon} {s.name}</span>
                    <span style={{ fontSize:8, color:C.muted, marginLeft:8 }}>{s.url}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Cancelled finance entries */}
            {cancelledEntries.length>0 && (
              <div>
                <div style={{ fontSize:9, color:C.red, marginBottom:6 }}>🚫 Écritures annulées ({cancelledEntries.length})</div>
                {cancelledEntries.map(e=>(
                  <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 10px", background:"rgba(239,68,68,0.05)", border:`1px solid ${C.red}22`, borderRadius:5, marginBottom:3 }}>
                    <span style={{ fontSize:8, color:C.muted }}>{e.date} · {e.description}</span>
                    <span style={{ fontSize:8, color:C.red, fontFamily:"monospace" }}>{e.total} {e.currency}</span>
                  </div>
                ))}
              </div>
            )}

            {disabledSW.length===0 && cancelledEntries.length===0 && (
              <div style={{ color:C.muted, fontSize:9, textAlign:"center", paddingTop:20 }}>
                Aucun enregistrement désactivé ou annulé
              </div>
            )}
          </div>
        )}

        {/* FUTURE */}
        {tab==="future" && (
          <div style={{ color:C.muted }}>
            <div style={{ fontSize:9, color:C.gold, fontFamily:"monospace", marginBottom:12 }}>🔮 MODULES D'AUDIT À VENIR</div>
            {[
              ["🔍 Audit interne","Révision périodique des processus et contrôles internes"],
              ["📋 Revue de conformité","Vérification de la conformité réglementaire et politique"],
              ["🔗 Vérification croisée IT/Finance","Réconciliation automatique des coûts IT vs entrées comptables"],
              ["📄 Traçabilité des documents","Suivi complet des documents source et leur cycle de vie"],
              ["⚠️ Contrôle opérationnel","Revue des workflows et points de contrôle opérationnels"],
              ["🕵️ Piste d'approbation","Historique complet de toutes les approbations et refus"],
            ].map(([title,desc])=>(
              <div key={title} style={{ padding:"10px 12px", background:C.card, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:3 }}>{title}</div>
                <div style={{ fontSize:8, color:C.muted }}>{desc}</div>
                <div style={{ fontSize:7, color:C.amber, marginTop:5 }}>🔧 Disponible prochainement</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
