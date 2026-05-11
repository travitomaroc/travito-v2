import { useState, useRef, useEffect } from "react";
import { BRAND, getCurrentRotation, callClaude } from "../config/agentConfig";
import XTwitterManager from "../platforms/x-twitter/XTwitterManager";
import YouTubeManager from "../platforms/youtube/YouTubeManager";

const DIR_PERSONA = `Tu es Social Media Director de ${BRAND.name}. Commence par [DIRECTOR]. Français.`;
const PLATFORMS = [
  { id:"x",       label:"X-Twitter", icon:"𝕏",  color:"#1DA1F2", status:"active" },
  { id:"youtube", label:"YouTube",   icon:"▶️", color:"#FF0000", status:"active" },
  { id:"tiktok",  label:"TikTok",    icon:"🎵", color:"#ff0050", status:"soon"   },
];

export default function SocialMediaDirector({ articles, onArticleReady, vpInstruction=null, xKeys }) {
  const [platform, setPlatform] = useState("x");
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [history, setHistory]   = useState([]);
  const [dirCmd, setDirCmd]     = useState(null);
  const [showChat, setShowChat] = useState(false);
  const bottomRef = useRef(null);
  const rot = getCurrentRotation();
  const C = {bg:"rgba(12,18,35,0.95)",border:"rgba(16,185,129,0.2)",teal:"#10b981",text:"#e8dcc8",muted:"#6b6050"};

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{setMessages([{role:"assistant",content:`[DIRECTOR] Social Media Director.\n• X-Twitter actif\n• YouTube/TikTok bientôt\nThème: ${rot.theme}`}]);},[]);
  useEffect(()=>{if(vpInstruction){setDirCmd(vpInstruction);setMessages(p=>[...p,{role:"assistant",content:`[DIR] VP: "${vpInstruction}"`}]);}},[vpInstruction]);

  const send=async()=>{
    const text=input.trim(); if(!text||loading) return;
    setInput("");
    const u={role:"user",content:text};
    setMessages(p=>[...p,u]); setHistory(p=>[...p,u]); setLoading(true);
    if(/x-twitter|article|post/i.test(text)) setDirCmd(text);
    try {
      const r=await callClaude(DIR_PERSONA,text,history);
      setMessages(p=>[...p,{role:"assistant",content:r}]);
      setHistory(p=>[...p,{role:"assistant",content:r}]);
    } catch {setMessages(p=>[...p,{role:"assistant",content:"[DIR] ⚠️ Erreur."}]);}
    setLoading(false);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      {/* Platform tabs */}
      <div style={{height:34,minHeight:34,flexShrink:0,display:"flex",alignItems:"center",gap:5,padding:"0 10px",borderBottom:`1px solid ${C.border}`,background:C.bg}}>
        <div style={{fontSize:7,color:C.muted,fontFamily:"monospace",marginRight:4}}>PLATFORMS:</div>
        {PLATFORMS.map(p=>(
          <button key={p.id} onClick={()=>{if(p.status==="active")setPlatform(p.id);}}
            style={{display:"flex",alignItems:"center",gap:3,padding:"3px 9px",borderRadius:10,background:platform===p.id?`${p.color}18`:"transparent",border:`1px solid ${platform===p.id?p.color:"rgba(255,255,255,0.06)"}`,cursor:p.status==="active"?"pointer":"default"}}>
            <span style={{fontSize:10}}>{p.icon}</span>
            <span style={{fontSize:8,color:platform===p.id?p.color:C.muted,fontFamily:"monospace"}}>{p.label}</span>
            {p.status==="soon"&&<span style={{fontSize:6,color:C.muted}}>SOON</span>}
          </button>
        ))}
        <button onClick={()=>setShowChat(p=>!p)} style={{marginLeft:"auto",fontSize:8,padding:"2px 7px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:"pointer"}}>{showChat?"🙈":"💬 Dir"}</button>
      </div>

      {/* Content */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:showChat?"1fr 200px":"1fr",overflow:"hidden",minHeight:0}}>
        <div style={{overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0}}>
          {platform==="x"
            ? <XTwitterManager articles={articles} onArticleReady={onArticleReady} directorInstruction={dirCmd} xKeys={xKeys}/>
            : platform==="youtube"
            ? <YouTubeManager xKeys={xKeys}/>
            : <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}><div style={{fontSize:28}}>{PLATFORMS.find(p=>p.id===platform)?.icon}</div><div style={{fontSize:11,color:C.teal}}>{PLATFORMS.find(p=>p.id===platform)?.label} — Prochain sprint</div></div>
          }
        </div>
        {showChat&&(
          <div style={{borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <div style={{flex:1,overflowY:"auto",padding:7,display:"flex",flexDirection:"column",gap:4,minHeight:0}}>
              {messages.map((m,i)=>(
                <div key={i} style={{fontSize:9,lineHeight:1.5,padding:"4px 6px",borderRadius:5,background:m.role==="assistant"?"rgba(12,18,35,0.9)":"rgba(16,185,129,0.06)",border:`1px solid ${m.role==="assistant"?C.border:"rgba(16,185,129,0.2)"}`,whiteSpace:"pre-wrap",fontFamily:"monospace",color:C.text}}>{m.content}</div>
              ))}
              <div ref={bottomRef}/>
            </div>
            <div style={{padding:"4px 5px",borderTop:`1px solid ${C.border}`,display:"flex",gap:4,flexShrink:0}}>
              <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Instruction Director..." rows={2} style={{flex:1,padding:"4px 6px",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontSize:9,resize:"none",outline:"none",fontFamily:"Georgia,serif"}}/>
              <button onClick={send} disabled={loading||!input.trim()} style={{width:24,height:24,background:`linear-gradient(135deg,${C.teal},#065f46)`,border:"none",borderRadius:5,cursor:"pointer",fontSize:11,flexShrink:0}}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
