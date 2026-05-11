// ================================================================
//  COO — Chief Operating Officer
//  Routes to: CFO, CTO, Audit Director
// ================================================================
import { useState } from "react";
import CFO from "./CFO";
import CTO from "./CTO";
import AuditDirectorCOO from "./AuditDirectorCOO";
import DataManager from "./DataManager";
import ProductManagerManuel from "./ProductManagerManuel";
import ProductManagerAuto from "./ProductManagerAuto";

const C = {
  bg:"rgba(12,18,35,0.95)", border:"rgba(212,175,55,0.18)",
  gold:"#D4AF37", text:"#e8dcc8", muted:"#6b6050",
  green:"#10b981", red:"#ef4444", blue:"#1DA1F2",
  amber:"#f59e0b", purple:"#8b5cf6", card:"rgba(20,28,48,0.9)",
  teal:"#14b8a6",
};

const DEPTS = [
  { id:"cfo",   icon:"💰", label:"CFO",            sub:"Finance & Accounting",  color:"#10b981" },
  { id:"cto",   icon:"⚙️", label:"CTO",            sub:"IT & Integrations",     color:"#1DA1F2" },
  { id:"audit",      icon:"🔎", label:"Audit Director",  sub:"Compliance & Control",  color:"#f59e0b" },
  { id:"production", icon:"🏭", label:"VP Production",  sub:"Data & Taxonomy Manager", color:"#8b5cf6" },
];

function VPProduction() {
  const [agent, setAgent] = useState("datamanager");
  const AGENTS = [
    { id:"datamanager",         icon:"📊", label:"Data Manager",           sub:"Taxonomies & Mapping" },
    { id:"productmanager_manuel",icon:"⚙️", label:"Product Manager Manuel", sub:"Annonces manuelles" },
    { id:"productmanager_auto",  icon:"🤖", label:"Product Manager Auto",   sub:"Automatisation" },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, overflow:"hidden" }}>
      <div style={{ display:"flex", gap:5, padding:"8px 14px",
        borderBottom:"1px solid rgba(212,175,55,0.18)", flexShrink:0,
        background:"rgba(12,18,35,0.6)" }}>
        <span style={{ fontSize:9, color:"#6b6050", alignSelf:"center", marginRight:4 }}>
          🏭 VP Production:
        </span>
        {AGENTS.map(a => (
          <button key={a.id} onClick={() => setAgent(a.id)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 12px",
              borderRadius:8, cursor:"pointer",
              background: agent===a.id ? "rgba(212,175,55,0.12)" : "transparent",
              border: `1px solid ${agent===a.id ? "#D4AF37" : "rgba(212,175,55,0.18)"}`,
              color: agent===a.id ? "#D4AF37" : "#6b6050" }}>
            <span style={{ fontSize:11 }}>{a.icon}</span>
            <div>
              <div style={{ fontSize:9, fontWeight:700 }}>{a.label}</div>
              <div style={{ fontSize:7, opacity:0.7 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ flex:1, minHeight:0, overflow:"hidden" }}>
<div style={{display:agent==="datamanager"?"flex":"none",flexDirection:"column",height:"100%",overflow:"hidden"}}><DataManager/></div>
<div style={{display:agent==="productmanager_manuel"?"flex":"none",flex:1,minHeight:0,flexDirection:"column",overflow:"hidden"}}><ProductManagerManuel/></div>
<div style={{display:agent==="productmanager_auto"?"flex":"none",flex:1,minHeight:0,flexDirection:"column",overflow:"hidden"}}><ProductManagerAuto/></div>
      </div>
    </div>
  );
}

export default function COO() {
  const [dept, setDept] = useState("cfo");

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, overflow:"hidden", background:C.bg }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 14px", borderBottom:`1px solid ${C.border}`, height:42, flexShrink:0 }}>
        <span style={{ fontSize:14 }}>🏢</span>
        <span style={{ fontSize:11, fontWeight:700, color:C.gold, fontFamily:"monospace" }}>COO — CHIEF OPERATING OFFICER</span>
        <div style={{ display:"flex", gap:5, marginLeft:16 }}>
          {DEPTS.map(d=>(
            <button key={d.id} onClick={()=>setDept(d.id)}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 12px", borderRadius:8,
                background:dept===d.id?`${d.color}18`:"transparent",
                border:`1px solid ${dept===d.id?d.color:C.border}`,
                color:dept===d.id?d.color:C.muted, cursor:"pointer" }}>
              <span style={{ fontSize:11 }}>{d.icon}</span>
              <div>
                <div style={{ fontSize:9, fontWeight:700 }}>{d.label}</div>
                <div style={{ fontSize:7, opacity:0.7 }}>{d.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, minHeight:0, overflow:"hidden" }}>
        {dept==="cfo"   && <CFO/>}
        {dept==="cto"   && <CTO/>}
        {dept==="audit"      && <AuditDirectorCOO/>}
        {dept==="production" && <VPProduction/>}
      </div>
    </div>
  );
}
