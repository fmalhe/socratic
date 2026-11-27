(() => {
  "use strict";

  const SILENT_WAV_URI =
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

  const OWL_SVG = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="60" cy="64" r="50" fill="#FEF3C7" fill-opacity="0.65"/>
    <path d="M27 38L39 20L49 35Z" fill="#2563EB"/>
    <path d="M93 38L81 20L71 35Z" fill="#2563EB"/>
    <ellipse cx="60" cy="66" rx="35" ry="37" fill="#3B82F6"/>
    <ellipse cx="60" cy="80" rx="22" ry="20" fill="#FEF3C7"/>
    <path d="M50 76Q54 80 58 76M62 76Q66 80 70 76M54 86Q60 91 66 86" stroke="#F59E0B" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="44" cy="52" r="13.5" fill="#FFFFFF"/>
    <circle cx="76" cy="52" r="13.5" fill="#FFFFFF"/>
    <circle cx="45" cy="53" r="6" fill="#1E2433"/>
    <circle cx="75" cy="53" r="6" fill="#1E2433"/>
    <circle cx="42.5" cy="50" r="2.2" fill="#FFFFFF"/>
    <circle cx="72.5" cy="50" r="2.2" fill="#FFFFFF"/>
    <path d="M53 58H67L60 69Z" fill="#F59E0B"/>
  </svg>`;

  const FLAG_SVGS = {
    pt: `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <rect width="28" height="20" rx="3" fill="#DA291C"/>
      <rect width="11" height="20" rx="3" fill="#046A38"/>
      <circle cx="11" cy="10" r="4.3" fill="#FFE900"/>
      <rect x="9.1" y="7.8" width="3.8" height="4.4" rx="1.2" fill="#FFFFFF" stroke="#DA291C" stroke-width="0.9"/>
    </svg>`,
    no: `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <rect width="28" height="20" rx="3" fill="#BA0C2F"/>
      <rect x="7" width="5" height="20" fill="#FFFFFF"/>
      <rect y="7.5" width="28" height="5" fill="#FFFFFF"/>
      <rect x="8.3" width="2.4" height="20" fill="#00205B"/>
      <rect y="8.8" width="28" height="2.4" fill="#00205B"/>
    </svg>`,
    gb: `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <rect width="28" height="20" rx="3" fill="#012169"/>
      <path d="M0 0L28 20M28 0L0 20" stroke="#FFFFFF" stroke-width="3.6"/>
      <path d="M0 0L28 20M28 0L0 20" stroke="#C8102E" stroke-width="1.8"/>
      <rect x="11.2" width="5.6" height="20" fill="#FFFFFF"/>
      <rect y="7.2" width="28" height="5.6" fill="#FFFFFF"/>
      <rect x="12.4" width="3.2" height="20" fill="#C8102E"/>
      <rect y="8.4" width="28" height="3.2" fill="#C8102E"/>
    </svg>`,
  };

  const state = {
    activeTab: "homework", // "homework" | "read"
    profile: null,
    progress: { totalStars: 0, currentStreakDays: 0, pagesReadCount: 0, savedWords: [] },
    sessions: [],
    currentSession: null,
    hwSubView: "passage", // "passage" | "exercise"
    hwExerciseIndex: 0,
    passageActiveSentenceIdx: 0,
    hwSlow: false,
    readData: null,
    readActiveSentenceIdx: 0,
    readSlow: false,
    isUploading: false,
    activeUploadXhr: null,
  };

  const $ = (id) => document.getElementById(id);

  function hydrateIconsAndFlags() {
    document.querySelectorAll(".owl-svg-slot, .owl-dock-avatar, .owl-mini-slot").forEach((el) => {
      if (!el.innerHTML.trim()) el.innerHTML = OWL_SVG;
    });
    document.querySelectorAll(".flag-slot[data-flag]").forEach((el) => {
      const code = el.getAttribute("data-flag");
      if (code && FLAG_SVGS[code]) {
        el.innerHTML = FLAG_SVGS[code];
      }
    });
  }

  function showToast(text) {
    const container = $("toast-container");
    if (!container) return;
    const pill = document.createElement("div");
    pill.className = "toast-pill";
    pill.textContent = text;
    container.appendChild(pill);
    setTimeout(() => {
      pill.remove();
    }, 2800);
  }

  function launchConfetti() {
    const layer = $("confetti-layer");
    if (!layer) return;
    const colors = ["#2563EB", "#F59E0B", "#16A34A", "#EC4899", "#0D9488"];
    for (let i = 0; i < 36; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.top = "-12px";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.25}s`;
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), 1700);
    }
  }

  function setOwlState(next) {
    const owl = $("hw-owl-svg");
    if (owl) owl.setAttribute("data-owl-state", next);
  }

  // ======================================================
  // IMAGE COMPRESSION & UPLOAD WITH PROGRESS + CANCEL
  // ======================================================
  async function compressImageFile(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      return file;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("decode failed"));
        image.src = dataUrl;
      });
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
      if (!blob || blob.size === 0) return file;
      const baseName = (file.name || "page").replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch {
      return file;
    }
  }

  function uploadWithProgress(url, formData, { fillEl, msgEl, messages }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      state.activeUploadXhr = xhr;
      xhr.open("POST", url, true);
      xhr.timeout = 60000;

      let msgIdx = 0;
      let progressVal = 12;
      fillEl.style.width = `${progressVal}%`;
      msgEl.textContent = messages[0];

      const msgTimer = setInterval(() => {
        msgIdx = (msgIdx + 1) % messages.length;
        msgEl.textContent = messages[msgIdx];
        if (progressVal < 92) {
          progressVal = Math.min(92, progressVal + 7);
          fillEl.style.width = `${progressVal}%`;
        }
      }, 2200);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.round((ev.loaded / ev.total) * 44);
          progressVal = Math.max(progressVal, Math.min(48, pct));
          fillEl.style.width = `${progressVal}%`;
        }
      };

      const cleanup = () => {
        clearInterval(msgTimer);
        if (state.activeUploadXhr === xhr) state.activeUploadXhr = null;
      };

      xhr.onload = () => {
        cleanup();
        fillEl.style.width = "100%";
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Invalid server response"));
          }
        } else {
          let detail = `Server returned ${xhr.status}`;
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed && parsed.error) {
              detail = typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error);
            }
          } catch {}
          reject(new Error(detail));
        }
      };

      xhr.onerror = () => {
        cleanup();
        reject(new Error("Network error while uploading photo"));
      };

      xhr.ontimeout = () => {
        cleanup();
        reject(new Error("Upload timed out — please try again"));
      };

      xhr.onabort = () => {
        cleanup();
        const err = new Error("CANCELLED");
        err.isCancelled = true;
        reject(err);
      };

      xhr.send(formData);
    });
  }

  // ======================================================
  // UNIFIED GESTURE-UNLOCKED AUDIO + WAV KARAOKE ENGINE
  // ======================================================
  const AudioController = (() => {
    const sharedAudio = new Audio();
    sharedAudio.playsInline = true;
    sharedAudio.preload = "auto";

    let audioCtx = null;
    let firstHtmlAudioUnlock = false;
    let runId = 0;
    let currentAbort = null;
    let rafId = 0;
    let browserTimer = 0;
    let currentKey = null;
    let currentState = "idle"; // idle | loading | playing | paused
    let activeKaraokeEls = [];
    let currentBrowserJob = null;
    let activeSources = [];
    let usingHtmlAudio = false;
    const lruCache = new Map(); // cacheKey -> { buffer, contentType, trim }
    const persistentCachePromise =
      typeof caches !== "undefined" ? caches.open("socratic-audio-v1").catch(() => null) : Promise.resolve(null);

    function ensureAudioCtx() {
      if (audioCtx) return audioCtx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
      return audioCtx;
    }

    function unlockSync() {
      const ctx = ensureAudioCtx();
      if (ctx) {
        try {
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }
          const buf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
        } catch {}
      }
      if (!firstHtmlAudioUnlock) {
        firstHtmlAudioUnlock = true;
        try {
          sharedAudio.muted = true;
          sharedAudio.src = SILENT_WAV_URI;
          const p = sharedAudio.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {}
      }
    }

    function clearKaraokeClasses() {
      for (const el of activeKaraokeEls) {
        el.classList.remove("is-active", "is-spoken");
      }
      activeKaraokeEls = [];
    }

    function setLruCache(key, entry) {
      if (lruCache.has(key)) lruCache.delete(key);
      lruCache.set(key, entry);
      if (lruCache.size > 48) {
        const oldestKey = lruCache.keys().next().value;
        lruCache.delete(oldestKey);
      }
    }

    function cacheRequestUrl(key) {
      return `https://socratic-cache.local/audio/${encodeURIComponent(key)}`;
    }

    async function readPersistentCache(key) {
      const mem = lruCache.get(key);
      if (mem) return mem;
      try {
        const cache = await persistentCachePromise;
        if (!cache) return null;
        const match = await cache.match(cacheRequestUrl(key));
        if (!match) return null;
        const buffer = await match.arrayBuffer();
        const contentType = match.headers.get("Content-Type") || "audio/wav";
        const trim = contentType.includes("wav") ? analyzeWavTrim(buffer) : null;
        const entry = { buffer, contentType, trim };
        setLruCache(key, entry);
        return entry;
      } catch {
        return null;
      }
    }

    async function writePersistentCache(key, buffer, contentType) {
      const trim = contentType.includes("wav") ? analyzeWavTrim(buffer) : null;
      const entry = { buffer, contentType, trim };
      setLruCache(key, entry);
      try {
        const cache = await persistentCachePromise;
        if (!cache) return entry;
        await cache.put(
          cacheRequestUrl(key),
          new Response(buffer.slice(0), {
            headers: { "Content-Type": contentType },
          }),
        );
      } catch {}
      return entry;
    }

    function buildWavFromPcm16(pcmBytes, sampleRate = 24000) {
      const wav = new Uint8Array(44 + pcmBytes.byteLength);
      const view = new DataView(wav.buffer);
      const writeStr = (off, str) => {
        for (let i = 0; i < str.length; i++) wav[off + i] = str.charCodeAt(i);
      };
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + pcmBytes.byteLength, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, pcmBytes.byteLength, true);
      wav.set(pcmBytes, 44);
      return wav.buffer;
    }

    function notifyUI() {
      syncAudioButtonsUI();
    }

    function setState(key, nextState) {
      currentKey = nextState === "idle" ? null : key;
      currentState = nextState;
      notifyUI();
    }

    function analyzeWavTrim(arrayBuffer) {
      try {
        if (arrayBuffer.byteLength < 44) return null;
        const view = new DataView(arrayBuffer);
        const tag = (off) =>
          String.fromCharCode(
            view.getUint8(off),
            view.getUint8(off + 1),
            view.getUint8(off + 2),
            view.getUint8(off + 3),
          );
        if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

        let offset = 12;
        let sampleRate = 24000;
        let channels = 1;
        let bitsPerSample = 16;
        let dataOffset = -1;
        let dataBytes = 0;

        while (offset + 8 <= arrayBuffer.byteLength) {
          const id = tag(offset);
          const size = view.getUint32(offset + 4, true);
          if (id === "fmt " && offset + 24 <= arrayBuffer.byteLength) {
            channels = view.getUint16(offset + 10, true) || 1;
            sampleRate = view.getUint32(offset + 12, true) || 24000;
            bitsPerSample = view.getUint16(offset + 22, true) || 16;
          } else if (id === "data") {
            dataOffset = offset + 8;
            dataBytes = Math.min(size, arrayBuffer.byteLength - dataOffset);
            break;
          }
          offset += 8 + size + (size % 2);
        }

        if (dataOffset < 0 || bitsPerSample !== 16 || dataBytes < 64) return null;
        const bytesPerFrame = channels * 2;
        const totalFrames = Math.floor(dataBytes / bytesPerFrame);
        const totalSec = totalFrames / sampleRate;
        const winFrames = Math.max(1, Math.floor(sampleRate * 0.015));
        const threshold = 480;
        let firstSpeechFrame = 0;
        let lastSpeechFrame = totalFrames - 1;
        let foundStart = false;

        for (let f = 0; f < totalFrames; f += winFrames) {
          let peak = 0;
          const endF = Math.min(totalFrames, f + winFrames);
          for (let s = f; s < endF; s += 2) {
            const amp = Math.abs(view.getInt16(dataOffset + s * bytesPerFrame, true));
            if (amp > peak) peak = amp;
          }
          if (peak >= threshold) {
            if (!foundStart) {
              firstSpeechFrame = f;
              foundStart = true;
            }
            lastSpeechFrame = endF;
          }
        }

        if (!foundStart) return { startSec: 0, endSec: totalSec };
        const startSec = Math.max(0, firstSpeechFrame / sampleRate - 0.02);
        const endSec = Math.min(totalSec, Math.max(startSec + 0.14, lastSpeechFrame / sampleRate + 0.03));
        return { startSec, endSec };
      } catch {
        return null;
      }
    }

    function buildWordWeights(wordEls) {
      const weights = wordEls.map((el) => {
        const raw = (el.textContent || "").trim();
        const vowels = (raw.match(/[aeiouyáàâãéêíóôõúüæøå]+/gi) || []).length;
        let w = Math.max(1, vowels);
        if (/[,;:]$/.test(raw)) w += 0.55;
        else if (/[.!?…]$/.test(raw)) w += 1.05;
        return w;
      });
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      return weights.map((w) => {
        const start = acc / total;
        acc += w;
        return { start, end: acc / total };
      });
    }

    function applyHighlightIndex(wordEls, idx) {
      for (let i = 0; i < wordEls.length; i++) {
        const el = wordEls[i];
        if (i < idx) {
          el.classList.add("is-spoken");
          el.classList.remove("is-active");
        } else if (i === idx) {
          el.classList.add("is-active");
          el.classList.remove("is-spoken");
        } else {
          el.classList.remove("is-active", "is-spoken");
        }
      }
    }

    function pickSpeechVoice(langCode) {
      if (!("speechSynthesis" in window)) return null;
      const voices = window.speechSynthesis.getVoices() || [];
      const target = (langCode || "pt-PT").toLowerCase();
      if (target.startsWith("pt")) {
        return (
          voices.find((v) => v.lang.toLowerCase() === "pt-pt") ||
          voices.find((v) => v.lang.toLowerCase().startsWith("pt-pt")) ||
          voices.find((v) => v.lang.toLowerCase().startsWith("pt") && !v.lang.toLowerCase().includes("br")) ||
          null
        );
      }
      if (target.startsWith("nb") || target.startsWith("no") || target.startsWith("nn")) {
        return (
          voices.find((v) => ["nb-no", "no-no", "nn-no"].includes(v.lang.toLowerCase())) ||
          voices.find((v) => /^(nb|no|nn)/.test(v.lang.toLowerCase())) ||
          null
        );
      }
      return (
        voices.find((v) => v.lang.toLowerCase() === target) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(target.split("-")[0])) ||
        null
      );
    }

    function stopActiveAudioNodes() {
      for (const src of activeSources) {
        try {
          src.onended = null;
          src.stop();
          src.disconnect();
        } catch {}
      }
      activeSources = [];
    }

    function stop() {
      runId += 1;
      if (currentAbort) {
        try {
          currentAbort.abort();
        } catch {}
        currentAbort = null;
      }
      cancelAnimationFrame(rafId);
      clearInterval(browserTimer);
      currentBrowserJob = null;
      stopActiveAudioNodes();
      usingHtmlAudio = false;
      try {
        sharedAudio.pause();
        sharedAudio.onended = null;
        sharedAudio.onerror = null;
      } catch {}
      if ("speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      clearKaraokeClasses();
      setState(null, "idle");
    }

    function pause() {
      if (currentState !== "playing") return;
      if (currentBrowserJob) {
        currentBrowserJob.paused = true;
        cancelAnimationFrame(rafId);
        clearInterval(browserTimer);
        if ("speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
        }
        setState(currentKey, "paused");
        return;
      }
      if (!usingHtmlAudio && audioCtx && audioCtx.state === "running") {
        audioCtx.suspend().catch(() => {});
        setState(currentKey, "paused");
        return;
      }
      try {
        sharedAudio.pause();
        cancelAnimationFrame(rafId);
        setState(currentKey, "paused");
      } catch {
        stop();
      }
    }

    function resume() {
      if (currentState !== "paused") return;
      unlockSync();
      if (currentBrowserJob) {
        const job = currentBrowserJob;
        job.paused = false;
        setState(currentKey, "playing");
        startBrowserUtterance(job);
        return;
      }
      if (!usingHtmlAudio && audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
        setState(currentKey, "playing");
        return;
      }
      try {
        sharedAudio.muted = false;
        const p = sharedAudio.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        setState(currentKey, "playing");
      } catch {
        stop();
      }
    }

    function startBrowserUtterance(job) {
      if (!("speechSynthesis" in window)) {
        job.onDone?.();
        return;
      }
      window.speechSynthesis.cancel();
      const remainingEls = job.wordEls.slice(job.wordOffset);
      const remainingText =
        remainingEls.length > 0
          ? remainingEls.map((el) => el.textContent.trim()).join(" ")
          : job.text;

      const utt = new SpeechSynthesisUtterance(remainingText);
      const voice = pickSpeechVoice(job.languageCode);
      if (voice) utt.voice = voice;
      utt.lang = voice?.lang || job.languageCode || "pt-PT";
      utt.rate = job.slow ? 0.72 : 0.96;

      const weights = remainingEls.length > 0 ? buildWordWeights(remainingEls) : [];
      const wordCount = Math.max(1, remainingText.split(/\s+/).filter(Boolean).length);
      const estMs = Math.max(650, wordCount * (job.slow ? 620 : 410));
      const startedAt = performance.now();
      let lastHighlight = -1;

      if (remainingEls.length > 0) {
        clearInterval(browserTimer);
        browserTimer = setInterval(() => {
          if (job.myRunId !== runId || job.paused) return;
          const frac = Math.min(0.99, (performance.now() - startedAt) / estMs);
          let relIdx = weights.findIndex((w) => frac <= w.end);
          if (relIdx < 0) relIdx = remainingEls.length - 1;
          job.currentWordOffset = job.wordOffset + relIdx;
          if (job.currentWordOffset !== lastHighlight) {
            lastHighlight = job.currentWordOffset;
            applyHighlightIndex(job.wordEls, lastHighlight);
          }
        }, 65);
      }

      utt.onend = () => {
        if (job.myRunId !== runId || job.paused) return;
        clearInterval(browserTimer);
        clearKaraokeClasses();
        currentBrowserJob = null;
        setState(null, "idle");
        job.onDone?.();
      };

      utt.onerror = () => {
        if (job.myRunId !== runId || job.paused) return;
        clearInterval(browserTimer);
        clearKaraokeClasses();
        currentBrowserJob = null;
        setState(null, "idle");
        job.onDone?.();
      };

      window.speechSynthesis.speak(utt);
    }

    async function playDecodedAudioBuffer({ myRun, key, cached, onEnded }) {
      const ctx = ensureAudioCtx();
      if (ctx) {
        try {
          if (ctx.state === "suspended") await ctx.resume();
          const audioBuf = await ctx.decodeAudioData(cached.buffer.slice(0));
          if (myRun !== runId) return;

          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          activeSources = [src];
          usingHtmlAudio = false;

          const dur = audioBuf.duration || 1;
          const startOffset = cached.trim ? cached.trim.startSec : 0;
          const endOffset = cached.trim ? Math.min(dur, cached.trim.endSec) : dur;
          const span = Math.max(0.15, endOffset - startOffset);
          const wordWeights = activeKaraokeEls.length > 0 ? buildWordWeights(activeKaraokeEls) : [];
          let lastIdx = -1;
          const startedCtxTime = ctx.currentTime;

          const tick = () => {
            if (myRun !== runId) return;
            if (ctx.state === "running" && activeKaraokeEls.length > 0) {
              const elapsed = ctx.currentTime - startedCtxTime;
              const progress = Math.max(0, Math.min(1, (elapsed - startOffset) / span));
              let idx = wordWeights.findIndex((w) => progress <= w.end);
              if (idx < 0) idx = wordWeights.length - 1;
              if (idx !== lastIdx) {
                lastIdx = idx;
                applyHighlightIndex(activeKaraokeEls, idx);
              }
            }
            if (currentState === "playing" || currentState === "paused") {
              rafId = requestAnimationFrame(tick);
            }
          };

          src.onended = () => {
            if (myRun !== runId) return;
            cancelAnimationFrame(rafId);
            activeSources = [];
            clearKaraokeClasses();
            setState(null, "idle");
            if (typeof onEnded === "function") onEnded();
          };

          setState(key, "playing");
          src.start(0);
          if (activeKaraokeEls.length > 0) {
            rafId = requestAnimationFrame(tick);
          }
          return;
        } catch {}
      }

      // HTMLAudio fallback if Web Audio API decode unavailable
      usingHtmlAudio = true;
      const blob = new Blob([cached.buffer], { type: cached.contentType || "audio/wav" });
      const blobUrl = URL.createObjectURL(blob);
      sharedAudio.muted = false;
      sharedAudio.src = blobUrl;
      const wordWeights = activeKaraokeEls.length > 0 ? buildWordWeights(activeKaraokeEls) : [];
      let lastIdx = -1;

      const tickHtml = () => {
        if (myRun !== runId) return;
        if (!sharedAudio.paused && activeKaraokeEls.length > 0) {
          const dur = Number.isFinite(sharedAudio.duration) && sharedAudio.duration > 0 ? sharedAudio.duration : 1;
          const startSec = cached.trim ? cached.trim.startSec : 0;
          const endSec = cached.trim ? Math.min(dur, cached.trim.endSec) : dur;
          const span = Math.max(0.15, endSec - startSec);
          const progress = Math.max(0, Math.min(1, (sharedAudio.currentTime - startSec) / span));
          let idx = wordWeights.findIndex((w) => progress <= w.end);
          if (idx < 0) idx = wordWeights.length - 1;
          if (idx !== lastIdx) {
            lastIdx = idx;
            applyHighlightIndex(activeKaraokeEls, idx);
          }
        }
        if (currentState === "playing") rafId = requestAnimationFrame(tickHtml);
      };

      sharedAudio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        if (myRun !== runId) return;
        cancelAnimationFrame(rafId);
        clearKaraokeClasses();
        setState(null, "idle");
        if (typeof onEnded === "function") onEnded();
      };
      sharedAudio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        if (myRun !== runId) return;
        cancelAnimationFrame(rafId);
        clearKaraokeClasses();
        setState(null, "idle");
      };

      setState(key, "playing");
      await sharedAudio.play();
      if (myRun === runId && activeKaraokeEls.length > 0) {
        rafId = requestAnimationFrame(tickHtml);
      }
    }

    async function playStreamingPcmResponse({ res, myRun, key, cacheKey, resolvedText, slow, onEnded }) {
      const ctx = ensureAudioCtx();
      if (!ctx || !res.body) return false;
      if (ctx.state === "suspended") await ctx.resume();

      const ct = res.headers.get("Content-Type") || "";
      const rateMatch = ct.match(/rate=(\d+)/i);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

      const reader = res.body.getReader();
      let leftover = null;
      let nextStartTime = 0;
      let streamStartedAt = 0;
      let streamDone = false;
      let totalPcmBytes = 0;
      const recordedChunks = [];
      activeSources = [];
      usingHtmlAudio = false;

      const wordWeights = activeKaraokeEls.length > 0 ? buildWordWeights(activeKaraokeEls) : [];
      const tokenUnits = wordWeights.length > 0 ? wordWeights.length : Math.max(1, resolvedText.split(/\s+/).length);
      let estDuration = Math.max(0.8, tokenUnits * (slow ? 0.56 : 0.36));
      let lastIdx = -1;

      const tickStream = () => {
        if (myRun !== runId) return;
        if (streamStartedAt > 0 && ctx.state === "running" && activeKaraokeEls.length > 0) {
          const playedSec = Math.max(0, ctx.currentTime - streamStartedAt);
          const bufferedSec = totalPcmBytes / (sampleRate * 2);
          const denom = streamDone ? Math.max(0.25, bufferedSec) : Math.max(estDuration, bufferedSec + 0.15);
          const progress = Math.max(0, Math.min(1, playedSec / denom));
          let idx = wordWeights.findIndex((w) => progress <= w.end);
          if (idx < 0) idx = wordWeights.length - 1;
          if (idx !== lastIdx) {
            lastIdx = idx;
            applyHighlightIndex(activeKaraokeEls, idx);
          }
        }
        if (currentState === "playing" || currentState === "paused") {
          rafId = requestAnimationFrame(tickStream);
        }
      };

      let scheduledAny = false;
      let lastNode = null;

      while (true) {
        const { value, done } = await reader.read();
        if (myRun !== runId) {
          reader.cancel().catch(() => {});
          return true;
        }
        if (done) {
          streamDone = true;
          break;
        }
        if (!value || value.byteLength === 0) continue;

        let combined;
        if (leftover !== null) {
          combined = new Uint8Array(1 + value.byteLength);
          combined[0] = leftover;
          combined.set(value, 1);
          leftover = null;
        } else {
          combined = value;
        }

        const evenLen = combined.byteLength - (combined.byteLength % 2);
        if (combined.byteLength % 2 === 1) {
          leftover = combined[combined.byteLength - 1];
        }
        if (evenLen <= 0) continue;

        const chunkBytes = combined.subarray(0, evenLen);
        recordedChunks.push(chunkBytes.slice());
        totalPcmBytes += chunkBytes.byteLength;

        const sampleCount = evenLen / 2;
        const floatBuf = ctx.createBuffer(1, sampleCount, sampleRate);
        const channel = floatBuf.getChannelData(0);
        const dv = new DataView(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength);
        for (let i = 0; i < sampleCount; i++) {
          channel[i] = dv.getInt16(i * 2, true) / 32768;
        }

        const src = ctx.createBufferSource();
        src.buffer = floatBuf;
        src.connect(ctx.destination);
        const now = ctx.currentTime;
        if (!scheduledAny) {
          nextStartTime = now + 0.03;
          streamStartedAt = nextStartTime;
          scheduledAny = true;
          setState(key, "playing");
          if (activeKaraokeEls.length > 0) rafId = requestAnimationFrame(tickStream);
        } else if (nextStartTime < now) {
          nextStartTime = now;
        }
        src.start(nextStartTime);
        nextStartTime += floatBuf.duration;
        activeSources.push(src);
        lastNode = src;
      }

      if (!scheduledAny) return false;

      // Save full WAV in browser CacheStorage so replays are instant
      if (totalPcmBytes > 0) {
        const fullPcm = new Uint8Array(totalPcmBytes);
        let off = 0;
        for (const ch of recordedChunks) {
          fullPcm.set(ch, off);
          off += ch.byteLength;
        }
        const wavBuf = buildWavFromPcm16(fullPcm, sampleRate);
        writePersistentCache(cacheKey, wavBuf, "audio/wav").catch(() => {});
      }

      if (lastNode) {
        lastNode.onended = () => {
          if (myRun !== runId) return;
          cancelAnimationFrame(rafId);
          activeSources = [];
          clearKaraokeClasses();
          setState(null, "idle");
          if (typeof onEnded === "function") onEnded();
        };
      }

      return true;
    }

    async function speak({ key, text, languageCode = "pt-PT", slow = false, wordEls = [], onBeforeFetch = null, onEnded = null }) {
      if (currentKey === key && (currentState === "playing" || currentState === "loading")) {
        stop();
        return;
      }

      stop();
      unlockSync();

      const myRun = runId;
      currentAbort = new AbortController();
      activeKaraokeEls = Array.isArray(wordEls) ? wordEls : [];
      setState(key, "loading");

      try {
        let resolvedText = (text || "").trim();
        if (typeof onBeforeFetch === "function") {
          const fetchedText = await onBeforeFetch();
          if (myRun !== runId) return;
          if (fetchedText) resolvedText = fetchedText.trim();
        }

        if (!resolvedText) {
          stop();
          return;
        }

        const cacheKey = `${languageCode}|${slow ? 1 : 0}|${resolvedText}`;
        const cached = await readPersistentCache(cacheKey);
        if (myRun !== runId) return;

        if (cached) {
          await playDecodedAudioBuffer({ myRun, key, cached, onEnded });
          return;
        }

        // Stream directly for low TTFA; hits R2 instantly if already edge-cached
        const res = await fetch("/api/audio/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: resolvedText, languageCode, slow: Boolean(slow) }),
          signal: currentAbort.signal,
        });
        if (myRun !== runId) return;

        if (res.ok) {
          const ct = (res.headers.get("Content-Type") || "").toLowerCase();
          if (ct.includes("l16") || res.headers.get("X-Audio-Stream") === "1") {
            const streamed = await playStreamingPcmResponse({
              res,
              myRun,
              key,
              cacheKey,
              resolvedText,
              slow,
              onEnded,
            });
            if (streamed || myRun !== runId) return;
          } else {
            const buffer = await res.arrayBuffer();
            if (myRun !== runId) return;
            const entry = await writePersistentCache(cacheKey, buffer, res.headers.get("Content-Type") || "audio/wav");
            if (myRun !== runId) return;
            await playDecodedAudioBuffer({ myRun, key, cached: entry, onEnded });
            return;
          }
        }

        // Fallback to Browser speechSynthesis ONLY if cloud TTS returned 501 / unavailable
        if (myRun !== runId) return;
        setState(key, "playing");
        currentBrowserJob = {
          myRunId: myRun,
          text: resolvedText,
          languageCode,
          slow,
          wordEls: activeKaraokeEls,
          wordOffset: 0,
          currentWordOffset: 0,
          paused: false,
          onDone: onEnded,
        };
        startBrowserUtterance(currentBrowserJob);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        if (myRun === runId) {
          clearKaraokeClasses();
          setState(null, "idle");
        }
      }
    }

    return {
      unlockSync,
      speak,
      stop,
      pause,
      resume,
      readPersistentCache,
      writePersistentCache,
      getKey: () => currentKey,
      getState: () => currentState,
    };
  })();

  // Polite Single-Lane Background Prefetcher (w/ R2 Hit Fast-Path & 429 Cooldown)
  const PrefetchManager = (() => {
    let epoch = 0;
    let queue = [];
    let running = false;
    let cooldownUntil = 0;

    function reset() {
      epoch += 1;
      queue = [];
    }

    function enqueue(items) {
      const valid = (items || []).filter((it) => it && it.text && it.text.trim());
      if (!valid.length) return;
      queue.push(...valid);
      if (!running) processQueue();
    }

    async function processQueue() {
      if (running) return;
      running = true;
      const myEpoch = epoch;
      try {
        while (queue.length > 0 && myEpoch === epoch) {
          if (Date.now() < cooldownUntil) break;
          const item = queue.shift();
          const text = item.text.trim();
          const lang = item.languageCode || "pt-PT";
          const slow = Boolean(item.slow);
          const key = `${lang}|${slow ? 1 : 0}|${text}`;

          const already = await AudioController.readPersistentCache(key);
          if (already) continue;

          try {
            const res = await fetch("/api/audio/speak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text, languageCode: lang, slow, prefetch: true }),
            });
            if (myEpoch !== epoch) break;
            if (res.status === 429) {
              cooldownUntil = Date.now() + 25000;
              break;
            }
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              await AudioController.writePersistentCache(
                key,
                buffer,
                res.headers.get("Content-Type") || "audio/wav",
              );
              const isHit = res.headers.get("X-Audio-Cache") === "HIT";
              await new Promise((r) => setTimeout(r, isHit ? 80 : 1200));
            } else {
              await new Promise((r) => setTimeout(r, 800));
            }
          } catch {
            await new Promise((r) => setTimeout(r, 1200));
          }
        }
      } finally {
        running = false;
      }
    }

    return { reset, enqueue };
  })();

  function syncAudioButtonsUI() {
    const activeKey = AudioController.getKey();
    const audioState = AudioController.getState();

    // Sync Owl avatar state
    if (audioState === "loading" && activeKey && activeKey.startsWith("hw-")) {
      setOwlState("loading");
    } else if (audioState === "playing" && activeKey && activeKey.startsWith("hw-")) {
      setOwlState("speaking");
    } else if ($("hw-owl-svg")?.getAttribute("data-owl-state") !== "celebrating") {
      setOwlState("idle");
    }

    const buttonKeyMap = {
      "hw-q-listen-pt": "hw-q-pt",
      "hw-q-listen-no": "hw-q-no",
      "hw-explain-pt": "hw-explain-pt",
      "hw-explain-no": "hw-explain-no",
    };

    Object.entries(buttonKeyMap).forEach(([domId, key]) => {
      const btn = $(domId);
      if (!btn) return;
      const isMatch = activeKey === key;
      const spinner = btn.querySelector(".btn-spinner");
      const eq = btn.querySelector(".eq-bars");
      btn.classList.toggle("is-playing", isMatch && audioState === "playing");
      if (spinner) spinner.hidden = !(isMatch && audioState === "loading");
      if (eq) eq.hidden = !(isMatch && audioState === "playing");
    });

    // Sync floating glass dock
    const dock = $("floating-audio-dock");
    if (dock && !dock.hidden) {
      const isDockActive =
        activeKey && (activeKey.startsWith("read-") || activeKey.startsWith("passage-"));
      const dockPlayIcon = $("dock-play-icon");
      const dockBtn = $("dock-play-btn");
      const dockSpinner = dockBtn?.querySelector(".btn-spinner");
      if (dockSpinner) dockSpinner.hidden = !(isDockActive && audioState === "loading");
      if (dockPlayIcon) {
        dockPlayIcon.hidden = Boolean(isDockActive && audioState === "loading");
        dockPlayIcon.textContent = isDockActive && audioState === "playing" ? "⏸" : "▶";
      }
    }
  }

  // ======================================================
  // KARAOKE TOKEN RENDERING & WORD POPOVER
  // ======================================================
  let popoverTimer = 0;

  function showWordPopover(wordEl, hint) {
    const pop = $("word-popover");
    if (!pop) return;
    $("word-popover-syllables").textContent = hint.syllables || hint.word;
    $("word-popover-hint").textContent = hint.nativeHint || "";
    const rect = wordEl.getBoundingClientRect();
    pop.style.left = `${Math.max(12, Math.min(window.innerWidth - 230, rect.left))}px`;
    pop.style.top = `${Math.max(58, rect.top - 58)}px`;
    pop.hidden = false;
    clearTimeout(popoverTimer);
    popoverTimer = setTimeout(() => {
      pop.hidden = true;
    }, 3200);
  }

  function renderKaraokeWords(container, text, trickyWords = []) {
    container.innerHTML = "";
    const wordHintMap = new Map(
      (trickyWords || []).map((w) => [w.word.toLowerCase().replace(/[.,!?;:"'()]/g, ""), w]),
    );
    const tokens = String(text || "").split(/\s+/).filter(Boolean);
    const spans = [];

    tokens.forEach((tok, idx) => {
      const span = document.createElement("span");
      span.className = "karaoke-word";
      span.textContent = tok;
      const clean = tok.toLowerCase().replace(/[.,!?;:"'()]/g, "");
      const hint = wordHintMap.get(clean);
      if (hint) span.classList.add("is-tricky");

      span.addEventListener("click", (e) => {
        e.stopPropagation();
        if (hint) showWordPopover(span, hint);
        AudioController.speak({
          key: `word-${clean}`,
          text: clean || tok,
          languageCode: state.profile?.targetLanguageCode || "pt-PT",
          slow: true,
          wordEls: [span],
        });
      });

      container.appendChild(span);
      spans.push(span);
      if (idx < tokens.length - 1) {
        container.appendChild(document.createTextNode(" "));
      }
    });

    return spans;
  }

  // ======================================================
  // SHARED SENTENCE LIST + FLOATING DOCK (PASSAGE & READ)
  // ======================================================
  function renderKaraokeSentenceList({
    containerEl,
    sentences,
    keyPrefix,
    activeIndex,
    getSlow,
    onSelectIndex,
    onTranslatePlay,
  }) {
    containerEl.innerHTML = "";
    const rowsMeta = [];

    sentences.forEach((sent, idx) => {
      const row = document.createElement("div");
      row.className = `sentence-row${idx === activeIndex ? " is-active" : ""}`;
      row.setAttribute("data-idx", String(idx));

      const textEl = document.createElement("div");
      textEl.className = "sentence-text";
      textEl.setAttribute("dir", "auto");
      const wordSpans = renderKaraokeWords(textEl, sent.targetText, sent.trickyWords || []);

      textEl.addEventListener("click", (e) => {
        if (e.target.closest(".karaoke-word")) return;
        onSelectIndex(idx);
        playSentenceFromList(idx, true);
      });

      const flagsWrap = document.createElement("div");
      flagsWrap.className = "sentence-flags";

      const noBtn = document.createElement("button");
      noBtn.className = "flag-icon-btn";
      noBtn.type = "button";
      noBtn.title = "Ouvir em Norueguês";
      noBtn.setAttribute("aria-label", "Ouvir frase em Norueguês");
      noBtn.innerHTML = FLAG_SVGS.no;
      noBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectIndex(idx);
        onTranslatePlay(idx, "nb-NO", sent);
      });

      flagsWrap.append(noBtn);
      row.append(textEl, flagsWrap);
      containerEl.appendChild(row);
      rowsMeta.push({ row, wordSpans });
    });

    function playSentenceFromList(startIdx, autoAdvance) {
      const item = sentences[startIdx];
      const meta = rowsMeta[startIdx];
      if (!item || !meta) return;
      onSelectIndex(startIdx);
      Array.from(containerEl.querySelectorAll(".sentence-row")).forEach((r, i) => {
        r.classList.toggle("is-active", i === startIdx);
      });
      meta.row.scrollIntoView({ behavior: "smooth", block: "nearest" });

      const targetLang = state.profile?.targetLanguageCode || "pt-PT";
      const slow = getSlow();
      const lookahead = [];
      for (let j = 1; j <= 2; j++) {
        if (sentences[startIdx + j]?.targetText) {
          lookahead.push({ text: sentences[startIdx + j].targetText, languageCode: targetLang, slow });
        }
      }
      PrefetchManager.enqueue(lookahead);

      AudioController.speak({
        key: `${keyPrefix}-${startIdx}`,
        text: item.targetText,
        languageCode: targetLang,
        slow,
        wordEls: meta.wordSpans,
        onEnded: () => {
          if (autoAdvance && startIdx + 1 < sentences.length) {
            playSentenceFromList(startIdx + 1, true);
          }
        },
      });
    }

    return { playSentenceFromList };
  }

  let activeDockController = null;

  function updateFloatingDock() {
    const dock = $("floating-audio-dock");
    if (!dock) return;

    const showForHomeworkPassage =
      state.activeTab === "homework" &&
      !$("hw-session-stage").hidden &&
      state.hwSubView === "passage" &&
      state.currentSession?.readingPassage?.sentences?.length > 0;

    const showForRead =
      state.activeTab === "read" &&
      !$("read-stage").hidden &&
      state.readData?.sentences?.length > 0;

    if (!showForHomeworkPassage && !showForRead) {
      dock.hidden = true;
      activeDockController = null;
      return;
    }

    dock.hidden = false;
    const isPassage = showForHomeworkPassage;
    const sentences = isPassage
      ? state.currentSession.readingPassage.sentences
      : state.readData.sentences;
    const idx = isPassage ? state.passageActiveSentenceIdx : state.readActiveSentenceIdx;
    const slow = isPassage ? state.hwSlow : state.readSlow;

    $("dock-slow-btn").setAttribute("aria-pressed", String(slow));
    $("dock-status-label").textContent = `${idx + 1} / ${sentences.length}`;
    syncAudioButtonsUI();
  }

  // ======================================================
  // RENDER HOMEWORK VIEW
  // ======================================================
  function renderHomeworkStepper(session) {
    const bar = $("hw-stepper");
    bar.innerHTML = "";
    const hasPassage = Boolean(session.readingPassage && session.readingPassage.sentences.length > 0);

    if (hasPassage) {
      const pBtn = document.createElement("button");
      pBtn.type = "button";
      pBtn.className = `step-pill${state.hwSubView === "passage" ? " is-active" : ""}`;
      pBtn.innerHTML = `<span aria-hidden="true">📖</span><span>Texto</span>`;
      pBtn.addEventListener("click", () => {
        AudioController.stop();
        state.hwSubView = "passage";
        renderHomeworkSession();
      });
      bar.appendChild(pBtn);
    }

    (session.exercises || []).forEach((ex, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isDone = ex.status === "COMPLETED";
      const isActive = state.hwSubView === "exercise" && state.hwExerciseIndex === idx;
      btn.className = `step-pill${isDone ? " is-done" : ""}${isActive ? " is-active" : ""}`;
      btn.textContent = isDone ? `${ex.label} ✓` : ex.label;
      btn.addEventListener("click", () => {
        AudioController.stop();
        state.hwSubView = "exercise";
        state.hwExerciseIndex = idx;
        renderHomeworkSession();
      });
      bar.appendChild(btn);
    });
  }

  async function ensurePassageHydrated(session) {
    if (!session?.readingPassage) return session?.readingPassage;
    const needs = session.readingPassage.sentences.some(
      (s) => !s.nativeSummary?.trim() || !s.englishSummary?.trim(),
    );
    if (!needs) return session.readingPassage;
    const res = await fetch(`/api/homework/sessions/${session.id}/passage/hydrate`, {
      method: "POST",
    });
    if (!res.ok) return session.readingPassage;
    const updated = await res.json();
    session.readingPassage = updated;
    return updated;
  }

  async function ensureExerciseHydrated(session, exercise) {
    if (
      exercise.promptNative &&
      exercise.promptEnglish &&
      exercise.explanationTarget &&
      exercise.explanationEnglish
    ) {
      return exercise;
    }
    const res = await fetch(
      `/api/homework/sessions/${session.id}/exercises/${exercise.id}/hydrate`,
      { method: "POST" },
    );
    if (!res.ok) return exercise;
    const updated = await res.json();
    Object.assign(exercise, updated);
    return exercise;
  }

  function renderHomeworkSession() {
    const session = state.currentSession;
    const emptyEl = $("hw-empty-state");
    const progEl = $("hw-progress-card");
    const errEl = $("hw-error-card");
    const stageEl = $("hw-session-stage");

    progEl.hidden = true;
    errEl.hidden = true;

    if (!session) {
      emptyEl.hidden = false;
      stageEl.hidden = true;
      $("hw-open-pages-empty").hidden = state.sessions.length === 0;
      updateFloatingDock();
      return;
    }

    emptyEl.hidden = true;
    stageEl.hidden = false;
    $("hw-page-title").textContent = session.pageTitle || "Homework Page";
    $("hw-photo-btn").hidden = !session.imageUrl;

    const hasPassage = Boolean(session.readingPassage && session.readingPassage.sentences.length > 0);
    const hasExercises = Boolean(session.exercises && session.exercises.length > 0);

    if (state.hwSubView === "passage" && !hasPassage && hasExercises) {
      state.hwSubView = "exercise";
    } else if (state.hwSubView === "exercise" && !hasExercises && hasPassage) {
      state.hwSubView = "passage";
    }

    renderHomeworkStepper(session);

    const passageStage = $("hw-passage-stage");
    const exerciseStage = $("hw-exercise-stage");

    if (state.hwSubView === "passage" && hasPassage) {
      passageStage.hidden = false;
      exerciseStage.hidden = true;
      const passage = session.readingPassage;
      $("hw-passage-title").textContent = passage.titleTarget || session.pageTitle || "";
      if (state.passageActiveSentenceIdx >= passage.sentences.length) {
        state.passageActiveSentenceIdx = 0;
      }

      const listCtrl = renderKaraokeSentenceList({
        containerEl: $("hw-passage-sentences"),
        sentences: passage.sentences,
        keyPrefix: "passage",
        activeIndex: state.passageActiveSentenceIdx,
        getSlow: () => state.hwSlow,
        onSelectIndex: (idx) => {
          state.passageActiveSentenceIdx = idx;
          updateFloatingDock();
        },
        onTranslatePlay: (idx, lang, sent) => {
          const isNo = lang.startsWith("nb");
          AudioController.speak({
            key: `passage-tr-${idx}-${lang}`,
            text: isNo ? sent.nativeSummary : sent.englishSummary,
            languageCode: lang,
            slow: state.hwSlow,
            onBeforeFetch: async () => {
              const updated = await ensurePassageHydrated(session);
              const fresh = updated?.sentences?.[idx];
              return isNo ? fresh?.nativeSummary || "" : fresh?.englishSummary || "";
            },
          });
        },
      });

      activeDockController = {
        getCount: () => passage.sentences.length,
        getIndex: () => state.passageActiveSentenceIdx,
        setIndex: (i) => {
          state.passageActiveSentenceIdx = i;
        },
        getSlow: () => state.hwSlow,
        toggleSlow: () => {
          state.hwSlow = !state.hwSlow;
          updateFloatingDock();
        },
        playIndex: (i) => listCtrl.playSentenceFromList(i, true),
        keyPrefix: "passage",
      };
      updateFloatingDock();
      PrefetchManager.reset();
      const targetLang = state.profile?.targetLanguageCode || "pt-PT";
      PrefetchManager.enqueue(
        passage.sentences.slice(0, 3).map((s) => ({
          text: s.targetText,
          languageCode: targetLang,
          slow: state.hwSlow,
        })),
      );
      return;
    }

    // Exercise Stage
    passageStage.hidden = true;
    exerciseStage.hidden = !hasExercises;
    updateFloatingDock();

    if (!hasExercises) return;
    if (state.hwExerciseIndex >= session.exercises.length) {
      state.hwExerciseIndex = 0;
    }
    const ex = session.exercises[state.hwExerciseIndex];

    $("hw-question-badge").textContent = `Pergunta ${ex.label}`;
    $("hw-question-done-badge").hidden = ex.status !== "COMPLETED";
    $("hw-q-slow-toggle").setAttribute("aria-pressed", String(state.hwSlow));

    const questionSpans = renderKaraokeWords(
      $("hw-question-karaoke"),
      ex.promptTarget,
      ex.trickyWords || [],
    );

    // Rebind Question Audio buttons
    $("hw-q-listen-pt").onclick = () => {
      AudioController.speak({
        key: "hw-q-pt",
        text: ex.promptTarget,
        languageCode: state.profile?.targetLanguageCode || "pt-PT",
        slow: state.hwSlow,
        wordEls: questionSpans,
      });
    };

    $("hw-q-slow-toggle").onclick = () => {
      state.hwSlow = !state.hwSlow;
      $("hw-q-slow-toggle").setAttribute("aria-pressed", String(state.hwSlow));
    };

    $("hw-q-listen-no").onclick = () => {
      AudioController.speak({
        key: "hw-q-no",
        text: ex.promptNative || "",
        languageCode: state.profile?.nativeLanguageCode || "nb-NO",
        slow: state.hwSlow,
        onBeforeFetch: async () => {
          const fresh = await ensureExerciseHydrated(session, ex);
          return fresh.promptNative || "";
        },
      });
    };

    // Tricky words strip
    const trickyRow = $("hw-tricky-words");
    trickyRow.innerHTML = "";
    if (ex.trickyWords && ex.trickyWords.length > 0) {
      trickyRow.hidden = false;
      ex.trickyWords.forEach((tw) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tricky-chip";
        chip.innerHTML = `<span>🔊 ${tw.word}</span><small>(${tw.syllables})</small>`;
        chip.addEventListener("click", () => {
          showWordPopover(chip, tw);
          AudioController.speak({
            key: `word-${tw.word}`,
            text: tw.word,
            languageCode: state.profile?.targetLanguageCode || "pt-PT",
            slow: true,
          });
        });
        trickyRow.appendChild(chip);
      });
    } else {
      trickyRow.hidden = true;
    }

    // Audio-First Owl Helper Dock Flag Buttons (Português + Norsk only)
    $("hw-explain-pt").onclick = () => {
      AudioController.speak({
        key: "hw-explain-pt",
        text: ex.explanationTarget || "",
        languageCode: state.profile?.targetLanguageCode || "pt-PT",
        slow: state.hwSlow,
        onBeforeFetch: async () => {
          const fresh = await ensureExerciseHydrated(session, ex);
          return fresh.explanationTarget || "";
        },
      });
    };

    $("hw-explain-no").onclick = () => {
      AudioController.speak({
        key: "hw-explain-no",
        text: ex.explanationNative || "",
        languageCode: state.profile?.nativeLanguageCode || "nb-NO",
        slow: state.hwSlow,
      });
    };

    // Ping-Pong Chat Messages
    renderHomeworkChat(ex);

    // Polite background prefetch for instant PT & NO flag playback
    PrefetchManager.reset();
    const targetLang = state.profile?.targetLanguageCode || "pt-PT";
    const nativeLang = state.profile?.nativeLanguageCode || "nb-NO";
    const queueExerciseAudio = (freshEx) => {
      PrefetchManager.enqueue([
        { text: freshEx.promptTarget, languageCode: targetLang, slow: state.hwSlow },
        { text: freshEx.explanationNative, languageCode: nativeLang, slow: state.hwSlow },
        { text: freshEx.explanationTarget, languageCode: targetLang, slow: state.hwSlow },
        { text: freshEx.promptNative, languageCode: nativeLang, slow: state.hwSlow },
      ]);
    };
    if (!ex.promptNative || !ex.explanationTarget) {
      ensureExerciseHydrated(session, ex).then(queueExerciseAudio).catch(() => {});
    } else {
      queueExerciseAudio(ex);
    }
  }

  function renderHomeworkChat(ex) {
    const box = $("hw-chat-messages");
    box.innerHTML = "";
    const msgs = ex.messages || [];
    if (msgs.length === 0 && ex.openingQuestionNative) {
      appendChatBubble(box, { sender: "TUTOR", content: ex.openingQuestionNative });
    }
    msgs.forEach((m) => appendChatBubble(box, m));
    box.scrollTop = box.scrollHeight;
  }

  function appendChatBubble(container, msg) {
    const div = document.createElement("div");
    div.className = `chat-bubble ${msg.sender === "CHILD" ? "is-child" : "is-tutor"}`;
    const span = document.createElement("span");
    span.textContent = msg.content;
    div.appendChild(span);

    if (msg.sender !== "CHILD") {
      const speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "icon-btn";
      speakBtn.title = "Listen";
      speakBtn.textContent = "🔊";
      speakBtn.addEventListener("click", () => {
        AudioController.speak({
          key: `chat-${msg.id || Math.random()}`,
          text: msg.content,
          languageCode: state.profile?.nativeLanguageCode || "nb-NO",
          slow: state.hwSlow,
        });
      });
      div.appendChild(speakBtn);
    }
    container.appendChild(div);
  }

  // ======================================================
  // RENDER READ MODE
  // ======================================================
  function renderReadMode() {
    const emptyEl = $("read-empty-state");
    const progEl = $("read-progress-card");
    const errEl = $("read-error-card");
    const stageEl = $("read-stage");

    progEl.hidden = true;
    errEl.hidden = true;

    if (!state.readData || !state.readData.sentences?.length) {
      emptyEl.hidden = false;
      stageEl.hidden = true;
      updateFloatingDock();
      return;
    }

    emptyEl.hidden = true;
    stageEl.hidden = false;
    $("read-photo-btn").hidden = !state.readData.imageUrl;

    const sentences = state.readData.sentences;
    if (state.readActiveSentenceIdx >= sentences.length) {
      state.readActiveSentenceIdx = 0;
    }

    const listCtrl = renderKaraokeSentenceList({
      containerEl: $("read-sentences"),
      sentences,
      keyPrefix: "read",
      activeIndex: state.readActiveSentenceIdx,
      getSlow: () => state.readSlow,
      onSelectIndex: (idx) => {
        state.readActiveSentenceIdx = idx;
        updateFloatingDock();
      },
      onTranslatePlay: (idx, lang, sent) => {
        const isNo = lang.startsWith("nb");
        AudioController.speak({
          key: `read-tr-${idx}-${lang}`,
          text: (isNo ? sent.nativeSummary : sent.englishSummary) || sent.nativeSummary || "",
          languageCode: lang,
          slow: state.readSlow,
        });
      },
    });

    activeDockController = {
      getCount: () => sentences.length,
      getIndex: () => state.readActiveSentenceIdx,
      setIndex: (i) => {
        state.readActiveSentenceIdx = i;
      },
      getSlow: () => state.readSlow,
      toggleSlow: () => {
        state.readSlow = !state.readSlow;
        updateFloatingDock();
      },
      playIndex: (i) => listCtrl.playSentenceFromList(i, true),
      keyPrefix: "read",
    };

    updateFloatingDock();
    PrefetchManager.reset();
    const targetLang = state.profile?.targetLanguageCode || "pt-PT";
    PrefetchManager.enqueue(
      sentences.slice(0, 3).map((s) => ({
        text: s.targetText,
        languageCode: targetLang,
        slow: state.readSlow,
      })),
    );
  }

  // ======================================================
  // VISUAL RECENT PAGES DRAWER & MODALS
  // ======================================================
  function friendlyDate(iso) {
    try {
      const d = new Date(iso);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return "Hoje";
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return "Ontem";
      return d.toLocaleDateString("pt-PT", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  function renderPagesDrawer(filterText = "") {
    const list = $("pages-list");
    const searchWrap = $("pages-search-wrap");
    searchWrap.hidden = state.sessions.length < 5;

    const q = filterText.trim().toLowerCase();
    const visible = q
      ? state.sessions.filter((s) =>
          `${s.pageTitle} ${s.pageSummaryNative}`.toLowerCase().includes(q),
        )
      : state.sessions;

    list.innerHTML = "";
    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "settings-note";
      empty.textContent = "Ainda não há páginas guardadas.";
      list.appendChild(empty);
      return;
    }

    visible.forEach((sess) => {
      const card = document.createElement("div");
      card.className = `page-card-item${state.currentSession?.id === sess.id ? " is-active" : ""}`;

      const thumb = sess.imageUrl
        ? (() => {
            const img = document.createElement("img");
            img.className = "page-thumb";
            img.src = sess.imageUrl;
            img.alt = sess.pageTitle || "Página de TPC";
            return img;
          })()
        : (() => {
            const ph = document.createElement("div");
            ph.className = "page-thumb";
            ph.textContent = "📄";
            return ph;
          })();

      const meta = document.createElement("div");
      meta.className = "page-card-meta";
      const title = document.createElement("div");
      title.className = "page-card-title";
      title.textContent = sess.pageTitle || "Página de TPC";

      const sub = document.createElement("div");
      sub.className = "page-card-sub";
      const dateSpan = document.createElement("span");
      dateSpan.textContent = friendlyDate(sess.createdAt);
      sub.appendChild(dateSpan);

      if (sess.exercises && sess.exercises.length > 0) {
        const dots = document.createElement("span");
        dots.className = "progress-dots";
        sess.exercises.forEach((ex) => {
          const dot = document.createElement("i");
          if (ex.status === "COMPLETED") dot.classList.add("is-done");
          dots.appendChild(dot);
        });
        sub.appendChild(dots);
      }
      meta.append(title, sub);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.title = "Apagar página";
      delBtn.setAttribute("aria-label", "Apagar página");
      delBtn.textContent = "🗑️";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Apagar "${sess.pageTitle || "esta página"}"?`)) return;
        const res = await fetch(`/api/homework/sessions/${sess.id}`, { method: "DELETE" });
        if (res.ok) {
          state.sessions = state.sessions.filter((x) => x.id !== sess.id);
          if (state.currentSession?.id === sess.id) {
            state.currentSession = state.sessions[0] || null;
            if (state.currentSession) {
              const hasPassage = Boolean(state.currentSession.readingPassage?.sentences?.length);
              state.hwSubView = hasPassage ? "passage" : "exercise";
              state.hwExerciseIndex = 0;
            }
            renderHomeworkSession();
          }
          renderPagesDrawer($("pages-search-input").value);
          showToast("Página removida");
        }
      });

      card.append(thumb, meta, delBtn);
      card.addEventListener("click", () => {
        AudioController.stop();
        state.currentSession = sess;
        const hasPassage = Boolean(sess.readingPassage?.sentences?.length);
        state.hwSubView = hasPassage ? "passage" : "exercise";
        state.hwExerciseIndex = 0;
        state.passageActiveSentenceIdx = 0;
        $("pages-drawer").hidden = true;
        renderHomeworkSession();
      });

      list.appendChild(card);
    });
  }

  function renderProgressUI() {
    $("header-stars-count").textContent = String(state.progress.totalStars ?? 0);
    $("modal-stars-val").textContent = String(state.progress.totalStars ?? 0);
    $("modal-streak-val").textContent = String(state.progress.currentStreakDays ?? 0);
    $("modal-pages-val").textContent = String(state.progress.pagesReadCount ?? 0);

    const wordsEl = $("saved-words-list");
    wordsEl.innerHTML = "";
    const words = state.progress.savedWords || [];
    if (words.length === 0) {
      const p = document.createElement("p");
      p.className = "settings-note";
      p.textContent = "Completa exercícios ou páginas para guardar palavras difíceis aqui!";
      wordsEl.appendChild(p);
      return;
    }

    words.forEach((w) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tricky-chip";
      btn.textContent = `🔊 ${w.word}`;
      btn.addEventListener("click", () => {
        AudioController.speak({
          key: `saved-${w.word}`,
          text: w.word,
          languageCode: w.languageCode || state.profile?.targetLanguageCode || "pt-PT",
          slow: true,
        });
      });
      wordsEl.appendChild(btn);
    });
  }

  // ======================================================
  // DATA BOOT & UPLOAD HANDLERS
  // ======================================================
  async function loadInitialData() {
    const [profRes, progRes, sessRes] = await Promise.all([
      fetch("/api/profile").catch(() => null),
      fetch("/api/progress").catch(() => null),
      fetch("/api/homework/sessions").catch(() => null),
    ]);

    if (profRes && profRes.ok) {
      state.profile = await profRes.json();
    }
    if (progRes && progRes.ok) {
      state.progress = await progRes.json();
      renderProgressUI();
    }
    if (sessRes && sessRes.ok) {
      state.sessions = await sessRes.json();
      if (state.sessions.length > 0) {
        state.currentSession = state.sessions[0];
        const hasPassage = Boolean(state.currentSession.readingPassage?.sentences?.length);
        state.hwSubView = hasPassage ? "passage" : "exercise";
        state.hwExerciseIndex = 0;
      }
      renderHomeworkSession();
    }
  }

  async function handleHomeworkUpload(file) {
    if (!file || state.isUploading) return;
    state.isUploading = true;
    AudioController.stop();

    const thumbUrl = URL.createObjectURL(file);
    $("hw-progress-thumb").src = thumbUrl;
    $("hw-empty-state").hidden = true;
    $("hw-session-stage").hidden = true;
    $("hw-error-card").hidden = true;
    $("hw-progress-card").hidden = false;

    try {
      const prepared = await compressImageFile(file);
      const fd = new FormData();
      fd.append("image", prepared);
      const created = await uploadWithProgress("/api/homework/sessions/scan", fd, {
        fillEl: $("hw-progress-fill"),
        msgEl: $("hw-progress-msg"),
        messages: [
          "O Owly está a olhar para a tua página…",
          "A encontrar o texto e as perguntas…",
          "A preparar tudo para ti…",
        ],
      });

      state.sessions = [created, ...state.sessions.filter((s) => s.id !== created.id)];
      state.currentSession = created;
      const hasPassage = Boolean(created.readingPassage?.sentences?.length);
      state.hwSubView = hasPassage ? "passage" : "exercise";
      state.hwExerciseIndex = 0;
      state.passageActiveSentenceIdx = 0;
      renderHomeworkSession();
      showToast("Página pronta!");
    } catch (err) {
      if (err && err.isCancelled) {
        renderHomeworkSession();
      } else {
        $("hw-progress-card").hidden = true;
        $("hw-error-card").hidden = false;
        $("hw-error-raw").textContent = err?.message || "Erro desconhecido";
      }
    } finally {
      state.isUploading = false;
      URL.revokeObjectURL(thumbUrl);
    }
  }

  async function handleReadUpload(file) {
    if (!file || state.isUploading) return;
    state.isUploading = true;
    AudioController.stop();

    const thumbUrl = URL.createObjectURL(file);
    $("read-progress-thumb").src = thumbUrl;
    $("read-empty-state").hidden = true;
    $("read-stage").hidden = true;
    $("read-error-card").hidden = true;
    $("read-progress-card").hidden = false;

    try {
      const prepared = await compressImageFile(file);
      const fd = new FormData();
      fd.append("image", prepared);
      const scanned = await uploadWithProgress("/api/reading/scan", fd, {
        fillEl: $("read-progress-fill"),
        msgEl: $("read-progress-msg"),
        messages: [
          "O Owly está a ler a tua página…",
          "A dividir em frases para leitura…",
          "Quase pronto para ouvir…",
        ],
      });

      state.readData = scanned;
      state.readActiveSentenceIdx = 0;
      renderReadMode();
      showToast("Página do livro pronta!");
    } catch (err) {
      if (err && err.isCancelled) {
        renderReadMode();
      } else {
        $("read-progress-card").hidden = true;
        $("read-error-card").hidden = false;
        $("read-error-raw").textContent = err?.message || "Erro desconhecido";
      }
    } finally {
      state.isUploading = false;
      URL.revokeObjectURL(thumbUrl);
    }
  }

  // ======================================================
  // WIRING ALL DOM EVENTS
  // ======================================================
  function wireEvents() {
    // Tabs
    const switchTab = (tab) => {
      AudioController.stop();
      state.activeTab = tab;
      $("tab-homework").classList.toggle("is-active", tab === "homework");
      $("tab-homework").setAttribute("aria-selected", String(tab === "homework"));
      $("tab-read").classList.toggle("is-active", tab === "read");
      $("tab-read").setAttribute("aria-selected", String(tab === "read"));
      $("view-homework").hidden = tab !== "homework";
      $("view-read").hidden = tab !== "read";
      updateFloatingDock();
    };

    $("tab-homework").addEventListener("click", () => switchTab("homework"));
    $("tab-read").addEventListener("click", () => switchTab("read"));

    // Theme Toggle
    const syncThemeIcon = () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      $("theme-toggle-icon").textContent = isDark ? "☀️" : "🌙";
    };
    syncThemeIcon();

    $("theme-toggle").addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("socratic-theme", next);
      } catch {}
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", next === "dark" ? "#131620" : "#FAF7F2");
      syncThemeIcon();
    });

    // Homework Scan Triggers
    $("hw-camera-btn").addEventListener("click", () => $("hw-file-input").click());
    $("hw-new-btn").addEventListener("click", () => $("hw-file-input").click());
    $("hw-error-retry").addEventListener("click", () => $("hw-file-input").click());
    $("hw-error-dismiss").addEventListener("click", () => renderHomeworkSession());
    $("hw-file-input").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) handleHomeworkUpload(f);
    });
    $("hw-scan-cancel").addEventListener("click", () => {
      if (state.activeUploadXhr) state.activeUploadXhr.abort();
    });

    // Read Scan Triggers
    $("read-camera-btn").addEventListener("click", () => $("read-file-input").click());
    $("read-new-btn").addEventListener("click", () => $("read-file-input").click());
    $("read-error-retry").addEventListener("click", () => $("read-file-input").click());
    $("read-error-dismiss").addEventListener("click", () => renderReadMode());
    $("read-file-input").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) handleReadUpload(f);
    });
    $("read-scan-cancel").addEventListener("click", () => {
      if (state.activeUploadXhr) state.activeUploadXhr.abort();
    });

    // Floating Audio Dock Controls
    $("dock-slow-btn").addEventListener("click", () => {
      if (activeDockController) activeDockController.toggleSlow();
    });
    $("dock-play-btn").addEventListener("click", () => {
      if (!activeDockController) return;
      const keyNow = AudioController.getKey();
      const stateNow = AudioController.getState();
      const isMyKey = keyNow && keyNow.startsWith(`${activeDockController.keyPrefix}-`);
      if (isMyKey && stateNow === "playing") {
        AudioController.pause();
      } else if (isMyKey && stateNow === "paused") {
        AudioController.resume();
      } else {
        activeDockController.playIndex(activeDockController.getIndex());
      }
    });
    $("dock-stop-btn").addEventListener("click", () => AudioController.stop());
    $("dock-prev-btn").addEventListener("click", () => {
      if (!activeDockController) return;
      const nextIdx = Math.max(0, activeDockController.getIndex() - 1);
      activeDockController.playIndex(nextIdx);
    });
    $("dock-next-btn").addEventListener("click", () => {
      if (!activeDockController) return;
      const nextIdx = Math.min(activeDockController.getCount() - 1, activeDockController.getIndex() + 1);
      activeDockController.playIndex(nextIdx);
    });

    // Recent Pages Drawer
    const openPages = () => {
      renderPagesDrawer("");
      $("pages-drawer").hidden = false;
    };
    $("hw-pages-btn").addEventListener("click", openPages);
    $("hw-open-pages-empty").addEventListener("click", openPages);
    $("pages-close-btn").addEventListener("click", () => {
      $("pages-drawer").hidden = true;
    });
    $("pages-drawer").addEventListener("click", (e) => {
      if (e.target === $("pages-drawer")) $("pages-drawer").hidden = true;
    });
    $("pages-search-input").addEventListener("input", (e) => {
      renderPagesDrawer(e.target.value);
    });

    // Photo Lightbox
    const openPhoto = (url) => {
      if (!url) return;
      $("photo-modal-img").src = url;
      $("photo-modal").hidden = false;
    };
    $("hw-photo-btn").addEventListener("click", () => openPhoto(state.currentSession?.imageUrl));
    $("read-photo-btn").addEventListener("click", () => openPhoto(state.readData?.imageUrl));
    $("photo-close-btn").addEventListener("click", () => {
      $("photo-modal").hidden = true;
    });
    $("photo-modal").addEventListener("click", (e) => {
      if (e.target === $("photo-modal")) $("photo-modal").hidden = true;
    });

    // Stars Modal
    $("stars-pill").addEventListener("click", () => {
      renderProgressUI();
      $("stars-modal").hidden = false;
    });
    $("stars-close-btn").addEventListener("click", () => {
      $("stars-modal").hidden = true;
    });
    $("stars-modal").addEventListener("click", (e) => {
      if (e.target === $("stars-modal")) $("stars-modal").hidden = true;
    });

    // Parent Settings Modal
    $("settings-btn").addEventListener("click", () => {
      if (state.profile) {
        $("set-name").value = state.profile.name || "";
        $("set-age").value = String(state.profile.age || 8);
        $("set-target-code").value = state.profile.targetLanguageCode || "pt-PT";
        $("set-native-code").value = state.profile.nativeLanguageCode || "nb-NO";
        $("set-voice").value = state.profile.ttsVoiceName || "Sulafat";
        $("set-dialect").value = state.profile.dialectRules || "";
      }
      $("settings-modal").hidden = false;
    });
    $("settings-close-btn").addEventListener("click", () => {
      $("settings-modal").hidden = true;
    });
    $("settings-modal").addEventListener("click", (e) => {
      if (e.target === $("settings-modal")) $("settings-modal").hidden = true;
    });
    $("settings-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        name: $("set-name").value.trim(),
        age: Number($("set-age").value) || 8,
        targetLanguageCode: $("set-target-code").value.trim(),
        nativeLanguageCode: $("set-native-code").value.trim(),
        ttsVoiceName: $("set-voice").value.trim(),
        dialectRules: $("set-dialect").value.trim(),
      };
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        state.profile = await res.json();
        $("settings-modal").hidden = true;
        showToast("Definições guardadas!");
      } else {
        showToast("Não foi possível guardar");
      }
    });

    // Chat Drawer Toggle & Form
    $("hw-chat-toggle").addEventListener("click", () => {
      const drawer = $("hw-chat-drawer");
      const opening = drawer.hidden;
      drawer.hidden = !opening;
      $("hw-chat-toggle").setAttribute("aria-expanded", String(opening));
    });

    document.querySelectorAll(".quick-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $("hw-chat-input").value = chip.getAttribute("data-msg") || "";
        $("hw-chat-form").requestSubmit();
      });
    });

    $("hw-chat-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const session = state.currentSession;
      const ex = session?.exercises?.[state.hwExerciseIndex];
      const msgText = $("hw-chat-input").value.trim();
      if (!session || !ex || !msgText) return;

      $("hw-chat-input").value = "";
      ex.messages = ex.messages || [];
      ex.messages.push({ sender: "CHILD", content: msgText });
      renderHomeworkChat(ex);

      const res = await fetch(
        `/api/homework/sessions/${session.id}/exercises/${ex.id}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msgText }),
        },
      );
      if (res.ok) {
        const reply = await res.json();
        ex.status = reply.status;
        ex.messages.push({ sender: "TUTOR", content: reply.replyNative });
        renderHomeworkChat(ex);
        renderHomeworkStepper(session);
      }
    });

    // Celebrate / Complete Homework Exercise
    $("hw-complete-btn").addEventListener("click", async () => {
      const session = state.currentSession;
      const ex = session?.exercises?.[state.hwExerciseIndex];
      if (!session || !ex) return;

      AudioController.stop();
      setOwlState("celebrating");
      launchConfetti();

      const res = await fetch(
        `/api/homework/sessions/${session.id}/exercises/${ex.id}/complete`,
        { method: "POST" },
      );
      if (res.ok) {
        ex.status = "COMPLETED";
        const words = (ex.trickyWords || []).map((w) => w.word);
        const progRes = await fetch("/api/progress/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityType: "HOMEWORK",
            starsEarned: 2,
            trickyWords: words,
          }),
        });
        if (progRes.ok) {
          state.progress = await progRes.json();
          renderProgressUI();
        }
        showToast("⭐ +2 Estrelas! Muito bem!");
        const nextIdx = session.exercises.findIndex((item, i) => i > state.hwExerciseIndex && item.status !== "COMPLETED");
        if (nextIdx >= 0) {
          setTimeout(() => {
            state.hwExerciseIndex = nextIdx;
            renderHomeworkSession();
          }, 900);
        } else {
          renderHomeworkSession();
        }
      }
    });

    // Finish Read Page
    $("read-finish-btn").addEventListener("click", async () => {
      if (!state.readData) return;
      launchConfetti();
      const tricky = (state.readData.sentences || []).flatMap((s) =>
        (s.trickyWords || []).map((w) => w.word),
      );
      const res = await fetch("/api/progress/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "READING",
          starsEarned: 3,
          trickyWords: tricky.slice(0, 12),
        }),
      });
      if (res.ok) {
        state.progress = await res.json();
        renderProgressUI();
      }
      showToast("⭐ +3 Estrelas pela leitura!");
    });
  }

  // Boot
  hydrateIconsAndFlags();
  wireEvents();
  loadInitialData();
})();
