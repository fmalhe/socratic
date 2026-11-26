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

  it("returns 501 on /api/audio/speak when GOOGLE_TTS_API_KEY is unset", async () => {
    const res = await app.request(
      "/api/audio/speak",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Bom dia!", slow: true }),
      },
      makeEnv(),
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
});
