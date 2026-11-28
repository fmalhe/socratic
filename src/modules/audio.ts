import { Hono } from "hono";
import { z } from "zod";
import type { Env, LearnerProfileDto } from "../types";
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

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((acc, ch) => acc + ch.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

/** Wraps raw 16-bit signed little-endian mono PCM in a standard 44-byte RIFF WAV header. */
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

const NORWEGIAN_CODES = new Set(["nb", "no", "nn"]);

function baseLanguageSubtag(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/)[0] || "";
}

function matchesLanguage(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const baseA = baseLanguageSubtag(normA);
  const baseB = baseLanguageSubtag(normB);
  if (baseA && baseA === baseB) return true;
  if (NORWEGIAN_CODES.has(baseA) && NORWEGIAN_CODES.has(baseB)) return true;
  return false;
}

export function resolveLanguageContext(
  profile: LearnerProfileDto,
  requestedLanguageCode?: string | null,
): {
  languageCode: string;
  spokenLanguageName: string;
  dialectRules: string;
} {
  const languageCode = requestedLanguageCode?.trim() || profile.targetLanguageCode;
  const isTarget = matchesLanguage(languageCode, profile.targetLanguageCode);
  const isNative = !isTarget && matchesLanguage(languageCode, profile.nativeLanguageCode);
  const base = baseLanguageSubtag(languageCode);
  const spokenLanguageName = isTarget
    ? profile.targetLanguageName
    : isNative
      ? profile.nativeLanguageName
      : base === "en"
        ? "English"
        : languageCode;
  const dialectRules = isTarget ? profile.dialectRules.trim() : "";
  return { languageCode, spokenLanguageName, dialectRules };
}

function buildGeminiCacheKey(
  env: Env,
  profile: LearnerProfileDto,
  geminiVoice: string,
  languageCode: string,
  slow: boolean,
  text: string,
): Promise<string> {
  return computeAudioCacheKey([
    "gemini-tts",
    env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
    geminiVoice,
    profile.ttsVoiceName,
    profile.dialectRules,
    languageCode,
    slow ? "slow" : "normal",
    text,
  ]);
}

function buildGoogleCloudCacheKey(
  profile: LearnerProfileDto,
  languageCode: string,
  slow: boolean,
  text: string,
): Promise<string> {
  return computeAudioCacheKey([
    "google-cloud-tts",
    resolveCloudTtsVoiceName(languageCode, profile.ttsVoiceName) || "default",
    languageCode,
    slow ? "slow" : "normal",
    text,
  ]);
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
  dialectRules?: string;
  voiceName: string;
  slow: boolean;
  includeLanguageCode: boolean;
  includeSpeechMetadata: boolean;
}): string {
  const dialectNote = params.dialectRules?.trim()
    ? ` Strictly follow these dialect/pronunciation rules: ${params.dialectRules.trim()}`
    : "";
  const style = params.slow
    ? `Warm, gentle, natural children's tutor speaking ${params.targetLanguageName} slowly and clearly for a young child.${dialectNote}`
    : `Warm, friendly, natural children's tutor speaking ${params.targetLanguageName} clearly at a comfortable pace.${dialectNote}`;

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
    dialectRules?: string;
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
    dialectRules?: string;
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
      const sampleRate = parseSampleRate(mime, 24000);
      return { audio: { bytes: wrapPcm16AsWav(rawBytes, sampleRate), contentType: "audio/wav" } };
    }

    return { audio: { bytes: rawBytes, contentType: mime.split(";")[0]?.trim() || "audio/wav" } };
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
    dialectRules?: string;
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

export interface WavHeaderInfo {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataStart: number;
  dataEnd: number;
}

export function parseWavHeader(bytes: Uint8Array): WavHeaderInfo | null {
  if (bytes.byteLength < 12) return null;
  if (
    bytes[0] !== 0x52 || // R
    bytes[1] !== 0x49 || // I
    bytes[2] !== 0x46 || // F
    bytes[3] !== 0x46 || // F
    bytes[8] !== 0x57 || // W
    bytes[9] !== 0x41 || // A
    bytes[10] !== 0x56 || // V
    bytes[11] !== 0x45 // E
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt " && offset + 24 <= bytes.byteLength) {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    }

    if (chunkId === "data") {
      const dataStart = offset + 8;
      const dataEnd = Math.min(bytes.byteLength, dataStart + chunkSize);
      return {
        audioFormat,
        channels,
        sampleRate,
        bitsPerSample,
        dataStart,
        dataEnd,
      };
    }

    const paddedSize = chunkSize + (chunkSize % 2);
    if (paddedSize > bytes.byteLength - (offset + 8)) {
      break;
    }
    offset += 8 + paddedSize;
  }

  // Truncated RIFF/WAVE header without a "data" subchunk
  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    dataStart: bytes.byteLength,
    dataEnd: bytes.byteLength,
  };
}

export function stripWavHeaderIfPresent(bytes: Uint8Array): Uint8Array {
  const wav = parseWavHeader(bytes);
  if (!wav) return bytes;
  if (wav.dataStart >= wav.dataEnd) return new Uint8Array(0);
  return bytes.subarray(wav.dataStart, wav.dataEnd);
}

type ParsedAudioPart =
  | { kind: "pcm"; sampleRate: number }
  | { kind: "wav-pcm"; sampleRate: number }
  | { kind: "buffered"; contentType: string };

function parseSampleRate(mime: string, fallback = 24000): number {
  const match = mime.match(/(?:^|[;\s])rate=(\d+)/i);
  if (!match) return fallback;
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate >= 8000 && rate <= 192000 ? rate : fallback;
}

function parseAudioPartMime(
  mimeType: string | undefined,
  rawBytes: Uint8Array,
  isFirstChunk: boolean,
  activeSampleRate = 24000,
): ParsedAudioPart {
  const mime = (mimeType || "").trim().toLowerCase();
  if (!mime || mime.includes("l16") || mime.includes("pcm")) {
    return { kind: "pcm", sampleRate: parseSampleRate(mime, activeSampleRate) };
  }
  if (mime.includes("wav")) {
    if (isFirstChunk) {
      const wav = parseWavHeader(rawBytes);
      if (!wav) {
        return { kind: "wav-pcm", sampleRate: parseSampleRate(mime, activeSampleRate) };
      }
      if (wav.audioFormat === 1 && wav.channels === 1 && wav.bitsPerSample === 16) {
        const rate =
          wav.sampleRate >= 8000 && wav.sampleRate <= 192000
            ? wav.sampleRate
            : parseSampleRate(mime, activeSampleRate);
        return { kind: "wav-pcm", sampleRate: rate };
      }
      return { kind: "buffered", contentType: "audio/wav" };
    }
    return { kind: "pcm", sampleRate: activeSampleRate };
  }
  const cleanContentType = mime.split(";")[0]?.trim() || "application/octet-stream";
  return { kind: "buffered", contentType: cleanContentType };
}

function extractSseAudioParts(line: string): Array<{ data: string; mimeType?: string }> {
  if (!line.startsWith("data:")) return [];
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return [];
  try {
    const obj = JSON.parse(payload) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    };
    const out: Array<{ data: string; mimeType?: string }> = [];
    for (const part of obj.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        out.push({ data: part.inlineData.data, mimeType: part.inlineData.mimeType });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function resolveCloudTtsVoiceName(languageCode: string, profileVoice: string): string {
  const lc = languageCode.toLowerCase();
  const pvLower = profileVoice.toLowerCase();
  if (
    LEGACY_CLOUD_TTS_VOICE.test(profileVoice) &&
    (pvLower.startsWith(lc) || (!lc.includes("-") && pvLower.startsWith(`${lc}-`)))
  ) {
    return profileVoice;
  }
  if (lc.startsWith("pt-br")) return "pt-BR-Wavenet-A";
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
  const { languageCode, spokenLanguageName, dialectRules } = resolveLanguageContext(
    profile,
    parsed.data.languageCode,
  );
  const geminiVoice = resolveGeminiVoiceName(profile.ttsVoiceName, c.env.GEMINI_TTS_VOICE);
  const geminiCacheKey = await buildGeminiCacheKey(
    c.env,
    profile,
    geminiVoice,
    languageCode,
    parsed.data.slow,
    parsed.data.text,
  );
  const googleCacheKey = await buildGoogleCloudCacheKey(
    profile,
    languageCode,
    parsed.data.slow,
    parsed.data.text,
  );

  return {
    data: parsed.data,
    profile,
    languageCode,
    spokenLanguageName,
    dialectRules,
    geminiVoice,
    geminiCacheKey,
    googleCacheKey,
    geminiContentLocation: `/api/uploads/${geminiCacheKey}`,
    googleContentLocation: `/api/uploads/${googleCacheKey}`,
  };
}

function buildCachedAudioResponse(
  cached: R2ObjectBody,
  contentLocation: string,
  defaultContentType: string,
  defaultProvider: string,
  includeAcceptQuery: boolean,
): Response {
  const headers = new Headers();
  cached.writeHttpMetadata(headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", defaultContentType);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, max-age=2592000");
  headers.set("Accept-Ranges", "bytes");
  if (includeAcceptQuery) {
    headers.set("Accept-Query", AUDIO_ACCEPT_QUERY);
  }
  headers.set("Content-Location", contentLocation);
  headers.set("X-Audio-Provider", cached.customMetadata?.provider || defaultProvider);
  headers.set("X-Audio-Cache", "HIT");
  return new Response(cached.body, { status: 200, headers });
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

  const {
    data,
    profile,
    languageCode,
    spokenLanguageName,
    dialectRules,
    geminiVoice,
    geminiCacheKey,
    googleCacheKey,
    geminiContentLocation,
    googleContentLocation,
  } = resolved;

  // 1. Serve instantly from Gemini R2 cache if available (ignore any foreign-provider object)
  if (c.env.UPLOADS && c.env.GEMINI_API_KEY) {
    const cached = await c.env.UPLOADS.get(geminiCacheKey);
    if (cached && cached.customMetadata?.provider !== "google-cloud-tts") {
      return buildCachedAudioResponse(cached, geminiContentLocation, "audio/wav", "gemini-tts", true);
    }
  }

  // 2. Try Gemini 3.8 TTS (with waterfall fallback across flash-lite -> flash -> 2.5)
  const geminiResult = await synthesizeWithGeminiTts(c.env, {
    text: data.text,
    languageCode,
    targetLanguageName: spokenLanguageName,
    dialectRules,
    voiceName: geminiVoice,
    slow: data.slow,
    prefetch: data.prefetch,
  });
  let audio = geminiResult.audio;
  let provider = "gemini-tts";
  let targetCacheKey = geminiCacheKey;
  let targetContentLocation = geminiContentLocation;

  if (!audio && data.prefetch && geminiResult.status === 429) {
    return c.json(
      { error: "Rate limited during prefetch" },
      429,
      { "X-Audio-Fallback-Reason": "gemini-tts-429" },
    );
  }

  // 3. Fallback to Google Cloud TTS under its isolated R2 namespace
  if (!audio && c.env.GOOGLE_TTS_API_KEY) {
    if (c.env.UPLOADS) {
      const cachedFallback = await c.env.UPLOADS.get(googleCacheKey);
      if (cachedFallback) {
        return buildCachedAudioResponse(
          cachedFallback,
          googleContentLocation,
          "audio/mpeg",
          "google-cloud-tts",
          true,
        );
      }
    }
    audio = await synthesizeWithGoogleCloudTts(c.env, {
      text: data.text,
      languageCode,
      voiceName: profile.ttsVoiceName,
      slow: data.slow,
    });
    provider = "google-cloud-tts";
    targetCacheKey = googleCacheKey;
    targetContentLocation = googleContentLocation;
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

  // 4. Cache in R2 under the matching provider namespace
  if (c.env.UPLOADS) {
    responseHeaders["Content-Location"] = targetContentLocation;
    const putPromise = c.env.UPLOADS.put(targetCacheKey, audio.bytes, {
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

  const {
    data,
    profile,
    languageCode,
    spokenLanguageName,
    dialectRules,
    geminiVoice,
    geminiCacheKey,
    googleCacheKey,
    geminiContentLocation,
    googleContentLocation,
  } = resolved;

  // 1. Instant cached WAV on Gemini R2 HIT (zero stream overhead; ignore any foreign-provider object)
  if (c.env.UPLOADS && c.env.GEMINI_API_KEY) {
    const cached = await c.env.UPLOADS.get(geminiCacheKey);
    if (cached && cached.customMetadata?.provider !== "google-cloud-tts") {
      return buildCachedAudioResponse(cached, geminiContentLocation, "audio/wav", "gemini-tts", false);
    }
  }

  // 2. Open Gemini SSE stream and inspect the first audio part before sending response headers
  const opened = await openGeminiTtsStream(c.env, {
    text: data.text,
    languageCode,
    targetLanguageName: spokenLanguageName,
    dialectRules,
    voiceName: geminiVoice,
    slow: data.slow,
  });

  if (opened.upstream?.body) {
    const reader = opened.upstream.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let upstreamDone = false;
    const streamState: {
      mode: "unknown" | "pcm" | "buffered";
      sampleRate: number;
      bufferedContentType: string;
      firstChunk: boolean;
    } = {
      mode: "unknown",
      sampleRate: 24000,
      bufferedContentType: "application/octet-stream",
      firstChunk: true,
    };
    const initialPcmChunks: Uint8Array[] = [];
    const bufferedChunks: Uint8Array[] = [];
    let preReadAborted = false;

    const processParts = (
      parts: Array<{ data: string; mimeType?: string }>,
      targetPcm: Uint8Array[],
      onEnqueue?: (chunk: Uint8Array) => void,
    ): boolean => {
      for (const part of parts) {
        const raw = decodeBase64(part.data);
        if (streamState.mode === "unknown") {
          const parsedMime = parseAudioPartMime(part.mimeType, raw, true, 24000);
          if (parsedMime.kind === "buffered") {
            streamState.mode = "buffered";
            streamState.bufferedContentType = parsedMime.contentType;
            streamState.firstChunk = false;
            if (raw.byteLength > 0) bufferedChunks.push(raw);
            continue;
          }
          streamState.mode = "pcm";
          streamState.sampleRate = parsedMime.sampleRate;
          const pcm = stripWavHeaderIfPresent(raw);
          streamState.firstChunk = false;
          if (pcm.byteLength > 0) {
            targetPcm.push(pcm);
            onEnqueue?.(pcm);
          }
          continue;
        }

        if (streamState.mode === "buffered") {
          if (raw.byteLength > 0) bufferedChunks.push(raw);
          continue;
        }

        const parsedMime = parseAudioPartMime(part.mimeType, raw, false, streamState.sampleRate);
        if (parsedMime.kind === "buffered") {
          return false;
        }
        const shouldStrip =
          streamState.firstChunk ||
          Boolean(part.mimeType && part.mimeType.toLowerCase().includes("wav"));
        const pcm = shouldStrip ? stripWavHeaderIfPresent(raw) : raw;
        streamState.firstChunk = false;
        if (pcm.byteLength > 0) {
          targetPcm.push(pcm);
          onEnqueue?.(pcm);
        }
      }
      return true;
    };

    try {
      while (!upstreamDone) {
        const { value, done } = await reader.read();
        if (done) {
          upstreamDone = true;
          if (sseBuffer.trim()) {
            for (const line of sseBuffer.split(/\r?\n/)) {
              if (!processParts(extractSseAudioParts(line), initialPcmChunks)) {
                preReadAborted = true;
                break;
              }
            }
          }
          sseBuffer = "";
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split(/\r?\n/);
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!processParts(extractSseAudioParts(line), initialPcmChunks)) {
            preReadAborted = true;
            break;
          }
        }
        if (preReadAborted) break;
        if (
          streamState.mode === "buffered" ||
          (streamState.mode === "pcm" && initialPcmChunks.length > 0)
        ) {
          break;
        }
      }
    } catch {
      preReadAborted = true;
    }

    if (preReadAborted) {
      await reader.cancel().catch(() => {});
    } else if (streamState.mode === "buffered") {
      try {
        while (!upstreamDone) {
          const { value, done } = await reader.read();
          if (done) {
            upstreamDone = true;
            if (sseBuffer.trim()) {
              for (const line of sseBuffer.split(/\r?\n/)) {
                processParts(extractSseAudioParts(line), initialPcmChunks);
              }
            }
            break;
          }
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() ?? "";
          for (const line of lines) {
            processParts(extractSseAudioParts(line), initialPcmChunks);
          }
        }
      } catch {
        await reader.cancel().catch(() => {});
      }

      const fullBytes = concatBytes(bufferedChunks);
      if (fullBytes.byteLength > 0) {
        const headers: Record<string, string> = {
          "Content-Type": streamState.bufferedContentType,
          "Content-Length": String(fullBytes.byteLength),
          "Cache-Control": "private, max-age=2592000",
          "Accept-Ranges": "bytes",
          "X-Audio-Provider": "gemini-tts",
          "X-Audio-Cache": "MISS",
        };
        if (c.env.UPLOADS) {
          headers["Content-Location"] = geminiContentLocation;
          const putPromise = c.env.UPLOADS.put(geminiCacheKey, fullBytes, {
            httpMetadata: {
              contentType: streamState.bufferedContentType,
              cacheControl: "private, max-age=2592000",
            },
            customMetadata: {
              provider: "gemini-tts",
            },
          });
          try {
            c.executionCtx.waitUntil(putPromise);
          } catch {
            await putPromise;
          }
        }
        return new Response(fullBytes, { status: 200, headers });
      }
    } else if (streamState.mode === "pcm" && initialPcmChunks.length > 0) {
      let resolveCacheWrite!: () => void;
      let cacheWriteSettled = false;
      const cacheWriteDone = new Promise<void>((resolve) => {
        resolveCacheWrite = resolve;
      });
      const settleCacheWrite = () => {
        if (!cacheWriteSettled) {
          cacheWriteSettled = true;
          resolveCacheWrite();
        }
      };

      let hasExecutionCtx = false;
      if (c.env.UPLOADS) {
        try {
          c.executionCtx.waitUntil(cacheWriteDone);
          hasExecutionCtx = true;
        } catch {
          hasExecutionCtx = false;
        }
      } else {
        settleCacheWrite();
      }

      const pcmChunks: Uint8Array[] = [...initialPcmChunks];
      let initialFlushed = false;
      let streamAborted = false;
      let putStarted = false;

      const finalizeAndClose = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
        if (c.env.UPLOADS && pcmChunks.length > 0 && !streamAborted && !putStarted) {
          putStarted = true;
          const wavBytes = wrapPcm16AsWav(concatBytes(pcmChunks), streamState.sampleRate);
          const putPromise = c.env.UPLOADS.put(geminiCacheKey, wavBytes, {
            httpMetadata: {
              contentType: "audio/wav",
              cacheControl: "private, max-age=2592000",
            },
            customMetadata: {
              provider: "gemini-tts",
            },
          })
            .catch((err) => {
              console.error("R2 stream cache put failed:", err);
            })
            .finally(settleCacheWrite);

          if (!hasExecutionCtx) {
            await putPromise;
          }
        } else {
          settleCacheWrite();
        }
        controller.close();
      };

      const pcmStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            if (!initialFlushed) {
              initialFlushed = true;
              for (const chunk of initialPcmChunks) {
                controller.enqueue(chunk);
              }
              if (upstreamDone) {
                await finalizeAndClose(controller);
              }
              return;
            }

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                upstreamDone = true;
                if (sseBuffer.trim()) {
                  for (const line of sseBuffer.split(/\r?\n/)) {
                    const ok = processParts(extractSseAudioParts(line), pcmChunks, (chunk) => {
                      controller.enqueue(chunk);
                    });
                    if (!ok) {
                      streamAborted = true;
                      settleCacheWrite();
                      await reader.cancel().catch(() => {});
                      controller.error(new Error("Unexpected non-PCM chunk in PCM stream"));
                      return;
                    }
                  }
                }
                await finalizeAndClose(controller);
                return;
              }

              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split(/\r?\n/);
              sseBuffer = lines.pop() ?? "";
              let enqueued = false;
              for (const line of lines) {
                const ok = processParts(extractSseAudioParts(line), pcmChunks, (chunk) => {
                  controller.enqueue(chunk);
                  enqueued = true;
                });
                if (!ok) {
                  streamAborted = true;
                  settleCacheWrite();
                  await reader.cancel().catch(() => {});
                  controller.error(new Error("Unexpected non-PCM chunk in PCM stream"));
                  return;
                }
              }
              if (enqueued) return;
            }
          } catch (err) {
            streamAborted = true;
            settleCacheWrite();
            controller.error(err);
          }
        },
        cancel() {
          streamAborted = true;
          reader.cancel().catch(() => {});
          settleCacheWrite();
        },
      });

      const streamHeaders: Record<string, string> = {
        "Content-Type": `audio/l16;rate=${streamState.sampleRate};channels=1`,
        "Cache-Control": "no-store",
        "X-Audio-Stream": "1",
        "X-Audio-Provider": "gemini-tts",
        "X-Audio-Cache": "MISS",
      };
      if (c.env.UPLOADS) {
        streamHeaders["Content-Location"] = geminiContentLocation;
      }

      return new Response(pcmStream, { status: 200, headers: streamHeaders });
    } else {
      await reader.cancel().catch(() => {});
    }
  }

  // 3. Fallback to Google Cloud TTS under its isolated R2 namespace
  if (c.env.GOOGLE_TTS_API_KEY) {
    if (c.env.UPLOADS) {
      const cachedFallback = await c.env.UPLOADS.get(googleCacheKey);
      if (cachedFallback) {
        return buildCachedAudioResponse(
          cachedFallback,
          googleContentLocation,
          "audio/mpeg",
          "google-cloud-tts",
          false,
        );
      }
    }

    const gcAudio = await synthesizeWithGoogleCloudTts(c.env, {
      text: data.text,
      languageCode,
      voiceName: profile.ttsVoiceName,
      slow: data.slow,
    });
    if (gcAudio) {
      const headers: Record<string, string> = {
        "Content-Type": gcAudio.contentType,
        "Content-Length": String(gcAudio.bytes.byteLength),
        "Cache-Control": "private, max-age=2592000",
        "X-Audio-Provider": "google-cloud-tts",
        "X-Audio-Cache": "MISS",
      };
      if (c.env.UPLOADS) {
        headers["Content-Location"] = googleContentLocation;
        const putPromise = c.env.UPLOADS.put(googleCacheKey, gcAudio.bytes, {
          httpMetadata: {
            contentType: gcAudio.contentType,
            cacheControl: "private, max-age=2592000",
          },
          customMetadata: {
            provider: "google-cloud-tts",
          },
        });
        try {
          c.executionCtx.waitUntil(putPromise);
        } catch {
          await putPromise;
        }
      }
      return new Response(gcAudio.bytes, {
        status: 200,
        headers,
      });
    }
  }

  return c.json(
    { error: "Cloud TTS unavailable; falling back to device speechSynthesis" },
    501,
    { "X-Audio-Fallback-Reason": opened.reason || "provider-unavailable" },
  );
}

const MAX_GEMINI_PREWARM_ITEMS = 6;

export async function prewarmAudioItems(
  env: Env,
  profile: LearnerProfileDto,
  items: Array<{ text: string; languageCode: string; slow?: boolean }>,
): Promise<void> {
  if (!env.UPLOADS || (!env.GEMINI_API_KEY && !env.GOOGLE_TTS_API_KEY) || items.length === 0) return;

  const geminiVoice = resolveGeminiVoiceName(profile.ttsVoiceName, env.GEMINI_TTS_VOICE);
  const seen = new Set<string>();
  const unique = items
    .map((it) => ({
      text: it.text.trim(),
      languageCode: it.languageCode || profile.targetLanguageCode,
      slow: Boolean(it.slow),
    }))
    .filter((it) => {
      if (!it.text) return false;
      const k = `${it.languageCode}|${it.slow ? 1 : 0}|${it.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  if (env.GEMINI_API_KEY) {
    const targets = unique.slice(0, MAX_GEMINI_PREWARM_ITEMS);
    let rateLimited = false;

    for (let i = 0; i < targets.length && !rateLimited; i += 2) {
      const batch = targets.slice(i, i + 2);
      await Promise.all(
        batch.map(async (item) => {
          if (rateLimited) return;
          try {
            const { languageCode, spokenLanguageName, dialectRules } = resolveLanguageContext(
              profile,
              item.languageCode,
            );
            const geminiCacheKey = await buildGeminiCacheKey(
              env,
              profile,
              geminiVoice,
              languageCode,
              item.slow,
              item.text,
            );
            const exists = env.UPLOADS?.head
              ? await env.UPLOADS.head(geminiCacheKey)
              : await env.UPLOADS!.get(geminiCacheKey);
            if (exists && exists.customMetadata?.provider !== "google-cloud-tts") {
              return;
            }

            const result = await synthesizeWithGeminiTts(env, {
              text: item.text,
              languageCode,
              targetLanguageName: spokenLanguageName,
              dialectRules,
              voiceName: geminiVoice,
              slow: item.slow,
              prefetch: true,
            });

            if (result.status === 429 || result.reason === "gemini-tts-429") {
              rateLimited = true;
              return;
            }
            if (!result.audio) return;

            await env.UPLOADS!.put(geminiCacheKey, result.audio.bytes, {
              httpMetadata: {
                contentType: result.audio.contentType,
                cacheControl: "private, max-age=2592000",
              },
              customMetadata: {
                provider: "gemini-tts",
              },
            });
          } catch {}
        }),
      );
    }
    return;
  }

  // Fallback-only environments (no GEMINI_API_KEY): prewarm strictly in the Google Cloud namespace
  const targets = unique.slice(0, 12);
  for (let i = 0; i < targets.length; i += 3) {
    const batch = targets.slice(i, i + 3);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const googleCacheKey = await buildGoogleCloudCacheKey(
            profile,
            item.languageCode,
            item.slow,
            item.text,
          );
          const exists = env.UPLOADS?.head
            ? await env.UPLOADS.head(googleCacheKey)
            : await env.UPLOADS!.get(googleCacheKey);
          if (exists) return;

          const gc = await synthesizeWithGoogleCloudTts(env, {
            text: item.text,
            languageCode: item.languageCode,
            voiceName: profile.ttsVoiceName,
            slow: item.slow,
          });
          if (!gc) return;

          await env.UPLOADS!.put(googleCacheKey, gc.bytes, {
            httpMetadata: {
              contentType: gc.contentType,
              cacheControl: "private, max-age=2592000",
            },
            customMetadata: {
              provider: "google-cloud-tts",
            },
          });
        } catch {}
      }),
    );
  }
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
