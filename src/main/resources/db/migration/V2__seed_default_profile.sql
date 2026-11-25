INSERT INTO learner_profile (
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

INSERT INTO child_progress (
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
