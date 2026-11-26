const state = {
  profile: null,
  progress: null,
  readingPage: null,
  readingPreviewUrl: null,
  homeworkSessions: [],
  activeSession: null,
  activeExerciseIndex: 0,
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

/* Cached cloud TTS fetcher (Gemini 3.8 Flash-Lite TTS / Google Cloud TTS + R2 cache) */
const ttsAudioCache = new Map();
async function fetchTtsAudio(text, slow = false) {
  const langCode = state.profile?.targetLanguageCode || 'pt-PT';
  const voice = state.profile?.ttsVoiceName || '';
  const key = `${langCode}|${voice}|${slow ? '1' : '0'}|${text}`;
  if (ttsAudioCache.has(key)) {
    return ttsAudioCache.get(key);
  }
  const promise = (async () => {
    try {
      const res = await fetch('/api/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, languageCode: langCode, slow }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const provider = res.headers.get('X-Audio-Provider') || 'cloud';
      return { url, provider };
    } catch {
      return null;
    }
  })();
  ttsAudioCache.set(key, promise);
  const result = await promise;
  if (!result) ttsAudioCache.delete(key);
  return result;
}

/* Safari & Android Chrome/Brave friendly TTS with automatic speechSynthesis fallback */
let currentAudio = null;
async function speakText(text, slow = false) {
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

  const clip = await fetchTtsAudio(text, slow);
  if (clip?.url) {
    const audio = new Audio(clip.url);
    currentAudio = audio;
    await audio.play();
    return;
  }

  if (window.speechSynthesis) {
    const langCode = state.profile?.targetLanguageCode || 'pt-PT';
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
  $('learner-subtitle').textContent = `${p.name} · ${p.targetLanguageName} → ${p.nativeLanguageName}`;
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

    speedBtn.textContent = slow ? '0.75× Slow' : '1× Speed';
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

/* Reading Flow */
async function handleReadingUpload(file) {
  if (!file) return;
  lyricsPlayer.stop();
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
    showToast(`Could not scan page: ${err.message}`);
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
    btnListen.textContent = 'Play Here';
    btnListen.addEventListener('click', () => lyricsPlayer.playFrom(idx, false));

    const btnSlow = document.createElement('button');
    btnSlow.type = 'button';
    btnSlow.className = 'btn btn-secondary btn-sm';
    btnSlow.textContent = '0.75× Slow';
    btnSlow.addEventListener('click', () => lyricsPlayer.playFrom(idx, true));

    audioRow.append(btnListen, btnSlow);

    const wordsRow = document.createElement('div');
    wordsRow.className = 'tricky-words-row';
    (sentence.trickyWords || []).forEach((w) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'word-pill';
      pill.textContent = w.word;
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
  showToast('Awesome reading! +10 stars earned ★');
}

/* Homework Session Flow */
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

function renderSessionChips() {
  const container = $('homework-recent-sessions');
  const chips = $('session-chips');
  if (!state.homeworkSessions.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  chips.innerHTML = '';
  state.homeworkSessions.forEach((session) => {
    const done = session.exercises.filter((e) => e.status === 'COMPLETED').length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'session-chip' + (state.activeSession?.id === session.id ? ' is-active' : '');
    btn.textContent = `Page #${session.id} (${done}/${session.exercises.length})`;
    btn.addEventListener('click', () => selectHomeworkSession(session));
    chips.appendChild(btn);
  });
}

async function handleHomeworkScan(file) {
  if (!file) return;
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
          'Preparing Socratic hints & tricky words…',
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
    showToast(`Found ${session.exercises.length} exercises! Let's do them one by one.`);
  } catch (err) {
    URL.revokeObjectURL(localUrl);
    homeworkProgress.hide();
    showToast(`Could not scan homework: ${err.message}`);
  }
}

function selectHomeworkSession(session) {
  state.activeSession = session;
  const firstPending = session.exercises.findIndex((e) => e.status !== 'COMPLETED');
  state.activeExerciseIndex = firstPending >= 0 ? firstPending : 0;
  renderSessionChips();
  renderHomeworkWorkspace();
}

function renderHomeworkWorkspace() {
  const session = state.activeSession;
  if (!session || !session.exercises.length) {
    $('homework-workspace').hidden = true;
    return;
  }
  $('homework-workspace').hidden = false;
  $('hw-page-summary').textContent = session.pageSummaryNative;

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

  const ex = session.exercises[state.activeExerciseIndex];
  $('hw-ex-badge').textContent = `Exercise ${ex.label}`;
  const statusEl = $('hw-ex-status');
  statusEl.textContent = ex.status;
  statusEl.classList.toggle('is-completed', ex.status === 'COMPLETED');
  $('hw-ex-target').textContent = ex.promptTarget;
  $('hw-ex-explanation').textContent = ex.explanationNative;

  const wordsRow = $('hw-ex-words');
  wordsRow.innerHTML = '';
  (ex.trickyWords || []).forEach((w) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'word-pill';
    pill.textContent = w.word;
    pill.addEventListener('click', () => openWordDialog(w));
    wordsRow.appendChild(pill);
  });

  const msgBox = $('hw-messages');
  msgBox.innerHTML = '';
  const opener = document.createElement('div');
  opener.className = 'msg-bubble msg-tutor';
  opener.textContent = ex.openingQuestionNative;
  msgBox.appendChild(opener);

  (ex.messages || []).forEach((m) => {
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${m.sender === 'CHILD' ? 'msg-child' : 'msg-tutor'}`;
    bubble.textContent = m.content;
    if (m.targetPhrase) {
      const phraseBtn = document.createElement('button');
      phraseBtn.type = 'button';
      phraseBtn.className = 'msg-phrase-btn';
      phraseBtn.textContent = m.targetPhrase;
      phraseBtn.addEventListener('click', () => speakText(m.targetPhrase, true));
      bubble.appendChild(document.createElement('br'));
      bubble.appendChild(phraseBtn);
    }
    msgBox.appendChild(bubble);
  });
  msgBox.scrollTop = msgBox.scrollHeight;

  const completeBtn = $('btn-hw-complete');
  completeBtn.disabled = ex.status === 'COMPLETED';
  completeBtn.textContent = ex.status === 'COMPLETED' ? 'Completed' : 'Mark Exercise Done';
}

async function submitHomeworkReply(event) {
  event.preventDefault();
  const input = $('hw-reply-input');
  const message = input.value.trim();
  if (!message || !state.activeSession) return;

  const session = state.activeSession;
  const ex = session.exercises[state.activeExerciseIndex];
  const sendBtn = $('btn-hw-send');
  sendBtn.disabled = true;

  try {
    const reply = await apiJson(
      `/api/homework/sessions/${session.id}/exercises/${ex.id}/reply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    );
    input.value = '';
    const updatedSession = await apiJson(`/api/homework/sessions/${session.id}`);
    state.activeSession = updatedSession;
    state.homeworkSessions = state.homeworkSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s));
    renderHomeworkWorkspace();
    if (reply.followUpQuestionNative) {
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble msg-tutor';
      bubble.textContent = reply.followUpQuestionNative;
      $('hw-messages').appendChild(bubble);
      $('hw-messages').scrollTop = $('hw-messages').scrollHeight;
    }
  } catch (err) {
    showToast(`Could not send reply: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
  }
}

async function completeActiveExercise() {
  const session = state.activeSession;
  if (!session) return;
  const ex = session.exercises[state.activeExerciseIndex];
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

    const nextPending = updatedSession.exercises.findIndex((item) => item.status !== 'COMPLETED');
    if (nextPending >= 0) {
      state.activeExerciseIndex = nextPending;
      showToast('Exercise done! +5 ★ — Moving to the next one!');
    } else {
      showToast('You finished the whole homework page! 🎉 +5 ★');
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
  $('btn-hw-photo').addEventListener('click', () => {
    const session = state.activeSession;
    const url = session?.imageUrl || (session ? state.localSessionPhotos.get(session.id) : null);
    openPhotoDialog(url);
  });
  $('btn-hw-listen').addEventListener('click', () => {
    const ex = state.activeSession?.exercises[state.activeExerciseIndex];
    speakText(ex?.promptTarget, false);
  });
  $('btn-hw-slow').addEventListener('click', () => {
    const ex = state.activeSession?.exercises[state.activeExerciseIndex];
    speakText(ex?.promptTarget, true);
  });
  $('hw-reply-form').addEventListener('submit', submitHomeworkReply);
  $('btn-hw-complete').addEventListener('click', completeActiveExercise);

  $('profile-form').addEventListener('submit', saveProfile);

  $('btn-dialog-slow').addEventListener('click', () => speakText(state.activeWord?.word, true));
  $('btn-dialog-normal').addEventListener('click', () => speakText(state.activeWord?.word, false));
  $('btn-dialog-close').addEventListener('click', () => $('word-dialog').close());

  $('btn-photo-close').addEventListener('click', () => $('photo-dialog').close());
  $('photo-dialog').addEventListener('click', (e) => {
    if (e.target === $('photo-dialog')) $('photo-dialog').close();
  });

  Promise.all([loadProfile(), loadProgress()]).catch((err) => {
    showToast(`Unable to connect to Socratic backend: ${err.message}`);
  });
}

init();
