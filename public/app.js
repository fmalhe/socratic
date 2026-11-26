const state = {
  profile: null,
  progress: null,
  readingPage: null,
  readingPreviewUrl: null,
  homeworkSessions: [],
  activeSession: null,
  activeExerciseIndex: 0,
  explanationLang: 'native',
  activeWord: null,
  localSessionPhotos: new Map(),
};

const $ = (id) => document.getElementById(id);

let cachedVoices = [];
function refreshVoices() {
  if (window.speechSynthesis && typeof window.speechSynthesis.getVoices === 'function') {
    cachedVoices = window.speechSynthesis.getVoices() || [];
  }
}
if (window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

function pickBestVoice(langCode) {
  if (!cachedVoices.length) refreshVoices();
  if (!cachedVoices.length || !langCode) return null;
  const target = langCode.toLowerCase();
  const base = target.split('-')[0];
  const candidates = cachedVoices.filter((v) => {
    const lang = (v.lang || '').toLowerCase();
    return lang === target || lang.startsWith(`${base}-`) || lang === base;
  });
  if (!candidates.length) return null;

  const scoreVoice = (v) => {
    let score = 0;
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    if (lang === target) score += 40;
    if (/natural|neural|wavenet|chirp|enhanced|premium|siri/i.test(name)) score += 35;
    if (/google|microsoft|joana|catarina|inês|ines/i.test(name)) score += 18;
    if (!v.localService) score += 8; // Network/cloud voices on Android/Chrome are much less robotic
    return score;
  };

  candidates.sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return candidates[0];
}

let toastTimer = null;
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3600);
}

function launchStarCelebration() {
  const layer = $('confetti-layer');
  if (!layer) return;
  const emojis = ['⭐', '🌟', '✨', '🎉', '💫'];
  for (let i = 0; i < 18; i += 1) {
    const node = document.createElement('span');
    node.className = 'confetti-star';
    node.textContent = emojis[i % emojis.length];
    const startX = 25 + Math.random() * 50;
    const startY = 45 + Math.random() * 20;
    const dx = (Math.random() - 0.5) * 260;
    const dy = -120 - Math.random() * 220;
    const rot = `${Math.round((Math.random() - 0.5) * 320)}deg`;
    node.style.left = `${startX}vw`;
    node.style.top = `${startY}vh`;
    node.style.setProperty('--dx', `${Math.round(dx)}px`);
    node.style.setProperty('--dy', `${Math.round(dy)}px`);
    node.style.setProperty('--rot', rot);
    node.style.animationDelay = `${Math.round(Math.random() * 140)}ms`;
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1400);
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

/* Client-side resize & JPEG compression (fast on Android Chrome/Brave & iPad Safari) */
async function compressImageForUpload(file, maxDimension = 1600, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) return file;
  // Skip tiny images already under 350 KB
  if (file.size <= 350 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    return file;
  }

  let source = null;
  let width = 0;
  let height = 0;
  let cleanup = () => {};

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
      cleanup = () => bitmap.close?.();
    } else {
      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      source = img;
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      cleanup = () => URL.revokeObjectURL(url);
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, targetW, targetH);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) {
      return file;
    }
    const baseName = (file.name || 'scan').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    cleanup();
  }
}

/* XMLHttpRequest wrapper to track real upload byte progress */
function uploadFormWithProgress(url, formData, onUploadFraction) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        onUploadFraction(Math.min(1, evt.loaded / evt.total));
      }
    };
    xhr.upload.onload = () => onUploadFraction(1);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid JSON response from server'));
        }
      } else {
        let message = xhr.responseText || `Request failed (${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.error) message = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
        } catch {
          // keep raw text
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading image'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(formData);
  });
}

/* Multi-stage progress controller for Reading & Homework scans */
function createScanProgress(prefix) {
  const card = $(`${prefix}-loading`);
  const thumb = $(`${prefix}-progress-thumb`);
  const stageEl = $(`${prefix}-progress-stage`);
  const pctEl = $(`${prefix}-progress-pct`);
  const barEl = $(`${prefix}-progress-bar`);
  const fillEl = $(`${prefix}-progress-fill`);
  const stepsEl = $(`${prefix}-progress-steps`);
  const sizeEl = $(`${prefix}-progress-size`);

  let currentPct = 0;
  let analyzeTimer = null;

  function setPct(pct) {
    currentPct = Math.max(currentPct, Math.min(100, Math.round(pct)));
    pctEl.textContent = `${currentPct}%`;
    fillEl.style.width = `${currentPct}%`;
    barEl.setAttribute('aria-valuenow', String(currentPct));
  }

  function setStep(activeStep) {
    const order = ['optimize', 'upload', 'analyze'];
    const activeIdx = order.indexOf(activeStep);
    stepsEl.querySelectorAll('.p-step').forEach((el) => {
      const idx = order.indexOf(el.dataset.step);
      el.classList.toggle('is-done', activeStep === 'done' || (activeIdx >= 0 && idx < activeIdx));
      el.classList.toggle('is-active', activeStep !== 'done' && idx === activeIdx);
    });
  }

  return {
    start(previewUrl) {
      clearInterval(analyzeTimer);
      currentPct = 0;
      sizeEl.textContent = '';
      if (previewUrl) {
        thumb.src = previewUrl;
        thumb.hidden = false;
      } else {
        thumb.hidden = true;
      }
      stageEl.textContent = 'Optimizing photo…';
      setStep('optimize');
      setPct(8);
      card.hidden = false;
    },
    setSizeInfo(originalBytes, optimizedBytes) {
      if (originalBytes > optimizedBytes) {
        sizeEl.textContent = `${formatBytes(originalBytes)} → ${formatBytes(optimizedBytes)}`;
      } else {
        sizeEl.textContent = formatBytes(optimizedBytes);
      }
    },
    setUploadFraction(fraction) {
      stageEl.textContent = fraction < 1 ? 'Uploading photo…' : 'Photo uploaded, starting analysis…';
      setStep('upload');
      setPct(15 + fraction * 30);
    },
    startAnalyzing(messages) {
      clearInterval(analyzeTimer);
      setStep('analyze');
      setPct(48);
      let tick = 0;
      stageEl.textContent = messages[0];
      analyzeTimer = setInterval(() => {
        tick += 1;
        // Asymptotically approach 94% while waiting for Gemini
        const next = currentPct + Math.max(1, Math.round((94 - currentPct) * 0.16));
        setPct(Math.min(94, next));
        const msgIndex = Math.min(messages.length - 1, Math.floor(tick / 4));
        stageEl.textContent = messages[msgIndex];
      }, 650);
    },
    finish() {
      clearInterval(analyzeTimer);
      setStep('done');
      stageEl.textContent = 'Ready!';
      setPct(100);
      setTimeout(() => {
        card.hidden = true;
      }, 280);
    },
    hide() {
      clearInterval(analyzeTimer);
      card.hidden = true;
    },
  };
}

function openPhotoDialog(url) {
  if (!url) return;
  $('photo-dialog-img').src = url;
  $('photo-dialog').showModal();
}

function flagForLanguage(code) {
  const norm = (code || '').toLowerCase();
  if (norm.startsWith('nb') || norm.startsWith('nn') || norm === 'no') return '🇳🇴';
  if (norm === 'pt-br') return '🇧🇷';
  if (norm.startsWith('pt')) return '🇵🇹';
  if (norm === 'en-gb') return '🇬🇧';
  if (norm.startsWith('en')) return '🇺🇸';
  if (norm.startsWith('es')) return '🇪🇸';
  if (norm.startsWith('fr')) return '🇫🇷';
  if (norm.startsWith('de')) return '🇩🇪';
  if (norm.startsWith('sv')) return '🇸🇪';
  if (norm.startsWith('da')) return '🇩🇰';
  if (norm.startsWith('it')) return '🇮🇹';
  return '🌐';
}

/* Cached cloud TTS fetcher (Gemini 3.8 Flash-Lite TTS / Google Cloud TTS + R2 cache) */
const ttsAudioCache = new Map();
async function fetchTtsAudio(text, slow = false, languageCodeOverride = null) {
  const langCode = languageCodeOverride || state.profile?.targetLanguageCode || 'pt-PT';
  const voice = state.profile?.ttsVoiceName || '';
  const key = `${langCode}|${voice}|${slow ? '1' : '0'}|${text}`;
  if (ttsAudioCache.has(key)) {
    return ttsAudioCache.get(key);
  }
  const promise = (async () => {
    const payload = JSON.stringify({ text, languageCode: langCode, slow });
    const headers = { 'Content-Type': 'application/json' };
    try {
      let res = await fetch('/api/audio/speak', { method: 'QUERY', headers, body: payload });
      if (res.status === 405) {
        res = await fetch('/api/audio/speak', { method: 'POST', headers, body: payload });
      }
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const provider = res.headers.get('X-Audio-Provider') || 'cloud';
      return { url, provider };
    } catch {
      try {
        const res = await fetch('/api/audio/speak', { method: 'POST', headers, body: payload });
        if (!res.ok) return null;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const provider = res.headers.get('X-Audio-Provider') || 'cloud';
        return { url, provider };
      } catch {
        return null;
      }
    }
  })();
  ttsAudioCache.set(key, promise);
  const result = await promise;
  if (!result) ttsAudioCache.delete(key);
  return result;
}

/* Safari & Android Chrome/Brave friendly TTS with automatic speechSynthesis fallback */
let currentAudio = null;
async function speakText(text, slow = false, languageCodeOverride = null) {
  if (!text) return;
  if (typeof lyricsPlayer !== 'undefined' && lyricsPlayer.isActive()) {
    lyricsPlayer.stop();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  const langCode = languageCodeOverride || state.profile?.targetLanguageCode || 'pt-PT';
  const clip = await fetchTtsAudio(text, slow, langCode);
  if (clip?.url) {
    const audio = new Audio(clip.url);
    currentAudio = audio;
    await audio.play();
    return;
  }

  if (window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    const voice = pickBestVoice(langCode);
    if (voice) utterance.voice = voice;
    utterance.rate = slow ? 0.72 : 0.96;
    window.speechSynthesis.speak(utterance);
  } else {
    showToast('Audio playback is unavailable in this browser.');
  }
}

/* Navigation */
function switchTab(tabName) {
  if (tabName !== 'reading' && typeof lyricsPlayer !== 'undefined' && lyricsPlayer.isActive()) {
    lyricsPlayer.stop();
  }
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.view').forEach((view) => {
    const active = view.id === `view-${tabName}`;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  });
  if (tabName === 'progress') {
    loadProgress();
  } else if (tabName === 'homework') {
    loadHomeworkSessions();
  }
}

/* Profile & Progress Loading */
async function loadProfile() {
  state.profile = await apiJson('/api/profile');
  const p = state.profile;
  $('learner-subtitle').textContent = `${p.name} · ${flagForLanguage(p.targetLanguageCode)} → ${flagForLanguage(p.nativeLanguageCode)}`;
  $('flag-q-target').textContent = flagForLanguage(p.targetLanguageCode);
  $('flag-q-native').textContent = flagForLanguage(p.nativeLanguageCode);
  $('flag-hw-text').textContent = flagForLanguage(p.targetLanguageCode);
  $('flag-exp-native').textContent = flagForLanguage(p.nativeLanguageCode);
  $('flag-exp-target').textContent = flagForLanguage(p.targetLanguageCode);
  $('prof-name').value = p.name;
  $('prof-age').value = p.age;
  $('prof-target-code').value = p.targetLanguageCode;
  $('prof-target-name').value = p.targetLanguageName;
  $('prof-native-code').value = p.nativeLanguageCode;
  $('prof-native-name').value = p.nativeLanguageName;
  $('prof-tts-voice').value = p.ttsVoiceName;
  $('prof-dialect-rules').value = p.dialectRules;
}

async function loadProgress() {
  state.progress = await apiJson('/api/progress');
  const pr = state.progress;
  $('header-stars').textContent = pr.totalStars;
  $('header-streak').textContent = pr.currentStreakDays;
  $('stat-stars').textContent = pr.totalStars;
  $('stat-streak').textContent = pr.currentStreakDays;
  $('stat-pages').textContent = pr.pagesReadCount;

  const shelf = $('saved-words-shelf');
  shelf.innerHTML = '';
  if (!pr.recentWords || pr.recentWords.length === 0) {
    shelf.innerHTML = '<p class="muted-note">No saved tricky words yet — scan a page to start collecting.</p>';
    return;
  }
  pr.recentWords.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'word-pill';
    btn.textContent = item.word;
    btn.addEventListener('click', () => speakText(item.word, true));
    shelf.appendChild(btn);
  });
}

/* Word Dialog */
function openWordDialog(wordHint) {
  state.activeWord = wordHint;
  $('dialog-syllables').textContent = wordHint.syllables || wordHint.word;
  $('dialog-word').textContent = wordHint.word;
  $('dialog-hint').textContent = wordHint.nativeHint;
  $('word-dialog').showModal();
  speakText(wordHint.word, true);
}

/* Spotify-Lyrics-Style Read Along Engine */
function tokenizeSentenceWords(text) {
  const tokens = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }
  return tokens;
}

function computeWordIntervals(tokens) {
  const weights = tokens.map((t) => {
    let w = Math.max(2, t.text.replace(/[.,!?;:()"'«»—-]/g, '').length);
    if (/[,;:]$/.test(t.text)) w += 3;
    if (/[.!?…]$/.test(t.text)) w += 5;
    return w;
  });
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  let acc = 0;
  return weights.map((w) => {
    const start = acc / total;
    acc += w;
    const end = acc / total;
    return { start, end };
  });
}

function createLyricsPlayer() {
  let sentences = [];
  let cardEls = [];
  let wordSpanLists = [];
  let tokenLists = [];
  let intervalLists = [];

  let status = 'idle'; // 'idle' | 'loading' | 'playing' | 'paused'
  let currentIndex = -1;
  let slow = false;
  let playRunId = 0;
  let activeAudio = null;
  let rafId = null;
  let fallbackTimer = null;
  let voiceMode = null; // 'natural' | 'device'

  function stopAnimators() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (fallbackTimer !== null) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function updateControls() {
    const playBtn = $('btn-lyrics-play');
    const playIcon = $('lyrics-play-icon');
    const playLabel = $('lyrics-play-label');
    const stopBtn = $('btn-lyrics-stop');
    const prevBtn = $('btn-lyrics-prev');
    const nextBtn = $('btn-lyrics-next');
    const speedBtn = $('btn-lyrics-speed');
    const counter = $('lyrics-counter');
    const badge = $('lyrics-voice-badge');

    const hasLines = sentences.length > 0;
    playBtn.disabled = !hasLines;
    stopBtn.disabled = status === 'idle';
    prevBtn.disabled = !hasLines || currentIndex <= 0;
    nextBtn.disabled = !hasLines || currentIndex < 0 || currentIndex >= sentences.length - 1;

    if (status === 'loading') {
      playIcon.textContent = '…';
      playLabel.textContent = 'Loading';
    } else if (status === 'playing') {
      playIcon.textContent = '⏸';
      playLabel.textContent = 'Pause';
    } else if (status === 'paused') {
      playIcon.textContent = '▶';
      playLabel.textContent = 'Resume';
    } else {
      playIcon.textContent = '▶';
      playLabel.textContent = 'Play';
    }

    speedBtn.textContent = slow ? '🐢 Slow' : '🐢';
    speedBtn.setAttribute('aria-pressed', String(slow));

    if (!hasLines) {
      counter.textContent = '';
    } else if (currentIndex >= 0) {
      const stateSuffix = status === 'paused' ? ' · Paused' : '';
      counter.textContent = `Line ${currentIndex + 1} of ${sentences.length}${stateSuffix}`;
    } else {
      counter.textContent = 'Tap Play or any sentence';
    }

    if (voiceMode) {
      badge.hidden = false;
      badge.textContent = voiceMode === 'natural' ? 'Natural Voice' : 'Device Voice';
      badge.classList.toggle('is-fallback', voiceMode !== 'natural');
    } else {
      badge.hidden = true;
    }
  }

  function clearWordHighlights(idx) {
    const spans = wordSpanLists[idx];
    if (!spans) return;
    spans.forEach((span) => {
      span.classList.remove('is-spoken', 'is-current');
    });
  }

  function highlightWord(lineIdx, wordIdx) {
    const spans = wordSpanLists[lineIdx];
    if (!spans) return;
    for (let i = 0; i < spans.length; i += 1) {
      spans[i].classList.toggle('is-spoken', i < wordIdx);
      spans[i].classList.toggle('is-current', i === wordIdx);
    }
  }

  function highlightAllSpoken(lineIdx) {
    const spans = wordSpanLists[lineIdx];
    if (!spans) return;
    spans.forEach((span) => {
      span.classList.add('is-spoken');
      span.classList.remove('is-current');
    });
  }

  function setActiveLine(idx) {
    const list = $('reading-sentences');
    list.classList.toggle('is-reading-along', idx >= 0);
    cardEls.forEach((card, i) => {
      const active = i === idx;
      card.classList.toggle('is-active-line', active);
      if (!active) clearWordHighlights(i);
    });
    if (idx >= 0 && cardEls[idx]) {
      cardEls[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function teardownPlayback() {
    stopAnimators();
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function syncAudioHighlight(lineIdx, audio, runId) {
    const intervals = intervalLists[lineIdx] || [];
    const tick = () => {
      if (runId !== playRunId || status !== 'playing' || !audio) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const progress = Math.min(0.999, Math.max(0, audio.currentTime / audio.duration));
        let wordIdx = intervals.findIndex((iv) => progress >= iv.start && progress < iv.end);
        if (wordIdx < 0) wordIdx = Math.max(0, intervals.length - 1);
        highlightWord(lineIdx, wordIdx);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  async function playSentence(idx, overrideSlow) {
    if (idx < 0 || idx >= sentences.length) {
      stop();
      return;
    }
    if (typeof overrideSlow === 'boolean') {
      slow = overrideSlow;
    }
    teardownPlayback();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    playRunId += 1;
    const runId = playRunId;
    currentIndex = idx;
    status = 'loading';
    setActiveLine(idx);
    highlightWord(idx, 0);
    updateControls();

    const text = sentences[idx].targetText;

    // Pre-fetch the next sentence in background so transitions are seamless
    if (idx + 1 < sentences.length) {
      fetchTtsAudio(sentences[idx + 1].targetText, slow).catch(() => {});
    }

    const clip = await fetchTtsAudio(text, slow);
    if (runId !== playRunId) return;

    if (clip?.url) {
      voiceMode = 'natural';
      const audio = new Audio(clip.url);
      activeAudio = audio;
      status = 'playing';
      updateControls();

      audio.onended = () => {
        if (runId !== playRunId) return;
        stopAnimators();
        highlightAllSpoken(idx);
        if (idx + 1 < sentences.length) {
          playSentence(idx + 1);
        } else {
          stop();
        }
      };
      audio.onerror = () => {
        if (runId !== playRunId) return;
        playWithSpeechSynthesis(idx, runId);
      };

      try {
        await audio.play();
        if (runId !== playRunId) return;
        syncAudioHighlight(idx, audio, runId);
      } catch {
        if (runId !== playRunId) return;
        playWithSpeechSynthesis(idx, runId);
      }
      return;
    }

    playWithSpeechSynthesis(idx, runId);
  }

  function playWithSpeechSynthesis(idx, runId) {
    if (!window.speechSynthesis) {
      showToast('Audio playback is unavailable in this browser.');
      stop();
      return;
    }
    voiceMode = 'device';
    status = 'playing';
    updateControls();

    const text = sentences[idx].targetText;
    const tokens = tokenLists[idx] || [];
    const intervals = intervalLists[idx] || [];
    const langCode = state.profile?.targetLanguageCode || 'pt-PT';
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    const voice = pickBestVoice(langCode);
    if (voice) utterance.voice = voice;
    utterance.rate = slow ? 0.72 : 0.96;

    let boundarySeen = false;
    const startedAt = performance.now();
    // Estimate duration (~13 chars/sec normal, ~9.5 chars/sec slow) as fallback when Android Chrome omits onboundary
    const estDurationMs = Math.max(900, (text.length / (slow ? 9.5 : 13.5)) * 1000);

    utterance.onboundary = (evt) => {
      if (runId !== playRunId || status !== 'playing') return;
      if (typeof evt.charIndex === 'number') {
        boundarySeen = true;
        const wordIdx = tokens.findIndex((t) => evt.charIndex >= t.charStart && evt.charIndex <= t.charEnd);
        if (wordIdx >= 0) {
          highlightWord(idx, wordIdx);
        }
      }
    };

    fallbackTimer = setInterval(() => {
      if (runId !== playRunId || status !== 'playing' || boundarySeen) return;
      const frac = Math.min(0.99, (performance.now() - startedAt) / estDurationMs);
      let wordIdx = intervals.findIndex((iv) => frac >= iv.start && frac < iv.end);
      if (wordIdx < 0) wordIdx = Math.max(0, intervals.length - 1);
      highlightWord(idx, wordIdx);
    }, 90);

    utterance.onend = () => {
      if (runId !== playRunId) return;
      stopAnimators();
      highlightAllSpoken(idx);
      if (idx + 1 < sentences.length) {
        playSentence(idx + 1);
      } else {
        stop();
      }
    };

    utterance.onerror = () => {
      if (runId !== playRunId) return;
      stop();
    };

    window.speechSynthesis.speak(utterance);
  }

  function pause() {
    if (status !== 'playing' && status !== 'loading') return;
    stopAnimators();
    if (activeAudio) {
      activeAudio.pause();
      status = 'paused';
      updateControls();
      return;
    }
    // speechSynthesis pause is unreliable on Android Chrome, so cancel and resume cleanly from this line
    playRunId += 1;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    status = 'paused';
    updateControls();
  }

  function resume() {
    if (status !== 'paused') return;
    if (activeAudio) {
      status = 'playing';
      updateControls();
      const runId = playRunId;
      activeAudio.play().then(() => {
        if (runId === playRunId) syncAudioHighlight(currentIndex, activeAudio, runId);
      }).catch(() => playSentence(currentIndex));
      return;
    }
    playSentence(Math.max(0, currentIndex));
  }

  function stop() {
    playRunId += 1;
    teardownPlayback();
    status = 'idle';
    currentIndex = -1;
    setActiveLine(-1);
    cardEls.forEach((_, i) => clearWordHighlights(i));
    updateControls();
  }

  return {
    load(pageSentences, cards, spans, tokens) {
      stop();
      sentences = pageSentences || [];
      cardEls = cards;
      wordSpanLists = spans;
      tokenLists = tokens;
      intervalLists = tokens.map(computeWordIntervals);
      updateControls();
    },
    isActive() {
      return status !== 'idle';
    },
    playFrom(idx, overrideSlow) {
      playSentence(idx, overrideSlow);
    },
    togglePlayPause() {
      if (status === 'playing' || status === 'loading') {
        pause();
      } else if (status === 'paused') {
        resume();
      } else if (sentences.length > 0) {
        playSentence(0);
      }
    },
    stop,
    prev() {
      if (currentIndex > 0) playSentence(currentIndex - 1);
    },
    next() {
      if (currentIndex >= 0 && currentIndex + 1 < sentences.length) {
        playSentence(currentIndex + 1);
      }
    },
    toggleSpeed() {
      slow = !slow;
      updateControls();
      if (status === 'playing' && currentIndex >= 0) {
        playSentence(currentIndex, slow);
      }
    },
  };
}

const lyricsPlayer = createLyricsPlayer();
const readingProgress = createScanProgress('reading');
const homeworkProgress = createScanProgress('homework');

function showScanError(prefix, message) {
  const banner = $(`${prefix}-error`);
  const msgEl = $(`${prefix}-error-msg`);
  if (banner && msgEl) {
    msgEl.textContent = message || 'Unknown error';
    banner.hidden = false;
  }
}

function clearScanError(prefix) {
  const banner = $(`${prefix}-error`);
  if (banner) banner.hidden = true;
}

/* Reading Flow */
async function handleReadingUpload(file) {
  if (!file) return;
  lyricsPlayer.stop();
  clearScanError('reading');
  const localUrl = URL.createObjectURL(file);
  if (state.readingPreviewUrl) {
    URL.revokeObjectURL(state.readingPreviewUrl);
  }
  state.readingPreviewUrl = localUrl;

  $('reading-results').hidden = true;
  readingProgress.start(localUrl);
  try {
    const optimized = await compressImageForUpload(file);
    readingProgress.setSizeInfo(file.size, optimized.size);

    const form = new FormData();
    form.append('image', optimized);
    let analyzingStarted = false;

    state.readingPage = await uploadFormWithProgress('/api/reading/scan', form, (fraction) => {
      readingProgress.setUploadFraction(fraction);
      if (fraction >= 1 && !analyzingStarted) {
        analyzingStarted = true;
        readingProgress.startAnalyzing([
          'Reading text on the page…',
          'Breaking into kid-friendly sentences…',
          'Finding tricky words & syllables…',
        ]);
      }
    });
    readingProgress.finish();
    renderReadingPage();
  } catch (err) {
    readingProgress.hide();
    showScanError('reading', err.message);
    showToast('Scan failed — see error details above.');
  }
}

function renderReadingPage() {
  const page = state.readingPage;
  if (!page) return;
  const photoUrl = page.imageUrl || state.readingPreviewUrl;
  const photoBtn = $('btn-reading-photo');
  photoBtn.hidden = !photoUrl;

  const list = $('reading-sentences');
  list.innerHTML = '';

  const cards = [];
  const wordSpanLists = [];
  const tokenLists = [];

  page.sentences.forEach((sentence, idx) => {
    const card = document.createElement('article');
    card.className = 'sentence-card';

    const target = document.createElement('p');
    target.className = 'reading-text reading-text-interactive';
    target.title = 'Tap to read from this sentence';
    target.addEventListener('click', () => lyricsPlayer.playFrom(idx));

    const tokens = tokenizeSentenceWords(sentence.targetText);
    const spans = [];
    tokens.forEach((tok, tIdx) => {
      const span = document.createElement('span');
      span.className = 'karaoke-word';
      span.textContent = tok.text;
      target.appendChild(span);
      spans.push(span);
      if (tIdx < tokens.length - 1) {
        target.appendChild(document.createTextNode(' '));
      }
    });

    const summary = document.createElement('p');
    summary.className = 'native-summary';
    summary.textContent = sentence.nativeSummary;

    const audioRow = document.createElement('div');
    audioRow.className = 'audio-row';

    const btnListen = document.createElement('button');
    btnListen.type = 'button';
    btnListen.className = 'btn btn-secondary btn-sm';
    btnListen.textContent = '▶ Play';
    btnListen.addEventListener('click', () => lyricsPlayer.playFrom(idx, false));

    const btnSlow = document.createElement('button');
    btnSlow.type = 'button';
    btnSlow.className = 'btn btn-secondary btn-sm';
    btnSlow.textContent = '🐢';
    btnSlow.title = 'Slow';
    btnSlow.addEventListener('click', () => lyricsPlayer.playFrom(idx, true));

    audioRow.append(btnListen, btnSlow);

    const wordsRow = document.createElement('div');
    wordsRow.className = 'tricky-words-row';
    (sentence.trickyWords || []).forEach((w) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'word-pill';
      pill.textContent = `✨ ${w.word}`;
      pill.addEventListener('click', () => openWordDialog(w));
      wordsRow.appendChild(pill);
    });

    card.append(target, summary, audioRow, wordsRow);
    list.appendChild(card);

    cards.push(card);
    wordSpanLists.push(spans);
    tokenLists.push(tokens);
  });

  lyricsPlayer.load(page.sentences, cards, wordSpanLists, tokenLists);
  $('reading-results').hidden = false;
}

async function finishReadingPage() {
  if (!state.readingPage) return;
  const trickyWords = state.readingPage.sentences
    .flatMap((s) => (s.trickyWords || []).map((w) => w.word))
    .slice(0, 8);
  await apiJson('/api/progress/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activityType: 'READING',
      starsEarned: 10,
      trickyWords,
    }),
  });
  await loadProgress();
  launchStarCelebration();
  showToast('Awesome reading! +10 ⭐');
}

/* Homework Session Flow */
let hwSearchQuery = '';
async function loadHomeworkSessions() {
  try {
    state.homeworkSessions = await apiJson('/api/homework/sessions');
    renderSessionChips();
    if (!state.activeSession && state.homeworkSessions.length > 0) {
      selectHomeworkSession(state.homeworkSessions[0]);
    }
  } catch {
    // Ignore on initial load
  }
}

async function queryHomeworkSessions(q) {
  hwSearchQuery = (q || '').trim();
  if (!hwSearchQuery) {
    await loadHomeworkSessions();
    return;
  }
  try {
    state.homeworkSessions = await apiJson('/api/homework/sessions', {
      method: 'QUERY',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: hwSearchQuery, limit: 20 }),
    });
    renderSessionChips();
  } catch (err) {
    showToast(`Search failed: ${err.message}`);
  }
}

let hwPagesOpen = false;
function setHwPagesOpen(open) {
  hwPagesOpen = open;
  const drawer = $('homework-recent-sessions');
  const toggleBtn = $('btn-hw-pages-toggle');
  if (drawer) drawer.hidden = !open;
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(open));
}

function renderSessionChips() {
  const container = $('homework-recent-sessions');
  const chips = $('session-chips');
  const searchInput = $('hw-search-input');
  const toggleBtn = $('btn-hw-pages-toggle');
  const toggleLabel = $('hw-pages-label');

  const count = state.homeworkSessions.length;
  if (!count && !hwSearchQuery) {
    container.hidden = true;
    if (toggleBtn) toggleBtn.hidden = true;
    return;
  }

  if (toggleBtn) {
    toggleBtn.hidden = false;
    if (toggleLabel) {
      toggleLabel.textContent = state.activeSession ? `#${state.activeSession.id}` : `${count}`;
    }
  }
  container.hidden = !hwPagesOpen && !hwSearchQuery;
  if (searchInput) {
    searchInput.hidden = count < 4 && !hwSearchQuery;
  }

  chips.innerHTML = '';
  if (!count && hwSearchQuery) {
    chips.innerHTML = '<span class="muted-note">No matching pages found.</span>';
    return;
  }
  state.homeworkSessions.forEach((session) => {
    const done = session.exercises.filter((e) => e.status === 'COMPLETED').length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'session-chip' + (state.activeSession?.id === session.id ? ' is-active' : '');
    btn.textContent = `#${session.id} (${done}/${session.exercises.length})`;
    btn.addEventListener('click', () => {
      setHwPagesOpen(false);
      selectHomeworkSession(session);
    });
    chips.appendChild(btn);
  });
}

async function handleHomeworkScan(file) {
  if (!file) return;
  clearScanError('homework');
  const localUrl = URL.createObjectURL(file);
  homeworkProgress.start(localUrl);
  try {
    const optimized = await compressImageForUpload(file);
    homeworkProgress.setSizeInfo(file.size, optimized.size);

    const form = new FormData();
    form.append('image', optimized);
    let analyzingStarted = false;

    const session = await uploadFormWithProgress('/api/homework/sessions/scan', form, (fraction) => {
      homeworkProgress.setUploadFraction(fraction);
      if (fraction >= 1 && !analyzingStarted) {
        analyzingStarted = true;
        homeworkProgress.startAnalyzing([
          'Reading worksheet text…',
          'Splitting into individual exercises…',
          'Preparing spoken hints & tricky words…',
        ]);
      }
    });
    if (!session.imageUrl) {
      state.localSessionPhotos.set(session.id, localUrl);
    } else {
      URL.revokeObjectURL(localUrl);
    }
    homeworkProgress.finish();
    state.homeworkSessions = [session, ...state.homeworkSessions.filter((s) => s.id !== session.id)];
    selectHomeworkSession(session);
    showToast(`Found ${session.exercises.length} exercises!`);
  } catch (err) {
    URL.revokeObjectURL(localUrl);
    homeworkProgress.hide();
    showScanError('homework', err.message);
    showToast('Scan failed — see error details above.');
  }
}

function selectHomeworkSession(session) {
  state.activeSession = session;
  const firstPending = session.exercises.findIndex((e) => e.status !== 'COMPLETED');
  state.activeExerciseIndex = firstPending >= 0 ? firstPending : 0;
  renderSessionChips();
  renderHomeworkWorkspace();
}

async function ensureExerciseHydrated(session, ex) {
  if (ex.promptNative && ex.explanationTarget && ex.explanationEnglish) {
    return ex;
  }
  const updated = await apiJson(
    `/api/homework/sessions/${session.id}/exercises/${ex.id}/hydrate`,
    { method: 'POST' },
  );
  if (updated) {
    session.exercises = session.exercises.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  }
  return ex;
}

function renderHomeworkExplanation() {
  ['btn-exp-native', 'btn-exp-target', 'btn-exp-english'].forEach((id) => {
    const btn = $(id);
    if (btn) {
      btn.hidden = false;
      btn.classList.remove('is-playing');
    }
  });
}

async function speakHomeworkPromptNative(btnEl) {
  const session = state.activeSession;
  let ex = session?.exercises[state.activeExerciseIndex];
  if (!session || !ex) return;

  btnEl?.classList.add('is-playing');
  try {
    if (!ex.promptNative) {
      ex = await ensureExerciseHydrated(session, ex);
    }
    if (ex.promptNative) {
      await speakText(ex.promptNative, false, state.profile?.nativeLanguageCode || 'nb-NO');
    }
  } catch (err) {
    showToast(`Could not load audio: ${err.message}`);
  } finally {
    setTimeout(() => btnEl?.classList.remove('is-playing'), 900);
  }
}

async function speakHomeworkHint(kind, btnEl) {
  const session = state.activeSession;
  let ex = session?.exercises[state.activeExerciseIndex];
  if (!session || !ex) return;

  document.querySelectorAll('.hint-flag-btn').forEach((b) => b.classList.remove('is-playing'));
  btnEl?.classList.add('is-playing');

  try {
    if ((kind === 'target' && !ex.explanationTarget) || (kind === 'english' && !ex.explanationEnglish)) {
      ex = await ensureExerciseHydrated(session, ex);
    }
    let text = '';
    let langCode = 'nb-NO';
    if (kind === 'native') {
      text = ex.explanationNative;
      langCode = state.profile?.nativeLanguageCode || 'nb-NO';
    } else if (kind === 'target') {
      text = ex.explanationTarget;
      langCode = state.profile?.targetLanguageCode || 'pt-PT';
    } else if (kind === 'english') {
      text = ex.explanationEnglish;
      langCode = 'en-GB';
    }
    if (text) {
      await speakText(text, false, langCode);
    }
  } catch (err) {
    showToast(`Could not load audio: ${err.message}`);
  } finally {
    setTimeout(() => btnEl?.classList.remove('is-playing'), 900);
  }
}

function renderHomeworkWorkspace() {
  const session = state.activeSession;
  if (!session || !session.exercises.length) {
    $('homework-workspace').hidden = true;
    return;
  }
  $('homework-workspace').hidden = false;

  const photoUrl = session.imageUrl || state.localSessionPhotos.get(session.id) || null;
  const photoBtn = $('btn-hw-photo');
  if (photoUrl) {
    $('hw-photo-thumb').src = photoUrl;
    photoBtn.hidden = false;
  } else {
    photoBtn.hidden = true;
  }

  const stepper = $('hw-exercise-stepper');
  stepper.innerHTML = '';

  const hasPageText = Boolean(session.pageTextTarget && session.pageTextTarget.trim());
  if (hasPageText) {
    const textBtn = document.createElement('button');
    textBtn.type = 'button';
    textBtn.className = 'step-btn' + (state.activeExerciseIndex === -1 ? ' is-active' : '');
    textBtn.textContent = '📖 Text';
    textBtn.addEventListener('click', () => {
      state.activeExerciseIndex = -1;
      renderHomeworkWorkspace();
    });
    stepper.appendChild(textBtn);
  }

  session.exercises.forEach((ex, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'step-btn';
    if (idx === state.activeExerciseIndex) btn.classList.add('is-active');
    if (ex.status === 'COMPLETED') btn.classList.add('is-done');
    btn.textContent = `${ex.status === 'COMPLETED' ? '✓ ' : ''}#${ex.label}`;
    btn.addEventListener('click', () => {
      state.activeExerciseIndex = idx;
      renderHomeworkWorkspace();
    });
    stepper.appendChild(btn);
  });

  const textCard = $('hw-text-card');
  const exCard = $('hw-active-exercise');
  if (state.activeExerciseIndex === -1 && hasPageText) {
    textCard.hidden = false;
    exCard.hidden = true;
    const body = $('hw-page-text');
    body.innerHTML = '';
    const lines = session.pageTextTarget
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    lines.forEach((line) => {
      const p = document.createElement('p');
      p.className = 'hw-text-line';
      p.textContent = line;
      p.title = 'Tap to listen';
      p.addEventListener('click', () => speakText(line, false, state.profile?.targetLanguageCode));
      body.appendChild(p);
    });
    return;
  }

  textCard.hidden = true;
  exCard.hidden = false;

  const ex = session.exercises[state.activeExerciseIndex] || session.exercises[0];
  $('hw-ex-badge').textContent = `Exercise ${ex.label}`;
  const statusEl = $('hw-ex-status');
  const isDone = ex.status === 'COMPLETED';
  statusEl.hidden = !isDone;
  statusEl.textContent = '⭐ Done!';
  statusEl.classList.toggle('is-completed', isDone);
  $('hw-ex-target').textContent = ex.promptTarget;
  renderHomeworkExplanation();

  const wordsRow = $('hw-ex-words');
  wordsRow.innerHTML = '';
  (ex.trickyWords || []).forEach((w) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'word-pill';
    pill.textContent = `✨ ${w.word}`;
    pill.addEventListener('click', () => openWordDialog(w));
    wordsRow.appendChild(pill);
  });

  const completeBtn = $('btn-hw-complete');
  completeBtn.disabled = isDone;
  completeBtn.textContent = isDone ? '⭐ Done!' : '🎉 Done!';
}

async function completeActiveExercise() {
  const session = state.activeSession;
  if (!session) return;
  const ex = session.exercises[state.activeExerciseIndex];
  if (!ex) return;
  try {
    await apiJson(`/api/homework/sessions/${session.id}/exercises/${ex.id}/complete`, { method: 'POST' });
    const updatedSession = await apiJson(`/api/homework/sessions/${session.id}`);
    state.activeSession = updatedSession;
    state.homeworkSessions = state.homeworkSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s));

    const trickyWords = (ex.trickyWords || []).map((w) => w.word);
    await apiJson('/api/progress/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activityType: 'HOMEWORK',
        starsEarned: 5,
        trickyWords,
      }),
    });
    await loadProgress();
    launchStarCelebration();

    const nextPending = updatedSession.exercises.findIndex((item) => item.status !== 'COMPLETED');
    if (nextPending >= 0) {
      state.activeExerciseIndex = nextPending;
      showToast('Awesome! +5 ⭐ — Next exercise!');
    } else {
      showToast('Whole page finished! 🎉 +5 ⭐');
    }
    renderSessionChips();
    renderHomeworkWorkspace();
  } catch (err) {
    showToast(`Could not complete exercise: ${err.message}`);
  }
}

/* Profile Save */
async function saveProfile(event) {
  event.preventDefault();
  try {
    state.profile = await apiJson('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('prof-name').value.trim(),
        age: Number($('prof-age').value),
        targetLanguageCode: $('prof-target-code').value.trim(),
        targetLanguageName: $('prof-target-name').value.trim(),
        nativeLanguageCode: $('prof-native-code').value.trim(),
        nativeLanguageName: $('prof-native-name').value.trim(),
        ttsVoiceName: $('prof-tts-voice').value.trim(),
        dialectRules: $('prof-dialect-rules').value.trim(),
      }),
    });
    await loadProfile();
    showToast('Settings saved!');
  } catch (err) {
    showToast(`Could not save settings: ${err.message}`);
  }
}

/* Wire Events */
function init() {
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.nav));
  });

  const onFileSelected = (handler) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handler(file);
  };

  $('reading-camera-input').addEventListener('change', onFileSelected(handleReadingUpload));
  $('reading-library-input').addEventListener('change', onFileSelected(handleReadingUpload));
  $('btn-reading-photo').addEventListener('click', () => {
    openPhotoDialog(state.readingPage?.imageUrl || state.readingPreviewUrl);
  });
  $('btn-lyrics-play').addEventListener('click', () => lyricsPlayer.togglePlayPause());
  $('btn-lyrics-stop').addEventListener('click', () => lyricsPlayer.stop());
  $('btn-lyrics-prev').addEventListener('click', () => lyricsPlayer.prev());
  $('btn-lyrics-next').addEventListener('click', () => lyricsPlayer.next());
  $('btn-lyrics-speed').addEventListener('click', () => lyricsPlayer.toggleSpeed());
  $('btn-finish-reading').addEventListener('click', finishReadingPage);

  $('homework-camera-input').addEventListener('change', onFileSelected(handleHomeworkScan));
  $('homework-library-input').addEventListener('change', onFileSelected(handleHomeworkScan));
  $('btn-hw-pages-toggle').addEventListener('click', () => setHwPagesOpen(!hwPagesOpen));
  let hwSearchTimer = null;
  $('hw-search-input').addEventListener('input', (e) => {
    clearTimeout(hwSearchTimer);
    const val = e.target.value;
    hwSearchTimer = setTimeout(() => queryHomeworkSessions(val), 250);
  });
  $('btn-hw-photo').addEventListener('click', () => {
    const session = state.activeSession;
    const url = session?.imageUrl || (session ? state.localSessionPhotos.get(session.id) : null);
    openPhotoDialog(url);
  });
  $('btn-hw-text-listen').addEventListener('click', () => {
    speakText(state.activeSession?.pageTextTarget, false, state.profile?.targetLanguageCode);
  });
  $('btn-hw-text-slow').addEventListener('click', () => {
    speakText(state.activeSession?.pageTextTarget, true, state.profile?.targetLanguageCode);
  });
  $('btn-hw-listen').addEventListener('click', () => {
    const ex = state.activeSession?.exercises[state.activeExerciseIndex];
    speakText(ex?.promptTarget, false, state.profile?.targetLanguageCode);
  });
  $('btn-hw-slow').addEventListener('click', () => {
    const ex = state.activeSession?.exercises[state.activeExerciseIndex];
    speakText(ex?.promptTarget, true, state.profile?.targetLanguageCode);
  });
  $('btn-hw-listen-native').addEventListener('click', (e) => speakHomeworkPromptNative(e.currentTarget));
  $('btn-exp-native').addEventListener('click', (e) => speakHomeworkHint('native', e.currentTarget));
  $('btn-exp-target').addEventListener('click', (e) => speakHomeworkHint('target', e.currentTarget));
  $('btn-exp-english').addEventListener('click', (e) => speakHomeworkHint('english', e.currentTarget));
  $('btn-hw-complete').addEventListener('click', completeActiveExercise);

  $('profile-form').addEventListener('submit', saveProfile);

  $('btn-dialog-slow').addEventListener('click', () => speakText(state.activeWord?.word, true));
  $('btn-dialog-normal').addEventListener('click', () => speakText(state.activeWord?.word, false));
  $('btn-dialog-close').addEventListener('click', () => $('word-dialog').close());

  $('btn-photo-close').addEventListener('click', () => $('photo-dialog').close());
  $('photo-dialog').addEventListener('click', (e) => {
    if (e.target === $('photo-dialog')) $('photo-dialog').close();
  });

  ['reading', 'homework'].forEach((prefix) => {
    $(`btn-${prefix}-error-close`).addEventListener('click', () => clearScanError(prefix));
    $(`btn-${prefix}-error-copy`).addEventListener('click', async () => {
      const text = $(`${prefix}-error-msg`).textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Error copied to clipboard');
      } catch {
        showToast('Select and copy the error text above');
      }
    });
  });

  /* Theme Toggle (Obsidian Dark default / Alabaster Light) */
  function applyTheme(theme) {
    const isLight = theme === 'light';
    if (isLight) {
      document.documentElement.dataset.theme = 'light';
    } else {
      delete document.documentElement.dataset.theme;
    }
    $('theme-icon-sun').hidden = isLight;
    $('theme-icon-moon').hidden = !isLight;
    const metaTheme = $('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', isLight ? '#F6F7F9' : '#0A0B0D');
    try {
      localStorage.setItem('socratic-theme', isLight ? 'light' : 'dark');
    } catch {
      // ignore storage restrictions
    }
  }

  let savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem('socratic-theme') || 'dark';
  } catch {
    savedTheme = 'dark';
  }
  applyTheme(savedTheme);

  $('btn-theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });

  /* Raycast-style Command Palette (⌘K / Ctrl+K) */
  const cmdDialog = $('cmd-dialog');
  const cmdInput = $('cmd-input');
  const cmdList = $('cmd-list');
  let cmdSelected = 0;

  const commands = [
    { label: 'Take Photo to Read', sub: 'Open camera in Read', kbd: 'R', run: () => { switchTab('reading'); $('reading-camera-input').click(); } },
    { label: 'Scan Homework Page', sub: 'Open camera in Homework', kbd: 'H', run: () => { switchTab('homework'); $('homework-camera-input').click(); } },
    { label: 'Play / Pause Read Along', sub: 'Toggle lyrics playback', kbd: 'Space', run: () => { switchTab('reading'); lyricsPlayer.togglePlayPause(); } },
    { label: 'Toggle Reading Speed', sub: 'Switch 1× / 0.75× Slow', kbd: 'S', run: () => { switchTab('reading'); lyricsPlayer.toggleSpeed(); } },
    { label: 'Go to Read', sub: 'Reading practice', kbd: '1', run: () => switchTab('reading') },
    { label: 'Go to Homework', sub: 'One exercise at a time', kbd: '2', run: () => switchTab('homework') },
    { label: 'Go to Progress', sub: 'Stars, streak & words', kbd: '3', run: () => switchTab('progress') },
    { label: 'Go to Settings', sub: 'Learner profile & voice', kbd: '4', run: () => switchTab('profile') },
    {
      label: 'Toggle Light / Dark Theme',
      sub: 'Obsidian Dark ↔ Alabaster Light',
      kbd: 'T',
      run: () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'),
    },
  ];

  function getFilteredCommands() {
    const q = cmdInput.value.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q));
  }

  function renderCmdList() {
    const items = getFilteredCommands();
    cmdSelected = Math.min(cmdSelected, Math.max(0, items.length - 1));
    cmdList.innerHTML = '';
    if (!items.length) {
      cmdList.innerHTML = '<div class="muted-note" style="padding:12px">No matching commands</div>';
      return;
    }
    items.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cmd-item' + (idx === cmdSelected ? ' is-selected' : '');
      btn.innerHTML = `<span>${item.label}<span class="cmd-item-sub">${item.sub}</span></span><span class="kbd">${item.kbd}</span>`;
      btn.addEventListener('click', () => {
        cmdDialog.close();
        item.run();
      });
      cmdList.appendChild(btn);
    });
  }

  function openCmdPalette() {
    cmdInput.value = '';
    cmdSelected = 0;
    renderCmdList();
    cmdDialog.showModal();
    cmdInput.focus();
  }

  $('btn-cmd-open').addEventListener('click', openCmdPalette);
  cmdDialog.addEventListener('click', (e) => {
    if (e.target === cmdDialog) cmdDialog.close();
  });
  cmdInput.addEventListener('input', () => {
    cmdSelected = 0;
    renderCmdList();
  });
  cmdInput.addEventListener('keydown', (e) => {
    const items = getFilteredCommands();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cmdSelected = (cmdSelected + 1) % Math.max(1, items.length);
      renderCmdList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cmdSelected = (cmdSelected - 1 + Math.max(1, items.length)) % Math.max(1, items.length);
      renderCmdList();
    } else if (e.key === 'Enter' && items[cmdSelected]) {
      e.preventDefault();
      cmdDialog.close();
      items[cmdSelected].run();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (cmdDialog.open) {
        cmdDialog.close();
      } else {
        openCmdPalette();
      }
      return;
    }
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || cmdDialog.open) return;

    if (e.code === 'Space' && !$('reading-results').hidden && !$('view-reading').hidden) {
      e.preventDefault();
      lyricsPlayer.togglePlayPause();
    } else if (e.key === 'ArrowLeft' && lyricsPlayer.isActive()) {
      e.preventDefault();
      lyricsPlayer.prev();
    } else if (e.key === 'ArrowRight' && lyricsPlayer.isActive()) {
      e.preventDefault();
      lyricsPlayer.next();
    }
  });

  Promise.all([loadProfile(), loadProgress()]).catch((err) => {
    showToast(`Unable to connect to Socratic backend: ${err.message}`);
  });
}

init();
