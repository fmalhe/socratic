CREATE TABLE learner_profile (
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

CREATE TABLE child_progress (
    profile_id INTEGER PRIMARY KEY REFERENCES learner_profile(id) ON DELETE CASCADE,
    total_stars INTEGER NOT NULL DEFAULT 0,
    current_streak_days INTEGER NOT NULL DEFAULT 0,
    last_activity_date TEXT,
    pages_read_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE saved_word (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES learner_profile(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    language_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saved_word_profile_created ON saved_word(profile_id, created_at DESC);

CREATE TABLE event_publication (
    id TEXT PRIMARY KEY,
    listener_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    serialized_event TEXT NOT NULL,
    publication_date TEXT NOT NULL,
    completion_date TEXT
);

CREATE INDEX idx_event_publication_completion_date ON event_publication(completion_date);
