ALTER TABLE homework_session ADD COLUMN page_title TEXT;
ALTER TABLE homework_session ADD COLUMN reading_passage_json TEXT;
ALTER TABLE homework_exercise ADD COLUMN prompt_english TEXT;

-- Upgrade legacy Cloud TTS Wavenet voice default to warm natural Gemini 3.8 voice
UPDATE learner_profile
SET tts_voice_name = 'Sulafat'
WHERE tts_voice_name = 'pt-PT-Wavenet-A';
