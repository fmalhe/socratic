import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { parseJsonBody } from "../lib/http";
import type { Env, LearnerProfileDto } from "../types";

export const DEFAULT_PROFILE_ID = 1;

interface ProfileRow {
  id: number;
  name: string;
  age: number;
  target_language_code: string;
  target_language_name: string;
  native_language_code: string;
  native_language_name: string;
  dialect_rules: string;
  tts_voice_name: string;
}

const updateProfileSchema = z.object({
  name: z.string().trim().min(1),
  age: z.number().int().min(3).max(18),
  targetLanguageCode: z.string().trim().min(1),
  targetLanguageName: z.string().trim().min(1),
  nativeLanguageCode: z.string().trim().min(1),
  nativeLanguageName: z.string().trim().min(1),
  dialectRules: z.string().trim().min(1),
  ttsVoiceName: z.string().trim().min(1).optional(),
});

function toDto(row: ProfileRow): LearnerProfileDto {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    targetLanguageCode: row.target_language_code,
    targetLanguageName: row.target_language_name,
    nativeLanguageCode: row.native_language_code,
    nativeLanguageName: row.native_language_name,
    dialectRules: row.dialect_rules,
    ttsVoiceName: row.tts_voice_name,
  };
}

export function resolveProfileId(headerValue: string | undefined): number {
  if (!headerValue || !headerValue.trim()) {
    return DEFAULT_PROFILE_ID;
  }
  const trimmed = headerValue.trim();
  const parsed = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HTTPException(400, { message: `Invalid X-Profile-Id header: ${headerValue}` });
  }
  return parsed;
}

export async function getActiveProfile(db: D1Database, profileId = DEFAULT_PROFILE_ID): Promise<LearnerProfileDto> {
  const row = await db
    .prepare("SELECT * FROM learner_profile WHERE id = ?")
    .bind(profileId)
    .first<ProfileRow>();
  if (!row) {
    throw new HTTPException(404, { message: `Learner profile not found: ${profileId}` });
  }
  return toDto(row);
}

export const profileRoutes = new Hono<{ Bindings: Env }>();

profileRoutes.get("/", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const profile = await getActiveProfile(c.env.DB, profileId);
  return c.json(profile);
});

profileRoutes.put("/", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const rawBody = await parseJsonBody(c);
  const parsed = updateProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const d = parsed.data;
  const ttsVoiceName = d.ttsVoiceName ?? c.env.GEMINI_TTS_VOICE ?? "Sulafat";
  const result = await c.env.DB.prepare(
    `UPDATE learner_profile
     SET name = ?, age = ?, target_language_code = ?, target_language_name = ?,
         native_language_code = ?, native_language_name = ?, dialect_rules = ?, tts_voice_name = ?
     WHERE id = ?`,
  )
    .bind(
      d.name,
      d.age,
      d.targetLanguageCode,
      d.targetLanguageName,
      d.nativeLanguageCode,
      d.nativeLanguageName,
      d.dialectRules,
      ttsVoiceName,
      profileId,
    )
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: `Learner profile not found: ${profileId}` }, 404);
  }
  const updated = await getActiveProfile(c.env.DB, profileId);
  return c.json(updated);
});
