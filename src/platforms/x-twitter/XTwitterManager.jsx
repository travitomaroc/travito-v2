// ================================================================
//  X-TWITTER MANAGER — All agents
//  A1 Pipeline | Network Engager | Special Events
// ================================================================
import { useState } from "react";
import { getCurrentRotation, BRAND } from "../../config/agentConfig";
import XTwitterPipeline from "./XTwitterPipeline";
import NetworkEngager from "./NetworkEngager";
import SpecialEventsAgent from "./SpecialEventsAgent";

export default function XTwitterManager({ articles, onArticleReady, directorInstruction=null, xKeys }) {
  const [activeAgent, setActiveAgent] = useState("pipeline");
  const rotation = getCurrentRotation();

  const C = {
    bg:"rgba(12,18,35,0.95)", border:"rgba(29,161,242,0.2)",
    blue:"#1DA1F2", text:"#e8dcc8", muted:"#6b6050", green:"#10b981",
    gold:"#D4AF37", amber:"#f59e0b", orange:"#f97316",
  };

  const AGENTS = [
    { id:"pipeline", label:"A1→A4 Pipeline", icon:"🔄", color:C.green,  desc:"Génération automatique" },
    { id:"engager",  label:"Network Engager",icon:"🤝", color:C.blue,   desc:"Engagement & Hashtags" },
    { id:"events",   label:"Special Events", icon:"🎉", color:C.orange, desc:"Événements 2026" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Manager header */}
      <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:"7px 12px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <div style={{ width:28,height:28,background:"linear-gradient(135deg,#1DA1F2,#0a5f8a)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"#fff",flexShrink:0 }}>𝕏</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.blue }}>X-Twitter Manager</div>
          <div style={{ fontSize:7,color:C.muted,fontFamily:"monospace" }}>{rotation.theme.toUpperCase()} · {BRAND.x}</div>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {AGENTS.map(a=>(
            <button key={a.id} onClick={()=>setActiveAgent(a.id)}
              style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:12, background:activeAgent===a.id?`${a.color}18`:"transparent", border:`1px solid ${activeAgent===a.id?a.color:C.border}`, cursor:"pointer" }}>
              <span style={{ fontSize:10 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize:8,color:activeAgent===a.id?a.color:C.muted,fontFamily:"monospace",fontWeight:activeAgent===a.id?700:400 }}>{a.label}</div>
                <div style={{ fontSize:6,color:C.muted }}>{a.desc}</div>
              </div>
              <div style={{ width:4,height:4,borderRadius:"50%",background:a.color,animation:"pulse 2s infinite" }}/>
            </button>
          ))}
        </div>
      </div>

      {/* Agent area */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>
        {activeAgent==="pipeline" && <XTwitterPipeline articles={articles} onArticleReady={onArticleReady} managerInstruction={directorInstruction} xKeys={xKeys}/>}
        {activeAgent==="engager"  && <NetworkEngager xKeys={xKeys}/>}
        {activeAgent==="events"   && <SpecialEventsAgent xKeys={xKeys}/>}
      </div>
    </div>
  );
}
