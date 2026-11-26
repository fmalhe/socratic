import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";

const speakSchema = z.object({
  text: z.string().trim().min(1),
  languageCode: z.string().trim().min(1).nullable().optional(),
  slow: z.boolean().optional().default(false),
});

export const audioRoutes = new Hono<{ Bindings: Env }>();

audioRoutes.post("/speak", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const parsed = speakSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  if (!c.env.GOOGLE_TTS_API_KEY) {
    return c.json(
      { error: "Google Cloud TTS is not configured; use browser speechSynthesis fallback" },
      501,
    );
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const languageCode = parsed.data.languageCode || profile.targetLanguageCode;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(c.env.GOOGLE_TTS_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: parsed.data.text },
        voice: { languageCode, name: profile.ttsVoiceName },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: parsed.data.slow ? 0.75 : 1.0,
        },
      }),
    },
  );

  if (!res.ok) {
    return c.json({ error: `TTS provider error (${res.status})` }, 502);
  }

  const body = (await res.json()) as { audioContent?: string };
  if (!body.audioContent) {
    return c.json({ error: "Empty audio response" }, 502);
  }

  const binary = atob(body.audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
});
