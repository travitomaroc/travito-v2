import { useState, useRef, useEffect } from "react";
import { BRAND, getCurrentRotation, callClaude } from "../config/agentConfig";
import SocialMediaDirector from "../director/SocialMediaDirector";
import PerformanceAnalyst from "../analytics/PerformanceAnalyst";
import AuditDirector from "../audit/AuditDirector";
import SEODirector from "../seo/SEODirector";

const VP_PERSONA = `Tu es VP Marketing de ${BRAND.name}. Commence par [VP-MARKETING]. Français.`;

export default function VPMarketing({ articles, onArticleReady, ceoInstruction=null, xKeys }) {
  const [dept, setDept]         = useState("social");
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [history, setHistory]   = useState([]);
  const [vpCmd, setVpCmd]       = useState(null);
  const [showChat, setShowChat] = useState(false);
  const bottomRef = useRef(null);
  const rot = getCurrentRotation();
  const C = {bg:"rgba(12,18,35,0.95)",border:"rgba(139,92,246,0.2)",purple:"#8b5cf6",text:"#e8dcc8",muted:"#6b6050"};

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{setMessages([{role:"assistant",content:`[VP-MARKETING] Bonjour!\n• Rotation: ${rot.theme}\n• X-Twitter actif`}]);},[]);
  useEffect(()=>{if(ceoInstruction){setVpCmd(ceoInstruction);setMessages(p=>[...p,{role:"assistant",content:`[VP] CEO: "${ceoInstruction}"`}]);}},[ceoInstruction]);

  const send=async()=>{
    const text=input.trim(); if(!text||loading) return;
    setInput("");
    const u={role:"user",content:text};
    setMessages(p=>[...p,u]); setHistory(p=>[...p,u]); setLoading(true);
    if(/director|social|contenu/i.test(text)) setVpCmd(text);
    try {
      const r=await callClaude(VP_PERSONA,text,history);
      setMessages(p=>[...p,{role:"assistant",content:r}]);
      setHistory(p=>[...p,{role:"assistant",content:r}]);
    } catch {setMessages(p=>[...p,{role:"assistant",content:"[VP] ⚠️ Erreur."}]);}
    setLoading(false);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      {/* Header */}
      <div style={{height:36,minHeight:36,flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderBottom:`1px solid ${C.border}`,background:C.bg}}>
        <div style={{width:22,height:22,background:`linear-gradient(135deg,${C.purple},#5b21b6)`,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>📣</div>
        <div style={{fontSize:10,fontWeight:700,color:C.purple}}>VP Marketing</div>
        <div style={{fontSize:7,color:C.muted,fontFamily:"monospace"}}>MARKETING STRATEGY · {BRAND.name}</div>
        <button onClick={()=>setShowChat(p=>!p)} style={{marginLeft:"auto",fontSize:8,padding:"2px 7px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:"pointer"}}>{showChat?"🙈 VP":"💬 VP"}</button>
      </div>

      {/* Dept tabs */}
      <div style={{display:"flex",gap:4,padding:"4px 10px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        {[
          ["social","🎯 Social Media","#1DA1F2"],
          ["performance","📈 Performance","#10b981"],
          ["seo","🔍 SEO","#8b5cf6"],
          ["audit","🔎 Audit","#f59e0b"],
        ].map(([id,label,color])=>(
          <button key={id} onClick={()=>setDept(id)}
            style={{fontSize:8,padding:"3px 10px",borderRadius:7,
              background:dept===id?`${color}18`:"transparent",
              border:`1px solid ${dept===id?color:"rgba(212,175,55,0.18)"}`,
              color:dept===id?color:"#6b6050",cursor:"pointer",fontWeight:dept===id?"700":"400"}}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:showChat&&dept==="social"?"1fr 220px":"1fr",overflow:"hidden",minHeight:0}}>
        <div style={{overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0}}>
          {dept==="social" && <SocialMediaDirector articles={articles} onArticleReady={onArticleReady} vpInstruction={vpCmd} xKeys={xKeys}/>}
          {dept==="performance" && <PerformanceAnalyst/>}
          {dept==="seo" && <SEODirector/>}
          {dept==="audit" && <AuditDirector/>}
        </div>
        {showChat&&(
          <div style={{borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexDirection:"column",gap:5,minHeight:0}}>
              {messages.map((m,i)=>(
                <div key={i} style={{fontSize:9,lineHeight:1.5,padding:"5px 7px",borderRadius:6,background:m.role==="assistant"?"rgba(12,18,35,0.9)":"rgba(139,92,246,0.06)",border:`1px solid ${m.role==="assistant"?C.border:"rgba(139,92,246,0.2)"}`,whiteSpace:"pre-wrap",fontFamily:"monospace",color:C.text}}>{m.content}</div>
              ))}
              <div ref={bottomRef}/>
            </div>
            <div style={{padding:"5px 6px",borderTop:`1px solid ${C.border}`,display:"flex",gap:4,flexShrink:0}}>
              <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Instruction VP..." rows={2} style={{flex:1,padding:"5px 7px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontSize:9,resize:"none",outline:"none",fontFamily:"Georgia,serif"}}/>
              <button onClick={send} disabled={loading||!input.trim()} style={{width:26,height:26,background:`linear-gradient(135deg,${C.purple},#5b21b6)`,border:"none",borderRadius:5,cursor:"pointer",fontSize:11,flexShrink:0}}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
