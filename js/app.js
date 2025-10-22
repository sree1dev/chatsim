(() => {
  "use strict";

  /** ========== State & Settings ========== */
  let els = {};
  const defaultSettings = {
    meCps: 14,
    friendCps: 12,
    meReadMs: 25,
    friendReadMs: 30,
    speedMult: 1,
    showKb: true,
    ticksStyle: "blue",
  };
  let settings = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem("whatsupp_settings");
      if (!raw) return { ...defaultSettings };
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      return { ...defaultSettings };
    }
  }
  function saveSettings() {
    localStorage.setItem("whatsupp_settings", JSON.stringify(settings));
  }

  /** Playback state */
  let script = [];
  let idx = 0;
  let playing = false;
  let paused = false;
  let cancelToken = { cancel: false };
  let lastSender = null;
  let lastOppMsgLen = 0;

  /** ========== UI Helpers ========== */
  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  }

  function bubble({ from, text, time }) {
    const b = document.createElement("div");
    b.className = "bubble " + (from === "me" ? "me" : "friend");
    b.textContent = text;

    const meta = document.createElement("div");
    meta.className = "meta";
    const t = document.createElement("span");
    t.textContent = time || nowTime();
    meta.appendChild(t);

    if (from === "me") {
      const tk = document.createElement("span");
      const style = settings.ticksStyle;
      tk.className =
        "ticks " + (style === "blue" ? "blue" : style === "single" ? "muted" : "");
      tk.textContent = style === "single" ? "✓" : "✓✓";
      meta.appendChild(tk);
    }

    b.appendChild(meta);
    return b;
  }

  /** ========== Keyboard Simulator ========== */
  const layout = [
    "` 1 2 3 4 5 6 7 8 9 0 - =".split(" "),
    "q w e r t y u i o p [ ] \\".split(" "),
    "a s d f g h j k l ; '".split(" "),
    ["⇧", "z", "x", "c", "v", "b", "n", "m", "മ", ",", ".", "/", "⌫"],
    ["⎵"],
  ];

  let kbScreen = null;
  let keyMap = new Map();

  function buildKeyboard() {
    if (!els.keyboard) return;
    els.keyboard.innerHTML = "";
    keyMap = new Map();

    kbScreen = document.createElement("div");
    kbScreen.className = "kb-screen";
    kbScreen.textContent = "";
    els.keyboard.appendChild(kbScreen);

    for (const row of layout) {
      const r = document.createElement("div");
      r.className = "kb-row";
      for (const k of row) {
        const key = document.createElement("div");
        key.className = "key";
        key.textContent = k === "⎵" ? "space" : k;
        if (k === "⎵") key.classList.add("space");
        if (k === "⇧" || k === "⌫") key.classList.add("wide");
        r.appendChild(key);
        keyMap.set(k, key);
      }
      els.keyboard.appendChild(r);
    }
  }

  function keyForChar(ch) {
    if (ch === " " || ch === "\n") return "⎵";
    const lower = String(ch).toLowerCase();
    for (const k of keyMap.keys()) {
      if (String(k).toLowerCase() === lower) return k;
    }
    return null;
  }

  function pressKeyVisual(ch) {
    if (!settings.showKb) return;
    const k = keyForChar(ch) ?? ch;
    const keyEl = keyMap.get(k);
    if (!keyEl) return;
    keyEl.classList.add("active");
    setTimeout(() => keyEl.classList.remove("active"), 110);
  }

  function kbAppend(ch) {
    if (!settings.showKb || !kbScreen) return;
    if (ch === "\b") {
      kbScreen.textContent = kbScreen.textContent.slice(0, -1);
    } else {
      kbScreen.textContent += ch;
    }
  }

  /** ========== Malayalam → Manglish (WhatsApp-realistic) ========== */
  function malToManglish(txt) {
    const VOW_INDEP = {
      "അ": "a",
      "ആ": "aa",
      "ഇ": "i",
      "ഈ": "ee",
      "ഉ": "u",
      "ഊ": "oo",
      "എ": "e",
      "ഏ": "e",
      "ഐ": "ai",
      "ഒ": "o",
      "ഓ": "o",
      "ഔ": "au",
      "ഋ": "ri",
    };
    const VOW_SIGNS = {
      "ാ": "a",
      "ി": "i",
      "ീ": "ee",
      "ു": "u",
      "ൂ": "oo",
      "െ": "e",
      "േ": "e",
      "ൈ": "ai",
      "ൊ": "o",
      "ോ": "o",
      "ൗ": "au",
      "ൃ": "ri",
    };
    const CONS = {
      "ക": "k",
      "ഖ": "kh",
      "ഗ": "g",
      "ഘ": "gh",
      "ങ": "ng",
      "ച": "ch",
      "ഛ": "chh",
      "ജ": "j",
      "ഝ": "jh",
      "ഞ": "nj",
      "ട": "d", // retroflex ta -> d (realistic typing)
      "ഠ": "dh",
      "ഡ": "d",
      "ഢ": "dh",
      "ണ": "n",
      "ത": "th",
      "ഥ": "thh",
      "ദ": "d",
      "ധ": "dh",
      "ന": "n",
      "പ": "p",
      "ഫ": "ph",
      "ബ": "b",
      "ഭ": "bh",
      "മ": "m",
      "യ": "y",
      "ര": "r",
      "ല": "l",
      "വ": "v",
      "ശ": "sh",
      "ഷ": "sh",
      "സ": "s",
      "ഹ": "h",
      "ഴ": "zh",
      "ള": "l",
      "റ": "r",
      "ൺ": "n",
      "ൻ": "n",
      "ർ": "r",
      "ൽ": "l",
      "ൾ": "l",
    };
    const VIR = "്";
    let out = "";

    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      const next = txt[i + 1] || "";

      // independent vowels
      if (VOW_INDEP[ch]) {
        out += VOW_INDEP[ch];
        continue;
      }

      // conjunct cluster: ണ്ട / ന്ട  -> nt
      if ((ch === "ണ" || ch === "ന") && next === "്ട") {
        out += "nt";
        i++;
        continue;
      }

      // consonants
      if (CONS[ch]) {
        const base = CONS[ch];
        if (next === VIR) {
          out += base; // dead consonant
          i++;
          continue;
        }
        if (VOW_SIGNS[next]) {
          out += base + VOW_SIGNS[next];
          i++;
          continue;
        }
        out += base + "a"; // inherent 'a'
        continue;
      }

      // vowel sign standing alone
      if (VOW_SIGNS[ch]) {
        out += VOW_SIGNS[ch];
        continue;
      }

      // space/punct
      out += ch;
    }

    // cleanup
    out = out.replace(/thh/g, "th") // normalize double h
             .replace(/([eiou])a(\b|[^a-z])/gi, "$1$2"); // keep final "aa" (do not trim)
    return out;
  }

  /** ========== Timing ========== */
  const sleep = (ms, token) =>
    new Promise((res) => {
      if (token.cancel) return res();
      setTimeout(res, ms);
    });

  function charDelay(sender) {
    const cps = sender === "me" ? settings.meCps : settings.friendCps;
    const base = 1000 / Math.max(1, cps);
    return base / Math.max(0.1, settings.speedMult);
    }

  function readingDelayMs(forReader, againstLength) {
    const perChar = forReader === "me" ? settings.meReadMs : settings.friendReadMs;
    return (perChar * (againstLength || 0)) / Math.max(0.1, settings.speedMult);
  }

  /** ========== Playback ========== */
  async function typeMessage(sender, text, token) {
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
    const keysToPress = hasMalayalam ? malToManglish(text) : text;

    if (sender === "friend") {
      els.typing.classList.remove("hidden");
      els.topStatus.textContent = "typing…";
    }

    for (const ch of keysToPress) {
      if (token.cancel) return;
      pressKeyVisual(ch);
      kbAppend(ch);
      await sleep(charDelay(sender), token);
    }

    if (kbScreen) kbScreen.textContent = "";
    addBubble({ from: sender, text });

    if (sender === "friend") {
      els.typing.classList.add("hidden");
      els.topStatus.textContent = "online";
    }
  }

  function addBubble(msg) {
    const el = bubble(msg);
    els.chat.appendChild(el);
    els.chat.scrollTop = els.chat.scrollHeight;
  }

  async function playFromCurrent() {
    if (playing) return;
    playing = true;
    paused = false;
    cancelToken = { cancel: false };

    if (els.btnPlay) els.btnPlay.disabled = true;
    if (els.btnPause) els.btnPause.disabled = false;

    while (idx < script.length && !cancelToken.cancel) {
      const m = script[idx];

      // pre-delay: reading + optional delayMs
      let preDelay = 0;
      if (lastSender && lastSender !== m.from) {
        preDelay = readingDelayMs(m.from, lastOppMsgLen);
      }
      if (typeof m.delayMs === "number") {
        preDelay += m.delayMs / Math.max(0.1, settings.speedMult);
      }
      if (preDelay > 0) {
        await sleep(preDelay, cancelToken);
        if (cancelToken.cancel) break;
      }

      await typeMessage(m.from, m.text, cancelToken);

      if (!lastSender) {
        lastOppMsgLen = m.text.length;
      } else if (lastSender !== m.from) {
        lastOppMsgLen = m.text.length;
      }
      lastSender = m.from;

      idx++;
      if (paused || cancelToken.cancel) break;
    }

    if (els.btnPlay) els.btnPlay.disabled = false;
    if (els.btnPause) els.btnPause.disabled = true;
    playing = false;
  }

  function pausePlayback() {
    if (!playing) return;
    paused = true;
    cancelToken.cancel = true;
    if (els.btnPlay) els.btnPlay.disabled = false;
    if (els.btnPause) els.btnPause.disabled = true;
  }

  function resetPlayback() {
    pausePlayback();
    idx = 0;
    lastSender = null;
    lastOppMsgLen = 0;
    if (els.chat) els.chat.innerHTML = "";
    if (els.typing) els.typing.classList.add("hidden");
    if (els.topStatus) els.topStatus.textContent = "online";
    if (kbScreen) kbScreen.textContent = "";
  }

  /** ========== Script I/O ========== */
  function loadScriptFromTextarea() {
    try {
      const data = JSON.parse(els.scriptInput.value);
      if (!Array.isArray(data)) throw new Error("Script must be an array");
      for (const m of data) {
        if (m.from !== "me" && m.from !== "friend")
          throw new Error("Each item needs from:'me'|'friend'");
        if (typeof m.text !== "string")
          throw new Error("Each item needs text:string");
      }
      script = data;
      resetPlayback();
      toast("Script loaded.");
    } catch (e) {
      alert("Invalid script JSON:\n" + e.message);
    }
  }

  function exportCurrent() {
    const out = JSON.stringify(script || [], null, 2);
    try {
      navigator.clipboard?.writeText(out);
    } catch {}
    const w = window.open("", "_blank");
    w.document.write("<pre>" + escapeHtml(out) + "</pre>");
    w.document.close();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  /** ========== Settings & Wiring ========== */
  function applySettingsToInputs() {
    els.meCps.value = settings.meCps;
    els.friendCps.value = settings.friendCps;
    els.meReadMs.value = settings.meReadMs;
    els.friendReadMs.value = settings.friendReadMs;
    els.speedMult.value = settings.speedMult;
    els.showKb.checked = settings.showKb;
    els.ticksStyle.value = settings.ticksStyle;
  }

  function bindUI() {
    if (els.btnPlay) els.btnPlay.addEventListener("click", () => { paused = false; playFromCurrent(); });
    if (els.btnPause) els.btnPause.addEventListener("click", () => pausePlayback());
    if (els.btnReset) els.btnReset.addEventListener("click", () => resetPlayback());
    if (els.btnLoad) els.btnLoad.addEventListener("click", () => loadScriptFromTextarea());
    if (els.btnExport) els.btnExport.addEventListener("click", () => exportCurrent());

    if (els.btnSaveSettings)
      els.btnSaveSettings.addEventListener("click", () => {
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

    if (els.btnResetSettings)
      els.btnResetSettings.addEventListener("click", () => {
        settings = { ...defaultSettings };
        saveSettings();
        applySettingsToInputs();
        toast("Settings reset.");
      });
  }

  function toast(msg) {
    console.log(msg);
  }

  /** ========== Init on DOM Ready ========== */
  document.addEventListener("DOMContentLoaded", () => {
    // grab elements only now
    els = {
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

    settings = loadSettings();
    applySettingsToInputs();
    buildKeyboard();
    // pre-load any JSON present
    if (els.scriptInput && els.scriptInput.value.trim().startsWith("[")) {
      try { script = JSON.parse(els.scriptInput.value); } catch (_) {}
    }
    bindUI();
  });
})();
