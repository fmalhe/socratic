CREATE TABLE IF NOT EXISTS learner_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    target_language_code TEXT NOT NULL,
    target_language_name TEXT NOT NULL,
    native_language_code TEXT NOT NULL,
    native_language_name TEXT NOT NULL,
    dialect_rules TEXT NOT NULL,
    tts_voice_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS child_progress (
    profile_id INTEGER PRIMARY KEY REFERENCES learner_profile(id) ON DELETE CASCADE,
    total_stars INTEGER NOT NULL DEFAULT 0,
    current_streak_days INTEGER NOT NULL DEFAULT 0,
    last_activity_date TEXT,
    pages_read_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS saved_word (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES learner_profile(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    language_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_word_profile_created ON saved_word(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS homework_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES learner_profile(id) ON DELETE CASCADE,
    page_summary_native TEXT NOT NULL,
    page_text_target TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_homework_session_profile ON homework_session(profile_id, id DESC);

CREATE TABLE IF NOT EXISTS homework_exercise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES homework_session(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    prompt_target TEXT NOT NULL,
    explanation_native TEXT NOT NULL,
    tricky_words_json TEXT NOT NULL,
    opening_question_native TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_homework_exercise_session ON homework_exercise(session_id, position);

CREATE TABLE IF NOT EXISTS homework_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL REFERENCES homework_exercise(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    target_phrase TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_homework_message_exercise ON homework_message(exercise_id, id);

INSERT OR IGNORE INTO learner_profile (
    id,
    name,
    age,
    target_language_code,
    target_language_name,
    native_language_code,
    native_language_name,
    dialect_rules,
    tts_voice_name
) VALUES (
    1,
    'Sofia',
    8,
    'pt-PT',
    'European Portuguese',
    'nb-NO',
    'Norwegian',
    'ALWAYS use European Portuguese (PT-PT)—never Brazilian Portuguese. Use tu forms, estar a + infinitivo, and PT-PT vocabulary like autocarro, pequeno-almoço, telemóvel, and ecrã.',
    'pt-PT-Wavenet-A'
);

INSERT OR IGNORE INTO child_progress (
    profile_id,
    total_stars,
    current_streak_days,
    last_activity_date,
    pages_read_count
) VALUES (
    1,
    0,
    0,
    NULL,
    0
);
