import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBrowserSession } from "./helpers/browser_bridge.mjs";
import { makePcm16Bytes, makeRiffWavWithExtraChunks } from "./helpers/gemini_mock.mjs";
import { createTestHarness, makeValidPngBytes } from "./helpers/test_server.mjs";

describe("Tier 2 — Boundary & Corner Cases", () => {
  let harness;
  let baseUrl;
  let browser;

  beforeAll(async () => {
    harness = createTestHarness();
    baseUrl = await harness.startHttpServer();
    browser = await createBrowserSession(baseUrl);
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (harness) await harness.close();
  });

  beforeEach(() => {
    harness.resetAll();
  });

  // ===========================================================================
  // Area 1: Upload Validation, Orphan Cleanup & Malformed Request Boundaries
  // ===========================================================================
  describe("Upload & Input Validation Boundaries", () => {
    it("[api] rejects empty 0-byte, >12MB, image/svg+xml, text/plain, and empty-MIME uploads with 400", async () => {
      const cases = [
        new File([], "empty.png", { type: "image/png" }),
        new File([new Uint8Array(12 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" }),
        new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "xss.svg", { type: "image/svg+xml" }),
        new File(["hello"], "note.txt", { type: "text/plain" }),
        new File([new TextEncoder().encode("unverified-raw-bytes")], "mystery.bin", { type: "" }),
        new File([new TextEncoder().encode("<html>not a png</html>")], "spoofed.png", { type: "image/png" }),
      ];

      for (const file of cases) {
        const form = new FormData();
        form.append("image", file);
        const res = await harness.request("/api/homework/sessions/scan", { method: "POST", body: form });
        expect(res.status, `Expected 400 for ${file.name} (${file.type})`).toBe(400);
        const resRead = await harness.request("/api/reading/scan", { method: "POST", body: form });
        expect(resRead.status, `Expected 400 on /api/reading/scan for ${file.name}`).toBe(400);
      }
      expect(harness.r2.listKeys()).toEqual([]);
    });

    it("[api] leaves ZERO R2 orphan images when Gemini fails (500 or invalid JSON) on homework & reading scans", async () => {
      harness.geminiMock.setScenario({ structuredErrorStatus: 500 });
      const f1 = new FormData();
      f1.append("image", new File([makeValidPngBytes()], "hw.png", { type: "image/png" }));
      const r1 = await harness.request("/api/homework/sessions/scan", { method: "POST", body: f1 });
      expect(r1.status).toBeGreaterThanOrEqual(500);
      expect(harness.r2.listKeys("homework/")).toEqual([]);

      harness.geminiMock.setScenario({ structuredErrorStatus: null, structuredInvalidJson: true });
      const f2 = new FormData();
      f2.append("image", new File([makeValidPngBytes()], "book.png", { type: "image/png" }));
      const r2 = await harness.request("/api/reading/scan", { method: "POST", body: f2 });
      expect(r2.status).toBeGreaterThanOrEqual(500);
      expect(harness.r2.listKeys("reading/")).toEqual([]);
    });

    it("[api] returns 400 (never 500) on malformed JSON and non-multipart FormData bodies", async () => {
      for (const [url, method] of [
        ["/api/profile", "PUT"],
        ["/api/progress/complete", "POST"],
        ["/api/audio/speak", "POST"],
        ["/api/audio/stream", "POST"],
        ["/mcp", "POST"],
        ["/api/homework/sessions/1/exercises/1/reply", "POST"],
      ]) {
        const res = await harness.request(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: "{broken-json",
        });
        expect(res.status, `Expected 400 on malformed JSON for ${method} ${url}`).toBe(400);
      }

      for (const url of ["/api/reading/scan", "/api/homework/sessions/scan", "/api/homework/help"]) {
        const res = await harness.request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ not: "multipart" }),
        });
        expect(res.status, `Expected 400 on non-multipart body for ${url}`).toBe(400);
      }
    });

    it("[api] returns 400 on non-integer / <=0 sessionId & exerciseId across all homework routes", async () => {
      for (const badId of ["abc", "0", "-3", "1.5"]) {
        expect((await harness.request(`/api/homework/sessions/${badId}`)).status).toBe(400);
        expect((await harness.request(`/api/homework/sessions/${badId}`, { method: "DELETE" })).status).toBe(400);
        expect((await harness.request(`/api/homework/sessions/${badId}/passage/hydrate`, { method: "POST" })).status).toBe(400);
        expect((await harness.request(`/api/homework/sessions/1/exercises/${badId}/hydrate`, { method: "POST" })).status).toBe(400);
        expect((await harness.request(`/api/homework/sessions/1/exercises/${badId}/complete`, { method: "POST" })).status).toBe(400);
        expect(
          (
            await harness.request(`/api/homework/sessions/1/exercises/${badId}/reply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: "oi" }),
            })
          ).status,
        ).toBe(400);
      }
    });

    it("[api] returns 404 on missing profile ID and 400 on invalid X-Profile-Id header", async () => {
      expect((await harness.request("/api/profile", { headers: { "X-Profile-Id": "999" } })).status).toBe(404);
      expect((await harness.request("/api/progress", { headers: { "X-Profile-Id": "999" } })).status).toBe(404);
      expect((await harness.request("/api/profile", { headers: { "X-Profile-Id": "not-a-number" } })).status).toBe(400);
      expect((await harness.request("/api/profile", { headers: { "X-Profile-Id": "0" } })).status).toBe(400);
    });

    it("[api-tcp] enforces QUERY 400/415/422, path traversal 400, and Range 416", async () => {
      expect((await fetch(`${baseUrl}/api/homework/sessions`, { method: "QUERY" })).status).toBe(400);
      expect(
        (
          await fetch(`${baseUrl}/api/homework/sessions`, {
            method: "QUERY",
            headers: { "Content-Type": "application/xml" },
            body: "<q/>",
          })
        ).status,
      ).toBe(415);
      expect(
        (
          await fetch(`${baseUrl}/api/homework/sessions`, {
            method: "QUERY",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 999 }),
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await fetch(`${baseUrl}/api/audio/speak`, {
            method: "QUERY",
            headers: { "Content-Type": "application/xml" },
            body: "<speak/>",
          })
        ).status,
      ).toBe(415);

      expect((await harness.request("/api/uploads/unknown/file.png")).status).toBe(400);
      expect((await harness.request("/api/uploads/homework/..%2Fsecret.txt")).status).toBe(400);

      await harness.r2.put("audio/tiny.wav", new Uint8Array([1, 2, 3, 4]));
      const r416 = await harness.request("/api/uploads/audio/tiny.wav", { headers: { Range: "bytes=99-" } });
      expect(r416.status).toBe(416);
      const r416Invert = await harness.request("/api/uploads/audio/tiny.wav", { headers: { Range: "bytes=3-1" } });
      expect(r416Invert.status).toBe(416);
    });

    it("[browser] handles bad upload (image/svg+xml) gracefully with friendly error card and clean retry", async () => {
      await browser.runCase("t2_upload_progress_and_bad_file");
    });
  });

  // ===========================================================================
  // Area 2: D1 Scale (>100 Exercises), Concurrency & 0-Exercise Scan
  // ===========================================================================
  describe("D1 Scale, Atomicity & 0-Exercise Boundaries", () => {
    it("[harness] proves D1 SQLite shim genuinely enforces the 100-bind-parameter limit", async () => {
      const placeholders = Array.from({ length: 105 }, () => "?").join(",");
      const params = Array.from({ length: 105 }, (_, i) => i + 1);
      await expect(async () =>
        harness.db.prepare(`SELECT * FROM homework_exercise WHERE id IN (${placeholders})`).bind(...params).all(),
      ).rejects.toThrow(/too many SQL variables/);
    });

    it("[api] hydrates >100-exercise D1 session (150 exercises) without hitting 100-bind-parameter limit", async () => {
      harness.db.execRaw(
        `INSERT INTO homework_session (profile_id, page_title, page_summary_native, page_text_target)
         VALUES (1, 'Mega Page', 'Stor side', 'Texto')`,
      );
      const stmts = [];
      for (let i = 1; i <= 150; i++) {
        stmts.push(
          harness.db
            .prepare(
              `INSERT INTO homework_exercise (session_id, position, label, prompt_target, explanation_native, tricky_words_json, opening_question_native)
               VALUES (?, ?, ?, ?, ?, '[]', ?)`,
            )
            .bind(1, i, String(i), `Pergunta ${i}`, `Explicação ${i}`, `Questão ${i}`),
        );
      }
      await harness.db.batch(stmts);

      const res = await harness.request("/api/homework/sessions");
      expect(res.status).toBe(200);
      const sessions = await res.json();
      expect(sessions.length).toBe(1);
      expect(sessions[0].exercises.length).toBe(150);
    });

    it("[api] concurrent POST /api/progress/complete calls preserve every star & page via atomic SQL increments", async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          harness.request("/api/progress/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activityType: "READING", starsEarned: 2 }),
          }),
        ),
      );
      for (const r of results) expect(r.status).toBe(200);

      const finalProgress = await (await harness.request("/api/progress")).json();
      expect(finalProgress.totalStars).toBe(10);
      expect(finalProgress.pagesReadCount).toBe(5);
    });

    it("[api] 0-exercise scan (readingPassage only, exercises: []) saves cleanly without empty batch crash", async () => {
      harness.geminiMock.setScenario({
        homeworkScanResponse: {
          pageTitle: "Só Texto",
          pageSummaryNative: "Bare lesetekst",
          pageTextTarget: "O sol brilha.",
          readingPassage: {
            titleTarget: "O Sol",
            sentences: [
              { targetText: "O sol brilha.", nativeSummary: "Solen skinner.", englishSummary: "The sun shines.", trickyWords: [] },
            ],
          },
          exercises: [],
        },
      });
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "textonly.png", { type: "image/png" }));
      const res = await harness.request("/api/homework/sessions/scan", { method: "POST", body: form });
      expect(res.status).toBe(200);
      const s = await res.json();
      expect(s.exercises).toEqual([]);
      expect(s.readingPassage.sentences.length).toBe(1);
    });

    it("[browser] renders 0-exercise homework scan cleanly without broken exercise stage", async () => {
      await browser.runCase("t2_zero_exercise_scan");
    });

    it("[browser] prevents duplicate stars or duplicate chat submissions on rapid double-taps", async () => {
      await browser.runCase("t2_rapid_double_taps");
    });
  });

  // ===========================================================================
  // Area 3: Audio Stream & Playback Engine Boundaries
  // ===========================================================================
  describe("Audio Stream & Engine Boundaries", () => {
    it("[api] parses non-24kHz inlineData.mimeType (rate=16000) for stream Content-Type and cached WAV header", async () => {
      harness.geminiMock.setScenario({ streamMode: "pcm16k" });
      const res = await harness.request("/api/audio/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Taxa 16k", languageCode: "pt-PT" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("rate=16000");
      await res.arrayBuffer();
      await harness.flushWaitUntil();

      const audioKeys = harness.r2.listKeys("audio/");
      expect(audioKeys.length).toBe(1);
      const wav = harness.r2.getRaw(audioKeys[0]).bytes;
      const sampleRate = new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getUint32(24, true);
      expect(sampleRate).toBe(16000);
    });

    it("[api] strips RIFF WAV headers containing JUNK/LIST chunks before data without leaking metadata bytes", async () => {
      harness.geminiMock.setScenario({ streamMode: "riff_junk_24k" });
      const expectedPcm = makePcm16Bytes(2400, 24000);
      const res = await harness.request("/api/audio/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Chunks extras", languageCode: "pt-PT" }),
      });
      expect(res.status).toBe(200);
      const streamed = new Uint8Array(await res.arrayBuffer());
      expect(streamed.byteLength).toBe(expectedPcm.byteLength);
      expect(Buffer.from(streamed).equals(Buffer.from(expectedPcm))).toBe(true);
    });

    it("[api] prefetch: true halts immediately on 429 without burning fallback models or Cloud TTS", async () => {
      harness.geminiMock.setScenario({ ttsMode: "fail_429_all" });
      const res = await harness.request("/api/audio/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Prefetch stop", languageCode: "pt-PT", prefetch: true }),
      });
      expect(res.status).toBe(429);
      const reqs = harness.geminiMock.getRequests();
      expect(reqs.length).toBe(1);
      expect(reqs[0].url).toContain("flash-lite-tts");
    });

    it("[api] still persists R2 WAV cache when ExecutionContext is omitted on /api/audio/stream", async () => {
      const res = await harness.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Sem executionCtx", languageCode: "pt-PT" }),
        },
        { omitExecutionCtx: true },
      );
      expect(res.status).toBe(200);
      await res.arrayBuffer();
      // Give microtask turn a tick if awaited before close
      await new Promise((r) => setTimeout(r, 30));
      expect(harness.r2.listKeys("audio/").length).toBe(1);
    });

    it("[browser] finishes short 1-word PCM clip cleanly without leaving spinner/button stuck", async () => {
      await browser.runCase("t2_short_1word_audio_clip");
    });

    it("[browser] handles AudioContext interrupted state + visibilitychange and HTMLAudio stop cleanup", async () => {
      await browser.runCase("t2_audio_context_interrupted_and_revoke");
    });

    it("[browser] falls back to window.speechSynthesis cleanly when /api/audio/stream returns 501", async () => {
      await browser.runCase("t2_501_speech_synthesis_fallback", { mockSpeech: true });
    });
  });

  // ===========================================================================
  // Area 4: Responsive Viewports, Karaoke Reflow & XSS Immunity
  // ===========================================================================
  describe("Responsive Layout, Karaoke Geometry & XSS Immunity", () => {
    it("[browser] fits 375x812 mobile & 768x1024 iPad with zero horizontal overflow & 2-col flag dock", async () => {
      await browser.runCase("t2_responsive_mobile_and_ipad");
    });

    it("[browser] keeps zero horizontal/vertical reflow jitter when .karaoke-word.is-active activates", async () => {
      await browser.runCase("t2_karaoke_zero_horizontal_reflow");
    });

    it("[browser] escapes XSS payloads in pageTitle, trickyWords, promptTarget, chat replies & modals", async () => {
      await browser.runCase("t2_xss_payload_immunity");
    });

    it("[browser] safely falls back to light theme on corrupt localStorage and persists dark theme-color", async () => {
      await browser.runCase("t2_theme_corrupt_storage_and_persistence");
    });

    it("[browser] disables floating dock prev/next at bounds and clamps #word-popover inside 375px viewport", async () => {
      await browser.runCase("t2_dock_bounds_and_popover_edge_clamp");
    });
  });
});
