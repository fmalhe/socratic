CREATE TABLE homework_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES learner_profile(id) ON DELETE CASCADE,
    page_summary_native TEXT NOT NULL,
    page_text_target TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_homework_session_profile ON homework_session(profile_id, id DESC);

CREATE TABLE homework_exercise (
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

CREATE INDEX idx_homework_exercise_session ON homework_exercise(session_id, position);

CREATE TABLE homework_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL REFERENCES homework_exercise(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    target_phrase TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_homework_message_exercise ON homework_message(exercise_id, id);
