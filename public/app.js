(() => {
  "use strict";

  const SILENT_WAV_URI =
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  const READ_STORAGE_KEY = "socratic-read-page-v1";

  const OWL_SVG = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="60" cy="64" r="50" fill="#FEF0C7" fill-opacity="0.7"/>
    <path d="M42 99C42 95 46 93 49 95C51 93 54 95 54 99C54 101 42 101 42 99Z" fill="#D97706"/>
    <path d="M66 99C66 95 69 93 71 95C74 93 78 95 78 99C78 101 66 101 66 99Z" fill="#D97706"/>
    <path class="owl-wing owl-wing-l" d="M24 53C18 67 21 85 31 91C35 81 35 66 32 52Z" fill="#1D42A3"/>
    <path class="owl-wing owl-wing-r" d="M96 53C102 67 99 85 89 91C85 81 85 66 88 52Z" fill="#1D42A3"/>
    <path d="M28 40L38 20L50 35Z" fill="#2352C8"/>
    <path d="M92 40L82 20L70 35Z" fill="#2352C8"/>
    <ellipse cx="60" cy="65" rx="34" ry="36" fill="#2959D4"/>
    <ellipse cx="60" cy="79" rx="21" ry="18" fill="#FFF6E3"/>
    <path d="M49 75Q54 79 59 75M61 75Q66 79 71 75M53 84Q60 89 67 84" stroke="#D97706" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M60 65C51 69 31 67 31 51C31 40 41 35 50 39C54 41 58 45 60 49C62 45 66 41 70 39C79 35 89 40 89 51C89 67 69 69 60 65Z" fill="#EBF1FD"/>
    <circle cx="45" cy="52" r="12" fill="#FFFFFF"/>
    <circle cx="75" cy="52" r="12" fill="#FFFFFF"/>
    <path class="owl-brow-l" d="M34 42Q44 37 52 42" stroke="#173A94" stroke-width="2.4" stroke-linecap="round"/>
    <path class="owl-brow-r" d="M86 42Q76 37 68 42" stroke="#173A94" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="46" cy="53" r="5.6" fill="#1A1D24"/>
    <circle cx="74" cy="53" r="5.6" fill="#1A1D24"/>
    <circle cx="43.8" cy="50.2" r="2.1" fill="#FFFFFF"/>
    <circle cx="71.8" cy="50.2" r="2.1" fill="#FFFFFF"/>
    <g class="owl-glasses">
      <circle cx="45" cy="52" r="14" fill="#FFF6E3" fill-opacity="0.32" stroke="#D97706" stroke-width="2.4"/>
      <circle cx="75" cy="52" r="14" fill="#FFF6E3" fill-opacity="0.32" stroke="#D97706" stroke-width="2.4"/>
      <path d="M59 51H61" stroke="#D97706" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M29 50L31 51M91 50L89 51" stroke="#D97706" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    <path class="owl-beak-upper" d="M53 58H67L60 66Z" fill="#F59E0B"/>
    <path class="owl-beak-lower" d="M56 64H64L60 70Z" fill="#D97706"/>
  </svg>`;

  const ICONS = {
    pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
    bookOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5a2.5 2.5 0 0 1 2.5 2Z"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2.8 14.9 8.7 21.4 9.6 16.7 14.2 17.8 20.7 12 17.6 6.2 20.7 7.3 14.2 2.6 9.6 9.1 8.7 12 2.8"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11Z"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h2l1.6-2h4.8L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
    layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M8 5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1"/></svg>`,
    pagePlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M12 12v5M9.5 14.5h5"/></svg>`,
    document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5"/></svg>`,
    snail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18h14a4 4 0 0 0 4-4v-2"/><path d="M20 12l1.5-2.5M18 12l-1-2.5"/><path d="M11 18a5.5 5.5 0 1 0-5.5-5.5c0 2.5 1.8 4 3.5 4a2.2 2.2 0 0 0 2.2-2.2 1.4 1.4 0 0 0-1.4-1.4"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M9 12h.01M12 12h.01M15 12h.01"/></svg>`,
    speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7 5 19 12 7 19 7 5"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.8"/></svg>`,
    skipBack: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5v14"/><polygon points="18 6 9.5 12 18 18 18 6" fill="currentColor"/></svg>`,
    skipNext: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 5v14"/><polygon points="6 6 14.5 12 6 18 6 6" fill="currentColor"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5"/></svg>`,
    flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1.2 2.8 4.5 4.8 4.5 8.5a4.5 4.5 0 1 1-9 0c0-1.8.8-3.5 2-4.8.2 1.4 1 2.3 2 2.3-.5-2.1 0-4.2.5-6Z"/></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  };

  let flagClipSeq = 0;
  function renderFlagSvg(code) {
    const clipId = `fc-${code}-${++flagClipSeq}`;
    if (code === "pt") {
      return `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
        <defs><clipPath id="${clipId}"><rect width="28" height="20" rx="4"/></clipPath></defs>
        <g clip-path="url(#${clipId})">
          <rect width="28" height="20" fill="#DA291C"/>
          <rect width="11" height="20" fill="#046A38"/>
          <circle cx="11" cy="10" r="4.2" fill="#FFE900"/>
          <rect x="9.1" y="7.8" width="3.8" height="4.4" rx="1.1" fill="#FFFFFF" stroke="#DA291C" stroke-width="0.9"/>
        </g>
        <rect x="0.5" y="0.5" width="27" height="19" rx="3.5" fill="none" stroke="rgba(26,29,36,0.16)" stroke-width="1"/>
      </svg>`;
    }
    if (code === "no") {
      return `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
        <defs><clipPath id="${clipId}"><rect width="28" height="20" rx="4"/></clipPath></defs>
        <g clip-path="url(#${clipId})">
          <rect width="28" height="20" fill="#BA0C2F"/>
          <rect x="7" width="5" height="20" fill="#FFFFFF"/>
          <rect y="7.5" width="28" height="5" fill="#FFFFFF"/>
          <rect x="8.3" width="2.4" height="20" fill="#00205B"/>
          <rect y="8.8" width="28" height="2.4" fill="#00205B"/>
        </g>
        <rect x="0.5" y="0.5" width="27" height="19" rx="3.5" fill="none" stroke="rgba(26,29,36,0.16)" stroke-width="1"/>
      </svg>`;
    }
    return "";
  }

  function createIconEl(name, extraClass = "") {
    const span = document.createElement("span");
    span.className = extraClass ? `ui-icon ${extraClass}` : "ui-icon";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = ICONS[name] || "";
    return span;
  }

  const LANGUAGE_NAMES = {
    "pt-PT": "European Portuguese",
    "pt-BR": "Portuguese",
    "nb-NO": "Norwegian",
    "nn-NO": "Norwegian Nynorsk",
    "en-GB": "English",
    "en-US": "English",
  };

  function resolveLanguageName(code, existingCode, existingName, fallback) {
    if (existingName && code === existingCode) return existingName;
    return LANGUAGE_NAMES[code] || code || fallback;
  }

  function safeImageUrl(url) {
    if (typeof url !== "string") return "";
    if (url.startsWith("/api/uploads/") || url.startsWith("https://") || url.startsWith("blob:")) {
      return url;
    }
    return "";
  }

  const state = {
    activeTab: "homework", // "homework" | "read"
    profile: null,
    progress: { totalStars: 0, currentStreakDays: 0, pagesReadCount: 0, recentWords: [] },
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
    uploadCancelToken: null,
  };

  let isCompletingExercise = false;
  let isFinishingRead = false;
  let isSendingChat = false;
  let isSavingSettings = false;
  let completeAdvanceTimer = 0;
  let owlCelebrateTimer = 0;
  let chatMsgSeq = 0;

  const $ = (id) => document.getElementById(id);

  function getActiveTtsVoice() {
    return (state.profile?.ttsVoiceName || "Sulafat").trim() || "Sulafat";
  }

  function buildAudioCacheKey(languageCode, slow, text, voiceName = getActiveTtsVoice()) {
    return `${voiceName}|${languageCode}|${slow ? 1 : 0}|${text}`;
  }

  function isDockSentenceKey(key, prefix = "") {
    if (!key) return false;
    if (prefix) return key.startsWith(`${prefix}-`) && !key.startsWith(`${prefix}-tr-`);
    return (
      (key.startsWith("read-") && !key.startsWith("read-tr-")) ||
      (key.startsWith("passage-") && !key.startsWith("passage-tr-"))
    );
  }

  function saveReadState(data) {
    try {
      if (!data) {
        localStorage.removeItem(READ_STORAGE_KEY);
      } else {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(data));
      }
    } catch {}
  }

  function loadReadState() {
    try {
      const raw = localStorage.getItem(READ_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.sentences) ? parsed : null;
    } catch {
      return null;
    }
  }

  function hydrateIconsAndFlags() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      const name = el.getAttribute("data-icon");
      if (name && ICONS[name] && !el.innerHTML.trim()) {
        el.innerHTML = ICONS[name];
      }
    });
    document.querySelectorAll(".owl-svg-slot, .owl-dock-avatar, .owl-mini-slot").forEach((el) => {
      if (!el.innerHTML.trim()) el.innerHTML = OWL_SVG;
    });
    document.querySelectorAll(".flag-slot[data-flag]").forEach((el) => {
      const code = el.getAttribute("data-flag");
      if (code && !el.innerHTML.trim()) {
        el.innerHTML = renderFlagSvg(code);
      }
    });
  }

  function showToast(text, { icon = null } = {}) {
    const container = $("toast-container");
    if (!container) return;
    const pill = document.createElement("div");
    pill.className = "toast-pill";
    if (icon && ICONS[icon]) {
      pill.appendChild(createIconEl(icon, icon === "star" ? "ui-icon-star" : ""));
    }
    const span = document.createElement("span");
    span.textContent = text;
    pill.appendChild(span);
    container.appendChild(pill);
    setTimeout(() => {
      pill.remove();
    }, 2800);
  }

  function launchConfetti() {
    const layer = $("confetti-layer");
    if (!layer) return;
    const colors = ["#2352C8", "#D97706", "#1B7F4B", "#E05263", "#6B96FF"];
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

  function closeHomeworkChatDrawer() {
    const drawer = $("hw-chat-drawer");
    const toggle = $("hw-chat-toggle");
    const input = $("hw-chat-input");
    if (drawer) drawer.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    if (input) input.value = "";
  }

  // ======================================================
  // IMAGE COMPRESSION & UPLOAD WITH PROGRESS + CANCEL
  // ======================================================
  function setScanProgress(prefix, pct, msg) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const fillEl = $(`${prefix}-progress-fill`);
    if (fillEl) {
      fillEl.style.width = `${clamped}%`;
      fillEl.closest(".progress-track")?.setAttribute("aria-valuenow", String(clamped));
    }
    if (msg) {
      const msgEl = $(`${prefix}-progress-msg`);
      if (msgEl) msgEl.textContent = msg;
    }
  }

  function detectImageMeta(file) {
    const mime = (file?.type || "").toLowerCase();
    const ext = (file?.name || "").split(".").pop()?.toLowerCase() || "";
    const isHeic =
      mime === "image/heic" || mime === "image/heif" || ext === "heic" || ext === "heif";
    const isImage = mime
      ? mime.startsWith("image/")
      : /^(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/.test(ext);
    return { isImage, isHeic };
  }

  async function compressImageFile(file, cancelToken) {
    const { isImage, isHeic } = detectImageMeta(file);
    if (!file || !isImage) {
      return file;
    }
    if (cancelToken?.cancelled) {
      const err = new Error("CANCELLED");
      err.isCancelled = true;
      throw err;
    }

    let sourceWidth = 0;
    let sourceHeight = 0;
    let drawable = null;
    let bitmap = null;
    let objUrl = null;

    try {
      if (typeof createImageBitmap === "function") {
        try {
          bitmap = await createImageBitmap(file);
          drawable = bitmap;
          sourceWidth = bitmap.width;
          sourceHeight = bitmap.height;
        } catch {
          bitmap = null;
        }
      }

      if (!drawable) {
        objUrl = URL.createObjectURL(file);
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("decode failed"));
          image.src = objUrl;
        });
        drawable = img;
        sourceWidth = img.naturalWidth || img.width;
        sourceHeight = img.naturalHeight || img.height;
      }

      if (cancelToken?.cancelled) {
        const err = new Error("CANCELLED");
        err.isCancelled = true;
        throw err;
      }

      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight, 1));
      const w = Math.max(1, Math.round(sourceWidth * scale));
      const h = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(drawable, 0, 0, w, h);

      if (cancelToken?.cancelled) {
        const err = new Error("CANCELLED");
        err.isCancelled = true;
        throw err;
      }

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
      if (cancelToken?.cancelled) {
        const err = new Error("CANCELLED");
        err.isCancelled = true;
        throw err;
      }
      if (!blob || blob.size === 0) return file;
      const baseName = (file.name || "pagina").replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch (err) {
      if (err && err.isCancelled) throw err;
      if (isHeic) {
        throw new Error(
          "Este navegador não consegue abrir fotos HEIC. Escolhe uma foto JPG/PNG ou tira diretamente com a câmara.",
        );
      }
      return file;
    } finally {
      if (bitmap && typeof bitmap.close === "function") {
        try {
          bitmap.close();
        } catch {}
      }
      if (objUrl) {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {}
      }
    }
  }

  function uploadWithProgress(url, formData, { fillEl, msgEl, messages }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      state.activeUploadXhr = xhr;
      xhr.open("POST", url, true);
      xhr.timeout = 60000;

      const setBar = (pct) => {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        fillEl.style.width = `${clamped}%`;
        fillEl.closest(".progress-track")?.setAttribute("aria-valuenow", String(clamped));
      };

      let msgIdx = 0;
      let progressVal = 12;
      setBar(progressVal);
      msgEl.textContent = messages[0];

      const msgTimer = setInterval(() => {
        msgIdx = (msgIdx + 1) % messages.length;
        msgEl.textContent = messages[msgIdx];
        if (progressVal < 92) {
          progressVal = Math.min(92, progressVal + 7);
          setBar(progressVal);
        }
      }, 2200);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.round((ev.loaded / ev.total) * 44);
          progressVal = Math.max(progressVal, Math.min(48, pct));
          setBar(progressVal);
        }
      };

      const cleanup = () => {
        clearInterval(msgTimer);
        if (state.activeUploadXhr === xhr) state.activeUploadXhr = null;
      };

      xhr.onload = () => {
        cleanup();
        setBar(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Resposta inválida do servidor"));
          }
        } else {
          let detail = `O servidor devolveu o erro ${xhr.status}`;
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
        reject(new Error("Erro de rede ao enviar a foto"));
      };

      xhr.ontimeout = () => {
        cleanup();
        reject(new Error("O envio demorou demasiado tempo — tenta outra vez"));
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
    let activeBlobUrl = null;
    let restartActiveTick = null;
    const lruCache = new Map(); // cacheKey -> { buffer, contentType, trim }
    const persistentCachePromise =
      typeof caches !== "undefined" ? caches.open("socratic-audio-v1").catch(() => null) : Promise.resolve(null);

    function needsCtxResume(ctx) {
      return Boolean(ctx && (ctx.state === "suspended" || ctx.state === "interrupted"));
    }

    function revokeActiveBlobUrl() {
      if (activeBlobUrl) {
        try {
          URL.revokeObjectURL(activeBlobUrl);
        } catch {}
        activeBlobUrl = null;
      }
    }

    function ensureAudioCtx() {
      if (audioCtx) return audioCtx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
      audioCtx.onstatechange = () => {
        if (usingHtmlAudio || currentBrowserJob) return;
        if (currentState === "playing" && needsCtxResume(audioCtx) && activeSources.length > 0) {
          cancelAnimationFrame(rafId);
          setState(currentKey, "paused");
        } else if (currentState === "paused" && audioCtx.state === "running" && activeSources.length > 0) {
          setState(currentKey, "playing");
          restartActiveTick?.();
        }
      };
      return audioCtx;
    }

    // Warm speechSynthesis voices early & observe voiceschanged
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener?.("voiceschanged", () => {
          try {
            window.speechSynthesis.getVoices();
          } catch {}
        });
      } catch {}
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (!usingHtmlAudio && !currentBrowserJob && audioCtx && currentState === "playing" && needsCtxResume(audioCtx)) {
        audioCtx.resume().catch(() => {});
      } else if (usingHtmlAudio && currentState === "playing" && sharedAudio.paused) {
        cancelAnimationFrame(rafId);
        setState(currentKey, "paused");
      }
    });

    function unlockSync() {
      const ctx = ensureAudioCtx();
      if (ctx) {
        try {
          if (needsCtxResume(ctx)) {
            ctx.resume().catch(() => {});
          }
          const buf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
        } catch {}
      }
      if ("speechSynthesis" in window) {
        try {
          window.speechSynthesis.getVoices();
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

    function waitForSpeechVoices(timeoutMs = 250) {
      if (!("speechSynthesis" in window)) return Promise.resolve([]);
      const existing = window.speechSynthesis.getVoices() || [];
      if (existing.length > 0) return Promise.resolve(existing);
      return new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          try {
            window.speechSynthesis.removeEventListener?.("voiceschanged", done);
          } catch {}
          resolve(window.speechSynthesis.getVoices() || []);
        };
        try {
          window.speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
        } catch {}
        setTimeout(done, timeoutMs);
      });
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
      restartActiveTick = null;
      clearInterval(browserTimer);
      currentBrowserJob = null;
      stopActiveAudioNodes();
      usingHtmlAudio = false;
      try {
        sharedAudio.pause();
        sharedAudio.onended = null;
        sharedAudio.onerror = null;
        sharedAudio.removeAttribute("src");
      } catch {}
      revokeActiveBlobUrl();
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
        currentBrowserJob.wordOffset = Math.min(
          currentBrowserJob.currentWordOffset || 0,
          Math.max(0, currentBrowserJob.wordEls.length - 1),
        );
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
      if (!usingHtmlAudio && audioCtx) {
        cancelAnimationFrame(rafId);
        if (audioCtx.state === "running" || audioCtx.state === "interrupted") {
          audioCtx.suspend().catch(() => {});
        }
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
      if (!usingHtmlAudio && audioCtx) {
        if (needsCtxResume(audioCtx)) {
          audioCtx.resume().catch(() => {});
        }
        setState(currentKey, "playing");
        restartActiveTick?.();
        return;
      }
      const myRun = runId;
      try {
        sharedAudio.muted = false;
        setState(currentKey, "playing");
        restartActiveTick?.();
        const p = sharedAudio.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            if (myRun === runId) stop();
          });
        }
      } catch {
        stop();
      }
    }

    async function startBrowserUtterance(job) {
      if (!("speechSynthesis" in window)) {
        job.onDone?.();
        return;
      }
      if ((window.speechSynthesis.getVoices() || []).length === 0) {
        await waitForSpeechVoices(250);
      }
      if (job.myRunId !== runId || job.paused) return;

      try {
        window.speechSynthesis.cancel();
      } catch {}

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

      try {
        window.speechSynthesis.speak(utt);
      } catch {
        clearInterval(browserTimer);
        clearKaraokeClasses();
        currentBrowserJob = null;
        setState(null, "idle");
      }
    }

    function startBrowserFallback({ myRun, key, text, languageCode, slow, onEnded }) {
      if (myRun !== runId || !text) return;
      stopActiveAudioNodes();
      cancelAnimationFrame(rafId);
      restartActiveTick = null;
      usingHtmlAudio = false;
      if (!("speechSynthesis" in window)) {
        clearKaraokeClasses();
        setState(null, "idle");
        return;
      }
      setState(key, "playing");
      currentBrowserJob = {
        myRunId: myRun,
        text,
        languageCode,
        slow,
        wordEls: activeKaraokeEls,
        wordOffset: 0,
        currentWordOffset: 0,
        paused: false,
        onDone: onEnded,
      };
      startBrowserUtterance(currentBrowserJob);
    }

    async function playDecodedAudioBuffer({ myRun, key, cached, onEnded }) {
      const ctx = ensureAudioCtx();
      if (ctx) {
        try {
          if (needsCtxResume(ctx)) await ctx.resume();
          if (myRun !== runId) return true;
          const audioBuf = await ctx.decodeAudioData(cached.buffer.slice(0));
          if (myRun !== runId) return true;

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
            if (currentState === "playing") {
              rafId = requestAnimationFrame(tick);
            }
          };

          restartActiveTick = () => {
            cancelAnimationFrame(rafId);
            if (myRun === runId && activeKaraokeEls.length > 0 && currentState === "playing") {
              rafId = requestAnimationFrame(tick);
            }
          };

          src.onended = () => {
            if (myRun !== runId) return;
            cancelAnimationFrame(rafId);
            restartActiveTick = null;
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
          return true;
        } catch {}
      }

      // HTMLAudio fallback if Web Audio API decode unavailable
      usingHtmlAudio = true;
      revokeActiveBlobUrl();
      const blob = new Blob([cached.buffer], { type: cached.contentType || "audio/wav" });
      activeBlobUrl = URL.createObjectURL(blob);
      sharedAudio.muted = false;
      sharedAudio.src = activeBlobUrl;
      const wordWeights = activeKaraokeEls.length > 0 ? buildWordWeights(activeKaraokeEls) : [];
      let lastIdx = -1;

      const tickHtml = () => {
        if (myRun !== runId) return;
        if (!sharedAudio.paused && activeKaraokeEls.length > 0) {
          const dur =
            Number.isFinite(sharedAudio.duration) && sharedAudio.duration > 0 ? sharedAudio.duration : 1;
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

      restartActiveTick = () => {
        cancelAnimationFrame(rafId);
        if (myRun === runId && activeKaraokeEls.length > 0 && currentState === "playing") {
          rafId = requestAnimationFrame(tickHtml);
        }
      };

      sharedAudio.onended = () => {
        revokeActiveBlobUrl();
        restartActiveTick = null;
        if (myRun !== runId) return;
        cancelAnimationFrame(rafId);
        usingHtmlAudio = false;
        clearKaraokeClasses();
        setState(null, "idle");
        if (typeof onEnded === "function") onEnded();
      };
      sharedAudio.onerror = () => {
        revokeActiveBlobUrl();
        restartActiveTick = null;
        if (myRun !== runId) return;
        cancelAnimationFrame(rafId);
        usingHtmlAudio = false;
        clearKaraokeClasses();
        setState(null, "idle");
      };

      setState(key, "playing");
      try {
        await sharedAudio.play();
      } catch {
        revokeActiveBlobUrl();
        cancelAnimationFrame(rafId);
        restartActiveTick = null;
        usingHtmlAudio = false;
        sharedAudio.onended = null;
        sharedAudio.onerror = null;
        clearKaraokeClasses();
        setState(null, "idle");
        return false;
      }
      if (myRun === runId && activeKaraokeEls.length > 0) {
        rafId = requestAnimationFrame(tickHtml);
      }
      return true;
    }

    async function playStreamingPcmResponse({ res, myRun, key, cacheKey, resolvedText, slow, onEnded }) {
      const ctx = ensureAudioCtx();
      if (!ctx || !res.body) return false;
      if (needsCtxResume(ctx)) await ctx.resume();
      if (myRun !== runId) return true;

      const ct = res.headers.get("Content-Type") || "";
      const rateMatch = ct.match(/rate=(\d+)/i);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

      const reader = res.body.getReader();
      let leftover = null;
      let nextStartTime = 0;
      let streamStartedAt = 0;
      let stallGapSec = 0;
      let streamDone = false;
      let streamClosed = false;
      let finalized = false;
      let pendingNodes = 0;
      let totalPcmBytes = 0;
      const recordedChunks = [];
      activeSources = [];
      usingHtmlAudio = false;

      const wordWeights = activeKaraokeEls.length > 0 ? buildWordWeights(activeKaraokeEls) : [];
      const tokenUnits = wordWeights.length > 0 ? wordWeights.length : Math.max(1, resolvedText.split(/\s+/).length);
      const estDuration = Math.max(0.8, tokenUnits * (slow ? 0.56 : 0.36));
      let currentDenom = estDuration;
      let maxProgress = 0;
      let lastTickMs = performance.now();
      let lastIdx = -1;

      const finishStreamPlayback = () => {
        if (finalized || myRun !== runId) return;
        finalized = true;
        cancelAnimationFrame(rafId);
        restartActiveTick = null;
        activeSources = [];
        clearKaraokeClasses();
        setState(null, "idle");
        if (typeof onEnded === "function") onEnded();
      };

      const tickStream = () => {
        if (myRun !== runId) return;
        const nowMs = performance.now();
        const dt = Math.min(0.1, Math.max(0.008, (nowMs - lastTickMs) / 1000));
        lastTickMs = nowMs;

        if (streamStartedAt > 0 && ctx.state === "running" && activeKaraokeEls.length > 0) {
          const bufferedSec = totalPcmBytes / (sampleRate * 2);
          const rawElapsed = Math.max(0, ctx.currentTime - streamStartedAt - stallGapSec);
          const playedSec = Math.min(bufferedSec, rawElapsed);

          const targetDenom = streamDone
            ? Math.max(0.25, bufferedSec)
            : Math.max(estDuration, bufferedSec + 0.15);

          if (streamDone) {
            const remaining = Math.max(0.08, bufferedSec - playedSec);
            const alpha = Math.min(1, dt / Math.max(0.08, remaining * 0.45));
            currentDenom += (targetDenom - currentDenom) * alpha;
          } else {
            currentDenom += (targetDenom - currentDenom) * 0.12;
          }

          const rawProgress = Math.max(0, Math.min(1, playedSec / Math.max(0.25, currentDenom)));
          const progress = Math.max(maxProgress, rawProgress);
          maxProgress = progress;

          let idx = wordWeights.findIndex((w) => progress <= w.end);
          if (idx < 0) idx = wordWeights.length - 1;
          if (idx !== lastIdx) {
            lastIdx = idx;
            applyHighlightIndex(activeKaraokeEls, idx);
          }
        }

        if (
          streamClosed &&
          currentState === "playing" &&
          ctx.state === "running" &&
          ctx.currentTime >= nextStartTime + 0.06
        ) {
          finishStreamPlayback();
          return;
        }

        if (currentState === "playing") {
          rafId = requestAnimationFrame(tickStream);
        }
      };

      restartActiveTick = () => {
        cancelAnimationFrame(rafId);
        lastTickMs = performance.now();
        if (myRun === runId && currentState === "playing") {
          rafId = requestAnimationFrame(tickStream);
        }
      };

      let scheduledAny = false;

      try {
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
            lastTickMs = performance.now();
            setState(key, "playing");
            if (activeKaraokeEls.length > 0) rafId = requestAnimationFrame(tickStream);
          } else if (nextStartTime < now) {
            stallGapSec += now - nextStartTime;
            nextStartTime = now;
          }

          pendingNodes += 1;
          src.onended = () => {
            pendingNodes = Math.max(0, pendingNodes - 1);
            const idx = activeSources.indexOf(src);
            if (idx >= 0) activeSources.splice(idx, 1);
            try {
              src.disconnect();
            } catch {}
            if (myRun !== runId) return;
            if (streamClosed && pendingNodes === 0) {
              finishStreamPlayback();
            }
          };

          src.start(nextStartTime);
          nextStartTime += floatBuf.duration;
          activeSources.push(src);
        }
      } catch (err) {
        stopActiveAudioNodes();
        cancelAnimationFrame(rafId);
        restartActiveTick = null;
        reader.cancel().catch(() => {});
        throw err;
      }

      if (!scheduledAny) return false;

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

      streamClosed = true;
      if (
        pendingNodes === 0 ||
        (currentState === "playing" && ctx.state === "running" && ctx.currentTime >= nextStartTime + 0.02)
      ) {
        finishStreamPlayback();
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
      let resolvedTextForRun = "";

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
        resolvedTextForRun = resolvedText;

        const cacheKey = buildAudioCacheKey(languageCode, slow, resolvedText);
        const cached = await readPersistentCache(cacheKey);
        if (myRun !== runId) return;

        if (cached) {
          const played = await playDecodedAudioBuffer({ myRun, key, cached, onEnded });
          if (played || myRun !== runId) return;
        }

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
            const played = await playDecodedAudioBuffer({ myRun, key, cached: entry, onEnded });
            if (played || myRun !== runId) return;
          }
        }

        if (myRun !== runId) return;
        startBrowserFallback({ myRun, key, text: resolvedText, languageCode, slow, onEnded });
      } catch (err) {
        if (err && err.name === "AbortError") return;
        stopActiveAudioNodes();
        cancelAnimationFrame(rafId);
        restartActiveTick = null;
        if (myRun === runId && resolvedTextForRun) {
          startBrowserFallback({
            myRun,
            key,
            text: resolvedTextForRun,
            languageCode,
            slow,
            onEnded,
          });
          return;
        }
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
    const queuedKeys = new Set();
    let inFlightKey = null;
    let inFlightEpoch = 0;
    let running = false;
    let cooldownUntil = 0;

    function reset() {
      epoch += 1;
      queue = [];
      queuedKeys.clear();
      inFlightKey = null;
    }

    function enqueue(items) {
      const voice = getActiveTtsVoice();
      const defaultLang = state.profile?.targetLanguageCode || "pt-PT";
      let added = false;
      for (const it of items || []) {
        const text = it?.text?.trim();
        if (!text) continue;
        const languageCode = it.languageCode || defaultLang;
        const slow = Boolean(it.slow);
        const key = buildAudioCacheKey(languageCode, slow, text, voice);
        if (queuedKeys.has(key) || (key === inFlightKey && inFlightEpoch === epoch)) continue;
        queuedKeys.add(key);
        queue.push({ text, languageCode, slow, key, voice });
        added = true;
      }
      if (added && !running && Date.now() >= cooldownUntil) {
        processQueue();
      }
    }

    async function processQueue() {
      if (running) return;
      running = true;
      const myEpoch = epoch;
      try {
        while (queue.length > 0 && myEpoch === epoch) {
          if (Date.now() < cooldownUntil) break;
          const item = queue.shift();
          queuedKeys.delete(item.key);
          inFlightKey = item.key;
          inFlightEpoch = myEpoch;

          const already = await AudioController.readPersistentCache(item.key);
          if (myEpoch !== epoch) break;
          if (already) continue;

          try {
            const res = await fetch("/api/audio/speak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: item.text,
                languageCode: item.languageCode,
                slow: item.slow,
                prefetch: true,
              }),
            });
            if (myEpoch !== epoch) break;
            if (res.status === 429) {
              cooldownUntil = Date.now() + 25000;
              queue = [];
              queuedKeys.clear();
              break;
            }
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              if (myEpoch !== epoch) break;
              await AudioController.writePersistentCache(
                item.key,
                buffer,
                res.headers.get("Content-Type") || "audio/wav",
              );
              const isHit = res.headers.get("X-Audio-Cache") === "HIT";
              await new Promise((r) => setTimeout(r, isHit ? 80 : 1200));
            } else {
              await new Promise((r) => setTimeout(r, 800));
            }
          } catch {
            if (myEpoch !== epoch) break;
            await new Promise((r) => setTimeout(r, 1200));
          }
        }
      } finally {
        if (inFlightEpoch === myEpoch) {
          inFlightKey = null;
        }
        running = false;
        if (queue.length > 0 && Date.now() >= cooldownUntil) {
          processQueue();
        }
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

    // Sync per-sentence Play & Norwegian flag buttons
    document.querySelectorAll("[data-audio-key]").forEach((btn) => {
      const key = btn.getAttribute("data-audio-key");
      const isMatch = Boolean(key && activeKey === key);
      const isLoading = isMatch && audioState === "loading";
      const isPlaying = isMatch && audioState === "playing";
      const spinner = btn.querySelector(".btn-spinner");
      const eq = btn.querySelector(".eq-bars");
      const playIcon = btn.querySelector(".sentence-play-icon");
      btn.classList.toggle("is-playing", isPlaying);
      if (spinner) spinner.hidden = !isLoading;
      if (eq) eq.hidden = !isPlaying;
      if (playIcon) {
        playIcon.hidden = isLoading;
        playIcon.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
      }
    });

    // Sync Passage / Read "Ouvir Tudo" buttons
    const syncListenAllBtn = (btnId, prefix) => {
      const btn = $(btnId);
      if (!btn) return;
      const isMatch = isDockSentenceKey(activeKey, prefix);
      const isLoading = isMatch && audioState === "loading";
      const isPlaying = isMatch && audioState === "playing";
      const spinner = btn.querySelector(".btn-spinner");
      const eq = btn.querySelector(".eq-bars");
      const iconEl = btn.querySelector(".ui-icon");
      btn.classList.toggle("is-playing", isPlaying);
      if (spinner) spinner.hidden = !isLoading;
      if (eq) eq.hidden = !isPlaying;
      if (iconEl) {
        iconEl.hidden = isLoading;
        iconEl.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
      }
    };
    syncListenAllBtn("hw-passage-listen-all", "passage");
    syncListenAllBtn("read-listen-all", "read");

    // Sync editorial sentence-list dimming
    const passageList = $("hw-passage-sentences");
    if (passageList) {
      passageList.classList.toggle(
        "has-playing",
        isDockSentenceKey(activeKey, "passage") && (audioState === "playing" || audioState === "loading"),
      );
    }
    const readList = $("read-sentences");
    if (readList) {
      readList.classList.toggle(
        "has-playing",
        isDockSentenceKey(activeKey, "read") && (audioState === "playing" || audioState === "loading"),
      );
    }

    // Sync floating glass dock (only sentence keys, never *-tr-*)
    const dock = $("floating-audio-dock");
    if (dock && !dock.hidden) {
      const isDockActive = isDockSentenceKey(activeKey);
      const dockPlayIcon = $("dock-play-icon");
      const dockBtn = $("dock-play-btn");
      const dockSpinner = dockBtn?.querySelector(".btn-spinner");
      if (dockSpinner) dockSpinner.hidden = !(isDockActive && audioState === "loading");
      if (dockPlayIcon) {
        dockPlayIcon.hidden = Boolean(isDockActive && audioState === "loading");
        dockPlayIcon.innerHTML = isDockActive && audioState === "playing" ? ICONS.pause : ICONS.play;
      }
    }
  }

  // ======================================================
  // KARAOKE TOKEN RENDERING & WORD POPOVER
  // ======================================================
  let popoverTimer = 0;

  function dismissWordPopover() {
    clearTimeout(popoverTimer);
    const pop = $("word-popover");
    if (pop) pop.hidden = true;
  }

  function showWordPopover(wordEl, hint) {
    const pop = $("word-popover");
    if (!pop) return;
    $("word-popover-syllables").textContent = hint.syllables || hint.word;
    $("word-popover-hint").textContent = hint.nativeHint || "";

    pop.style.visibility = "hidden";
    pop.hidden = false;

    const rect = wordEl.getBoundingClientRect();
    const popW = pop.offsetWidth || 180;
    const popH = pop.offsetHeight || 56;
    const left = Math.max(12, Math.min(window.innerWidth - popW - 12, rect.left + rect.width / 2 - popW / 2));
    const wordCenterX = rect.left + rect.width / 2;
    const caretX = Math.max(14, Math.min(popW - 14, wordCenterX - left));

    pop.style.left = `${left}px`;
    pop.style.setProperty("--caret-x", `${caretX}px`);

    const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom || 58;
    const minTop = Math.max(68, Math.ceil(headerBottom + 8));
    const topAbove = rect.top - popH - 10;
    if (topAbove < minTop) {
      pop.dataset.placement = "bottom";
      const maxTop = Math.max(12, window.innerHeight - popH - 12);
      pop.style.top = `${Math.min(maxTop, Math.max(minTop, rect.bottom + 10))}px`;
    } else {
      pop.dataset.placement = "top";
      pop.style.top = `${topAbove}px`;
    }
    pop.style.visibility = "";

    clearTimeout(popoverTimer);
    popoverTimer = setTimeout(() => {
      pop.hidden = true;
    }, 3500);
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
    const nativeLang = state.profile?.nativeLanguageCode || "nb-NO";

    sentences.forEach((sent, idx) => {
      const row = document.createElement("div");
      row.className = `sentence-row${idx === activeIndex ? " is-active" : ""}`;
      row.setAttribute("data-idx", String(idx));

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "sentence-play-btn";
      playBtn.setAttribute("data-audio-key", `${keyPrefix}-${idx}`);
      playBtn.setAttribute("aria-label", `Ouvir frase ${idx + 1}`);
      playBtn.title = `Ouvir frase ${idx + 1}`;
      const playIcon = document.createElement("span");
      playIcon.className = "sentence-play-icon";
      playIcon.setAttribute("aria-hidden", "true");
      playIcon.innerHTML = ICONS.play;
      const playSpinner = document.createElement("span");
      playSpinner.className = "btn-spinner";
      playSpinner.hidden = true;
      const playEq = document.createElement("span");
      playEq.className = "eq-bars";
      playEq.hidden = true;
      playEq.innerHTML = "<i></i><i></i><i></i>";
      playBtn.append(playIcon, playSpinner, playEq);

      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = `${keyPrefix}-${idx}`;
        const curKey = AudioController.getKey();
        const curState = AudioController.getState();
        if (curKey === key && curState === "playing") {
          AudioController.pause();
        } else if (curKey === key && curState === "paused") {
          AudioController.resume();
        } else {
          onSelectIndex(idx);
          playSentenceFromList(idx, true);
        }
      });

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
      noBtn.setAttribute("data-audio-key", `${keyPrefix}-tr-${idx}-${nativeLang}`);
      const noFlagSlot = document.createElement("span");
      noFlagSlot.className = "flag-slot";
      noFlagSlot.setAttribute("data-flag", "no");
      noFlagSlot.innerHTML = renderFlagSvg("no");
      const noSpinner = document.createElement("span");
      noSpinner.className = "btn-spinner";
      noSpinner.hidden = true;
      const noEq = document.createElement("span");
      noEq.className = "eq-bars";
      noEq.hidden = true;
      noEq.innerHTML = "<i></i><i></i><i></i>";
      noBtn.append(noFlagSlot, noSpinner, noEq);

      noBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectIndex(idx);
        onTranslatePlay(idx, nativeLang, sent);
      });

      flagsWrap.append(noBtn);
      row.append(playBtn, textEl, flagsWrap);
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
      document.body.classList.remove("has-floating-dock");
      activeDockController = null;
      syncAudioButtonsUI();
      return;
    }

    dock.hidden = false;
    document.body.classList.add("has-floating-dock");
    const isPassage = showForHomeworkPassage;
    const sentences = isPassage
      ? state.currentSession.readingPassage.sentences
      : state.readData.sentences;
    const idx = isPassage ? state.passageActiveSentenceIdx : state.readActiveSentenceIdx;
    const slow = isPassage ? state.hwSlow : state.readSlow;

    $("dock-slow-btn").setAttribute("aria-pressed", String(slow));
    $("dock-status-label").textContent = `${idx + 1} / ${sentences.length}`;
    const prevBtn = $("dock-prev-btn");
    const nextBtn = $("dock-next-btn");
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= sentences.length - 1;
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
      const label = document.createElement("span");
      label.textContent = "Texto";
      pBtn.append(createIconEl("bookOpen"), label);
      pBtn.addEventListener("click", () => {
        clearTimeout(completeAdvanceTimer);
        AudioController.stop();
        dismissWordPopover();
        closeHomeworkChatDrawer();
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
      const lbl = document.createElement("span");
      lbl.textContent = ex.label;
      btn.appendChild(lbl);
      if (isDone) btn.appendChild(createIconEl("check"));
      btn.addEventListener("click", () => {
        clearTimeout(completeAdvanceTimer);
        AudioController.stop();
        dismissWordPopover();
        closeHomeworkChatDrawer();
        state.hwSubView = "exercise";
        state.hwExerciseIndex = idx;
        renderHomeworkSession();
      });
      bar.appendChild(btn);
    });
  }

  async function ensurePassageHydrated(session) {
    if (!session?.readingPassage) return session?.readingPassage;
    const needs = session.readingPassage.sentences.some((s) => !s.nativeSummary?.trim());
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
    if (exercise.promptNative && exercise.explanationTarget) {
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
    const emptySessionCard = $("hw-empty-session-card");

    progEl.hidden = true;
    errEl.hidden = true;

    if (!session) {
      emptyEl.hidden = false;
      stageEl.hidden = true;
      if (emptySessionCard) emptySessionCard.hidden = true;
      $("hw-open-pages-empty").hidden = state.sessions.length === 0;
      updateFloatingDock();
      return;
    }

    emptyEl.hidden = true;
    stageEl.hidden = false;
    $("hw-page-title").textContent = session.pageTitle || "Página de TPC";
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
    if (emptySessionCard) emptySessionCard.hidden = hasPassage || hasExercises;

    if (!hasPassage && !hasExercises) {
      passageStage.hidden = true;
      exerciseStage.hidden = true;
      updateFloatingDock();
      return;
    }

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
          AudioController.speak({
            key: `passage-tr-${idx}-${lang}`,
            text: sent.nativeSummary || "",
            languageCode: lang,
            slow: state.hwSlow,
            onBeforeFetch: async () => {
              const updated = await ensurePassageHydrated(session);
              const fresh = updated?.sentences?.[idx];
              return fresh?.nativeSummary || "";
            },
          });
        },
      });

      const listenAllBtn = $("hw-passage-listen-all");
      if (listenAllBtn) {
        listenAllBtn.onclick = () => {
          const curKey = AudioController.getKey();
          const curState = AudioController.getState();
          if (isDockSentenceKey(curKey, "passage") && curState === "playing") {
            AudioController.pause();
          } else if (isDockSentenceKey(curKey, "passage") && curState === "paused") {
            AudioController.resume();
          } else {
            listCtrl.playSentenceFromList(0, true);
          }
        };
      }

      const nextQuestionsBtn = $("hw-passage-next-questions");
      if (nextQuestionsBtn) {
        nextQuestionsBtn.hidden = !hasExercises;
        nextQuestionsBtn.onclick = () => {
          clearTimeout(completeAdvanceTimer);
          AudioController.stop();
          dismissWordPopover();
          closeHomeworkChatDrawer();
          state.hwSubView = "exercise";
          state.hwExerciseIndex = 0;
          renderHomeworkSession();
          $("hw-exercise-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      }

      activeDockController = {
        getCount: () => passage.sentences.length,
        getIndex: () => state.passageActiveSentenceIdx,
        setIndex: (i) => {
          state.passageActiveSentenceIdx = i;
        },
        getSlow: () => state.hwSlow,
        toggleSlow: () => {
          const wasDockActive = isDockSentenceKey(AudioController.getKey(), "passage");
          const prevState = AudioController.getState();
          state.hwSlow = !state.hwSlow;
          updateFloatingDock();

          const idx = state.passageActiveSentenceIdx;
          const targetLang = state.profile?.targetLanguageCode || "pt-PT";
          PrefetchManager.reset();
          PrefetchManager.enqueue(
            passage.sentences.slice(idx, idx + 3).map((s) => ({
              text: s.targetText,
              languageCode: targetLang,
              slow: state.hwSlow,
            })),
          );

          if (wasDockActive && (prevState === "playing" || prevState === "loading")) {
            AudioController.stop();
            listCtrl.playSentenceFromList(idx, true);
          } else if (wasDockActive && prevState === "paused") {
            AudioController.stop();
          }
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

    const completeBtn = $("hw-complete-btn");
    if (completeBtn) {
      const isDone = ex.status === "COMPLETED";
      completeBtn.disabled = isDone || isCompletingExercise;
      completeBtn.classList.toggle("is-completed", isDone);
      const lblSpan = completeBtn.querySelector("span:last-child");
      if (lblSpan) lblSpan.textContent = isDone ? "Pergunta concluída" : "Já acabei!";
    }

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

    // Tricky words strip (XSS-safe DOM construction)
    const trickyRow = $("hw-tricky-words");
    trickyRow.innerHTML = "";
    if (ex.trickyWords && ex.trickyWords.length > 0) {
      trickyRow.hidden = false;
      ex.trickyWords.forEach((tw) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tricky-chip";
        const wordSpan = document.createElement("span");
        wordSpan.textContent = tw.word;
        chip.append(createIconEl("speaker"), wordSpan);
        if (tw.syllables) {
          const sylEl = document.createElement("small");
          sylEl.textContent = `(${tw.syllables})`;
          chip.appendChild(sylEl);
        }
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
    if (ex.openingQuestionNative) {
      appendChatBubble(box, {
        id: `opening-${ex.id}`,
        sender: "TUTOR",
        content: ex.openingQuestionNative,
      });
    }
    msgs.forEach((m) => appendChatBubble(box, m));
    box.scrollTop = box.scrollHeight;
  }

  function appendChatBubble(container, msg) {
    const div = document.createElement("div");
    div.className = `chat-bubble ${msg.sender === "CHILD" ? "is-child" : "is-tutor"}`;
    const body = document.createElement("div");
    body.className = "chat-bubble-body";

    const span = document.createElement("span");
    span.className = "chat-bubble-text";
    span.textContent = msg.content;
    body.appendChild(span);

    if (msg.sender !== "CHILD" && msg.targetPhrase) {
      const targetBtn = document.createElement("button");
      targetBtn.type = "button";
      targetBtn.className = "chat-target-chip";
      const flagSpan = document.createElement("span");
      flagSpan.className = "flag-slot flag-slot-xs";
      flagSpan.innerHTML = renderFlagSvg("pt");
      const phraseSpan = document.createElement("span");
      phraseSpan.textContent = msg.targetPhrase;
      targetBtn.append(flagSpan, phraseSpan);
      targetBtn.addEventListener("click", () => {
        AudioController.speak({
          key: `chat-pt-${msg.id || msg.targetPhrase}`,
          text: msg.targetPhrase,
          languageCode: state.profile?.targetLanguageCode || "pt-PT",
          slow: state.hwSlow,
        });
      });
      body.appendChild(targetBtn);
    }

    if (msg.sender !== "CHILD" && msg.followUpQuestionNative) {
      const followUp = document.createElement("p");
      followUp.className = "chat-followup-text";
      followUp.textContent = msg.followUpQuestionNative;
      body.appendChild(followUp);
    }

    div.appendChild(body);

    if (msg.sender !== "CHILD") {
      const speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "icon-btn";
      speakBtn.title = "Ouvir";
      speakBtn.setAttribute("aria-label", "Ouvir resposta");
      speakBtn.appendChild(createIconEl("speaker"));
      const msgKey = msg.id || `msg-${++chatMsgSeq}`;
      const spokenText = [msg.content, msg.followUpQuestionNative].filter(Boolean).join(". ");
      speakBtn.addEventListener("click", () => {
        AudioController.speak({
          key: `chat-${msgKey}`,
          text: spokenText,
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

    const finishBtn = $("read-finish-btn");
    if (finishBtn) {
      const done = Boolean(state.readData._completed);
      finishBtn.disabled = done || isFinishingRead;
      const lbl = finishBtn.querySelector("span:last-child");
      if (lbl) lbl.textContent = done ? "Concluída" : "Concluir";
    }

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
        AudioController.speak({
          key: `read-tr-${idx}-${lang}`,
          text: sent.nativeSummary || "",
          languageCode: lang,
          slow: state.readSlow,
        });
      },
    });

    const readListenAllBtn = $("read-listen-all");
    if (readListenAllBtn) {
      readListenAllBtn.onclick = () => {
        const curKey = AudioController.getKey();
        const curState = AudioController.getState();
        if (isDockSentenceKey(curKey, "read") && curState === "playing") {
          AudioController.pause();
        } else if (isDockSentenceKey(curKey, "read") && curState === "paused") {
          AudioController.resume();
        } else {
          listCtrl.playSentenceFromList(0, true);
        }
      };
    }

    activeDockController = {
      getCount: () => sentences.length,
      getIndex: () => state.readActiveSentenceIdx,
      setIndex: (i) => {
        state.readActiveSentenceIdx = i;
      },
      getSlow: () => state.readSlow,
      toggleSlow: () => {
        const wasDockActive = isDockSentenceKey(AudioController.getKey(), "read");
        const prevState = AudioController.getState();
        state.readSlow = !state.readSlow;
        updateFloatingDock();

        const idx = state.readActiveSentenceIdx;
        const targetLang = state.profile?.targetLanguageCode || "pt-PT";
        PrefetchManager.reset();
        PrefetchManager.enqueue(
          sentences.slice(idx, idx + 3).map((s) => ({
            text: s.targetText,
            languageCode: targetLang,
            slow: state.readSlow,
          })),
        );

        if (wasDockActive && (prevState === "playing" || prevState === "loading")) {
          AudioController.stop();
          listCtrl.playSentenceFromList(idx, true);
        } else if (wasDockActive && prevState === "paused") {
          AudioController.stop();
        }
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

      const safeThumbUrl = safeImageUrl(sess.imageUrl);
      const thumb = safeThumbUrl
        ? (() => {
            const img = document.createElement("img");
            img.className = "page-thumb";
            img.src = safeThumbUrl;
            img.alt = sess.pageTitle || "Página de TPC";
            return img;
          })()
        : (() => {
            const ph = document.createElement("div");
            ph.className = "page-thumb";
            ph.appendChild(createIconEl("document"));
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
      delBtn.className = "icon-btn page-delete-btn";
      delBtn.title = "Apagar página";
      delBtn.setAttribute("aria-label", "Apagar página");
      delBtn.appendChild(createIconEl("trash"));

      let confirmResetTimer = 0;
      const resetDeleteBtn = () => {
        clearTimeout(confirmResetTimer);
        delete delBtn.dataset.confirming;
        delBtn.classList.remove("is-confirming");
        delBtn.disabled = false;
        delBtn.setAttribute("aria-label", "Apagar página");
        delBtn.replaceChildren(createIconEl("trash"));
      };

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (delBtn.dataset.confirming !== "1") {
          delBtn.dataset.confirming = "1";
          delBtn.classList.add("is-confirming");
          delBtn.setAttribute("aria-label", "Confirmar apagar página");
          delBtn.textContent = "Confirmar?";
          confirmResetTimer = setTimeout(resetDeleteBtn, 3200);
          return;
        }

        clearTimeout(confirmResetTimer);
        delBtn.disabled = true;
        try {
          const res = await fetch(`/api/homework/sessions/${sess.id}`, { method: "DELETE" });
          if (res.ok) {
            state.sessions = state.sessions.filter((x) => x.id !== sess.id);
            if (state.currentSession?.id === sess.id) {
              clearTimeout(completeAdvanceTimer);
              closeHomeworkChatDrawer();
              state.currentSession = state.sessions[0] || null;
              if (state.currentSession) {
                const hasPassage = Boolean(state.currentSession.readingPassage?.sentences?.length);
                state.hwSubView = hasPassage ? "passage" : "exercise";
                state.hwExerciseIndex = 0;
                state.passageActiveSentenceIdx = 0;
              }
              renderHomeworkSession();
            }
            renderPagesDrawer($("pages-search-input").value);
            showToast("Página removida");
          } else {
            resetDeleteBtn();
            showToast("Não foi possível apagar a página.");
          }
        } catch {
          resetDeleteBtn();
          showToast("Não foi possível apagar a página.");
        }
      });

      card.append(thumb, meta, delBtn);
      card.addEventListener("click", () => {
        clearTimeout(completeAdvanceTimer);
        AudioController.stop();
        dismissWordPopover();
        closeHomeworkChatDrawer();
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
    const words = state.progress.recentWords || state.progress.savedWords || [];
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
      const wordSpan = document.createElement("span");
      wordSpan.textContent = w.word;
      btn.append(createIconEl("speaker"), wordSpan);
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
    const savedRead = loadReadState();
    if (savedRead) {
      state.readData = savedRead;
      renderReadMode();
    }

    const [profRes, progRes, sessRes] = await Promise.all([
      fetch("/api/profile").catch(() => null),
      fetch("/api/progress").catch(() => null),
      fetch("/api/homework/sessions").catch(() => null),
    ]);

    let hadBootError = false;

    if (profRes && profRes.ok) {
      state.profile = await profRes.json();
    } else {
      hadBootError = true;
    }

    if (progRes && progRes.ok) {
      state.progress = await progRes.json();
      renderProgressUI();
    } else {
      hadBootError = true;
    }

    if (sessRes && sessRes.ok) {
      state.sessions = await sessRes.json();
      if (state.sessions.length > 0) {
        state.currentSession = state.sessions[0];
        const hasPassage = Boolean(state.currentSession.readingPassage?.sentences?.length);
        state.hwSubView = hasPassage ? "passage" : "exercise";
        state.hwExerciseIndex = 0;
      }
    } else {
      hadBootError = true;
    }

    const bootBanner = $("boot-error-banner");
    if (bootBanner) bootBanner.hidden = !hadBootError;

    renderHomeworkSession();
    renderReadMode();
  }

  async function handleHomeworkUpload(file) {
    if (!file || state.isUploading) return;
    state.isUploading = true;
    clearTimeout(completeAdvanceTimer);
    AudioController.stop();
    dismissWordPopover();
    closeHomeworkChatDrawer();

    const cancelToken = { cancelled: false };
    state.uploadCancelToken = cancelToken;

    const thumbUrl = URL.createObjectURL(file);
    $("hw-progress-thumb").src = thumbUrl;
    $("hw-empty-state").hidden = true;
    $("hw-session-stage").hidden = true;
    $("hw-error-card").hidden = true;
    $("hw-progress-card").hidden = false;
    setScanProgress("hw", 8, "A preparar a foto…");

    try {
      const prepared = await compressImageFile(file, cancelToken);
      if (cancelToken.cancelled) {
        const err = new Error("CANCELLED");
        err.isCancelled = true;
        throw err;
      }
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
      if (state.uploadCancelToken === cancelToken) state.uploadCancelToken = null;
      URL.revokeObjectURL(thumbUrl);
    }
  }

  async function handleReadUpload(file) {
    if (!file || state.isUploading) return;
    state.isUploading = true;
    AudioController.stop();
    dismissWordPopover();

    const cancelToken = { cancelled: false };
    state.uploadCancelToken = cancelToken;

    const thumbUrl = URL.createObjectURL(file);
    $("read-progress-thumb").src = thumbUrl;
    $("read-empty-state").hidden = true;
    $("read-stage").hidden = true;
    $("read-error-card").hidden = true;
    $("read-progress-card").hidden = false;
    setScanProgress("read", 8, "A preparar a foto…");

    try {
      const prepared = await compressImageFile(file, cancelToken);
      if (cancelToken.cancelled) {
        const err = new Error("CANCELLED");
        err.isCancelled = true;
        throw err;
      }
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

      scanned._completed = false;
      state.readData = scanned;
      saveReadState(scanned);
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
      if (state.uploadCancelToken === cancelToken) state.uploadCancelToken = null;
      URL.revokeObjectURL(thumbUrl);
    }
  }

  // ======================================================
  // WIRING ALL DOM EVENTS
  // ======================================================
  function wireEvents() {
    // Dismiss word popover when tapping outside
    document.addEventListener("pointerdown", (e) => {
      const pop = $("word-popover");
      if (pop && !pop.hidden && !e.target.closest(".karaoke-word, .tricky-chip, #word-popover")) {
        dismissWordPopover();
      }
    });

    // Boot Retry
    $("boot-retry-btn")?.addEventListener("click", () => {
      const banner = $("boot-error-banner");
      if (banner) banner.hidden = true;
      loadInitialData();
    });

    // Tabs
    const switchTab = (tab) => {
      clearTimeout(completeAdvanceTimer);
      AudioController.stop();
      dismissWordPopover();
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
      $("theme-toggle-icon").innerHTML = isDark ? ICONS.sun : ICONS.moon;
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
      if (meta) meta.setAttribute("content", next === "dark" ? "#12151C" : "#FAF7F0");
      syncThemeIcon();
    });

    // Homework Scan Triggers
    $("hw-camera-btn").addEventListener("click", () => $("hw-file-input").click());
    $("hw-new-btn").addEventListener("click", () => $("hw-file-input").click());
    $("hw-error-retry").addEventListener("click", () => $("hw-file-input").click());
    $("hw-empty-session-retry")?.addEventListener("click", () => $("hw-file-input").click());
    $("hw-error-dismiss").addEventListener("click", () => renderHomeworkSession());
    $("hw-file-input").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) handleHomeworkUpload(f);
    });
    $("hw-scan-cancel").addEventListener("click", () => {
      if (state.uploadCancelToken) state.uploadCancelToken.cancelled = true;
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
      if (state.uploadCancelToken) state.uploadCancelToken.cancelled = true;
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
      const isMyKey = isDockSentenceKey(keyNow, activeDockController.keyPrefix);
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
      const cur = activeDockController.getIndex();
      if (cur <= 0) return;
      activeDockController.playIndex(cur - 1);
    });
    $("dock-next-btn").addEventListener("click", () => {
      if (!activeDockController) return;
      const cur = activeDockController.getIndex();
      if (cur >= activeDockController.getCount() - 1) return;
      activeDockController.playIndex(cur + 1);
    });

    // Recent Pages Drawer
    const openPages = () => {
      dismissWordPopover();
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
      const safe = safeImageUrl(url);
      if (!safe) return;
      dismissWordPopover();
      $("photo-modal-img").src = safe;
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
      dismissWordPopover();
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
      dismissWordPopover();
      const errEl = $("settings-error");
      const hintEl = $("settings-voice-hint");
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (hintEl) {
        hintEl.hidden = true;
        hintEl.textContent = "";
      }
      if (state.profile) {
        $("set-name").value = state.profile.name || "";
        $("set-age").value = String(state.profile.age || 8);
        $("set-target-code").value = state.profile.targetLanguageCode || "pt-PT";
        $("set-native-code").value = state.profile.nativeLanguageCode || "nb-NO";
        const rawVoice = (state.profile.ttsVoiceName || "").trim();
        const isLegacyWavenet = /wavenet/i.test(rawVoice);
        $("set-voice").value = isLegacyWavenet || !rawVoice ? "Sulafat" : rawVoice;
        if (isLegacyWavenet && hintEl) {
          hintEl.textContent = `Voz antiga (${rawVoice}) sugerida para Sulafat (Gemini TTS).`;
          hintEl.hidden = false;
        }
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
      if (isSavingSettings) return;
      const errEl = $("settings-error");
      const submitBtn = $("settings-form").querySelector('button[type="submit"]');
      const prevVoice = getActiveTtsVoice();

      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }

      const targetCode = $("set-target-code").value.trim();
      const nativeCode = $("set-native-code").value.trim();
      const body = {
        name: $("set-name").value.trim(),
        age: Number($("set-age").value) || 8,
        targetLanguageCode: targetCode,
        targetLanguageName: resolveLanguageName(
          targetCode,
          state.profile?.targetLanguageCode,
          state.profile?.targetLanguageName,
          "European Portuguese",
        ),
        nativeLanguageCode: nativeCode,
        nativeLanguageName: resolveLanguageName(
          nativeCode,
          state.profile?.nativeLanguageCode,
          state.profile?.nativeLanguageName,
          "Norwegian",
        ),
        ttsVoiceName: $("set-voice").value.trim() || "Sulafat",
        dialectRules: $("set-dialect").value.trim(),
      };

      isSavingSettings = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "A guardar…";
      }

      try {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          state.profile = await res.json();
          if (getActiveTtsVoice() !== prevVoice) {
            AudioController.stop();
            PrefetchManager.reset();
          }
          $("settings-modal").hidden = true;
          showToast("Definições guardadas!");
        } else {
          let detail = "Verifica os campos e tenta outra vez.";
          try {
            const parsed = await res.json();
            if (typeof parsed?.error === "string") {
              detail = parsed.error;
            } else if (parsed?.error?.fieldErrors) {
              const fields = Object.keys(parsed.error.fieldErrors);
              if (fields.length > 0) detail = `Campos inválidos: ${fields.join(", ")}`;
            }
          } catch {}
          if (errEl) {
            errEl.textContent = `Não foi possível guardar: ${detail}`;
            errEl.hidden = false;
          }
          showToast("Não foi possível guardar");
        }
      } catch {
        if (errEl) {
          errEl.textContent = "Erro de rede ao guardar definições.";
          errEl.hidden = false;
        }
        showToast("Erro de rede ao guardar");
      } finally {
        isSavingSettings = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Guardar";
        }
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
        if (isSendingChat) return;
        $("hw-chat-input").value = chip.getAttribute("data-msg") || "";
        $("hw-chat-form").requestSubmit();
      });
    });

    $("hw-chat-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSendingChat) return;
      const session = state.currentSession;
      const ex = session?.exercises?.[state.hwExerciseIndex];
      const msgText = $("hw-chat-input").value.trim();
      if (!session || !ex || !msgText) return;

      const chatInput = $("hw-chat-input");
      const chatSend = $("hw-chat-send");
      const quickChips = document.querySelectorAll(".quick-chip");

      isSendingChat = true;
      chatInput.value = "";
      chatInput.disabled = true;
      chatSend.disabled = true;
      quickChips.forEach((c) => {
        c.disabled = true;
      });

      ex.messages = ex.messages || [];
      const optimisticMsg = { id: `child-${++chatMsgSeq}`, sender: "CHILD", content: msgText };
      ex.messages.push(optimisticMsg);
      renderHomeworkChat(ex);

      const box = $("hw-chat-messages");
      const typingDiv = document.createElement("div");
      typingDiv.className = "chat-bubble is-tutor is-typing";
      typingDiv.textContent = "O Owly está a pensar…";
      box.appendChild(typingDiv);
      box.scrollTop = box.scrollHeight;

      try {
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
          ex.messages.push({
            id: `tutor-${++chatMsgSeq}`,
            sender: "TUTOR",
            content: reply.replyNative,
            targetPhrase: reply.targetPhrase || null,
            followUpQuestionNative: reply.followUpQuestionNative || null,
          });
          renderHomeworkStepper(session);
        } else {
          const idx = ex.messages.indexOf(optimisticMsg);
          if (idx >= 0) ex.messages.splice(idx, 1);
          chatInput.value = msgText;
          showToast("O Owly não conseguiu responder. Tenta outra vez.");
        }
      } catch {
        const idx = ex.messages.indexOf(optimisticMsg);
        if (idx >= 0) ex.messages.splice(idx, 1);
        chatInput.value = msgText;
        showToast("O Owly não conseguiu responder. Tenta outra vez.");
      } finally {
        isSendingChat = false;
        chatInput.disabled = false;
        chatSend.disabled = false;
        quickChips.forEach((c) => {
          c.disabled = false;
        });
        renderHomeworkChat(ex);
      }
    });

    // Celebrate / Complete Homework Exercise (anti-farming & double-tap guard)
    $("hw-complete-btn").addEventListener("click", async () => {
      const session = state.currentSession;
      const ex = session?.exercises?.[state.hwExerciseIndex];
      const btn = $("hw-complete-btn");
      if (!session || !ex || isCompletingExercise || ex.status === "COMPLETED") return;

      isCompletingExercise = true;
      btn.disabled = true;

      try {
        const res = await fetch(
          `/api/homework/sessions/${session.id}/exercises/${ex.id}/complete`,
          { method: "POST" },
        );
        if (!res.ok) {
          showToast("Não foi possível concluir a pergunta. Tenta outra vez.");
          return;
        }

        ex.status = "COMPLETED";
        AudioController.stop();
        setOwlState("celebrating");
        launchConfetti();
        clearTimeout(owlCelebrateTimer);
        owlCelebrateTimer = setTimeout(() => {
          if ($("hw-owl-svg")?.getAttribute("data-owl-state") === "celebrating") {
            setOwlState("idle");
          }
        }, 1400);

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
        showToast("+2 Estrelas! Muito bem!", { icon: "star" });

        clearTimeout(completeAdvanceTimer);
        const nextIdx = session.exercises.findIndex(
          (item, i) => i > state.hwExerciseIndex && item.status !== "COMPLETED",
        );
        if (nextIdx >= 0) {
          renderHomeworkStepper(session);
          completeAdvanceTimer = setTimeout(() => {
            if (state.currentSession?.id === session.id) {
              closeHomeworkChatDrawer();
              state.hwExerciseIndex = nextIdx;
              renderHomeworkSession();
            }
          }, 900);
        } else {
          renderHomeworkSession();
        }
      } catch {
        showToast("Não foi possível concluir a pergunta. Tenta outra vez.");
      } finally {
        isCompletingExercise = false;
        if (state.currentSession?.exercises?.[state.hwExerciseIndex]?.status !== "COMPLETED") {
          btn.disabled = false;
        }
      }
    });

    // Finish Read Page (per-page guard + in-flight lock)
    $("read-finish-btn").addEventListener("click", async () => {
      if (!state.readData || isFinishingRead || state.readData._completed) return;
      const btn = $("read-finish-btn");
      isFinishingRead = true;
      btn.disabled = true;

      try {
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
          state.readData._completed = true;
          saveReadState(state.readData);
          state.progress = await res.json();
          renderProgressUI();
          launchConfetti();
          showToast("+3 Estrelas pela leitura!", { icon: "star" });
          const lbl = btn.querySelector("span:last-child");
          if (lbl) lbl.textContent = "Concluída";
        } else {
          btn.disabled = false;
          showToast("Não foi possível guardar as estrelas. Tenta outra vez.");
        }
      } catch {
        btn.disabled = false;
        showToast("Não foi possível guardar as estrelas. Tenta outra vez.");
      } finally {
        isFinishingRead = false;
      }
    });
  }

  // Boot
  hydrateIconsAndFlags();
  wireEvents();
  loadInitialData();
})();
