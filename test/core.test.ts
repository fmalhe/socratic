import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  renderHomeworkHelpSystemPrompt,
  renderHomeworkScanSystemPrompt,
  renderReadingSystemPrompt,
} from "../src/lib/gemini";
import { computeNextStreak } from "../src/lib/streak";
import { resolveProfileId } from "../src/modules/profile";
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
});
