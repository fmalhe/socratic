import { Hono } from "hono";
import { z } from "zod";
import {
  callGeminiStructured,
  fileToInlineImage,
  renderHomeworkHelpSystemPrompt,
  renderHomeworkPingPongSystemPrompt,
  renderHomeworkScanSystemPrompt,
} from "../lib/gemini";
import type {
  Env,
  ExerciseStatus,
  HomeworkExerciseDto,
  HomeworkHelpResponse,
  HomeworkMessageDto,
  HomeworkReplyResponse,
  HomeworkSessionResponse,
  MessageSender,
  WordHint,
} from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";
import { buildUploadUrl, storeUploadedImage } from "./uploads";

interface SessionRow {
  id: number;
  profile_id: number;
  page_summary_native: string;
  page_text_target: string;
  image_key: string | null;
  created_at: string;
}

interface ExerciseRow {
  id: number;
  session_id: number;
  position: number;
  label: string;
  prompt_target: string;
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
  pageSummaryNative: string;
  pageTextTarget: string;
  exercises: Array<{
    label: string;
    promptTarget: string;
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
    pageSummaryNative: { type: "STRING" },
    pageTextTarget: { type: "STRING" },
    exercises: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          promptTarget: { type: "STRING" },
          explanationNative: { type: "STRING" },
          explanationTarget: { type: "STRING" },
          explanationEnglish: { type: "STRING" },
          trickyWords: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                word: { type: "STRING" },
                syllables: { type: "STRING" },
                nativeHint: { type: "STRING" },
              },
              required: ["word", "syllables", "nativeHint"],
            },
          },
          openingQuestionNative: { type: "STRING" },
        },
        required: [
          "label",
          "promptTarget",
          "explanationNative",
          "explanationTarget",
          "explanationEnglish",
          "trickyWords",
          "openingQuestionNative",
        ],
      },
    },
  },
  required: ["pageSummaryNative", "pageTextTarget", "exercises"],
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

async function loadMessages(db: D1Database, exerciseId: number): Promise<HomeworkMessageDto[]> {
  const res = await db
    .prepare("SELECT * FROM homework_message WHERE exercise_id = ? ORDER BY id ASC")
    .bind(exerciseId)
    .all<MessageRow>();
  return (res.results ?? []).map((m) => ({
    id: m.id,
    sender: m.sender,
    content: m.content,
    targetPhrase: m.target_phrase,
    createdAt: m.created_at,
  }));
}

async function loadExercises(db: D1Database, sessionId: number): Promise<HomeworkExerciseDto[]> {
  const res = await db
    .prepare("SELECT * FROM homework_exercise WHERE session_id = ? ORDER BY position ASC")
    .bind(sessionId)
    .all<ExerciseRow>();

  const exercises: HomeworkExerciseDto[] = [];
  for (const row of res.results ?? []) {
    exercises.push({
      id: row.id,
      position: row.position,
      label: row.label,
      promptTarget: row.prompt_target,
      explanationNative: row.explanation_native,
      explanationTarget: row.explanation_target ?? null,
      explanationEnglish: row.explanation_english ?? null,
      trickyWords: JSON.parse(row.tricky_words_json) as WordHint[],
      openingQuestionNative: row.opening_question_native,
      status: row.status,
      messages: await loadMessages(db, row.id),
    });
  }
  return exercises;
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
  return {
    id: row.id,
    profileId: row.profile_id,
    pageSummaryNative: row.page_summary_native,
    pageTextTarget: row.page_text_target,
    imageUrl: buildUploadUrl(row.image_key),
    createdAt: row.created_at,
    exercises: await loadExercises(db, row.id),
  };
}

export async function listHomeworkSessions(
  db: D1Database,
  profileId: number,
): Promise<HomeworkSessionResponse[]> {
  const res = await db
    .prepare("SELECT * FROM homework_session WHERE profile_id = ? ORDER BY id DESC LIMIT 10")
    .bind(profileId)
    .all<SessionRow>();

  const sessions: HomeworkSessionResponse[] = [];
  for (const row of res.results ?? []) {
    sessions.push({
      id: row.id,
      profileId: row.profile_id,
      pageSummaryNative: row.page_summary_native,
      pageTextTarget: row.page_text_target,
      imageUrl: buildUploadUrl(row.image_key),
      createdAt: row.created_at,
      exercises: await loadExercises(db, row.id),
    });
  }
  return sessions;
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
  if (!(image instanceof File) || image.size === 0) {
    return c.json({ error: "Image file must not be empty" }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const [inlineImage, stored] = await Promise.all([
    fileToInlineImage(image),
    storeUploadedImage(c.env, image, "homework"),
  ]);

  const scanned = await callGeminiStructured<ScannedHomeworkPage>(c.env, {
    systemPrompt: renderHomeworkScanSystemPrompt(profile),
    userText: "Please scan this homework page and break down each exercise.",
    image: inlineImage,
    responseSchema: HOMEWORK_SCAN_SCHEMA,
  });

  const insertSession = await c.env.DB.prepare(
    "INSERT INTO homework_session (profile_id, page_summary_native, page_text_target, image_key) VALUES (?, ?, ?, ?)",
  )
    .bind(profile.id, scanned.pageSummaryNative, scanned.pageTextTarget, stored.imageKey)
    .run();

  const sessionId = Number(insertSession.meta.last_row_id);
  const exerciseStatements = scanned.exercises.map((ex, idx) =>
    c.env.DB.prepare(
      `INSERT INTO homework_exercise
         (session_id, position, label, prompt_target, explanation_native, explanation_target, explanation_english, tricky_words_json, opening_question_native, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    ).bind(
      sessionId,
      idx + 1,
      ex.label,
      ex.promptTarget,
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
    session.pageSummaryNative,
    session.pageTextTarget,
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
  return c.json(await listHomeworkSessions(c.env.DB, profile.id), 200, {
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
  const allSessions = await listHomeworkSessions(c.env.DB, profile.id);
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
