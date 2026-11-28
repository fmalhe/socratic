import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  renderHomeworkHelpSystemPrompt,
  renderHomeworkScanSystemPrompt,
  renderReadingSystemPrompt,
} from "../src/lib/gemini";
import { computeNextStreak } from "../src/lib/streak";
import { resolveProfileId } from "../src/modules/profile";
import {
  prewarmAudioItems,
  stripWavHeaderIfPresent,
  wrapPcm16AsWav,
} from "../src/modules/audio";
import type { Env, LearnerProfileDto } from "../src/types";

const SAMPLE_PROFILE: LearnerProfileDto = {
  id: 1,
  name: "Sofia",
  age: 8,
  targetLanguageCode: "pt-PT",
  targetLanguageName: "European Portuguese",
  nativeLanguageCode: "nb-NO",
  nativeLanguageName: "Norwegian",
  dialectRules: "ALWAYS use European Portuguese (PT-PT).",
  ttsVoiceName: "pt-PT-Wavenet-A",
};

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ASSETS: { fetch: async () => new Response("OK") } as unknown as Fetcher,
    GEMINI_API_KEY: "test-key",
    ...overrides,
  };
}

describe("computeNextStreak", () => {
  it("starts at 1 when no previous activity", () => {
    expect(computeNextStreak(0, null, "2026-11-26")).toBe(1);
  });

  it("keeps streak on same day", () => {
    expect(computeNextStreak(4, "2026-11-26", "2026-11-26")).toBe(4);
  });

  it("increments streak when active yesterday", () => {
    expect(computeNextStreak(4, "2026-11-25", "2026-11-26")).toBe(5);
  });

  it("resets streak when a day was missed", () => {
    expect(computeNextStreak(7, "2026-11-24", "2026-11-26")).toBe(1);
  });
});

describe("resolveProfileId", () => {
  it("defaults to 1 when header is missing", () => {
    expect(resolveProfileId(undefined)).toBe(1);
    expect(resolveProfileId("  ")).toBe(1);
  });

  it("parses valid positive integer", () => {
    expect(resolveProfileId("2")).toBe(2);
  });

  it("rejects invalid values", () => {
    expect(() => resolveProfileId("abc")).toThrow("Invalid X-Profile-Id");
    expect(() => resolveProfileId("0")).toThrow("Invalid X-Profile-Id");
  });
});

describe("dynamic prompt rendering", () => {
  it("injects learner profile into reading and homework prompts", () => {
    const readingPrompt = renderReadingSystemPrompt(SAMPLE_PROFILE);
    expect(readingPrompt).toContain("8-year-old");
    expect(readingPrompt).toContain("European Portuguese");
    expect(readingPrompt).toContain("Norwegian");
    expect(readingPrompt).toContain("ALWAYS use European Portuguese (PT-PT).");

    expect(renderHomeworkHelpSystemPrompt(SAMPLE_PROFILE)).toContain("NEVER give away the final answer");
    expect(renderHomeworkScanSystemPrompt(SAMPLE_PROFILE)).toContain("ONE BY ONE");
  });
});

describe("Worker HTTP routes", () => {
  it("enforces ALLOWED_IPS when configured", async () => {
    const env = makeEnv({ ALLOWED_IPS: "203.0.113.10" });

    const blocked = await app.request("/api/health", { headers: { "CF-Connecting-IP": "198.51.100.5" } }, env);
    expect(blocked.status).toBe(403);

    const allowed = await app.request("/api/health", { headers: { "CF-Connecting-IP": "203.0.113.10" } }, env);
    expect(allowed.status).toBe(200);
  });

  it("returns 501 on /api/audio/speak when no cloud TTS keys are configured", async () => {
    const res = await app.request(
      "/api/audio/speak",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Bom dia!", slow: true }),
      },
      makeEnv({ GEMINI_API_KEY: "" }),
    );
    expect(res.status).toBe(501);
  });

  it("lists all 4 MCP tools on POST /mcp", async () => {
    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((t) => t.name)).toEqual([
      "getLearnerProfile",
      "getProgressAndTrickyWords",
      "listHomeworkSessions",
      "getHomeworkSession",
    ]);
  });

  it("handles /api/uploads gracefully when R2 is not configured and serves stored images when bound", async () => {
    const unconfigured = await app.request("/api/uploads/homework/test.jpg", {}, makeEnv());
    expect(unconfigured.status).toBe(404);

    const store = new Map<string, { data: ArrayBuffer; contentType: string }>();
    const mockR2 = {
      put: async (key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => {
        store.set(key, { data: value, contentType: opts?.httpMetadata?.contentType ?? "image/jpeg" });
        return null;
      },
      get: async (key: string) => {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          body: new Uint8Array(entry.data),
          httpEtag: '"test-etag"',
          writeHttpMetadata: (headers: Headers) => headers.set("Content-Type", entry.contentType),
        };
      },
    } as unknown as R2Bucket;

    const env = makeEnv({ UPLOADS: mockR2 });
    const badPath = await app.request("/api/uploads/other/test.jpg", {}, env);
    expect(badPath.status).toBe(400);

    await mockR2.put("homework/page-1.jpg", new Uint8Array([1, 2, 3]).buffer, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    const okRes = await app.request("/api/uploads/homework/page-1.jpg", {}, env);
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("supports RFC 10008 HTTP QUERY and Accept-Query discovery on /api/audio/speak and /api/homework/sessions", async () => {
    const optAudio = await app.request("/api/audio/speak", { method: "OPTIONS" }, makeEnv());
    expect(optAudio.status).toBe(204);
    expect(optAudio.headers.get("Allow")).toContain("QUERY");
    expect(optAudio.headers.get("Accept-Query")).toContain("application/json");

    const badMediaAudio = await app.request(
      "/api/audio/speak",
      {
        method: "QUERY",
        headers: { "Content-Type": "text/plain" },
        body: "Bom dia",
      },
      makeEnv({ GEMINI_API_KEY: "" }),
    );
    expect(badMediaAudio.status).toBe(415);
    expect(badMediaAudio.headers.get("Accept-Query")).toContain("application/json");

    const validQueryAudio = await app.request(
      "/api/audio/speak",
      {
        method: "QUERY",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Bom dia!", slow: false }),
      },
      makeEnv({ GEMINI_API_KEY: "" }),
    );
    expect(validQueryAudio.status).toBe(501);
    expect(validQueryAudio.headers.get("Accept-Query")).toContain("application/json");

    const optSessions = await app.request("/api/homework/sessions", { method: "OPTIONS" }, makeEnv());
    expect(optSessions.status).toBe(204);
    expect(optSessions.headers.get("Allow")).toContain("QUERY");
    expect(optSessions.headers.get("Accept-Query")).toContain("text/plain");

    const badMediaSessions = await app.request(
      "/api/homework/sessions",
      {
        method: "QUERY",
        headers: { "Content-Type": "application/xml" },
        body: "<q/>",
      },
      makeEnv(),
    );
    expect(badMediaSessions.status).toBe(415);
  });

  it("validates image MIME type and 12 MB limit on scan endpoints", async () => {
    const form = new FormData();
    form.append("image", new File(["hello"], "notes.txt", { type: "text/plain" }));

    const res = await app.request(
      "/api/reading/scan",
      { method: "POST", body: form },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("unsupported file type");
  });

  it("serves HTTP 206 Partial Content and 416 for R2 upload Range requests", async () => {
    const payload = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const mockBucket = {
      get: async (_key: string, opts?: { range?: { offset?: number; length?: number; suffix?: number } }) => {
        const start = opts?.range?.offset ?? 0;
        const slice =
          opts?.range?.suffix !== undefined
            ? payload.slice(Math.max(0, payload.length - opts.range.suffix))
            : opts?.range?.length !== undefined
              ? payload.slice(start, start + opts.range.length)
              : payload.slice(start);
        return {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(slice);
              controller.close();
            },
          }),
          size: payload.length,
          range: opts?.range,
          httpEtag: '"etag-1"',
          writeHttpMetadata: (h: Headers) => h.set("Content-Type", "audio/wav"),
          arrayBuffer: async () => payload.buffer,
        };
      },
    } as unknown as R2Bucket;

    const partial = await app.request(
      "/api/uploads/audio/clip.bin",
      { headers: { Range: "bytes=1-3" } },
      makeEnv({ UPLOADS: mockBucket }),
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("Accept-Ranges")).toBe("bytes");
    expect(partial.headers.get("Content-Range")).toBe("bytes 1-3/6");
    expect(Array.from(new Uint8Array(await partial.arrayBuffer()))).toEqual([20, 30, 40]);

    const invalid = await app.request(
      "/api/uploads/audio/clip.bin",
      { headers: { Range: "bytes=99-120" } },
      makeEnv({ UPLOADS: mockBucket }),
    );
    expect(invalid.status).toBe(416);
  });

  it("sends thinkingLevel LOW and skips thought parts in callGeminiStructured", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: { generationConfig?: { thinkingConfig?: { thinkingLevel?: string } } } | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as { generationConfig?: { thinkingConfig?: { thinkingLevel?: string } } };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "internal reasoning", thought: true },
                  { text: '{"reply":"ok"}' },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const { callGeminiStructured } = await import("../src/lib/gemini");
      const out = await callGeminiStructured<{ reply: string }>(makeEnv(), {
        systemPrompt: "sys",
        userText: "usr",
        responseSchema: { type: "OBJECT" },
      });
      expect(out).toEqual({ reply: "ok" });
      expect(capturedBody?.generationConfig?.thinkingConfig?.thinkingLevel).toBe("LOW");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries Gemini TTS without languageCode on 400 and caches with X-Audio-Provider", async () => {
    const r2Store = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            id: 1,
            name: "Sofia",
            age: 8,
            target_language_code: "pt-PT",
            target_language_name: "European Portuguese",
            native_language_code: "nb-NO",
            native_language_name: "Norwegian",
            dialect_rules: "PT-PT",
            tts_voice_name: "pt-PT-Wavenet-A",
          }),
        }),
      }),
    } as unknown as D1Database;

    const mockBucket = {
      get: async (key: string) => {
        const entry = r2Store.get(key);
        if (!entry) return null;
        return {
          body: new ReadableStream({
            start(c) {
              c.enqueue(entry.bytes);
              c.close();
            },
          }),
          customMetadata: entry.customMetadata,
          writeHttpMetadata: (h: Headers) => {
            h.set("Content-Type", "audio/wav");
            h.set("Cache-Control", "private, max-age=2592000");
          },
        };
      },
      put: async (key: string, val: Uint8Array, opts?: { customMetadata?: Record<string, string> }) => {
        r2Store.set(key, { bytes: new Uint8Array(val), customMetadata: opts?.customMetadata });
      },
    } as unknown as R2Bucket;

    const fetchCalls: Array<Record<string, unknown>> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      fetchCalls.push(parsed);
      if (fetchCalls.length === 1) {
        return new Response(JSON.stringify({ error: { message: "languageCode unsupported" } }), { status: 400 });
      }
      const pcmBase64 = btoa(String.fromCharCode(1, 0, 2, 0));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "audio/l16;rate=24000", data: pcmBase64 } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb, UPLOADS: mockBucket });
      const miss = await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Olá!", languageCode: "pt-PT", slow: false }),
        },
        env,
      );
      expect(miss.status).toBe(200);
      expect(miss.headers.get("X-Audio-Cache")).toBe("MISS");
      expect(miss.headers.get("X-Audio-Provider")).toBe("gemini-tts");
      expect(miss.headers.get("Cache-Control")).toContain("max-age");
      expect(fetchCalls).toHaveLength(2);
      const firstVoice = (fetchCalls[0] as { generationConfig?: { speechConfig?: { voiceConfig?: { prebuiltVoiceConfig?: { voiceName?: string } } } } }).generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
      expect(firstVoice).toBe("Sulafat");
      expect((fetchCalls[1] as { generationConfig?: { speechConfig?: { languageCode?: string } } }).generationConfig?.speechConfig?.languageCode).toBeUndefined();

      const hit = await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Olá!", languageCode: "pt-PT", slow: false }),
        },
        env,
      );
      expect(hit.status).toBe(200);
      expect(hit.headers.get("X-Audio-Cache")).toBe("HIT");
      expect(hit.headers.get("X-Audio-Provider")).toBe("gemini-tts");
      expect(fetchCalls).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("derives readingPassage fallback for legacy sessions, filters by ?q=, deletes R2 image, and deduplicates saved words", async () => {
    const deletedKeys: string[] = [];
    const sessions = [
      {
        id: 1,
        profile_id: 1,
        page_title: null,
        page_summary_native: "En tekst om katten",
        page_text_target: "O gato dorme. O cão brinca.",
        reading_passage_json: null,
        image_key: "homework/old-page.jpg",
        created_at: "2026-11-26T10:00:00Z",
      },
    ];
    const savedWords = [{ w: "borboleta" }];
    const insertedWords: string[] = [];

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          _sql: sql,
          _args: args,
          first: async () => {
            if (sql.includes("FROM learner_profile")) {
              return {
                id: 1,
                name: "Sofia",
                age: 8,
                target_language_code: "pt-PT",
                target_language_name: "European Portuguese",
                native_language_code: "nb-NO",
                native_language_name: "Norwegian",
                dialect_rules: "PT-PT",
                tts_voice_name: "Sulafat",
              };
            }
            if (sql.includes("FROM homework_session WHERE id")) {
              return sessions.find((s) => s.id === Number(args[0])) ?? null;
            }
            if (sql.includes("FROM child_progress")) {
              return { profile_id: 1, total_stars: 5, current_streak_days: 1, last_activity_date: "2026-11-26", pages_read_count: 1 };
            }
            return null;
          },
          all: async () => {
            if (sql.includes("FROM homework_session")) return { results: [...sessions] };
            if (sql.includes("FROM homework_exercise")) return { results: [] };
            if (sql.includes("FROM homework_message")) return { results: [] };
            if (sql.includes("SELECT LOWER(word)")) return { results: savedWords };
            if (sql.includes("FROM saved_word")) return { results: [] };
            return { results: [] };
          },
          run: async () => ({ meta: { last_row_id: 1 } }),
        }),
      }),
      batch: async (stmts: Array<{ _sql?: string; _args?: unknown[] }>) => {
        for (const st of stmts) {
          if (st._sql?.includes("INSERT INTO saved_word") && typeof st._args?.[1] === "string") {
            insertedWords.push(st._args[1]);
          }
          if (st._sql?.includes("DELETE FROM homework_session")) {
            const idx = sessions.findIndex((s) => s.id === Number(st._args?.[0]));
            if (idx >= 0) sessions.splice(idx, 1);
          }
        }
        return [];
      },
    } as unknown as D1Database;

    const mockBucket = {
      delete: async (key: string) => {
        deletedKeys.push(key);
      },
    } as unknown as R2Bucket;

    const env = makeEnv({ DB: mockDb, UPLOADS: mockBucket });

    const listRes = await app.request("/api/homework/sessions?q=gato&limit=5", {}, env);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as Array<{
      pageTitle: string;
      readingPassage: { sentences: Array<{ targetText: string }> } | null;
    }>;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.pageTitle).toBe("O gato dorme");
    expect(listed[0]?.readingPassage?.sentences.map((s) => s.targetText)).toEqual([
      "O gato dorme.",
      "O cão brinca.",
    ]);

    const completeRes = await app.request(
      "/api/progress/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "HOMEWORK",
          starsEarned: 2,
          trickyWords: ["Borboleta", "tartaruga", "Tartaruga"],
        }),
      },
      env,
    );
    expect(completeRes.status).toBe(200);
    expect(insertedWords).toEqual(["tartaruga"]);

    const delRes = await app.request("/api/homework/sessions/1", { method: "DELETE" }, env);
    expect(delRes.status).toBe(200);
    expect(deletedKeys).toEqual(["homework/old-page.jpg"]);
  });

  it("falls back across Gemini TTS models on 429, halts prefetch on 429, and streams PCM with R2 WAV caching", async () => {
    const r2Store = new Map<string, Uint8Array>();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            id: 1,
            name: "Sofia",
            age: 8,
            target_language_code: "pt-PT",
            target_language_name: "European Portuguese",
            native_language_code: "nb-NO",
            native_language_name: "Norwegian",
            dialect_rules: "PT-PT",
            tts_voice_name: "Sulafat",
          }),
        }),
      }),
    } as unknown as D1Database;

    const mockBucket = {
      get: async (key: string) => {
        const bytes = r2Store.get(key);
        if (!bytes) return null;
        return {
          body: new ReadableStream({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
          customMetadata: { provider: "gemini-tts" },
          writeHttpMetadata: (h: Headers) => h.set("Content-Type", "audio/wav"),
        };
      },
      put: async (key: string, val: Uint8Array) => {
        r2Store.set(key, new Uint8Array(val));
      },
    } as unknown as R2Bucket;

    const urls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      urls.push(u);
      if (u.includes("gemini-3.8-flash-lite-tts")) {
        return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
      }
      if (u.includes("streamGenerateContent")) {
        const chunkB64 = btoa(String.fromCharCode(10, 0, 20, 0));
        const sse = `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { data: chunkB64 } }] } }],
        })}\n\n`;
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      const wavB64 = btoa(String.fromCharCode(5, 0, 6, 0));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/l16;rate=24000", data: wavB64 } }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb, UPLOADS: mockBucket });

      // 1. Prefetch returns 429 cleanly without hitting fallback models
      const prefRes = await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Prefetch me", languageCode: "pt-PT", slow: false, prefetch: true }),
        },
        env,
      );
      expect(prefRes.status).toBe(429);
      expect(urls).toHaveLength(1);

      // 2. Real stream request waterfalls from 429 -> gemini-3.8-flash-tts, streams raw PCM, and saves WAV to R2
      const streamRes = await app.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Bom dia Sofia!", languageCode: "pt-PT", slow: false }),
        },
        env,
      );
      expect(streamRes.status).toBe(200);
      expect(streamRes.headers.get("Content-Type")).toContain("audio/l16");
      expect(streamRes.headers.get("X-Audio-Stream")).toBe("1");
      const pcmOut = new Uint8Array(await streamRes.arrayBuffer());
      expect(Array.from(pcmOut)).toEqual([10, 0, 20, 0]);
      // Wait one tick for background R2 write
      await new Promise((r) => setTimeout(r, 10));
      expect(r2Store.size).toBe(1);

      // 3. Second stream request hits R2 WAV cache immediately
      const cachedHit = await app.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Bom dia Sofia!", languageCode: "pt-PT", slow: false }),
        },
        env,
      );
      expect(cachedHit.status).toBe(200);
      expect(cachedHit.headers.get("Content-Type")).toBe("audio/wav");
      expect(cachedHit.headers.get("X-Audio-Cache")).toBe("HIT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function createTestR2() {
  const store = new Map<
    string,
    { bytes: Uint8Array; contentType: string; customMetadata?: Record<string, string> }
  >();
  const putKeys: string[] = [];
  const deletedKeys: string[] = [];
  const bucket = {
    head: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.bytes.byteLength,
        httpEtag: '"test-etag"',
        customMetadata: entry.customMetadata,
      };
    },
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: new ReadableStream({
          start(c) {
            c.enqueue(entry.bytes);
            c.close();
          },
        }),
        size: entry.bytes.byteLength,
        httpEtag: '"test-etag"',
        customMetadata: entry.customMetadata,
        writeHttpMetadata: (h: Headers) => {
          h.set("Content-Type", entry.contentType);
          h.set("Cache-Control", "private, max-age=2592000");
        },
        arrayBuffer: async () => entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength),
      };
    },
    put: async (
      key: string,
      value: ArrayBuffer | Uint8Array,
      opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
    ) => {
      putKeys.push(key);
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
      store.set(key, {
        bytes,
        contentType: opts?.httpMetadata?.contentType ?? "application/octet-stream",
        customMetadata: opts?.customMetadata,
      });
      return null;
    },
    delete: async (key: string) => {
      deletedKeys.push(key);
      store.delete(key);
    },
  } as unknown as R2Bucket;

  return { store, putKeys, deletedKeys, bucket };
}

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Sofia",
    age: 8,
    target_language_code: "pt-PT",
    target_language_name: "European Portuguese",
    native_language_code: "nb-NO",
    native_language_name: "Norwegian",
    dialect_rules: "ALWAYS use European Portuguese (PT-PT).",
    tts_voice_name: "Sulafat",
    ...overrides,
  };
}

function createFakeJpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function createFakePngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function buildCustomWav(
  pcmPayload: Uint8Array,
  options: {
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
    extraChunks?: Array<{ id: string; data: Uint8Array }>;
    trailingChunk?: { id: string; data: Uint8Array };
    dataChunkSizeOverride?: number;
  } = {},
): Uint8Array {
  const sampleRate = options.sampleRate ?? 24000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const fmtChunk = new Uint8Array(24);
  const fmtView = new DataView(fmtChunk.buffer);
  fmtChunk.set([0x66, 0x6d, 0x74, 0x20], 0); // "fmt "
  fmtView.setUint32(4, 16, true);
  fmtView.setUint16(8, 1, true); // PCM
  fmtView.setUint16(10, channels, true);
  fmtView.setUint32(12, sampleRate, true);
  fmtView.setUint32(16, (sampleRate * channels * bitsPerSample) / 8, true);
  fmtView.setUint16(20, (channels * bitsPerSample) / 8, true);
  fmtView.setUint16(22, bitsPerSample, true);

  const parts: Uint8Array[] = [fmtChunk];
  for (const extra of options.extraChunks ?? []) {
    const paddedLen = extra.data.byteLength + (extra.data.byteLength % 2);
    const chunk = new Uint8Array(8 + paddedLen);
    for (let i = 0; i < 4; i++) chunk[i] = extra.id.charCodeAt(i);
    new DataView(chunk.buffer).setUint32(4, extra.data.byteLength, true);
    chunk.set(extra.data, 8);
    parts.push(chunk);
  }

  const dataHeader = new Uint8Array(8);
  dataHeader.set([0x64, 0x61, 0x74, 0x61], 0); // "data"
  new DataView(dataHeader.buffer).setUint32(
    4,
    options.dataChunkSizeOverride ?? pcmPayload.byteLength,
    true,
  );
  parts.push(dataHeader, pcmPayload);

  if (options.trailingChunk) {
    const t = options.trailingChunk;
    const paddedLen = t.data.byteLength + (t.data.byteLength % 2);
    const chunk = new Uint8Array(8 + paddedLen);
    for (let i = 0; i < 4; i++) chunk[i] = t.id.charCodeAt(i);
    new DataView(chunk.buffer).setUint32(4, t.data.byteLength, true);
    chunk.set(t.data, 8);
    parts.push(chunk);
  }

  const bodyLen = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const riff = new Uint8Array(12 + bodyLen);
  riff.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  new DataView(riff.buffer).setUint32(4, 4 + bodyLen, true);
  riff.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  let off = 12;
  for (const p of parts) {
    riff.set(p, off);
    off += p.byteLength;
  }
  return riff;
}

describe("Feature #1 — R2 Prewarm & Fallback Cache Isolation", () => {
  it("prewarms via Gemini TTS when GEMINI_API_KEY is present and halts on 429 without writing Wavenet MP3 into Gemini cache", async () => {
    const r2 = createTestR2();
    const fetchUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchUrls.push(url);
      if (fetchUrls.length === 1) {
        const pcmB64 = btoa(String.fromCharCode(1, 0, 2, 0));
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: "audio/l16;rate=24000", data: pcmB64 } }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
    }) as typeof fetch;

    try {
      const env = makeEnv({
        UPLOADS: r2.bucket,
        GEMINI_API_KEY: "gemini-key",
        GOOGLE_TTS_API_KEY: "google-key",
      });
      await prewarmAudioItems(env, SAMPLE_PROFILE, [
        { text: "Olá", languageCode: "pt-PT" },
        { text: "Bom dia", languageCode: "pt-PT" },
        { text: "Boa tarde", languageCode: "pt-PT" },
      ]);

      expect(fetchUrls.every((u) => u.includes("generativelanguage.googleapis.com"))).toBe(true);
      expect(fetchUrls.some((u) => u.includes("texttospeech.googleapis.com"))).toBe(false);
      expect(r2.store.size).toBe(1);
      const storedEntry = Array.from(r2.store.values())[0]!;
      expect(storedEntry.customMetadata?.provider).toBe("gemini-tts");
      expect(storedEntry.contentType).toBe("audio/wav");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("isolates Google Cloud fallback cache keys from Gemini TTS keys during prewarm and live fallback", async () => {
    const r2 = createTestR2();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => makeProfileRow(),
        }),
      }),
    } as unknown as D1Database;

    const originalFetch = globalThis.fetch;
    let geminiUp = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("texttospeech.googleapis.com")) {
        return new Response(JSON.stringify({ audioContent: btoa("FAKE_MP3") }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (!geminiUp) {
        return new Response("down", { status: 503 });
      }
      const pcmB64 = btoa(String.fromCharCode(9, 0, 10, 0));
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: "audio/l16;rate=24000", data: pcmB64 } }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      // 1. Prewarm in fallback-only mode writes to isolated google-cloud-tts key
      await prewarmAudioItems(
        makeEnv({ DB: mockDb, UPLOADS: r2.bucket, GEMINI_API_KEY: "", GOOGLE_TTS_API_KEY: "gc-key" }),
        SAMPLE_PROFILE,
        [{ text: "Obrigado", languageCode: "pt-PT" }],
      );
      expect(r2.store.size).toBe(1);
      expect(Array.from(r2.store.values())[0]?.customMetadata?.provider).toBe("google-cloud-tts");

      // 2. When Gemini is enabled, "Obrigado" is NOT poisoned by Google Cloud prewarm
      geminiUp = true;
      const envBoth = makeEnv({
        DB: mockDb,
        UPLOADS: r2.bucket,
        GEMINI_API_KEY: "gem-key",
        GOOGLE_TTS_API_KEY: "gc-key",
      });
      const resGemini = await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Obrigado", languageCode: "pt-PT", slow: false }),
        },
        envBoth,
      );
      expect(resGemini.status).toBe(200);
      expect(resGemini.headers.get("X-Audio-Provider")).toBe("gemini-tts");
      expect(resGemini.headers.get("X-Audio-Cache")).toBe("MISS");

      // 3. When Gemini fails on live phrase and falls back to Google Cloud, recovery still hits Gemini cleanly
      geminiUp = false;
      const resFallback = await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Boa noite", languageCode: "pt-PT", slow: false }),
        },
        envBoth,
      );
      expect(resFallback.status).toBe(200);
      expect(resFallback.headers.get("X-Audio-Provider")).toBe("google-cloud-tts");

      geminiUp = true;
      const resRecovered = await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Boa noite", languageCode: "pt-PT", slow: false }),
        },
        envBoth,
      );
      expect(resRecovered.status).toBe(200);
      expect(resRecovered.headers.get("X-Audio-Provider")).toBe("gemini-tts");
      expect(resRecovered.headers.get("X-Audio-Cache")).toBe("MISS");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Feature #2 — D1 Chunked Hydration (>100 bind parameters)", () => {
  it("chunks sessionIds and exerciseIds (<= 80 binds) across >120 exercises and preserves ordering", async () => {
    const sessions = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      profile_id: 1,
      page_title: `Página ${i + 1}`,
      page_summary_native: `Oppsummering ${i + 1}`,
      page_text_target: `Texto ${i + 1}.`,
      reading_passage_json: null,
      image_key: null,
      created_at: "2026-11-27T10:00:00Z",
    }));

    const exercises = sessions.flatMap((s) =>
      Array.from({ length: 5 }, (_, j) => ({
        id: (s.id - 1) * 5 + j + 1,
        session_id: s.id,
        position: j + 1,
        label: String(j + 1),
        prompt_target: `Pergunta ${s.id}.${j + 1}`,
        prompt_native: null,
        prompt_english: null,
        explanation_native: `Forklaring ${s.id}.${j + 1}`,
        explanation_target: null,
        explanation_english: null,
        tricky_words_json: "[]",
        opening_question_native: "Hva betyr dette?",
        status: "PENDING",
      })),
    );

    const messages = exercises.flatMap((e) => [
      {
        id: e.id * 2 - 1,
        exercise_id: e.id,
        sender: "CHILD",
        content: `Child ${e.id}`,
        target_phrase: null,
        created_at: "2026-11-27T10:01:00Z",
      },
      {
        id: e.id * 2,
        exercise_id: e.id,
        sender: "TUTOR",
        content: `Tutor ${e.id}`,
        target_phrase: "Olá",
        created_at: "2026-11-27T10:02:00Z",
      },
    ]);

    let maxBindCount = 0;
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          if (args.length > 100) {
            throw new Error(`D1_ERROR: too many SQL variables (${args.length})`);
          }
          maxBindCount = Math.max(maxBindCount, args.length);
          return {
            first: async () => (sql.includes("FROM learner_profile") ? makeProfileRow() : null),
            all: async () => {
              if (sql.includes("FROM homework_session")) {
                return { results: [...sessions].reverse() };
              }
              if (sql.includes("FROM homework_exercise")) {
                const wanted = new Set(args.map(Number));
                return {
                  results: exercises
                    .filter((e) => wanted.has(e.session_id))
                    .sort((a, b) => a.session_id - b.session_id || a.position - b.position || a.id - b.id),
                };
              }
              if (sql.includes("FROM homework_message")) {
                const wanted = new Set(args.map(Number));
                return {
                  results: messages
                    .filter((m) => wanted.has(m.exercise_id))
                    .sort((a, b) => a.id - b.id),
                };
              }
              return { results: [] };
            },
          };
        },
      }),
    } as unknown as D1Database;

    const env = makeEnv({ DB: mockDb });
    const res = await app.request("/api/homework/sessions?limit=50", {}, env);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{
      id: number;
      exercises: Array<{ id: number; position: number; messages: Array<{ id: number }> }>;
    }>;
    expect(list).toHaveLength(25);
    expect(maxBindCount).toBeLessThanOrEqual(80);
    expect(maxBindCount).toBeGreaterThan(0);

    const totalExercises = list.reduce((acc, s) => acc + s.exercises.length, 0);
    const totalMessages = list.reduce(
      (acc, s) => acc + s.exercises.reduce((a2, e) => a2 + e.messages.length, 0),
      0,
    );
    expect(totalExercises).toBe(125);
    expect(totalMessages).toBe(250);
    expect(list[0]?.exercises.map((e) => e.position)).toEqual([1, 2, 3, 4, 5]);
    expect(list[0]?.exercises[0]?.messages.map((m) => m.id)).toEqual([
      list[0]!.exercises[0]!.id * 2 - 1,
      list[0]!.exercises[0]!.id * 2,
    ]);
  });
});

describe("Feature #3 — Audio Stream Hardening & RIFF Chunk Stripping", () => {
  it("strips RIFF headers with extra subchunks, odd padding, trailing chunks, and handles truncated headers", () => {
    const pcm = new Uint8Array([11, 22, 33, 44]);
    const standardWav = wrapPcm16AsWav(pcm, 24000);
    expect(Array.from(stripWavHeaderIfPresent(standardWav))).toEqual([11, 22, 33, 44]);

    const emptyWav = wrapPcm16AsWav(new Uint8Array(0), 24000);
    expect(stripWavHeaderIfPresent(emptyWav).byteLength).toBe(0);

    const customWav = buildCustomWav(pcm, {
      sampleRate: 16000,
      extraChunks: [
        { id: "fact", data: new Uint8Array([1, 2, 3, 4]) },
        { id: "LIST", data: new Uint8Array([0x61, 0x62, 0x63, 0x64, 0x65]) }, // 5 bytes -> odd padded
      ],
      trailingChunk: { id: "id3 ", data: new Uint8Array([99, 98, 97, 96]) },
    });
    expect(Array.from(stripWavHeaderIfPresent(customWav))).toEqual([11, 22, 33, 44]);

    const streamingWav = buildCustomWav(pcm, { dataChunkSizeOverride: 0xffffffff });
    expect(Array.from(stripWavHeaderIfPresent(streamingWav))).toEqual([11, 22, 33, 44]);

    const truncatedRiff = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    ]);
    expect(stripWavHeaderIfPresent(truncatedRiff).byteLength).toBe(0);

    const rawPcm = new Uint8Array([5, 6, 7, 8]);
    expect(Array.from(stripWavHeaderIfPresent(rawPcm))).toEqual([5, 6, 7, 8]);
  });

  it("parses stream sample rate, strips non-44-byte WAV headers, awaits R2 put when executionCtx is absent, and handles compressed MIME", async () => {
    const r2 = createTestR2();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => makeProfileRow(),
        }),
      }),
    } as unknown as D1Database;

    const pcmBytes = new Uint8Array([15, 0, 25, 0]);
    const customWav = buildCustomWav(pcmBytes, {
      sampleRate: 16000,
      extraChunks: [{ id: "LIST", data: new Uint8Array([1, 2, 3, 4, 5]) }],
    });

    const originalFetch = globalThis.fetch;
    let mode: "wav16k" | "mpeg" | "empty" = "wav16k";
    globalThis.fetch = (async () => {
      if (mode === "wav16k") {
        let bin = "";
        for (const b of customWav) bin += String.fromCharCode(b);
        const sse = `data: ${JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: "audio/wav;rate=16000", data: btoa(bin) } }] } },
          ],
        })}\n\n`;
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      if (mode === "mpeg") {
        const sse = `data: ${JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: "audio/mpeg", data: btoa("MP3BYTES") } }] } },
          ],
        })}\n\n`;
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb, UPLOADS: r2.bucket });

      // 1. Custom RIFF WAV at 16000 Hz -> stripped accurately and R2 write completes synchronously before close
      const resWav = await app.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Dezasseis mil", languageCode: "pt-PT" }),
        },
        env,
      );
      expect(resWav.status).toBe(200);
      expect(resWav.headers.get("Content-Type")).toBe("audio/l16;rate=16000;channels=1");
      expect(resWav.headers.get("X-Audio-Stream")).toBe("1");
      expect(Array.from(new Uint8Array(await resWav.arrayBuffer()))).toEqual([15, 0, 25, 0]);
      // Immediately persisted in R2 without setTimeout
      expect(r2.store.size).toBe(1);
      const cachedWav = Array.from(r2.store.values())[0]!.bytes;
      expect(new DataView(cachedWav.buffer).getUint32(24, true)).toBe(16000);

      // 2. Compressed audio/mpeg -> NOT tagged as X-Audio-Stream: 1 or audio/l16
      mode = "mpeg";
      const resMpeg = await app.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Comprimido", languageCode: "pt-PT" }),
        },
        env,
      );
      expect(resMpeg.status).toBe(200);
      expect(resMpeg.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(resMpeg.headers.get("X-Audio-Stream")).toBeNull();

      // 3. Empty SSE stream with 0 audio parts -> returns 501 (not empty 200 audio/l16)
      mode = "empty";
      const resEmpty = await app.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Vazio", languageCode: "pt-PT" }),
        },
        env,
      );
      expect(resEmpty.status).toBe(501);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("registers deferred waitUntil promise before returning streaming response when executionCtx is available", async () => {
    const r2 = createTestR2();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => makeProfileRow(),
        }),
      }),
    } as unknown as D1Database;

    const waitUntilPromises: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const sse = `data: ${JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "audio/l16;rate=24000", data: btoa("ABCD") } }],
            },
          },
        ],
      })}\n\n`;
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb, UPLOADS: r2.bucket });
      const res = await app.fetch(
        new Request("http://localhost/api/audio/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Ctx test", languageCode: "pt-PT" }),
        }),
        env,
        executionCtx,
      );
      expect(res.status).toBe(200);
      expect(waitUntilPromises).toHaveLength(1);
      await res.arrayBuffer();
      await Promise.all(waitUntilPromises);
      expect(r2.store.size).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Feature #4 — Upload Security & R2 Orphan Cleanup", () => {
  it("rejects SVG, spoofed MIME, and empty unverified files; accepts magic-byte-verified uploads; sets nosniff & CSP headers", async () => {
    const r2 = createTestR2();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => makeProfileRow(),
        }),
      }),
    } as unknown as D1Database;
    const env = makeEnv({ DB: mockDb, UPLOADS: r2.bucket });

    // SVG rejected on reading & homework scan & homework help
    for (const url of ["/api/reading/scan", "/api/homework/sessions/scan", "/api/homework/help"]) {
      const form = new FormData();
      form.append("image", new File(["<svg onload=alert(1)/>"], "evil.svg", { type: "image/svg+xml" }));
      const res = await app.request(url, { method: "POST", body: form }, env);
      expect(res.status).toBe(400);
    }

    // Empty MIME with non-image payload rejected
    const badEmpty = new FormData();
    badEmpty.append("image", new File(["plain text"], "notes.bin", { type: "" }));
    expect((await app.request("/api/reading/scan", { method: "POST", body: badEmpty }, env)).status).toBe(400);

    // Spoofed image/jpeg containing SVG bytes rejected
    const spoofed = new FormData();
    spoofed.append("image", new File(["<svg></svg>"], "fake.jpg", { type: "image/jpeg" }));
    expect((await app.request("/api/reading/scan", { method: "POST", body: spoofed }, env)).status).toBe(400);

    // Empty MIME with real PNG magic bytes succeeds & writes .png with image/png
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      fullText: "Olá.",
                      sentences: [
                        { targetText: "Olá.", nativeSummary: "Hei.", englishSummary: "Hi.", trickyWords: [] },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const validEmpty = new FormData();
      validEmpty.append("image", new File([createFakePngBytes()], "photo", { type: "" }));
      const okScan = await app.request("/api/reading/scan", { method: "POST", body: validEmpty }, env);
      expect(okScan.status).toBe(200);
      const body = (await okScan.json()) as { imageUrl: string };
      expect(body.imageUrl).toMatch(/^\/api\/uploads\/reading\/.+\.png$/);

      const uploadKey = body.imageUrl.replace("/api/uploads/", "");
      expect(r2.store.get(uploadKey)?.contentType).toBe("image/png");

      // GET 200 + 206 both include nosniff and CSP sandbox headers
      const get200 = await app.request(body.imageUrl, {}, env);
      expect(get200.status).toBe(200);
      expect(get200.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(get200.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");

      const get206 = await app.request(body.imageUrl, { headers: { Range: "bytes=0-3" } }, env);
      expect(get206.status).toBe(206);
      expect(get206.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(get206.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("leaves no orphan R2 objects when Gemini fails on reading/homework scan or when D1 fails after upload", async () => {
    const r2 = createTestR2();
    let failD1Insert = false;
    const mockDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => makeProfileRow(),
          run: async () => {
            if (failD1Insert && sql.includes("INSERT INTO homework_session")) {
              throw new Error("D1 write failed");
            }
            return { meta: { last_row_id: 1, changes: 1 } };
          },
        }),
      }),
    } as unknown as D1Database;

    const originalFetch = globalThis.fetch;
    let geminiOk = false;
    globalThis.fetch = (async () => {
      if (!geminiOk) {
        return new Response("upstream error", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      pageTitle: "TPC",
                      pageSummaryNative: "Oppsummering",
                      pageTextTarget: "Texto.",
                      readingPassage: { titleTarget: "TPC", sentences: [] },
                      exercises: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb, UPLOADS: r2.bucket });

      const f1 = new FormData();
      f1.append("image", new File([createFakeJpegBytes()], "p1.jpg", { type: "image/jpeg" }));
      expect((await app.request("/api/reading/scan", { method: "POST", body: f1 }, env)).status).toBe(500);
      expect(r2.store.size).toBe(0);
      expect(r2.putKeys).toHaveLength(0);

      const f2 = new FormData();
      f2.append("image", new File([createFakeJpegBytes()], "p2.jpg", { type: "image/jpeg" }));
      expect((await app.request("/api/homework/sessions/scan", { method: "POST", body: f2 }, env)).status).toBe(500);
      expect(r2.store.size).toBe(0);
      expect(r2.putKeys).toHaveLength(0);

      // Gemini succeeds, D1 insert fails -> R2 object is cleaned up via delete
      geminiOk = true;
      failD1Insert = true;
      const f3 = new FormData();
      f3.append("image", new File([createFakeJpegBytes()], "p3.jpg", { type: "image/jpeg" }));
      expect((await app.request("/api/homework/sessions/scan", { method: "POST", body: f3 }, env)).status).toBe(500);
      expect(r2.putKeys).toHaveLength(1);
      expect(r2.deletedKeys).toEqual(r2.putKeys);
      expect(r2.store.size).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Feature #5 & #6 — Dynamic Dialect Rules, Validation, Homework/Profile/Progress/MCP Routes", () => {
  it("injects profile.dialectRules dynamically for target language only and omits it for native language", async () => {
    const r2 = createTestR2();
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () =>
            makeProfileRow({
              target_language_code: "es-ES",
              target_language_name: "Spanish",
              native_language_code: "nb-NO",
              native_language_name: "Norwegian",
              dialect_rules: "Use Castilian Spanish.",
            }),
        }),
      }),
    } as unknown as D1Database;

    const capturedBodies: Array<{
      contents?: Array<{ parts?: Array<{ speechMetadata?: { style?: string } }> }>;
    }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "audio/l16;rate=24000", data: btoa("AB") } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb, UPLOADS: r2.bucket });
      await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Buenos días", languageCode: "es" }),
        },
        env,
      );
      await app.request(
        "/api/audio/speak",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "God morgen", languageCode: "nb-NO" }),
        },
        env,
      );

      const targetStyle = capturedBodies[0]?.contents?.[0]?.parts?.[0]?.speechMetadata?.style ?? "";
      const nativeStyle = capturedBodies[1]?.contents?.[0]?.parts?.[0]?.speechMetadata?.style ?? "";
      expect(targetStyle).toContain("Spanish");
      expect(targetStyle).toContain("Use Castilian Spanish.");
      expect(targetStyle).not.toContain("Portuguese");
      expect(nativeStyle).toContain("Norwegian");
      expect(nativeStyle).not.toContain("Castilian");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles homework /reply, /complete, /hydrate, PUT /api/profile, POST /api/progress/complete, and POST /mcp tools/call", async () => {
    let profileState = makeProfileRow({ id: 2, name: "Lucas" });
    let progressState = {
      profile_id: 2,
      total_stars: 10,
      current_streak_days: 3,
      last_activity_date: "2026-11-26",
      pages_read_count: 4,
    };
    const exerciseState = {
      id: 10,
      session_id: 1,
      position: 1,
      label: "1",
      prompt_target: "Lê a frase.",
      prompt_native: null as string | null,
      prompt_english: null as string | null,
      explanation_native: "Les setningen.",
      explanation_target: null as string | null,
      explanation_english: null as string | null,
      tricky_words_json: "[]",
      opening_question_native: "Hva betyr lê?",
      status: "PENDING" as "PENDING" | "IN_PROGRESS" | "COMPLETED",
    };
    let passageJson = JSON.stringify({
      titleTarget: "O Gato",
      sentences: [{ targetText: "O gato dorme.", nativeSummary: "", englishSummary: "", trickyWords: [] }],
    });
    const sessionMessages: Array<{
      id: number;
      exercise_id: number;
      sender: string;
      content: string;
      target_phrase: string | null;
      created_at: string;
    }> = [];
    const progressSqls: string[] = [];

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          _sql: sql,
          _args: args,
          first: async () => {
            if (sql.includes("FROM learner_profile")) {
              return Number(args[0]) === profileState.id ? profileState : null;
            }
            if (sql.includes("FROM child_progress")) {
              return progressState;
            }
            if (sql.includes("FROM homework_session WHERE id")) {
              return Number(args[0]) === 1 && Number(args[1]) === profileState.id
                ? {
                    id: 1,
                    profile_id: profileState.id,
                    page_title: "O Gato",
                    page_summary_native: "Om katten",
                    page_text_target: "O gato dorme.",
                    reading_passage_json: passageJson,
                    image_key: null,
                    created_at: "2026-11-27T10:00:00Z",
                  }
                : null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes("FROM homework_session")) {
              return {
                results: [
                  {
                    id: 1,
                    profile_id: profileState.id,
                    page_title: "O Gato",
                    page_summary_native: "Om katten",
                    page_text_target: "O gato dorme.",
                    reading_passage_json: passageJson,
                    image_key: null,
                    created_at: "2026-11-27T10:00:00Z",
                  },
                ],
              };
            }
            if (sql.includes("FROM homework_exercise")) {
              return { results: [{ ...exerciseState }] };
            }
            if (sql.includes("FROM homework_message")) {
              return { results: [...sessionMessages] };
            }
            if (sql.includes("SELECT LOWER(word)")) {
              return { results: [] };
            }
            if (sql.includes("FROM saved_word")) {
              return { results: [{ id: 1, word: "gato", language_code: "pt-PT", created_at: "2026-11-27" }] };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes("UPDATE learner_profile")) {
              if (Number(args[8]) !== profileState.id) {
                return { meta: { changes: 0 } };
              }
              profileState = {
                ...profileState,
                name: String(args[0]),
                age: Number(args[1]),
                target_language_code: String(args[2]),
                target_language_name: String(args[3]),
                native_language_code: String(args[4]),
                native_language_name: String(args[5]),
                dialect_rules: String(args[6]),
                tts_voice_name: String(args[7]),
              };
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status = 'COMPLETED'")) {
              exerciseState.status = "COMPLETED";
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE homework_exercise") && sql.includes("prompt_native")) {
              exerciseState.prompt_native = String(args[0]);
              exerciseState.prompt_english = String(args[1]);
              exerciseState.explanation_target = String(args[2]);
              exerciseState.explanation_english = String(args[3]);
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET reading_passage_json = ?")) {
              passageJson = String(args[0]);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1, last_row_id: 1 } };
          },
        }),
      }),
      batch: async (stmts: Array<{ _sql?: string; _args?: unknown[] }>) => {
        for (const st of stmts) {
          if (st._sql?.includes("INSERT INTO homework_message") && st._sql.includes("'CHILD'")) {
            sessionMessages.push({
              id: sessionMessages.length + 1,
              exercise_id: Number(st._args?.[0]),
              sender: "CHILD",
              content: String(st._args?.[1]),
              target_phrase: null,
              created_at: "2026-11-27T10:05:00Z",
            });
          } else if (st._sql?.includes("INSERT INTO homework_message") && st._sql.includes("'TUTOR'")) {
            sessionMessages.push({
              id: sessionMessages.length + 1,
              exercise_id: Number(st._args?.[0]),
              sender: "TUTOR",
              content: String(st._args?.[1]),
              target_phrase: String(st._args?.[2]),
              created_at: "2026-11-27T10:05:01Z",
            });
          } else if (st._sql?.includes("UPDATE homework_exercise SET status")) {
            exerciseState.status = String(st._args?.[0]) as "IN_PROGRESS";
          } else if (st._sql?.includes("INSERT INTO child_progress")) {
            progressSqls.push(st._sql);
            progressState = {
              ...progressState,
              total_stars: progressState.total_stars + Number(st._args?.[4] ?? 0),
              pages_read_count: progressState.pages_read_count + Number(st._args?.[8] ?? 0),
            };
          }
        }
        return [];
      },
    } as unknown as D1Database;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const bodyStr = String(init?.body ?? "");
      if (bodyStr.includes("followUpQuestionNative")) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        replyNative: "Kjempebra!",
                        targetPhrase: "Lê a frase",
                        followUpQuestionNative: "Hva skjer nå?",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (bodyStr.includes("explanationTarget")) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        promptNative: "Les setningen.",
                        promptEnglish: "Read the sentence.",
                        explanationTarget: "Lê devagar.",
                        explanationEnglish: "Read slowly.",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      titleTarget: "O Gato",
                      sentences: [
                        { targetText: "O gato dorme.", nativeSummary: "Katten sover.", englishSummary: "The cat sleeps." },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const env = makeEnv({ DB: mockDb });
      const headers2 = { "Content-Type": "application/json", "X-Profile-Id": "2" };

      // 1. Exercise hydrate
      const hydEx = await app.request(
        "/api/homework/sessions/1/exercises/10/hydrate",
        { method: "POST", headers: { "X-Profile-Id": "2" } },
        env,
      );
      expect(hydEx.status).toBe(200);
      const hydExBody = (await hydEx.json()) as { promptNative: string; explanationTarget: string };
      expect(hydExBody.promptNative).toBe("Les setningen.");
      expect(hydExBody.explanationTarget).toBe("Lê devagar.");

      // 2. Passage hydrate
      const hydPass = await app.request(
        "/api/homework/sessions/1/passage/hydrate",
        { method: "POST", headers: { "X-Profile-Id": "2" } },
        env,
      );
      expect(hydPass.status).toBe(200);
      const hydPassBody = (await hydPass.json()) as { sentences: Array<{ nativeSummary: string }> };
      expect(hydPassBody.sentences[0]?.nativeSummary).toBe("Katten sover.");

      // 3. Exercise reply -> IN_PROGRESS
      const rep = await app.request(
        "/api/homework/sessions/1/exercises/10/reply",
        { method: "POST", headers: headers2, body: JSON.stringify({ message: "Jeg prøver" }) },
        env,
      );
      expect(rep.status).toBe(200);
      expect(((await rep.json()) as { status: string }).status).toBe("IN_PROGRESS");

      // 4. Exercise complete -> COMPLETED
      const comp = await app.request(
        "/api/homework/sessions/1/exercises/10/complete",
        { method: "POST", headers: { "X-Profile-Id": "2" } },
        env,
      );
      expect(comp.status).toBe(200);
      expect(((await comp.json()) as { status: string }).status).toBe("COMPLETED");

      // 5. PUT /api/profile (omitting optional ttsVoiceName defaults cleanly; invalid payload returns 400)
      const badProf = await app.request(
        "/api/profile",
        { method: "PUT", headers: headers2, body: JSON.stringify({ name: "Lucas", age: 1 }) },
        env,
      );
      expect(badProf.status).toBe(400);

      const okProf = await app.request(
        "/api/profile",
        {
          method: "PUT",
          headers: headers2,
          body: JSON.stringify({
            name: "Lucas",
            age: 9,
            targetLanguageCode: "pt-PT",
            targetLanguageName: "European Portuguese",
            nativeLanguageCode: "nb-NO",
            nativeLanguageName: "Norwegian",
            dialectRules: "PT-PT only",
          }),
        },
        env,
      );
      expect(okProf.status).toBe(200);
      expect(((await okProf.json()) as { ttsVoiceName: string; age: number }).ttsVoiceName).toBe("Sulafat");

      // 6. POST /api/progress/complete uses atomic SQL increments
      const progRes = await app.request(
        "/api/progress/complete",
        {
          method: "POST",
          headers: headers2,
          body: JSON.stringify({ activityType: "READING", starsEarned: 3, trickyWords: ["gato"] }),
        },
        env,
      );
      expect(progRes.status).toBe(200);
      const progBody = (await progRes.json()) as { totalStars: number; pagesReadCount: number; recentWords: unknown[] };
      expect(progBody.totalStars).toBe(13);
      expect(progBody.pagesReadCount).toBe(5);
      expect(Array.isArray(progBody.recentWords)).toBe(true);
      expect(progressSqls[0]).toContain("child_progress.total_stars +");
      expect(progressSqls[0]).toContain("child_progress.pages_read_count +");

      // 7. POST /mcp tools/call respects X-Profile-Id and validates params/envelope
      for (const toolCall of [
        { name: "getLearnerProfile", arguments: {} },
        { name: "getProgressAndTrickyWords", arguments: {} },
        { name: "listHomeworkSessions", arguments: {} },
        { name: "getHomeworkSession", arguments: { sessionId: 1 } },
      ]) {
        const mcpRes = await app.request(
          "/mcp",
          {
            method: "POST",
            headers: headers2,
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: toolCall }),
          },
          env,
        );
        expect(mcpRes.status).toBe(200);
        const mcpJson = (await mcpRes.json()) as { result: { content: Array<{ text: string }> } };
        expect(mcpJson.result.content[0]?.text).toBeTruthy();
      }

      const badMcpArgs = await app.request(
        "/mcp",
        {
          method: "POST",
          headers: headers2,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "getHomeworkSession", arguments: { sessionId: -1 } },
          }),
        },
        env,
      );
      expect(badMcpArgs.status).toBe(400);
      expect(((await badMcpArgs.json()) as { error: { code: number } }).error.code).toBe(-32602);

      const badMcpEnv = await app.request(
        "/mcp",
        {
          method: "POST",
          headers: headers2,
          body: JSON.stringify({ jsonrpc: "1.0", id: 3, method: "tools/list" }),
        },
        env,
      );
      expect(badMcpEnv.status).toBe(400);
      expect(((await badMcpEnv.json()) as { error: { code: number } }).error.code).toBe(-32600);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 400 on malformed JSON/FormData & non-integer params and 404 on missing profile", async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
    } as unknown as D1Database;
    const env = makeEnv({ DB: mockDb });

    // Malformed JSON -> 400
    for (const url of [
      "/api/profile",
      "/api/progress/complete",
      "/api/homework/sessions/1/exercises/1/reply",
      "/mcp",
    ]) {
      const method = url === "/api/profile" ? "PUT" : "POST";
      const res = await app.request(
        url,
        { method, headers: { "Content-Type": "application/json" }, body: "{bad-json" },
        env,
      );
      expect(res.status).toBe(400);
    }

    // Malformed FormData -> 400
    for (const url of ["/api/reading/scan", "/api/homework/sessions/scan", "/api/homework/help"]) {
      const res = await app.request(
        url,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        env,
      );
      expect(res.status).toBe(400);
    }

    // Non-integer params -> 400
    const badParamCases: Array<[string, string]> = [
      ["GET", "/api/homework/sessions/abc"],
      ["DELETE", "/api/homework/sessions/0"],
      ["POST", "/api/homework/sessions/abc/exercises/1/reply"],
      ["POST", "/api/homework/sessions/1/exercises/xyz/complete"],
      ["POST", "/api/homework/sessions/1/exercises/1.5/hydrate"],
      ["POST", "/api/homework/sessions/0/passage/hydrate"],
    ];
    for (const [method, url] of badParamCases) {
      const res = await app.request(
        url,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify({ message: "hi" }) : undefined,
        },
        env,
      );
      expect(res.status).toBe(400);
    }

    // Missing profile -> 404
    const missingProfileCases: Array<[string, string, string?]> = [
      ["GET", "/api/profile"],
      [
        "PUT",
        "/api/profile",
        JSON.stringify({
          name: "X",
          age: 8,
          targetLanguageCode: "pt-PT",
          targetLanguageName: "European Portuguese",
          nativeLanguageCode: "nb-NO",
          nativeLanguageName: "Norwegian",
          dialectRules: "PT-PT",
        }),
      ],
      ["GET", "/api/progress"],
      ["GET", "/api/homework/sessions"],
      [
        "POST",
        "/mcp",
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "getLearnerProfile" } }),
      ],
    ];
    for (const [method, url, body] of missingProfileCases) {
      const res = await app.request(
        url,
        {
          method,
          headers: { "Content-Type": "application/json", "X-Profile-Id": "999" },
          body,
        },
        env,
      );
      expect(res.status).toBe(404);
    }
  });
});
