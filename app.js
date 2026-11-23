/* Ahlam's Library: Supabase-backed. No secrets here; the anon key is public and RLS gates all data. */
(function () {
"use strict";
const $ = id => document.getElementById(id);
const cfg = window.LIB_CONFIG || {};
const configured = cfg.SUPABASE_URL && !/YOUR-/.test(cfg.SUPABASE_URL) && cfg.SUPABASE_ANON_KEY && !/YOUR-/.test(cfg.SUPABASE_ANON_KEY);
const sb = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const BASE_TABS = [
  {id:"all",ar:"الكل",en:"All"},{id:"security",ar:"السيكيورتي",en:"Security"},{id:"fde",ar:"FDE",en:"FDE"},
  {id:"ai",ar:"AI",en:"AI"},{id:"aws",ar:"AWS",en:"AWS"},{id:"certs",ar:"الشهادات",en:"Certifications"},
  {id:"english",ar:"الإنجليزي",en:"English"},{id:"misc",ar:"متفرقات",en:"Misc"}
];
const TYPES = {
  video:{ar:"فيديو",en:"Video",ic:'<path d="M5 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="m17 10 4-2v8l-4-2"/>'},
  article:{ar:"مقال",en:"Article",ic:'<path d="M6 3h9l5 5v13H6z"/><path d="M9 13h7M9 17h7M9 9h3"/>'},
  course:{ar:"دورة",en:"Course",ic:'<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'},
  tool:{ar:"أداة",en:"Tool",ic:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'},
  repo:{ar:"ريبو GitHub",en:"GitHub repo",ic:'<path d="M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'},
  pdf:{ar:"ملف PDF",en:"PDF",ic:'<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v5h5"/>'},
  thread:{ar:"ثريد",en:"Thread",ic:'<path d="M4 5h16v11H9l-5 4z"/>'},
  book:{ar:"كتاب",en:"Book",ic:'<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3"/>'},
  lab:{ar:"لاب / CTF",en:"Lab / CTF",ic:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>'},
  job:{ar:"وظيفة",en:"Job",ic:'<path d="M4 8h16v11H4z"/><path d="M9 8V5h6v3"/><path d="M4 13h16"/>'},
  event:{ar:"فعالية",en:"Event",ic:'<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3v5M16 3v5"/><path d="M9 15h2"/>'}
};
const STATUS = {ar:["ما بديت","أتعلم","خلصت"],en:["Not started","Learning","Done"]};
const UI = {
  ar:{sub:"كل اللي تبين تتعلمينه في مكان واحد",q:"ابحثي في مكتبتك",prog:(t,d,n)=>`تقدمك في ${t}: ${d} من ${n}`,open:"المصدر",file:"النسخة المحفوظة",
    emptyT:"ما فيه شي هنا لسه",emptyB:"أضيفي عناصر من Supabase أو من سكربت الـ seed.",noMatch:"ما لقيت شي يطابق بحثك.",
    due:d=>d<0?"انتهى":d===0?"ينتهي اليوم":d===1?"باقي يوم":d===2?"باقي يومين":d<=10?`باقي ${d} أيام`:`باقي ${d} يوم`,
    loading:"جاري التحميل…",offline:"ما قدرت أوصل للبيانات.",notConfigured:"أكملي config.js (SUPABASE_URL و SUPABASE_ANON_KEY).",saveErr:"ما انحفظ التغيير. جربي مرة ثانية.",lang:"EN",
    addSec:"إضافة قسم",secName:"اسم القسم",secEn:"English name (optional)",add:"أضف",cancel:"إلغاء",needName:"اكتبي اسم القسم أول.",dup:"هذا القسم موجود.",delSec:"حذف هذا القسم الفاضي",
    loginErr:"الإيميل أو كلمة السر غلط."},
  en:{sub:"Everything you want to learn, in one place",q:"Search your library",prog:(t,d,n)=>`Progress in ${t}: ${d} of ${n}`,open:"Source",file:"Saved copy",
    emptyT:"Nothing here yet",emptyB:"Add items in Supabase or via the seed script.",noMatch:"Nothing matches your search.",
    due:d=>d<0?"Ended":d===0?"Ends today":d===1?"1 day left":`${d} days left`,
    loading:"Loading…",offline:"Couldn't reach the data.",notConfigured:"Fill in config.js (SUPABASE_URL and SUPABASE_ANON_KEY).",saveErr:"Change not saved. Try again.",lang:"ع",
    addSec:"Add section",secName:"Section name (Arabic)",secEn:"English name (optional)",add:"Add",cancel:"Cancel",needName:"Enter a section name first.",dup:"That section already exists.",delSec:"Delete this empty section",
    loginErr:"Wrong email or password."}
};
const CAT = {
  ar:{def:"دوبي",ph:"اسأليني عن أي شي في مكتبتك",nameLbl:"اسمها",save:"حفظ",hi:n=>`هلا! أنا ${n}. أقدر أشرح لك أي مصدر، أختبرك، أو أقترح وش تبدين فيه.`,
    q:["وش أبدأ فيه الحين؟","اختبريني في مهارة FDE","لخصي لي قسم السيكيورتي"],think:"أفكر…",err:"ما قدرت أرد الحين، جربي بعد شوي.",
    done:n=>`أحسنتي! خلصتي «${n}» 🎉`,listen:"اسمعي",sub:"مساعدتك في المكتبة",askCard:"اسألي",
    tools:{newChat:"محادثة جديدة",voice:"اقرئي الردود بصوت",set:"الإعدادات",grow:"تكبير الشاشة",shrink:"تصغير لشريط جانبي",close:"إغلاق",send:"إرسال"}},
  en:{def:"Dobby",ph:"Ask me anything about your library",nameLbl:"Name",save:"Save",hi:n=>`Hi! I'm ${n}. I can explain any resource, quiz you, or suggest what to start next.`,
    q:["What should I start now?","Quiz me on an FDE skill","Summarize my security section"],think:"Thinking…",err:"I couldn't answer right now, try again shortly.",
    done:n=>`Well done! You finished "${n}" 🎉`,listen:"Listen",sub:"Your library assistant",askCard:"Ask",
    tools:{newChat:"New chat",voice:"Read replies aloud",set:"Settings",grow:"Full screen",shrink:"Back to side panel",close:"Close",send:"Send"}}
};

let ttsVoice = "noura";
let lang = "ar", tab = "all", statusFilter = null, items = [], custom = [], firstPaint = true, name = "";
let TABS = BASE_TABS.slice();
try { lang = localStorage.getItem("lib-lang") || "ar"; tab = localStorage.getItem("lib-tab") || "all"; } catch (e) {}
const U = () => UI[lang], C = () => CAT[lang];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function daysLeft(iso){ if(!iso) return null; const d=new Date(iso+"T23:59:59"); if(isNaN(d)) return null; return Math.ceil((d-new Date())/864e5)-1; }
function rebuildTabs(){ TABS = BASE_TABS.concat(custom.map(c=>({id:c.id,ar:c.ar,en:c.en||c.ar,custom:true}))); if(!TABS.some(t=>t.id===tab)) tab="all"; }
function tabName(id){ const t=TABS.find(x=>x.id===id); return t?t[lang]:id; }
function setMsg(t){ $("msg").hidden=!t; $("msg").textContent=t||""; }

function applyLang(){
  const u=U();
  document.documentElement.lang=lang; document.documentElement.dir=lang==="ar"?"rtl":"ltr";
  $("hsub").textContent=u.sub; $("q").placeholder=u.q; $("lang").textContent=u.lang;
  $("secAr").placeholder=u.secName; $("secEn").placeholder=u.secEn; $("secSave").textContent=u.add; $("secCancel").textContent=u.cancel;
  $("tabs").setAttribute("aria-label",lang==="ar"?"الأقسام":"Sections");
  paintTheme();
}
/* theme: dark (default) / light, remembered */
function curTheme(){ return document.documentElement.dataset.theme==="light"?"light":"dark"; }
function paintTheme(){
  const light=curTheme()==="light";
  $("theme").textContent=light?"🌙":"☀️";
  const label=light?(lang==="ar"?"الوضع الغامق":"Dark mode"):(lang==="ar"?"الوضع الفاتح":"Light mode");
  $("theme").setAttribute("aria-label",label); $("theme").title=label;
  if(window.LibTrail) LibTrail.paint();
}
$("theme").addEventListener("click",()=>{
  const next=curTheme()==="light"?"dark":"light";
  document.documentElement.dataset.theme=next;
  try{localStorage.setItem("lib-theme",next)}catch(_){}
  paintTheme();
});
function visible(){
  const q=$("q").value.trim().toLowerCase();
  return items.filter(x=>(tab==="all"||x.tab===tab)&&(!q||[x.title,x.title_en,x.summary_ar,x.summary_en,x.sub,x.notes,TYPES[x.type]?.ar,TYPES[x.type]?.en].join(" ").toLowerCase().includes(q)));
}
function render(){
  const u=U();
  $("tabs").innerHTML=TABS.map(t=>{const n=t.id==="all"?items.length:items.filter(x=>x.tab===t.id).length;return `<button class="tab" role="tab" type="button" data-tab="${esc(t.id)}" aria-selected="${t.id===tab}">${esc(t[lang])}<span class="n">${n}</span></button>`}).join("")+`<button class="tab plus" type="button" id="plus" aria-label="${esc(u.addSec)}" title="${esc(u.addSec)}">+</button>`;
  const base=visible(), done=base.filter(x=>x.status===2).length;
  $("plabel").textContent=u.prog(tabName(tab),done,base.length);
  $("pbar").style.width=(base.length?Math.round(done/base.length*100):0)+"%";
  $("counts").innerHTML=[0,1,2].map(s=>`<button class="chip" type="button" data-sf="${s}" aria-pressed="${statusFilter===s}">${STATUS[lang][s]} <b>${base.filter(x=>x.status===s).length}</b></button>`).join("");
  const list=base.filter(x=>statusFilter===null||x.status===statusFilter).sort((a,b)=>{
    const da=daysLeft(a.due),db=daysLeft(b.due),ua=da!==null&&da>=0&&a.status!==2,ub=db!==null&&db>=0&&b.status!==2;
    if(ua!==ub) return ua?-1:1; if(ua&&ub) return da-db; return String(b.added||"").localeCompare(String(a.added||""));
  });
  const cur=TABS.find(t=>t.id===tab);
  const delBtn=cur&&cur.custom&&!items.some(x=>x.tab===tab)?`<button class="delsec" type="button" id="delsec">${esc(u.delSec)}</button>`:"";
  if(!list.length){
    const filtered=items.length&&($("q").value||statusFilter!==null);
    $("grid").innerHTML=delBtn+(filtered?`<div class="empty">${esc(u.noMatch)}</div>`:`<div class="empty"><b>${esc(u.emptyT)}</b>${esc(u.emptyB)}</div>`);
  }else{
    $("grid").innerHTML=list.map(x=>{
      const t=TYPES[x.type]||TYPES.article, d=daysLeft(x.due), soon=d!==null&&d>=0&&d<=10&&x.status!==2;
      const title=lang==="en"&&x.title_en?x.title_en:x.title, sum=lang==="en"&&x.summary_en?x.summary_en:x.summary_ar;
      const url=safeUrl(x.url), file=safeUrl(x.file_url);
      return `<article class="card${soon?" due-soon":""}">
        <div class="top"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.ic}</svg></div>
        <div><h2 class="ttl">${esc(title)}</h2><div class="meta"><span>${esc(t[lang])}</span>${x.sub?`<span>${esc(x.sub)}</span>`:""}${tab==="all"?`<span>${esc(tabName(x.tab))}</span>`:""}</div></div></div>
        ${sum?`<p class="sum">${esc(sum)}</p>`:""}${x.notes?`<p class="note">${esc(x.notes)}</p>`:""}
        <div class="foot"><div class="links">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(u.open)}</a>`:""}${file?`<a href="${esc(file)}" target="_blank" rel="noopener noreferrer">${esc(u.file)}</a>`:""}${d!==null&&x.status!==2?`<span class="duep">${esc(u.due(d))}</span>`:""}</div>
        <button class="ask" type="button" data-title="${esc(title)}"><img src="cat/explain.png" alt="" width="20" height="20">${esc(C().askCard)}</button><button class="st" type="button" data-id="${esc(x.id)}" data-s="${x.status}">${esc(STATUS[lang][x.status]||STATUS[lang][0])}</button></div>
      </article>`}).join("");
    if(window.gsap&&!reduce) gsap.from("#grid .card",{y:firstPaint?8:4,opacity:0,duration:.3,stagger:.03,ease:"power2.out",clearProps:"transform,opacity"});
    firstPaint=false;
  }
}

/* ---- data ---- */
async function loadAll(){
  const [it,cf]=await Promise.all([
    sb.from("items").select("*").order("added",{ascending:false}).limit(1000),
    sb.from("config").select("key,value")
  ]);
  if(it.error||cf.error) throw (it.error||cf.error);
  items=it.data.map(r=>({...r,status:Number(r.status)||0}));
  const conf=Object.fromEntries(cf.data.map(r=>[r.key,r.value]));
  const list=conf.sections&&conf.sections.list;
  custom=Array.isArray(list)?list.filter(c=>c&&c.id&&c.ar):[];
  name=(conf.assistant&&conf.assistant.name)||""; ttsVoice=(conf.assistant&&conf.assistant.voice)||"noura";
  rebuildTabs(); window.__libItems=items;
}
async function saveSections(next){ const {error}=await sb.from("config").upsert({key:"sections",value:{list:next}}); if(error) throw error; }
function secErr(m){ $("secErr").textContent=m; $("secErr").hidden=!m; }

document.addEventListener("click",async e=>{
  if(e.target.closest("#plus")){const f=$("addsec");f.hidden=!f.hidden;secErr("");if(!f.hidden)$("secAr").focus();return}
  if(e.target.closest("#secCancel")){$("addsec").hidden=true;secErr("");return}
  if(e.target.closest("#delsec")){
    const next=custom.filter(c=>c.id!==tab);
    try{await saveSections(next);custom=next;tab="all";rebuildTabs();render()}catch(_){setMsg(U().saveErr)}return}
  const tb=e.target.closest(".tab[data-tab]");
  if(tb){tab=tb.dataset.tab;statusFilter=null;try{localStorage.setItem("lib-tab",tab)}catch(_){}render();return}
  const ch=e.target.closest(".chip");
  if(ch){const s=+ch.dataset.sf;statusFilter=statusFilter===s?null:s;render();return}
  const st=e.target.closest(".st");
  if(st){
    const it=items.find(x=>x.id===st.dataset.id); if(!it) return;
    const prev=it.status; it.status=(prev+1)%3; render(); onStatus(it);
    const {error}=await sb.from("items").update({status:it.status,updated_at:new Date().toISOString()}).eq("id",it.id);
    if(error){it.status=prev;render();setMsg(U().saveErr)} else setMsg("");
    return;
  }
  const ak=e.target.closest(".ask[data-title]");
  if(ak){openChat();ask((lang==="ar"?"اشرحي لي هذا المصدر ووش أستفيد منه: ":"Explain this resource and what I get from it: ")+ak.dataset.title)}
});
$("lang").addEventListener("click",()=>{lang=lang==="ar"?"en":"ar";try{localStorage.setItem("lib-lang",lang)}catch(_){}applyLang();render();paintCat()});
$("q").addEventListener("input",render);
$("secAr").addEventListener("input",()=>secErr(""));
$("addsec").addEventListener("submit",async e=>{
  e.preventDefault(); const u=U(), ar=$("secAr").value.trim(), en=$("secEn").value.trim();
  if(!ar){secErr(u.needName);return}
  if(TABS.some(t=>t.ar===ar||(en&&t.en.toLowerCase()===en.toLowerCase()))){secErr(u.dup);return}
  const sec={id:"c-"+Date.now().toString(36),ar,en}, next=custom.concat(sec);
  $("secSave").disabled=true;
  try{await saveSections(next);custom=next;rebuildTabs();tab=sec.id;$("secAr").value="";$("secEn").value="";$("addsec").hidden=true;render()}
  catch(_){secErr(u.saveErr)} finally{$("secSave").disabled=false}
});

/* ---- auth ---- */
function showLogin(msg){ $("app").hidden=true; $("catUi").hidden=true; document.body.classList.remove("chat-open","chat-full"); $("login").hidden=false; $("loginErr").hidden=!msg; $("loginErr").textContent=msg||""; }
$("login").addEventListener("submit",async e=>{
  e.preventDefault(); $("loginBtn").disabled=true;
  const {error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("pass").value});
  $("loginBtn").disabled=false; $("pass").value="";
  if(error) showLogin(U().loginErr); else start();
});
$("logout").addEventListener("click",async()=>{if(window.LibDobby)LibDobby.stop();await sb.auth.signOut();items=[];showLogin()});

async function start(){
  $("login").hidden=true; $("app").hidden=false; $("catUi").hidden=false; applyLang(); setMsg(U().loading); render();
  try{ await loadAll(); setMsg(""); render(); paintCat(); }
  catch(err){ console.error(err); setMsg(U().offline); }
}

/* ---- the cat ---- */
let history=[], busy=false, voice=false, idleT=null, poseT=null;
const nm=()=>name||C().def;
function setPose(p,ms){ $("catImg").src="cat/"+p+".png"; $("chatImg").src="cat/"+p+".png"; $("cat").classList.toggle("sleep",p==="sleep"); clearTimeout(poseT); if(ms) poseT=setTimeout(()=>setPose("happy"),ms); }
function wake(){ if($("catImg").src.includes("sleep")) setPose("happy"); clearTimeout(idleT); idleT=setTimeout(()=>{if(!busy)setPose("sleep")},120000); }
["click","keydown","scroll","touchstart"].forEach(ev=>addEventListener(ev,wake,{passive:true}));
function paintCat(){
  const t=C(); $("catName").textContent=nm(); $("catSub").textContent=t.sub; $("askIn").placeholder=t.ph; paintTools(); $("nameLbl").textContent=t.nameLbl; $("nameSave").textContent=t.save;
  $("quick").innerHTML=t.q.map(x=>`<button type="button">${esc(x)}</button>`).join("");
  if(!history.length){ $("msgs").innerHTML=""; addMsg("cat",t.hi(nm()),false); }
  $("voiceBtn").hidden=!("speechSynthesis" in window);
  $("listenBtn").hidden=!(navigator.mediaDevices&&window.MediaRecorder);
  $("listenBtn").title=lang==="ar"?"اضغطي وسولفي مع دوبي (أو المسطرة). يرد ويرجع يسمعك، واضغطي قبل ما تتكلمين للإنهاء":"Tap and talk (or Space). Dobby answers and listens again; tap before speaking to end";
  $("voiceSel").value=ttsVoice; $("voiceLbl").textContent=lang==="ar"?"الصوت":"Voice";
  if(window.LibDobby) LibDobby.refreshStatus();
}
function addMsg(who,text,keep=true){
  const d=document.createElement("div"); d.className="m "+(who==="me"?"me":"cat-m");
  const span=document.createElement("div"); span.className="body"; span.textContent=text; span.dataset.raw=text; d.appendChild(span);
  if(who!=="me"&&"speechSynthesis" in window){const b=document.createElement("button");b.className="spk";b.type="button";b.textContent="🔈 "+C().listen;b.onclick=()=>speak(span.dataset.raw||span.textContent);d.appendChild(b)}
  $("msgs").appendChild(d); $("msgs").scrollTop=1e9;
  if(keep) history.push({role:who==="me"?"user":"assistant",content:text});
  return span;
}
function setReply(el,text){ el.dataset.raw=text; el.closest(".m").classList.add("md"); el.innerHTML=window.LibMd.render(text); $("msgs").scrollTop=1e9; }
function speak(t){ if(window.LibDobby) LibDobby.say(t); else window.LibVoice.speak(window.LibVoice.shortSpoken(t)); }   // always the SHORT spoken version, never the table
function stopSpeaking(){ window.LibVoice.stop(); }
async function ask(text){
  if(busy||!text.trim()) return;
  busy=true; addMsg("me",text); setPose("think"); const bubble=addMsg("cat",C().think,false);
  try{
    const {data,error}=await sb.functions.invoke("cat",{body:{messages:history,name:name}});
    if(error||!data||!data.text) throw (error||new Error("empty"));
    setReply(bubble,data.text); history.push({role:"assistant",content:data.text}); setPose("explain",4000); if(voice) speak(data.text);
  }catch(e){ try{ if(e&&e.context&&e.context.json) console.error("cat error body:",await e.context.json()); }catch(_){} console.error(e); bubble.dataset.raw=C().err; bubble.textContent=C().err; history.pop(); setPose("happy"); }
  finally{ busy=false; $("msgs").scrollTop=1e9; }
}
/* panel: "dock" = tall side panel (pushes the page on wide screens), "full" = full screen. Phones are always full screen. */
let chatMode="dock"; try{ if(localStorage.getItem("lib-chat-mode")==="full") chatMode="full"; }catch(_){}
function paintTools(){
  const t=C().tools, full=chatMode==="full";
  [["newChat",t.newChat],["voiceBtn",t.voice],["setBtn",t.set],["sizeBtn",full?t.shrink:t.grow],["closeChat",t.close],["sendBtn",t.send]]
    .forEach(([id,l])=>{ $(id).title=l; $(id).setAttribute("aria-label",l); });
  $("sizeBtn").setAttribute("aria-pressed",full);
}
function setChatOpen(open){
  $("chat").hidden=!open;
  document.body.classList.toggle("chat-open",open);
  document.body.classList.toggle("chat-full",open&&chatMode==="full");
}
function setChatMode(m){ chatMode=m; try{localStorage.setItem("lib-chat-mode",m)}catch(_){} setChatOpen(!$("chat").hidden); paintTools(); $("msgs").scrollTop=1e9; }
function growAsk(){ const a=$("askIn"); a.style.height="auto"; a.style.height=Math.min(a.scrollHeight,160)+"px"; }
function openChat(noFocus){ setChatOpen(true); paintCat(); $("msgs").scrollTop=1e9; if(!noFocus) $("askIn").focus(); }
function onStatus(it){ if(it.status===2){ setPose("celebrate",3000); const t=$("toast"); t.textContent=C().done(it.title); t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,3000); } }
/* closing the panel also stops Dobby (conversation mode would otherwise keep listening) */
function closeChat(){ setChatOpen(false); if(window.LibDobby) LibDobby.stop(); }
$("cat").onclick=()=>{ $("chat").hidden?openChat():closeChat(); };
$("closeChat").onclick=()=>{ closeChat(); $("cat").focus(); };
/* a click anywhere outside the panel closes it (the card "Ask" button and the cat itself open it, so they are ignored) */
document.addEventListener("click",e=>{
  if($("chat").hidden||!e.isTrusted) return;
  const t=e.target; if(!t||!t.isConnected||!t.closest) return;
  if(t.closest("#chat,#cat,.ask,#toast")) return;
  closeChat();
});
$("sizeBtn").onclick=()=>setChatMode(chatMode==="full"?"dock":"full");
$("newChat").onclick=()=>{ if(busy) return; if(window.LibDobby) LibDobby.stop(); history.length=0; paintCat(); $("askIn").focus(); };
addEventListener("keydown",e=>{
  if(e.key!=="Escape"||$("chat").hidden) return;
  if(!$("setForm").hidden){ $("setForm").hidden=true; $("setBtn").setAttribute("aria-expanded","false"); return; }
  if(chatMode==="full"&&innerWidth>760) setChatMode("dock"); else { closeChat(); $("cat").focus(); }
});
$("setBtn").onclick=()=>{ const f=$("setForm"); f.hidden=!f.hidden; $("setBtn").setAttribute("aria-expanded",!f.hidden); $("nameIn").value=name; if(!f.hidden) $("nameIn").focus(); };
$("voiceBtn").onclick=()=>{ voice=!voice; $("voiceBtn").setAttribute("aria-pressed",voice); if(!voice) stopSpeaking(); };
$("setForm").onsubmit=async e=>{ e.preventDefault(); name=$("nameIn").value.trim(); ttsVoice=$("voiceSel").value||"noura"; paintCat(); $("setForm").hidden=true; $("setBtn").setAttribute("aria-expanded","false"); await sb.from("config").upsert({key:"assistant",value:{name,voice:ttsVoice}}); };
/* surface used by dobby.js (voice conversation) */
window.LibApp={ sb, cfg, $, esc, C, nm, lang:()=>lang, history:()=>history, busy:()=>busy, setBusy:v=>{busy=v}, addMsg, setReply, setPose, openChat,
  name:()=>name, ttsVoice:()=>ttsVoice, token:async()=>{const {data}=await sb.auth.getSession();return data.session&&data.session.access_token} };
$("askForm").onsubmit=e=>{ e.preventDefault(); const v=$("askIn").value; $("askIn").value=""; growAsk(); ask(v); };
$("askIn").addEventListener("input",growAsk);
$("askIn").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); $("askForm").requestSubmit(); } });
$("quick").onclick=e=>{ const b=e.target.closest("button"); if(b) ask(b.textContent); };

/* ---- boot ---- */
(async()=>{
  if(!sb){ $("login").hidden=true; $("app").hidden=false; applyLang(); setMsg(U().notConfigured); render(); return; }
  const {data}=await sb.auth.getSession();
  if(data.session) start(); else showLogin();
  sb.auth.onAuthStateChange((ev)=>{ if(ev==="SIGNED_OUT") showLogin(); });
})();
})();
