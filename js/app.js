(()=>{

/** ------------------ State & Defaults ------------------ */
const els = {
  chat: document.getElementById("chat"),
  typing: document.getElementById("typingIndicator"),
  topStatus: document.getElementById("topStatus"),
  btnPlay: document.getElementById("btnPlay"),
  btnPause: document.getElementById("btnPause"),
  btnReset: document.getElementById("btnReset"),
  btnLoad: document.getElementById("btnLoad"),
  btnExport: document.getElementById("btnExport"),
  meCps: document.getElementById("meCps"),
  friendCps: document.getElementById("friendCps"),
  meReadMs: document.getElementById("meReadMs"),
  friendReadMs: document.getElementById("friendReadMs"),
  speedMult: document.getElementById("speedMult"),
  showKb: document.getElementById("showKb"),
  ticksStyle: document.getElementById("ticksStyle"),
  btnSaveSettings: document.getElementById("btnSaveSettings"),
  btnResetSettings: document.getElementById("btnResetSettings"),
  scriptInput: document.getElementById("scriptInput"),
  keyboard: document.getElementById("keyboard"),
};

const defaultSettings = {
  meCps: 14,
  friendCps: 12,
  meReadMs: 25,
  friendReadMs: 30,
  speedMult: 1,
  showKb: true,
  ticksStyle: "blue"
};

let settings = loadSettings();

function loadSettings(){
  try{
    const raw = localStorage.getItem("whatsupp_settings");
    if(!raw) return {...defaultSettings};
    const s = JSON.parse(raw);
    return {...defaultSettings, ...s};
  }catch{ return {...defaultSettings}; }
}
function saveSettings(){
  localStorage.setItem("whatsupp_settings", JSON.stringify(settings));
}

applySettingsToInputs();

/** Conversation queue */
let script = [];
let idx = 0;
let playing = false;
let paused = false;
let cancelToken = {cancel:false};
let lastSender = null;
let lastOppMsgLen = 0;

/** ------------------ UI Builders ------------------ */

function bubble({from, text, time, ticks}){
  const b = document.createElement("div");
  b.className = "bubble " + (from === "me" ? "me" : "friend");
  b.textContent = text;
  const meta = document.createElement("div");
  meta.className = "meta";
  const t = document.createElement("span");
  t.textContent = time || nowTime();
  meta.appendChild(t);
  if(from === "me"){
    const tk = document.createElement("span");
    tk.className = "ticks " + (settings.ticksStyle==="blue"?"blue":settings.ticksStyle==="single"?"muted":"");
    tk.textContent = settings.ticksStyle==="single" ? "✓" : "✓✓";
    meta.appendChild(tk);
  }
  b.appendChild(meta);
  return b;
}

function nowTime(){
  const d = new Date();
  const hh = d.getHours().toString().padStart(2,"0");
  const mm = d.getMinutes().toString().padStart(2,"0");
  return hh+":"+mm;
}

/** ------------------ Keyboard Simulator ------------------ */

const layout = [
  "` 1 2 3 4 5 6 7 8 9 0 - =".split(" "),
  "q w e r t y u i o p [ ] \\".split(" "),
  "a s d f g h j k l ; '".split(" "),
  ["⇧","z","x","c","v","b","n","m",",",".","/","⌫"],
  ["⎵"]
];

let kbScreen, keyMap = new Map();

function buildKeyboard(){
  els.keyboard.innerHTML = "";
  kbScreen = document.createElement("div");
  kbScreen.className = "kb-screen";
  kbScreen.textContent = "";
  els.keyboard.appendChild(kbScreen);

  for(const row of layout){
    const r = document.createElement("div");
    r.className = "kb-row";
    for(const k of row){
      const key = document.createElement("div");
      key.className = "key";
      key.textContent = k === "⎵" ? "space" : k;
      if(k === "⎵") key.classList.add("space");
      if(k === "⇧" || k === "⌫") key.classList.add("wide");
      r.appendChild(key);
      keyMap.set(k, key);
    }
    els.keyboard.appendChild(r);
  }
}
buildKeyboard();

/** Normalize char to a keyboard key label */
function keyForChar(ch){
  if(ch === " ") return "⎵";
  if(ch === "\n") return "⎵"; // enter not displayed; use space
  const lower = ch.toLowerCase();
  const direct = [...keyMap.keys()].find(k => k.toLowerCase()===lower);
  return direct ?? null;
}
function pressKeyVisual(ch){
  if(!settings.showKb) return;
  const k = keyForChar(ch) ?? ch;
  const keyEl = keyMap.get(k);
  if(!keyEl) return;
  keyEl.classList.add("active");
  setTimeout(()=> keyEl.classList.remove("active"), 110);
}

/** While typing, show the string in the kb screen area */
function kbAppend(ch){
  if(!settings.showKb) return;
  if(ch === "\b"){
    kbScreen.textContent = kbScreen.textContent.slice(0,-1);
  }else{
    kbScreen.textContent += ch;
  }
}

/** ------------------ Timing Helpers ------------------ */
const sleep = (ms, token) => new Promise(res=>{
  if(token.cancel) return res();
  const id = setTimeout(()=>res(), ms);
});

function charDelay(sender){
  const cps = sender==="me" ? settings.meCps : settings.friendCps;
  const base = 1000 / Math.max(1, cps);
  return base / settings.speedMult;
}
function readingDelayMs(forReader, againstLength){
  const perChar = forReader==="me" ? settings.meReadMs : settings.friendReadMs;
  return (perChar * againstLength) / settings.speedMult;
}

/** ------------------ Playback Engine ------------------ */

async function typeMessage(sender, text, token){
  // show typing indicator when friend types
  if(sender === "friend"){
    els.typing.classList.remove("hidden");
    els.topStatus.textContent = "typing…";
  }

  // Fake per-char typing
  for(const ch of text){
    if(token.cancel) return;
    pressKeyVisual(ch);
    kbAppend(ch);
    await sleep(charDelay(sender), token);
  }

  // Clear kb screen after a message is committed
  kbScreen.textContent = "";

  // commit bubble
  addBubble({from: sender, text});
  if(sender === "friend"){
    els.typing.classList.add("hidden");
    els.topStatus.textContent = "online";
  }
}

function addBubble(msg){
  const el = bubble(msg);
  els.chat.appendChild(el);
  els.chat.scrollTop = els.chat.scrollHeight;
}

async function playFromCurrent(){
  if(playing) return;
  playing = true; paused = false; cancelToken = {cancel:false};
  els.btnPlay.disabled = true;
  els.btnPause.disabled = false;

  while(idx < script.length && !cancelToken.cancel){
    const m = script[idx];

    // Figure reading delay based on last opposite message length
    let preDelay = 0;
    if(lastSender && lastSender !== m.from){
      preDelay = readingDelayMs(m.from, lastOppMsgLen);
    }
    if(typeof m.delayMs === "number") preDelay += (m.delayMs / settings.speedMult);

    if(preDelay > 0){ await sleep(preDelay, cancelToken); if(cancelToken.cancel) break; }

    await typeMessage(m.from, m.text, cancelToken);
    lastOppMsgLen = (lastSender && lastSender !== m.from) ? 0 : lastOppMsgLen;
    // Update trackers
    if(lastSender && lastSender !== m.from){
      // we just typed opposite to previous sender; reset opp length baseline to current text length (for next reader)
      lastOppMsgLen = m.text.length;
    }else if(!lastSender){
      lastOppMsgLen = m.text.length;
    }
    lastSender = m.from;

    idx++;
    if(paused || cancelToken.cancel) break;
  }

  els.btnPlay.disabled = false;
  els.btnPause.disabled = true;
  playing = false;
}

function pausePlayback(){
  if(!playing) return;
  paused = true;
  cancelToken.cancel = true;
  els.btnPlay.disabled = false;
  els.btnPause.disabled = true;
}

function resetPlayback(){
  pausePlayback();
  idx = 0; lastSender = null; lastOppMsgLen = 0;
  els.chat.innerHTML = "";
  els.typing.classList.add("hidden");
  els.topStatus.textContent = "online";
  kbScreen.textContent = "";
}

/** ------------------ Script IO ------------------ */

function loadScriptFromTextarea(){
  try{
    const data = JSON.parse(els.scriptInput.value);
    if(!Array.isArray(data)) throw new Error("Script must be an array.");
    for(const m of data){
      if(m.from!=="me" && m.from!=="friend") throw new Error("Each item needs from:'me'|'friend'");
      if(typeof m.text!=="string") throw new Error("Each item needs text:string");
    }
    script = data;
    resetPlayback();
    toast("Script loaded.");
  }catch(e){
    alert("Invalid script JSON:\n" + e.message);
  }
}

function exportCurrent(){
  const out = JSON.stringify(script, null, 2);
  navigator.clipboard?.writeText(out).catch(()=>{});
  const w = window.open("", "_blank");
  w.document.write("<pre>"+escapeHtml(out)+"</pre>");
  w.document.close();
}

function escapeHtml(s){
  return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

/** ------------------ Wire Controls ------------------ */

els.btnPlay.addEventListener("click", ()=>{ paused=false; playFromCurrent(); });
els.btnPause.addEventListener("click", ()=> pausePlayback());
els.btnReset.addEventListener("click", ()=> resetPlayback());
els.btnLoad.addEventListener("click", ()=> loadScriptFromTextarea());
els.btnExport.addEventListener("click", ()=> exportCurrent());

els.btnSaveSettings.addEventListener("click", ()=>{
  settings.meCps = +els.meCps.value || defaultSettings.meCps;
  settings.friendCps = +els.friendCps.value || defaultSettings.friendCps;
  settings.meReadMs = +els.meReadMs.value || defaultSettings.meReadMs;
  settings.friendReadMs = +els.friendReadMs.value || defaultSettings.friendReadMs;
  settings.speedMult = +els.speedMult.value || defaultSettings.speedMult;
  settings.showKb = !!els.showKb.checked;
  settings.ticksStyle = els.ticksStyle.value;
  saveSettings();
  toast("Settings saved.");
});

els.btnResetSettings.addEventListener("click", ()=>{
  settings = {...defaultSettings};
  saveSettings();
  applySettingsToInputs();
  toast("Settings reset.");
});

function applySettingsToInputs(){
  els.meCps.value = settings.meCps;
  els.friendCps.value = settings.friendCps;
  els.meReadMs.value = settings.meReadMs;
  els.friendReadMs.value = settings.friendReadMs;
  els.speedMult.value = settings.speedMult;
  els.showKb.checked = settings.showKb;
  els.ticksStyle.value = settings.ticksStyle;
}

/** ------------------ Init ------------------ */
loadScriptFromTextarea();

function toast(msg){
  console.log(msg);
}

/** End IIFE */
})();
