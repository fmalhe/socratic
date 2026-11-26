export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Optional Cloudflare R2 bucket for persisting scanned page photos and caching TTS audio. */
  UPLOADS?: R2Bucket;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  GEMINI_TTS_MODEL?: string;
  GEMINI_TTS_VOICE?: string;
  GOOGLE_TTS_API_KEY?: string;
  /** Optional comma-separated list of allowed home IPs (e.g. "203.0.113.10"). When unset, rely on Cloudflare Access. */
  ALLOWED_IPS?: string;
}

export interface LearnerProfileDto {
  id: number;
  name: string;
  age: number;
  targetLanguageCode: string;
  targetLanguageName: string;
  nativeLanguageCode: string;
  nativeLanguageName: string;
  dialectRules: string;
  ttsVoiceName: string;
}

export interface WordHint {
  word: string;
  syllables: string;
  nativeHint: string;
}

export interface SentenceItem {
  targetText: string;
  nativeSummary: string;
  trickyWords: WordHint[];
}

export interface ReadingPageResponse {
  fullText: string;
  sentences: SentenceItem[];
  imageUrl?: string | null;
}

export interface HomeworkHelpResponse {
  taskExplanationNative: string;
  stepByStepHints: string[];
  encouragementTarget: string;
}

export type ExerciseStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type MessageSender = "CHILD" | "TUTOR";

export interface HomeworkMessageDto {
  id: number;
  sender: MessageSender;
  content: string;
  targetPhrase: string | null;
  createdAt: string;
}

export interface HomeworkExerciseDto {
  id: number;
  position: number;
  label: string;
  promptTarget: string;
  explanationNative: string;
  trickyWords: WordHint[];
  openingQuestionNative: string;
  status: ExerciseStatus;
  messages: HomeworkMessageDto[];
}

export interface HomeworkSessionResponse {
  id: number;
  profileId: number;
  pageSummaryNative: string;
  pageTextTarget: string;
  imageUrl?: string | null;
  createdAt: string;
  exercises: HomeworkExerciseDto[];
}

export interface HomeworkReplyResponse {
  exerciseId: number;
  status: ExerciseStatus;
  replyNative: string;
  targetPhrase: string;
  followUpQuestionNative: string;
}

export interface SavedWordDto {
  id: number;
  word: string;
  languageCode: string;
  createdAt: string;
}

export interface ProgressResponse {
  profileId: number;
  totalStars: number;
  currentStreakDays: number;
  lastActivityDate: string | null;
  pagesReadCount: number;
  recentWords: SavedWordDto[];
}
