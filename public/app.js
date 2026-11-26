const state = {
  profile: null,
  progress: null,
  readingPage: null,
  homeworkSessions: [],
  activeSession: null,
  activeExerciseIndex: 0,
  activeWord: null,
};

const $ = (id) => document.getElementById(id);

let toastTimer = null;
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

/* Safari-friendly TTS with automatic speechSynthesis fallback on HTTP 501 */
let currentAudio = null;
async function speakText(text, slow = false) {
  if (!text) return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  try {
    const res = await fetch('/api/audio/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        languageCode: state.profile?.targetLanguageCode || null,
        slow,
      }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      return;
    }
  } catch {
    // Fall through to browser speechSynthesis
  }

  if (window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = state.profile?.targetLanguageCode || 'pt-PT';
    utterance.rate = slow ? 0.72 : 0.96;
    window.speechSynthesis.speak(utterance);
  } else {
    showToast('Audio playback is unavailable in this browser.');
  }
}

/* Navigation */
function switchTab(tabName) {
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

/* Reading Flow */
async function handleReadingUpload(file) {
  if (!file) return;
  $('reading-loading').hidden = false;
  $('reading-results').hidden = true;
  try {
    const form = new FormData();
    form.append('image', file);
    state.readingPage = await apiJson('/api/reading/scan', { method: 'POST', body: form });
    renderReadingPage();
  } catch (err) {
    showToast(`Could not scan page: ${err.message}`);
  } finally {
    $('reading-loading').hidden = true;
  }
}

function renderReadingPage() {
  const page = state.readingPage;
  if (!page) return;
  const list = $('reading-sentences');
  list.innerHTML = '';

  page.sentences.forEach((sentence) => {
    const card = document.createElement('article');
    card.className = 'sentence-card';

    const target = document.createElement('p');
    target.className = 'reading-text';
    target.textContent = sentence.targetText;

    const summary = document.createElement('p');
    summary.className = 'native-summary';
    summary.textContent = sentence.nativeSummary;

    const audioRow = document.createElement('div');
    audioRow.className = 'audio-row';

    const btnListen = document.createElement('button');
    btnListen.type = 'button';
    btnListen.className = 'btn btn-secondary btn-sm';
    btnListen.textContent = 'Listen';
    btnListen.addEventListener('click', () => speakText(sentence.targetText, false));

    const btnSlow = document.createElement('button');
    btnSlow.type = 'button';
    btnSlow.className = 'btn btn-secondary btn-sm';
    btnSlow.textContent = '0.75× Slow';
    btnSlow.addEventListener('click', () => speakText(sentence.targetText, true));

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
  });

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
  $('homework-loading').hidden = false;
  try {
    const form = new FormData();
    form.append('image', file);
    const session = await apiJson('/api/homework/sessions/scan', { method: 'POST', body: form });
    state.homeworkSessions = [session, ...state.homeworkSessions.filter((s) => s.id !== session.id)];
    selectHomeworkSession(session);
    showToast(`Found ${session.exercises.length} exercises! Let's do them one by one.`);
  } catch (err) {
    showToast(`Could not scan homework: ${err.message}`);
  } finally {
    $('homework-loading').hidden = true;
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

  $('reading-camera-input').addEventListener('change', (e) => handleReadingUpload(e.target.files[0]));
  $('reading-library-input').addEventListener('change', (e) => handleReadingUpload(e.target.files[0]));
  $('btn-read-all').addEventListener('click', () => speakText(state.readingPage?.fullText, false));
  $('btn-finish-reading').addEventListener('click', finishReadingPage);

  $('homework-camera-input').addEventListener('change', (e) => handleHomeworkScan(e.target.files[0]));
  $('homework-library-input').addEventListener('change', (e) => handleHomeworkScan(e.target.files[0]));
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

  Promise.all([loadProfile(), loadProgress()]).catch((err) => {
    showToast(`Unable to connect to Socratic backend: ${err.message}`);
  });
}

init();
