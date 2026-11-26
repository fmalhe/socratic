import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";

const speakSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  languageCode: z.string().trim().min(1).nullable().optional(),
  slow: z.boolean().optional().default(false),
});

const GEMINI_PREBUILT_VOICES = new Set([
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
]);

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Wraps raw 16-bit signed little-endian mono PCM (24 kHz) in a standard 44-byte RIFF WAV header. */
export function wrapPcm16AsWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      wav[offset + i] = str.charCodeAt(i);
    }
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate = SampleRate * Channels * BitsPerSample/8
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
}

async function computeAudioCacheKey(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `audio/${hex}.bin`;
}

function resolveGeminiVoiceName(profileVoice: string | undefined, envVoice: string | undefined): string {
  const candidate = profileVoice?.trim();
  if (candidate && GEMINI_PREBUILT_VOICES.has(candidate)) {
    return candidate;
  }
  if (envVoice?.trim()) {
    return envVoice.trim();
  }
  return "Sulafat";
}

async function synthesizeWithGeminiTts(
  env: Env,
  params: {
    text: string;
    languageCode: string;
    targetLanguageName: string;
    voiceName: string;
    slow: boolean;
  },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!env.GEMINI_API_KEY) return null;

  const model = env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const style = params.slow
    ? `Warm, gentle, natural children's reading tutor speaking ${params.targetLanguageName} slowly and clearly, enunciating every syllable for a young learner.`
    : `Warm, friendly, natural children's reading tutor speaking ${params.targetLanguageName} clearly at a comfortable storytelling pace.`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: params.text,
              speechMetadata: { style },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: params.voiceName,
            },
          },
          languageCode: params.languageCode,
        },
      },
    }),
  });

  if (!res.ok) {
    return null;
  }

  const body = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
  };

  const inline = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) {
    return null;
  }

  const rawBytes = decodeBase64(inline.data);
  const mime = (inline.mimeType || "audio/wav").toLowerCase();

  // If the model returns headerless PCM (audio/l16), wrap it into a playable WAV container
  if (mime.includes("l16") || mime.includes("pcm")) {
    const rateMatch = mime.match(/rate=(\d+)/);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    return { bytes: wrapPcm16AsWav(rawBytes, sampleRate), contentType: "audio/wav" };
  }

  return { bytes: rawBytes, contentType: mime.split(";")[0] || "audio/wav" };
}

async function synthesizeWithGoogleCloudTts(
  env: Env,
  params: {
    text: string;
    languageCode: string;
    voiceName: string;
    slow: boolean;
  },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!env.GOOGLE_TTS_API_KEY) return null;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: params.text },
        voice: { languageCode: params.languageCode, name: params.voiceName },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: params.slow ? 0.75 : 1.0,
        },
      }),
    },
  );

  if (!res.ok) return null;

  const body = (await res.json()) as { audioContent?: string };
  if (!body.audioContent) return null;

  return { bytes: decodeBase64(body.audioContent), contentType: "audio/mpeg" };
}

const AUDIO_ACCEPT_QUERY = '"application/json"';

async function handleSpeak(c: import("hono").Context<{ Bindings: Env }>) {
  if (c.req.method === "QUERY") {
    const contentType = c.req.header("Content-Type")?.toLowerCase() ?? "";
    if (!contentType) {
      return c.json({ error: "Content-Type header is required for QUERY requests" }, 400, {
        "Accept-Query": AUDIO_ACCEPT_QUERY,
      });
    }
    if (!contentType.includes("application/json")) {
      return c.json({ error: "Unsupported Media Type; expected application/json" }, 415, {
        "Accept-Query": AUDIO_ACCEPT_QUERY,
      });
    }
  }

  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, { "Accept-Query": AUDIO_ACCEPT_QUERY });
  }

  const parsed = speakSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400, { "Accept-Query": AUDIO_ACCEPT_QUERY });
  }

  if (!c.env.GEMINI_API_KEY && !c.env.GOOGLE_TTS_API_KEY) {
    return c.json(
      { error: "No cloud TTS provider configured; use browser speechSynthesis fallback" },
      501,
      { "Accept-Query": AUDIO_ACCEPT_QUERY },
    );
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const languageCode = parsed.data.languageCode || profile.targetLanguageCode;
  const lc = languageCode.toLowerCase();
  const spokenLanguageName =
    lc === profile.nativeLanguageCode.toLowerCase()
      ? profile.nativeLanguageName
      : lc.startsWith("en")
        ? "English"
        : profile.targetLanguageName;
  const geminiVoice = resolveGeminiVoiceName(profile.ttsVoiceName, c.env.GEMINI_TTS_VOICE);
  const cacheKey = await computeAudioCacheKey([
    c.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
    geminiVoice,
    profile.ttsVoiceName,
    languageCode,
    parsed.data.slow ? "slow" : "normal",
    parsed.data.text,
  ]);
  const contentLocation = `/api/uploads/${cacheKey}`;

  // 1. Serve instantly from R2 cache if available
  if (c.env.UPLOADS) {
    const cached = await c.env.UPLOADS.get(cacheKey);
    if (cached) {
      const headers = new Headers();
      cached.writeHttpMetadata(headers);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "audio/wav");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Accept-Query", AUDIO_ACCEPT_QUERY);
      headers.set("Content-Location", contentLocation);
      headers.set("X-Audio-Cache", "HIT");
      return new Response(cached.body, { status: 200, headers });
    }
  }

  // 2. Try Gemini 3.8 Flash-Lite TTS (natural human voice using existing GEMINI_API_KEY)
  let audio = await synthesizeWithGeminiTts(c.env, {
    text: parsed.data.text,
    languageCode,
    targetLanguageName: spokenLanguageName,
    voiceName: geminiVoice,
    slow: parsed.data.slow,
  });
  let provider = "gemini-tts";

  // 3. Fallback to Google Cloud TTS if configured
  if (!audio && c.env.GOOGLE_TTS_API_KEY) {
    audio = await synthesizeWithGoogleCloudTts(c.env, {
      text: parsed.data.text,
      languageCode,
      voiceName: profile.ttsVoiceName,
      slow: parsed.data.slow,
    });
    provider = "google-cloud-tts";
  }

  if (!audio) {
    return c.json(
      { error: "Cloud TTS unavailable; falling back to device speechSynthesis" },
      501,
      { "Accept-Query": AUDIO_ACCEPT_QUERY },
    );
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": audio.contentType,
    "Content-Length": String(audio.bytes.byteLength),
    "Accept-Ranges": "bytes",
    "Accept-Query": AUDIO_ACCEPT_QUERY,
    "X-Audio-Provider": provider,
    "X-Audio-Cache": "MISS",
  };

  // 4. Cache in R2 so replays are instant and addressable via Content-Location
  if (c.env.UPLOADS) {
    responseHeaders["Content-Location"] = contentLocation;
    const putPromise = c.env.UPLOADS.put(cacheKey, audio.bytes, {
      httpMetadata: {
        contentType: audio.contentType,
        cacheControl: "private, max-age=2592000",
      },
    });
    try {
      c.executionCtx.waitUntil(putPromise);
    } catch {
      await putPromise;
    }
  }

  return new Response(audio.bytes, {
    status: 200,
    headers: responseHeaders,
  });
}

export const audioRoutes = new Hono<{ Bindings: Env }>();

audioRoutes.on("OPTIONS", "/speak", (c) =>
  c.body(null, 204, {
    Allow: "QUERY, POST, OPTIONS",
    "Accept-Query": AUDIO_ACCEPT_QUERY,
  }),
);
audioRoutes.on("QUERY", "/speak", handleSpeak);
audioRoutes.post("/speak", handleSpeak);
