import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";

const speakSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  languageCode: z.string().trim().min(1).nullable().optional(),
  slow: z.boolean().optional().default(false),
  prefetch: z.boolean().optional().default(false),
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

const LEGACY_CLOUD_TTS_VOICE = /-(?:Wavenet|Standard|Neural2|Studio|Polyglot|Chirp|Journey)-/i;

function resolveGeminiVoiceName(profileVoice: string | undefined, envVoice: string | undefined): string {
  const candidate = profileVoice?.trim();
  if (
    candidate &&
    !LEGACY_CLOUD_TTS_VOICE.test(candidate) &&
    (GEMINI_PREBUILT_VOICES.has(candidate) || candidate.startsWith("voice_") || candidate.includes("-"))
  ) {
    return candidate;
  }
  if (envVoice?.trim()) {
    return envVoice.trim();
  }
  return "Sulafat";
}

function getGeminiTtsModels(env: Env, includeFallbacks: boolean): string[] {
  const primary = env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
  if (!includeFallbacks) return [primary];
  const ordered = [primary, "gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];
  return Array.from(new Set(ordered));
}

function buildGeminiTtsRequestBody(params: {
  model: string;
  text: string;
  languageCode: string;
  targetLanguageName: string;
  voiceName: string;
  slow: boolean;
  includeLanguageCode: boolean;
  includeSpeechMetadata: boolean;
}): string {
  const dialectNote = params.languageCode.toLowerCase().startsWith("pt")
    ? " using European Portuguese (Portugal) pronunciation, never Brazilian"
    : "";
  const style = params.slow
    ? `Warm, gentle, natural children's tutor speaking ${params.targetLanguageName}${dialectNote} slowly and clearly for a young child.`
    : `Warm, friendly, natural children's tutor speaking ${params.targetLanguageName}${dialectNote} clearly at a comfortable pace.`;

  const isLegacy25 = params.model.includes("2.5");
  const voiceConfig =
    params.voiceName.startsWith("voice_") || params.voiceName.includes("-")
      ? { voice: params.voiceName }
      : { prebuiltVoiceConfig: { voiceName: params.voiceName } };

  return JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          params.includeSpeechMetadata && !isLegacy25
            ? { text: params.text, speechMetadata: { style } }
            : { text: params.text },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig,
        ...(params.includeLanguageCode ? { languageCode: params.languageCode } : {}),
      },
    },
  });
}

async function fetchGeminiTtsWithFallback(
  env: Env,
  params: {
    model: string;
    method: "generateContent" | "streamGenerateContent";
    text: string;
    languageCode: string;
    targetLanguageName: string;
    voiceName: string;
    slow: boolean;
  },
): Promise<{ res: Response | null; status: number }> {
  const url =
    params.method === "streamGenerateContent"
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:${params.method}?alt=sse`
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:${params.method}`;

  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: buildGeminiTtsRequestBody({
      ...params,
      includeLanguageCode: true,
      includeSpeechMetadata: true,
    }),
  });

  if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 404) {
    const errText = await res.text().catch(() => "");
    console.error("Gemini TTS API error:", res.status, errText.slice(0, 400));
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: buildGeminiTtsRequestBody({
        ...params,
        includeLanguageCode: false,
        includeSpeechMetadata: !params.model.includes("2.5"),
      }),
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`Gemini TTS (${params.model}:${params.method}) error:`, res.status, errText.slice(0, 300));
    return { res: null, status: res.status };
  }

  return { res, status: 200 };
}

async function synthesizeWithGeminiTts(
  env: Env,
  params: {
    text: string;
    languageCode: string;
    targetLanguageName: string;
    voiceName: string;
    slow: boolean;
    prefetch?: boolean;
  },
): Promise<{ audio: { bytes: Uint8Array; contentType: string } | null; reason?: string; status?: number }> {
  if (!env.GEMINI_API_KEY) {
    return { audio: null, reason: "no-gemini-key" };
  }

  const models = getGeminiTtsModels(env, !params.prefetch);
  let lastStatus = 500;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const attempt = await fetchGeminiTtsWithFallback(env, {
      model,
      method: "generateContent",
      ...params,
    });

    if (!attempt.res) {
      lastStatus = attempt.status;
      if (params.prefetch && attempt.status === 429) {
        return { audio: null, reason: "gemini-tts-429", status: 429 };
      }
      continue;
    }

    const body = (await attempt.res.json()) as {
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
      console.error(`Gemini TTS (${model}) returned empty audio payload`);
      lastStatus = 502;
      continue;
    }

    const rawBytes = decodeBase64(inline.data);
    const mime = (inline.mimeType || "audio/wav").toLowerCase();

    // If the model returns headerless PCM (audio/l16), wrap it into a playable WAV container
    if (mime.includes("l16") || mime.includes("pcm")) {
      const rateMatch = mime.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
      return { audio: { bytes: wrapPcm16AsWav(rawBytes, sampleRate), contentType: "audio/wav" } };
    }

    return { audio: { bytes: rawBytes, contentType: mime.split(";")[0] || "audio/wav" } };
  }

  return {
    audio: null,
    reason: lastStatus === 429 ? "gemini-tts-429" : `gemini-tts-${lastStatus}`,
    status: lastStatus,
  };
}

async function openGeminiTtsStream(
  env: Env,
  params: {
    text: string;
    languageCode: string;
    targetLanguageName: string;
    voiceName: string;
    slow: boolean;
  },
): Promise<{ upstream: Response | null; model?: string; reason?: string; status?: number }> {
  if (!env.GEMINI_API_KEY) {
    return { upstream: null, reason: "no-gemini-key" };
  }
  const models = getGeminiTtsModels(env, true);
  let lastStatus = 500;
  for (const model of models) {
    const attempt = await fetchGeminiTtsWithFallback(env, {
      model,
      method: "streamGenerateContent",
      ...params,
    });
    if (attempt.res && attempt.res.body) {
      return { upstream: attempt.res, model };
    }
    lastStatus = attempt.status;
  }
  return {
    upstream: null,
    reason: lastStatus === 429 ? "gemini-tts-429" : `gemini-tts-${lastStatus}`,
    status: lastStatus,
  };
}

function stripWavHeaderIfPresent(bytes: Uint8Array): Uint8Array {
  if (
    bytes.byteLength > 44 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x41 && // A
    bytes[10] === 0x56 && // V
    bytes[11] === 0x45 // E
  ) {
    return bytes.subarray(44);
  }
  return bytes;
}

function resolveCloudTtsVoiceName(languageCode: string, profileVoice: string): string {
  const lc = languageCode.toLowerCase();
  if (
    LEGACY_CLOUD_TTS_VOICE.test(profileVoice) &&
    profileVoice.toLowerCase().startsWith(lc.split("-")[0]!)
  ) {
    return profileVoice;
  }
  if (lc.startsWith("pt")) return "pt-PT-Wavenet-A";
  if (lc.startsWith("nb") || lc.startsWith("no") || lc.startsWith("nn")) return "nb-NO-Wavenet-E";
  if (lc.startsWith("en-gb")) return "en-GB-Neural2-A";
  if (lc.startsWith("en")) return "en-US-Neural2-F";
  return "";
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

  const cloudVoice = resolveCloudTtsVoiceName(params.languageCode, params.voiceName);
  const voicePayload = cloudVoice
    ? { languageCode: params.languageCode, name: cloudVoice }
    : { languageCode: params.languageCode };

  const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GOOGLE_TTS_API_KEY,
    },
    body: JSON.stringify({
      input: { text: params.text },
      voice: voicePayload,
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: params.slow ? 0.78 : 1.0,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Google Cloud TTS error:", res.status, errText.slice(0, 300));
    return null;
  }

  const body = (await res.json()) as { audioContent?: string };
  if (!body.audioContent) return null;

  return { bytes: decodeBase64(body.audioContent), contentType: "audio/mpeg" };
}

const AUDIO_ACCEPT_QUERY = '"application/json"';

async function resolveSpeechRequest(c: import("hono").Context<{ Bindings: Env }>) {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return { errorResponse: c.json({ error: "Invalid JSON body" }, 400, { "Accept-Query": AUDIO_ACCEPT_QUERY }) };
  }

  const parsed = speakSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      errorResponse: c.json({ error: parsed.error.flatten() }, 400, { "Accept-Query": AUDIO_ACCEPT_QUERY }),
    };
  }

  if (!c.env.GEMINI_API_KEY && !c.env.GOOGLE_TTS_API_KEY) {
    return {
      errorResponse: c.json(
        { error: "No cloud TTS provider configured; use browser speechSynthesis fallback" },
        501,
        {
          "Accept-Query": AUDIO_ACCEPT_QUERY,
          "X-Audio-Fallback-Reason": "no-api-key",
        },
      ),
    };
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const languageCode = parsed.data.languageCode || profile.targetLanguageCode;
  const lc = languageCode.toLowerCase();
  const nativeLc = profile.nativeLanguageCode.toLowerCase();
  const spokenLanguageName =
    lc === nativeLc || lc.startsWith("nb") || lc.startsWith("no") || lc.startsWith("nn")
      ? profile.nativeLanguageName
      : lc.startsWith("en")
        ? "English"
        : lc.startsWith("pt")
          ? profile.targetLanguageName
          : languageCode;
  const geminiVoice = resolveGeminiVoiceName(profile.ttsVoiceName, c.env.GEMINI_TTS_VOICE);
  const cacheKey = await computeAudioCacheKey([
    c.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
    geminiVoice,
    profile.ttsVoiceName,
    languageCode,
    parsed.data.slow ? "slow" : "normal",
    parsed.data.text,
  ]);

  return {
    data: parsed.data,
    profile,
    languageCode,
    spokenLanguageName,
    geminiVoice,
    cacheKey,
    contentLocation: `/api/uploads/${cacheKey}`,
  };
}

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

  const resolved = await resolveSpeechRequest(c);
  if (resolved.errorResponse || !resolved.data) return resolved.errorResponse!;

  const { data, profile, languageCode, spokenLanguageName, geminiVoice, cacheKey, contentLocation } = resolved;

  // 1. Serve instantly from R2 cache if available
  if (c.env.UPLOADS) {
    const cached = await c.env.UPLOADS.get(cacheKey);
    if (cached) {
      const headers = new Headers();
      cached.writeHttpMetadata(headers);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "audio/wav");
      if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, max-age=2592000");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Accept-Query", AUDIO_ACCEPT_QUERY);
      headers.set("Content-Location", contentLocation);
      headers.set("X-Audio-Provider", cached.customMetadata?.provider || "gemini-tts");
      headers.set("X-Audio-Cache", "HIT");
      return new Response(cached.body, { status: 200, headers });
    }
  }

  // 2. Try Gemini 3.8 TTS (with waterfall fallback across flash-lite -> flash -> 2.5)
  const geminiResult = await synthesizeWithGeminiTts(c.env, {
    text: data.text,
    languageCode,
    targetLanguageName: spokenLanguageName,
    voiceName: geminiVoice,
    slow: data.slow,
    prefetch: data.prefetch,
  });
  let audio = geminiResult.audio;
  let provider = "gemini-tts";

  if (!audio && data.prefetch && geminiResult.status === 429) {
    return c.json(
      { error: "Rate limited during prefetch" },
      429,
      { "X-Audio-Fallback-Reason": "gemini-tts-429" },
    );
  }

  // 3. Fallback to Google Cloud TTS if configured
  if (!audio && c.env.GOOGLE_TTS_API_KEY) {
    audio = await synthesizeWithGoogleCloudTts(c.env, {
      text: data.text,
      languageCode,
      voiceName: profile.ttsVoiceName,
      slow: data.slow,
    });
    provider = "google-cloud-tts";
  }

  if (!audio) {
    return c.json(
      { error: "Cloud TTS unavailable; falling back to device speechSynthesis" },
      501,
      {
        "Accept-Query": AUDIO_ACCEPT_QUERY,
        "X-Audio-Fallback-Reason": geminiResult.reason || "provider-unavailable",
      },
    );
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": audio.contentType,
    "Content-Length": String(audio.bytes.byteLength),
    "Cache-Control": "private, max-age=2592000",
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
      customMetadata: {
        provider,
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

async function handleStreamSpeak(c: import("hono").Context<{ Bindings: Env }>) {
  const resolved = await resolveSpeechRequest(c);
  if (resolved.errorResponse || !resolved.data) return resolved.errorResponse!;

  const { data, profile, languageCode, spokenLanguageName, geminiVoice, cacheKey, contentLocation } = resolved;

  // 1. Instant cached WAV on R2 HIT (zero stream overhead)
  if (c.env.UPLOADS) {
    const cached = await c.env.UPLOADS.get(cacheKey);
    if (cached) {
      const headers = new Headers();
      cached.writeHttpMetadata(headers);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "audio/wav");
      if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, max-age=2592000");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Location", contentLocation);
      headers.set("X-Audio-Provider", cached.customMetadata?.provider || "gemini-tts");
      headers.set("X-Audio-Cache", "HIT");
      return new Response(cached.body, { status: 200, headers });
    }
  }

  // 2. Open Gemini SSE stream and emit raw 16-bit LE 24 kHz mono PCM chunks as they arrive
  const opened = await openGeminiTtsStream(c.env, {
    text: data.text,
    languageCode,
    targetLanguageName: spokenLanguageName,
    voiceName: geminiVoice,
    slow: data.slow,
  });

  if (opened.upstream?.body) {
    const reader = opened.upstream.body.getReader();
    const decoder = new TextDecoder();
    const pcmChunks: Uint8Array[] = [];
    let sseBuffer = "";
    let firstChunk = true;

    const pcmStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              // Flush any trailing SSE lines
              if (sseBuffer.trim()) {
                for (const line of sseBuffer.split(/\r?\n/)) {
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (!payload || payload === "[DONE]") continue;
                  try {
                    const obj = JSON.parse(payload) as {
                      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
                    };
                    for (const part of obj.candidates?.[0]?.content?.parts ?? []) {
                      if (!part.inlineData?.data) continue;
                      let raw = decodeBase64(part.inlineData.data);
                      if (firstChunk) {
                        raw = stripWavHeaderIfPresent(raw);
                        firstChunk = false;
                      }
                      if (raw.byteLength > 0) {
                        pcmChunks.push(raw);
                        controller.enqueue(raw);
                      }
                    }
                  } catch {}
                }
              }
              controller.close();
              if (c.env.UPLOADS && pcmChunks.length > 0) {
                const totalLen = pcmChunks.reduce((acc, ch) => acc + ch.byteLength, 0);
                const fullPcm = new Uint8Array(totalLen);
                let off = 0;
                for (const ch of pcmChunks) {
                  fullPcm.set(ch, off);
                  off += ch.byteLength;
                }
                const wavBytes = wrapPcm16AsWav(fullPcm, 24000);
                const putPromise = c.env.UPLOADS.put(cacheKey, wavBytes, {
                  httpMetadata: {
                    contentType: "audio/wav",
                    cacheControl: "private, max-age=2592000",
                  },
                  customMetadata: {
                    provider: "gemini-tts",
                  },
                });
                try {
                  c.executionCtx.waitUntil(putPromise);
                } catch {}
              }
              return;
            }

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split(/\r?\n/);
            sseBuffer = lines.pop() ?? "";
            let enqueued = false;
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const obj = JSON.parse(payload) as {
                  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
                };
                for (const part of obj.candidates?.[0]?.content?.parts ?? []) {
                  if (!part.inlineData?.data) continue;
                  let raw = decodeBase64(part.inlineData.data);
                  if (firstChunk) {
                    raw = stripWavHeaderIfPresent(raw);
                    firstChunk = false;
                  }
                  if (raw.byteLength > 0) {
                    pcmChunks.push(raw);
                    controller.enqueue(raw);
                    enqueued = true;
                  }
                }
              } catch {}
            }
            if (enqueued) return;
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });

    const streamHeaders: Record<string, string> = {
      "Content-Type": "audio/l16;rate=24000;channels=1",
      "Cache-Control": "no-store",
      "X-Audio-Stream": "1",
      "X-Audio-Provider": "gemini-tts",
      "X-Audio-Cache": "MISS",
    };
    if (c.env.UPLOADS) {
      streamHeaders["Content-Location"] = contentLocation;
    }

    return new Response(pcmStream, { status: 200, headers: streamHeaders });
  }

  // 3. Fallback to Google Cloud TTS if Gemini stream failed
  if (c.env.GOOGLE_TTS_API_KEY) {
    const gcAudio = await synthesizeWithGoogleCloudTts(c.env, {
      text: data.text,
      languageCode,
      voiceName: profile.ttsVoiceName,
      slow: data.slow,
    });
    if (gcAudio) {
      return new Response(gcAudio.bytes, {
        status: 200,
        headers: {
          "Content-Type": gcAudio.contentType,
          "Content-Length": String(gcAudio.bytes.byteLength),
          "X-Audio-Provider": "google-cloud-tts",
          "X-Audio-Cache": "MISS",
        },
      });
    }
  }

  return c.json(
    { error: "Cloud TTS unavailable; falling back to device speechSynthesis" },
    501,
    { "X-Audio-Fallback-Reason": opened.reason || "provider-unavailable" },
  );
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
audioRoutes.post("/stream", handleStreamSpeak);
