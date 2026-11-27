import { Hono } from "hono";
import { z } from "zod";
import {
  arrayBufferToInlineImage,
  callGeminiStructured,
  fileToInlineImage,
  renderHomeworkHelpSystemPrompt,
  renderHomeworkPingPongSystemPrompt,
  renderHomeworkScanSystemPrompt,
  splitIntoSentences,
} from "../lib/gemini";
import type {
  Env,
  ExerciseStatus,
  HomeworkExerciseDto,
  HomeworkHelpResponse,
  HomeworkMessageDto,
  HomeworkReadingPassageDto,
  HomeworkReplyResponse,
  HomeworkSessionResponse,
  MessageSender,
  SentenceItem,
  WordHint,
} from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";
import { buildUploadUrl, deleteUploadedImage, storeUploadedImage, validateImageUpload } from "./uploads";

interface SessionRow {
  id: number;
  profile_id: number;
  page_title: string | null;
  page_summary_native: string;
  page_text_target: string;
  reading_passage_json: string | null;
  image_key: string | null;
  created_at: string;
}

interface ExerciseRow {
  id: number;
  session_id: number;
  position: number;
  label: string;
  prompt_target: string;
  prompt_native: string | null;
  prompt_english: string | null;
  explanation_native: string;
  explanation_target: string | null;
  explanation_english: string | null;
  tricky_words_json: string;
  opening_question_native: string;
  status: ExerciseStatus;
}

interface MessageRow {
  id: number;
  exercise_id: number;
  sender: MessageSender;
  content: string;
  target_phrase: string | null;
  created_at: string;
}

interface ScannedHomeworkPage {
  pageTitle: string;
  pageSummaryNative: string;
  pageTextTarget: string;
  readingPassage?: {
    titleTarget: string;
    sentences: SentenceItem[];
  } | null;
  exercises: Array<{
    label: string;
    promptTarget: string;
    promptNative: string;
    promptEnglish: string;
    explanationNative: string;
    explanationTarget: string;
    explanationEnglish: string;
    trickyWords: WordHint[];
    openingQuestionNative: string;
  }>;
}

interface TutorPingPongReply {
  replyNative: string;
  targetPhrase: string;
  followUpQuestionNative: string;
}

const WORD_HINT_SCHEMA = {
  type: "OBJECT",
  properties: {
    word: { type: "STRING" },
    syllables: { type: "STRING" },
    nativeHint: { type: "STRING" },
  },
  required: ["word", "syllables", "nativeHint"],
};

const HOMEWORK_HELP_SCHEMA = {
  type: "OBJECT",
  properties: {
    taskExplanationNative: { type: "STRING" },
    stepByStepHints: { type: "ARRAY", items: { type: "STRING" } },
    encouragementTarget: { type: "STRING" },
  },
  required: ["taskExplanationNative", "stepByStepHints", "encouragementTarget"],
};

const HOMEWORK_SCAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    pageTitle: { type: "STRING" },
    pageSummaryNative: { type: "STRING" },
    pageTextTarget: { type: "STRING" },
    readingPassage: {
      type: "OBJECT",
      properties: {
        titleTarget: { type: "STRING" },
        sentences: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              targetText: { type: "STRING" },
              nativeSummary: { type: "STRING" },
              englishSummary: { type: "STRING" },
              trickyWords: { type: "ARRAY", items: WORD_HINT_SCHEMA },
            },
            required: ["targetText", "nativeSummary", "englishSummary", "trickyWords"],
          },
        },
      },
      required: ["titleTarget", "sentences"],
    },
    exercises: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          promptTarget: { type: "STRING" },
          promptNative: { type: "STRING" },
          promptEnglish: { type: "STRING" },
          explanationNative: { type: "STRING" },
          explanationTarget: { type: "STRING" },
          explanationEnglish: { type: "STRING" },
          trickyWords: {
            type: "ARRAY",
            items: WORD_HINT_SCHEMA,
          },
          openingQuestionNative: { type: "STRING" },
        },
        required: [
          "label",
          "promptTarget",
          "promptNative",
          "promptEnglish",
          "explanationNative",
          "explanationTarget",
          "explanationEnglish",
          "trickyWords",
          "openingQuestionNative",
        ],
      },
    },
  },
  required: ["pageTitle", "pageSummaryNative", "pageTextTarget", "readingPassage", "exercises"],
};

const PING_PONG_SCHEMA = {
  type: "OBJECT",
  properties: {
    replyNative: { type: "STRING" },
    targetPhrase: { type: "STRING" },
    followUpQuestionNative: { type: "STRING" },
  },
  required: ["replyNative", "targetPhrase", "followUpQuestionNative"],
};

const replySchema = z.object({
  message: z.string().trim().min(1),
});

function derivePageTitle(row: SessionRow): string {
  if (row.page_title?.trim()) {
    return row.page_title.trim();
  }
  const source = row.page_text_target?.trim() || row.page_summary_native?.trim() || "";
  if (!source) return "Página de TPC";
  const firstLine = source.split(/[\n.!?]/)[0]?.trim() || source;
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 5);
  const title = words.join(" ");
  return title.length > 44 ? `${title.slice(0, 41).trim()}...` : title || "Página de TPC";
}

function normalizePassage(
  passage: { titleTarget?: string; sentences?: SentenceItem[] } | null | undefined,
  fallbackTitle: string,
): HomeworkReadingPassageDto | null {
  if (!passage || !Array.isArray(passage.sentences) || passage.sentences.length === 0) {
    return null;
  }
  const cleaned = passage.sentences
    .filter((s) => s && typeof s.targetText === "string" && s.targetText.trim().length > 0)
    .map((s) => ({
      targetText: s.targetText.trim(),
      nativeSummary: (s.nativeSummary ?? "").trim(),
      englishSummary: (s.englishSummary ?? "").trim(),
      trickyWords: Array.isArray(s.trickyWords) ? s.trickyWords : [],
    }));
  if (cleaned.length === 0) return null;
  return {
    titleTarget: (passage.titleTarget ?? "").trim() || fallbackTitle,
    sentences: cleaned,
  };
}

function parseReadingPassage(row: SessionRow, pageTitle: string): HomeworkReadingPassageDto | null {
  if (row.reading_passage_json !== null && row.reading_passage_json !== undefined) {
    try {
      const parsed = JSON.parse(row.reading_passage_json) as HomeworkReadingPassageDto;
      return normalizePassage(parsed, pageTitle);
    } catch {
      return null;
    }
  }
  // Legacy sessions created before migration 0006 fall back to splitting page_text_target
  const sentenceTexts = splitIntoSentences(row.page_text_target ?? "");
  if (sentenceTexts.length === 0) return null;
  return {
    titleTarget: pageTitle,
    sentences: sentenceTexts.map((targetText) => ({
      targetText,
      nativeSummary: "",
      englishSummary: "",
      trickyWords: [],
    })),
  };
}

async function hydrateSessionRows(
  db: D1Database,
  sessionRows: SessionRow[],
): Promise<HomeworkSessionResponse[]> {
  if (sessionRows.length === 0) {
    return [];
  }

  const sessionIds = sessionRows.map((s) => s.id);
  const sessionPlaceholders = sessionIds.map(() => "?").join(", ");
  const exerciseRes = await db
    .prepare(
      `SELECT * FROM homework_exercise WHERE session_id IN (${sessionPlaceholders}) ORDER BY session_id ASC, position ASC`,
    )
    .bind(...sessionIds)
    .all<ExerciseRow>();

  const exerciseRows = exerciseRes.results ?? [];
  const messagesByExercise = new Map<number, HomeworkMessageDto[]>();

  if (exerciseRows.length > 0) {
    const exerciseIds = exerciseRows.map((e) => e.id);
    const exercisePlaceholders = exerciseIds.map(() => "?").join(", ");
    const msgRes = await db
      .prepare(
        `SELECT * FROM homework_message WHERE exercise_id IN (${exercisePlaceholders}) ORDER BY id ASC`,
      )
      .bind(...exerciseIds)
      .all<MessageRow>();

    for (const m of msgRes.results ?? []) {
      const list = messagesByExercise.get(m.exercise_id) ?? [];
      list.push({
        id: m.id,
        sender: m.sender,
        content: m.content,
        targetPhrase: m.target_phrase,
        createdAt: m.created_at,
      });
      messagesByExercise.set(m.exercise_id, list);
    }
  }

  const exercisesBySession = new Map<number, HomeworkExerciseDto[]>();
  for (const row of exerciseRows) {
    let trickyWords: WordHint[] = [];
    try {
      trickyWords = JSON.parse(row.tricky_words_json) as WordHint[];
    } catch {
      trickyWords = [];
    }
    const list = exercisesBySession.get(row.session_id) ?? [];
    list.push({
      id: row.id,
      position: row.position,
      label: row.label,
      promptTarget: row.prompt_target,
      promptNative: row.prompt_native ?? null,
      promptEnglish: row.prompt_english ?? null,
      explanationNative: row.explanation_native,
      explanationTarget: row.explanation_target ?? null,
      explanationEnglish: row.explanation_english ?? null,
      trickyWords,
      openingQuestionNative: row.opening_question_native,
      status: row.status,
      messages: messagesByExercise.get(row.id) ?? [],
    });
    exercisesBySession.set(row.session_id, list);
  }

  return sessionRows.map((row) => {
    const pageTitle = derivePageTitle(row);
    return {
      id: row.id,
      profileId: row.profile_id,
      pageTitle,
      pageSummaryNative: row.page_summary_native,
      pageTextTarget: row.page_text_target,
      readingPassage: parseReadingPassage(row, pageTitle),
      imageUrl: buildUploadUrl(row.image_key),
      createdAt: row.created_at,
      exercises: exercisesBySession.get(row.id) ?? [],
    };
  });
}

export async function getHomeworkSession(
  db: D1Database,
  profileId: number,
  sessionId: number,
): Promise<HomeworkSessionResponse | null> {
  const row = await db
    .prepare("SELECT * FROM homework_session WHERE id = ? AND profile_id = ?")
    .bind(sessionId, profileId)
    .first<SessionRow>();
  if (!row) {
    return null;
  }
  const [hydrated] = await hydrateSessionRows(db, [row]);
  return hydrated ?? null;
}

export async function listHomeworkSessions(
  db: D1Database,
  profileId: number,
  options?: { limit?: number },
): Promise<HomeworkSessionResponse[]> {
  const limit = Math.max(1, Math.min(50, options?.limit ?? 20));
  const res = await db
    .prepare("SELECT * FROM homework_session WHERE profile_id = ? ORDER BY id DESC LIMIT ?")
    .bind(profileId, limit)
    .all<SessionRow>();

  return hydrateSessionRows(db, res.results ?? []);
}

export const homeworkRoutes = new Hono<{ Bindings: Env }>();

homeworkRoutes.post("/help", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const form = await c.req.formData();
  const imageField = form.get("image");
  const questionField = form.get("question");

  const image = imageField instanceof File && imageField.size > 0 ? imageField : undefined;
  const question = typeof questionField === "string" && questionField.trim() ? questionField.trim() : undefined;

  if (!image && !question) {
    return c.json({ error: "Either an image or a question must be provided" }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const response = await callGeminiStructured<HomeworkHelpResponse>(c.env, {
    systemPrompt: renderHomeworkHelpSystemPrompt(profile),
    userText: question ?? "Please explain this homework exercise without giving away the answer.",
    image: image ? await fileToInlineImage(image) : undefined,
    responseSchema: HOMEWORK_HELP_SCHEMA,
  });

  return c.json(response);
});

homeworkRoutes.post("/sessions/scan", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const form = await c.req.formData();
  const image = form.get("image");
  validateImageUpload(image);

  const profile = await getActiveProfile(c.env.DB, profileId);
  const buffer = await image.arrayBuffer();
  const inlineImage = arrayBufferToInlineImage(buffer, image.type || "image/jpeg");
  const stored = await storeUploadedImage(c.env, image, "homework", buffer);

  const scanned = await callGeminiStructured<ScannedHomeworkPage>(c.env, {
    systemPrompt: renderHomeworkScanSystemPrompt(profile),
    userText: "Please scan this homework page, extract any reading passage verbatim, and break down each exercise.",
    image: inlineImage,
    responseSchema: HOMEWORK_SCAN_SCHEMA,
  });

  const pageTitle = scanned.pageTitle?.trim() || "Página de TPC";
  const passageToStore: HomeworkReadingPassageDto = {
    titleTarget: scanned.readingPassage?.titleTarget?.trim() || pageTitle,
    sentences: Array.isArray(scanned.readingPassage?.sentences) ? scanned.readingPassage.sentences : [],
  };

  const insertSession = await c.env.DB.prepare(
    `INSERT INTO homework_session
       (profile_id, page_title, page_summary_native, page_text_target, reading_passage_json, image_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      profile.id,
      pageTitle,
      scanned.pageSummaryNative,
      scanned.pageTextTarget,
      JSON.stringify(passageToStore),
      stored.imageKey,
    )
    .run();

  const sessionId = Number(insertSession.meta.last_row_id);
  const exerciseStatements = (scanned.exercises ?? []).map((ex, idx) =>
    c.env.DB.prepare(
      `INSERT INTO homework_exercise
         (session_id, position, label, prompt_target, prompt_native, prompt_english, explanation_native, explanation_target, explanation_english, tricky_words_json, opening_question_native, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    ).bind(
      sessionId,
      idx + 1,
      ex.label,
      ex.promptTarget,
      ex.promptNative ?? null,
      ex.promptEnglish ?? null,
      ex.explanationNative,
      ex.explanationTarget ?? null,
      ex.explanationEnglish ?? null,
      JSON.stringify(ex.trickyWords ?? []),
      ex.openingQuestionNative,
    ),
  );

  if (exerciseStatements.length > 0) {
    await c.env.DB.batch(exerciseStatements);
  }

  const session = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  return c.json(session);
});

const SESSIONS_ACCEPT_QUERY = '"application/json", "text/plain"';

const sessionQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

function matchesHomeworkQuery(session: HomeworkSessionResponse, needle: string, status?: ExerciseStatus): boolean {
  if (status && !session.exercises.some((ex) => ex.status === status)) {
    return false;
  }
  if (!needle) return true;
  const haystacks = [
    session.pageTitle,
    session.pageSummaryNative,
    session.pageTextTarget,
    session.readingPassage?.titleTarget ?? "",
    ...(session.readingPassage?.sentences ?? []).flatMap((s) => [s.targetText, s.nativeSummary]),
    ...session.exercises.flatMap((ex) => [
      ex.label,
      ex.promptTarget,
      ex.explanationNative,
      ...(ex.trickyWords ?? []).flatMap((w) => [w.word, w.nativeHint]),
    ]),
  ];
  return haystacks.some((text) => text && text.toLowerCase().includes(needle));
}

homeworkRoutes.on("OPTIONS", "/sessions", (c) =>
  c.body(null, 204, {
    Allow: "GET, QUERY, OPTIONS",
    "Accept-Query": SESSIONS_ACCEPT_QUERY,
  }),
);

homeworkRoutes.get("/sessions", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const profile = await getActiveProfile(c.env.DB, profileId);
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const limitRaw = Number(c.req.query("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 20;

  const sessions = await listHomeworkSessions(c.env.DB, profile.id, { limit: q ? 50 : limit });
  const result = q
    ? sessions.filter((s) => matchesHomeworkQuery(s, q)).slice(0, limit)
    : sessions.slice(0, limit);

  return c.json(result, 200, {
    "Accept-Query": SESSIONS_ACCEPT_QUERY,
  });
});

homeworkRoutes.on("QUERY", "/sessions", async (c) => {
  const contentType = c.req.header("Content-Type")?.toLowerCase() ?? "";
  if (!contentType) {
    return c.json({ error: "Content-Type header is required for QUERY requests" }, 400, {
      "Accept-Query": SESSIONS_ACCEPT_QUERY,
    });
  }

  let queryInput: { q: string; status?: ExerciseStatus; limit: number };
  if (contentType.includes("application/json")) {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON query body" }, 400, { "Accept-Query": SESSIONS_ACCEPT_QUERY });
    }
    const parsed = sessionQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 422, { "Accept-Query": SESSIONS_ACCEPT_QUERY });
    }
    queryInput = parsed.data;
  } else if (contentType.includes("text/plain")) {
    const text = (await c.req.text()).trim();
    queryInput = { q: text, limit: 20 };
  } else {
    return c.json({ error: "Unsupported Media Type; expected application/json or text/plain" }, 415, {
      "Accept-Query": SESSIONS_ACCEPT_QUERY,
    });
  }

  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const profile = await getActiveProfile(c.env.DB, profileId);
  const allSessions = await listHomeworkSessions(c.env.DB, profile.id, { limit: 50 });
  const needle = queryInput.q.toLowerCase();
  const filtered = allSessions
    .filter((session) => matchesHomeworkQuery(session, needle, queryInput.status))
    .slice(0, queryInput.limit);

  return c.json(filtered, 200, {
    "Accept-Query": SESSIONS_ACCEPT_QUERY,
  });
});

homeworkRoutes.get("/sessions/:sessionId", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const sessionId = Number(c.req.param("sessionId"));
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return c.json({ error: "Invalid sessionId" }, 400);
  }
  const profile = await getActiveProfile(c.env.DB, profileId);
  const session = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  if (!session) {
    return c.json({ error: `Homework session not found: ${sessionId}` }, 404);
  }
  return c.json(session);
});

homeworkRoutes.delete("/sessions/:sessionId", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const sessionId = Number(c.req.param("sessionId"));
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return c.json({ error: "Invalid sessionId" }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const row = await c.env.DB.prepare(
    "SELECT id, image_key FROM homework_session WHERE id = ? AND profile_id = ?",
  )
    .bind(sessionId, profile.id)
    .first<{ id: number; image_key: string | null }>();

  if (!row) {
    return c.json({ error: `Homework session not found: ${sessionId}` }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM homework_message WHERE exercise_id IN (SELECT id FROM homework_exercise WHERE session_id = ?)",
    ).bind(sessionId),
    c.env.DB.prepare("DELETE FROM homework_exercise WHERE session_id = ?").bind(sessionId),
    c.env.DB.prepare("DELETE FROM homework_session WHERE id = ? AND profile_id = ?").bind(
      sessionId,
      profile.id,
    ),
  ]);

  await deleteUploadedImage(c.env, row.image_key);
  return c.json({ deleted: true, id: sessionId });
});

homeworkRoutes.post("/sessions/:sessionId/exercises/:exerciseId/reply", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const sessionId = Number(c.req.param("sessionId"));
  const exerciseId = Number(c.req.param("exerciseId"));
  const parsed = replySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const session = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  const exercise = session?.exercises.find((e) => e.id === exerciseId);
  if (!session || !exercise) {
    return c.json({ error: `Homework exercise not found: ${exerciseId}` }, 404);
  }

  const reply = await callGeminiStructured<TutorPingPongReply>(c.env, {
    systemPrompt: renderHomeworkPingPongSystemPrompt(
      profile,
      session.pageSummaryNative,
      exercise,
      exercise.messages,
    ),
    userText: parsed.data.message,
    responseSchema: PING_PONG_SCHEMA,
  });

  const nextStatus: ExerciseStatus = exercise.status === "PENDING" ? "IN_PROGRESS" : exercise.status;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO homework_message (exercise_id, sender, content, target_phrase) VALUES (?, 'CHILD', ?, NULL)",
    ).bind(exerciseId, parsed.data.message),
    c.env.DB.prepare(
      "INSERT INTO homework_message (exercise_id, sender, content, target_phrase) VALUES (?, 'TUTOR', ?, ?)",
    ).bind(exerciseId, reply.replyNative, reply.targetPhrase),
    c.env.DB.prepare("UPDATE homework_exercise SET status = ? WHERE id = ?").bind(nextStatus, exerciseId),
  ]);

  const response: HomeworkReplyResponse = {
    exerciseId,
    status: nextStatus,
    replyNative: reply.replyNative,
    targetPhrase: reply.targetPhrase,
    followUpQuestionNative: reply.followUpQuestionNative,
  };
  return c.json(response);
});

homeworkRoutes.post("/sessions/:sessionId/exercises/:exerciseId/complete", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const sessionId = Number(c.req.param("sessionId"));
  const exerciseId = Number(c.req.param("exerciseId"));

  const profile = await getActiveProfile(c.env.DB, profileId);
  const session = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  const exercise = session?.exercises.find((e) => e.id === exerciseId);
  if (!session || !exercise) {
    return c.json({ error: `Homework exercise not found: ${exerciseId}` }, 404);
  }

  await c.env.DB.prepare("UPDATE homework_exercise SET status = 'COMPLETED' WHERE id = ?")
    .bind(exerciseId)
    .run();

  const updatedSession = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  const updatedExercise = updatedSession?.exercises.find((e) => e.id === exerciseId);
  return c.json(updatedExercise);
});

const HYDRATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    promptNative: { type: "STRING" },
    promptEnglish: { type: "STRING" },
    explanationTarget: { type: "STRING" },
    explanationEnglish: { type: "STRING" },
  },
  required: ["promptNative", "promptEnglish", "explanationTarget", "explanationEnglish"],
};

homeworkRoutes.post("/sessions/:sessionId/exercises/:exerciseId/hydrate", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const sessionId = Number(c.req.param("sessionId"));
  const exerciseId = Number(c.req.param("exerciseId"));

  const profile = await getActiveProfile(c.env.DB, profileId);
  const session = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  const exercise = session?.exercises.find((e) => e.id === exerciseId);
  if (!session || !exercise) {
    return c.json({ error: `Homework exercise not found: ${exerciseId}` }, 404);
  }

  if (
    exercise.promptNative &&
    exercise.promptEnglish &&
    exercise.explanationTarget &&
    exercise.explanationEnglish
  ) {
    return c.json(exercise);
  }

  const hydrated = await callGeminiStructured<{
    promptNative: string;
    promptEnglish: string;
    explanationTarget: string;
    explanationEnglish: string;
  }>(c.env, {
    systemPrompt: `You are a warm, Socratic homework tutor for a ${profile.age}-year-old learning ${profile.targetLanguageName} (native: ${profile.nativeLanguageName}).
${profile.dialectRules}
Return concise, kid-friendly spoken-only plain prose (<= 25 words each, no markdown). NEVER give away the answer.
- promptNative: natural ${profile.nativeLanguageName} translation of the exercise question.
- promptEnglish: natural simple English translation of the exercise question.
- explanationTarget: short spoken explanation in simple ${profile.targetLanguageName}.
- explanationEnglish: short spoken explanation in simple English.`,
    userText: `Exercise question (${profile.targetLanguageName}): ${exercise.promptTarget}\nExisting explanation (${profile.nativeLanguageName}): ${exercise.explanationNative}`,
    responseSchema: HYDRATE_SCHEMA,
  });

  await c.env.DB.prepare(
    `UPDATE homework_exercise
       SET prompt_native = COALESCE(prompt_native, ?),
           prompt_english = COALESCE(prompt_english, ?),
           explanation_target = COALESCE(explanation_target, ?),
           explanation_english = COALESCE(explanation_english, ?)
     WHERE id = ?`,
  )
    .bind(
      hydrated.promptNative,
      hydrated.promptEnglish,
      hydrated.explanationTarget,
      hydrated.explanationEnglish,
      exerciseId,
    )
    .run();

  const updatedSession = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  const updatedExercise = updatedSession?.exercises.find((e) => e.id === exerciseId);
  return c.json(updatedExercise);
});

const PASSAGE_HYDRATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    titleTarget: { type: "STRING" },
    sentences: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          targetText: { type: "STRING" },
          nativeSummary: { type: "STRING" },
          englishSummary: { type: "STRING" },
        },
        required: ["targetText", "nativeSummary", "englishSummary"],
      },
    },
  },
  required: ["titleTarget", "sentences"],
};

homeworkRoutes.post("/sessions/:sessionId/passage/hydrate", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const sessionId = Number(c.req.param("sessionId"));
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return c.json({ error: "Invalid sessionId" }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const session = await getHomeworkSession(c.env.DB, profile.id, sessionId);
  if (!session) {
    return c.json({ error: `Homework session not found: ${sessionId}` }, 404);
  }
  if (!session.readingPassage || session.readingPassage.sentences.length === 0) {
    return c.json({ error: "This homework page does not have a reading passage" }, 404);
  }

  const needsHydration = session.readingPassage.sentences.some(
    (s) => !s.nativeSummary?.trim() || !s.englishSummary?.trim(),
  );
  if (!needsHydration) {
    return c.json(session.readingPassage);
  }

  const hydrated = await callGeminiStructured<{
    titleTarget: string;
    sentences: Array<{ targetText: string; nativeSummary: string; englishSummary: string }>;
  }>(c.env, {
    systemPrompt: `You are a warm children's tutor helping a ${profile.age}-year-old understand a ${profile.targetLanguageName} passage (native: ${profile.nativeLanguageName}).
${profile.dialectRules}
For each input sentence, keep \`targetText\` intact and provide concise, kid-friendly spoken translations (<= 25 words, plain prose):
- nativeSummary (${profile.nativeLanguageName})
- englishSummary (simple English)`,
    userText: JSON.stringify({
      titleTarget: session.readingPassage.titleTarget,
      sentences: session.readingPassage.sentences.map((s) => s.targetText),
    }),
    responseSchema: PASSAGE_HYDRATE_SCHEMA,
  });

  const mergedSentences: SentenceItem[] = session.readingPassage.sentences.map((orig, idx) => {
    const match = hydrated.sentences?.[idx];
    return {
      targetText: orig.targetText,
      nativeSummary: orig.nativeSummary?.trim() || match?.nativeSummary?.trim() || "",
      englishSummary: orig.englishSummary?.trim() || match?.englishSummary?.trim() || "",
      trickyWords: orig.trickyWords ?? [],
    };
  });

  const updatedPassage: HomeworkReadingPassageDto = {
    titleTarget: session.readingPassage.titleTarget || hydrated.titleTarget?.trim() || session.pageTitle,
    sentences: mergedSentences,
  };

  await c.env.DB.prepare("UPDATE homework_session SET reading_passage_json = ? WHERE id = ?")
    .bind(JSON.stringify(updatedPassage), sessionId)
    .run();

  return c.json(updatedPassage);
});
