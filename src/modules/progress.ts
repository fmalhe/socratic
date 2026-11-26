import { Hono } from "hono";
import { z } from "zod";
import { computeNextStreak } from "../lib/streak";
import type { Env, ProgressResponse, SavedWordDto } from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";

interface ProgressRow {
  profile_id: number;
  total_stars: number;
  current_streak_days: number;
  last_activity_date: string | null;
  pages_read_count: number;
}

interface SavedWordRow {
  id: number;
  word: string;
  language_code: string;
  created_at: string;
}

const completeSchema = z.object({
  activityType: z.enum(["READING", "HOMEWORK"]),
  starsEarned: z.number().int().min(0),
  trickyWords: z.array(z.string()).optional().default([]),
});

export async function getProgress(db: D1Database, profileId: number): Promise<ProgressResponse> {
  const row = await db
    .prepare("SELECT * FROM child_progress WHERE profile_id = ?")
    .bind(profileId)
    .first<ProgressRow>();

  const wordsRes = await db
    .prepare(
      `SELECT id, word, language_code, created_at
       FROM saved_word
       WHERE profile_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
    )
    .bind(profileId)
    .all<SavedWordRow>();

  const recentWords: SavedWordDto[] = (wordsRes.results ?? []).map((w) => ({
    id: w.id,
    word: w.word,
    languageCode: w.language_code,
    createdAt: w.created_at,
  }));

  return {
    profileId,
    totalStars: row?.total_stars ?? 0,
    currentStreakDays: row?.current_streak_days ?? 0,
    lastActivityDate: row?.last_activity_date ?? null,
    pagesReadCount: row?.pages_read_count ?? 0,
    recentWords,
  };
}

export const progressRoutes = new Hono<{ Bindings: Env }>();

progressRoutes.get("/", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const profile = await getActiveProfile(c.env.DB, profileId);
  return c.json(await getProgress(c.env.DB, profile.id));
});

progressRoutes.post("/complete", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const parsed = completeSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const current = await getProgress(c.env.DB, profile.id);
  const todayIso = new Date().toISOString().slice(0, 10);

  const nextStreak = computeNextStreak(current.currentStreakDays, current.lastActivityDate, todayIso);
  const nextStars = current.totalStars + parsed.data.starsEarned;
  const nextPages = current.pagesReadCount + (parsed.data.activityType === "READING" ? 1 : 0);

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO child_progress (profile_id, total_stars, current_streak_days, last_activity_date, pages_read_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET
         total_stars = excluded.total_stars,
         current_streak_days = excluded.current_streak_days,
         last_activity_date = excluded.last_activity_date,
         pages_read_count = excluded.pages_read_count`,
    ).bind(profile.id, nextStars, nextStreak, todayIso, nextPages),
  ];

  for (const raw of parsed.data.trickyWords) {
    const word = raw.trim();
    if (word) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO saved_word (profile_id, word, language_code) VALUES (?, ?, ?)",
        ).bind(profile.id, word, profile.targetLanguageCode),
      );
    }
  }

  await c.env.DB.batch(statements);
  return c.json(await getProgress(c.env.DB, profile.id));
});
