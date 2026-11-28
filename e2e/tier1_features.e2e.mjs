import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBrowserSession } from "./helpers/browser_bridge.mjs";
import { createTestHarness, makeValidPngBytes } from "./helpers/test_server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

describe("Tier 1 — Feature Coverage (Opaque-Box API, Static & Browser)", () => {
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
  // Feature A: PT-PT Default UI, 2 Tabs (TPC / Ler), PT & NO Flags Only
  // ===========================================================================
  describe("Feature A: PT-PT Default UI, 2 Tabs & PT/NO Flags Only", () => {
    it("[browser] renders PT-PT default UI, switches TPC/Ler tabs, and shows PT/NO flags with zero GB flag or English UI", async () => {
      await browser.runCase("t1_pt_default_ui_and_tabs");
    });

    it("[static] index.html declares lang=pt-PT and exposes TPC and Ler tabs without GB flag", () => {
      const html = fs.readFileSync(path.join(REPO_ROOT, "public/index.html"), "utf8");
      expect(html).toContain('<html lang="pt-PT"');
      expect(html).toContain('id="tab-homework"');
      expect(html).toContain('id="tab-read"');
      expect(html).toContain("TPC");
      expect(html).toContain("Ler");
      expect(html).not.toContain('data-flag="gb"');
    });

    it("[static] public/app.js renders PT and NO flags only (no dead GB flag)", () => {
      const appJs = fs.readFileSync(path.join(REPO_ROOT, "public/app.js"), "utf8");
      expect(appJs).toMatch(/["']pt["']/);
      expect(appJs).toMatch(/["']no["']/);
      expect(appJs).not.toMatch(/code\s*===\s*["']gb["']|\bgb:\s*`/);
    });

    it("[static] public/manifest.webmanifest uses Portuguese metadata and valid icon references", () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "public/manifest.webmanifest"), "utf8"),
      );
      expect(manifest.name).toContain("Socratic");
      expect(manifest.start_url).toBe("/");
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThan(0);
    });

    it("[static] public/icon.svg is a self-contained inline SVG without external URLs", () => {
      const svg = fs.readFileSync(path.join(REPO_ROOT, "public/icon.svg"), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/i);
    });
  });

  // ===========================================================================
  // Feature B: Reading Passage (Texto), Homework Questions & Read Mode Karaoke
  // ===========================================================================
  describe("Feature B: Reading Passage (Texto), Homework Questions & Read Mode Karaoke", () => {
    it("[browser] renders Texto passage with Ouvir Tudo, Fazer Perguntas CTA, per-sentence play, and avoids word-tap trap", async () => {
      await browser.runCase("t1_passage_and_homework_controls");
    });

    it("[browser] Read Mode scans book page, streams karaoke highlighting, and controls playback via floating dock", async () => {
      await browser.runCase("t1_read_mode_karaoke_and_dock");
    });

    it("[api] POST /api/homework/sessions/scan creates readingPassage + ordered PENDING exercises and stores R2 image", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "page.png", { type: "image/png" }));
      const res = await harness.request("/api/homework/sessions/scan", { method: "POST", body: form });
      expect([200, 201]).toContain(res.status);
      const session = await res.json();
      expect(session.pageTitle).toBe("O Patinho Curioso");
      expect(session.readingPassage?.titleTarget).toBe("O Patinho e a Borboleta");
      expect(session.readingPassage?.sentences.length).toBe(2);
      expect(session.exercises.length).toBe(2);
      expect(session.exercises[0].status).toBe("PENDING");
      expect(session.imageUrl).toMatch(/^\/api\/uploads\/homework\//);
    });

    it("[api] POST /api/homework/sessions/:id/passage/hydrate populates missing native summaries", async () => {
      // Seed a legacy session missing nativeSummary in reading_passage_json
      harness.db.execRaw(
        `INSERT INTO homework_session (profile_id, page_title, page_summary_native, page_text_target, reading_passage_json)
         VALUES (1, 'Legacy Page', 'Resumo', 'O gato dorme.', ?)`,
        JSON.stringify({
          titleTarget: "Legacy Page",
          sentences: [{ targetText: "O gato dorme.", nativeSummary: "", englishSummary: "", trickyWords: [] }],
        }),
      );
      const res = await harness.request("/api/homework/sessions/1/passage/hydrate", { method: "POST" });
      expect(res.status).toBe(200);
      const passage = await res.json();
      expect(passage.sentences[0].nativeSummary).toBe("Katten sover.");
    });

    it("[api] POST /api/homework/sessions/:id/exercises/:exId/hydrate fills missing translations and is idempotent", async () => {
      harness.db.execRaw(
        `INSERT INTO homework_session (profile_id, page_title, page_summary_native, page_text_target)
         VALUES (1, 'Ex Page', 'Resumo', 'Texto')`,
      );
      harness.db.execRaw(
        `INSERT INTO homework_exercise (session_id, position, label, prompt_target, explanation_native, tricky_words_json, opening_question_native)
         VALUES (1, 1, '1', 'Onde está o gato?', 'Procura no texto.', '[]', 'Onde?')`,
      );
      const res1 = await harness.request("/api/homework/sessions/1/exercises/1/hydrate", { method: "POST" });
      expect(res1.status).toBe(200);
      const ex1 = await res1.json();
      expect(ex1.promptNative).toBe("Hva betyr denne oppgaven?");
      expect(ex1.explanationTarget).toBe("Olha para o texto com calma.");

      const callsBefore = harness.geminiMock.getRequests().length;
      const res2 = await harness.request("/api/homework/sessions/1/exercises/1/hydrate", { method: "POST" });
      expect(res2.status).toBe(200);
      expect(harness.geminiMock.getRequests().length).toBe(callsBefore);
    });

    it("[api] POST /api/reading/scan transcribes fullText, sentences, trickyWords, and returns imageUrl", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "book.png", { type: "image/png" }));
      const res = await harness.request("/api/reading/scan", { method: "POST", body: form });
      expect([200, 201]).toContain(res.status);
      const body = await res.json();
      expect(body.fullText).toContain("gato preto");
      expect(body.sentences.length).toBe(2);
      expect(body.sentences[0].trickyWords[0].syllables).toBe("al-mo-fa-da");
      expect(body.imageUrl).toMatch(/^\/api\/uploads\/reading\//);
    });
  });

  // ===========================================================================
  // Feature C: Audio-First Owly Dock & Socratic Ping-Pong Tutor
  // ===========================================================================
  describe("Feature C: Audio-First Owly Dock & Socratic Ping-Pong Tutor", () => {
    it("[browser] renders multi-state Owly SVG mascot and audio-first PT/NO explanation buttons", async () => {
      await browser.runCase("t1_owly_multistate_and_audio_dock");
    });

    it("[api] POST /api/homework/sessions/:id/exercises/:exId/reply transitions PENDING -> IN_PROGRESS and returns DTO", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "hw.png", { type: "image/png" }));
      const scanRes = await harness.request("/api/homework/sessions/scan", { method: "POST", body: form });
      const session = await scanRes.json();
      const exId = session.exercises[0].id;

      const replyRes = await harness.request(
        `/api/homework/sessions/${session.id}/exercises/${exId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "perto do lago" }),
        },
      );
      expect(replyRes.status).toBe(200);
      const reply = await replyRes.json();
      expect(reply.exerciseId).toBe(exId);
      expect(reply.status).toBe("IN_PROGRESS");
      expect(reply.replyNative).toContain("Kjempebra");
      expect(reply.targetPhrase).toBe("perto do lago azul");
      expect(reply.followUpQuestionNative).toContain("innsjø");
    });

    it("[api] POST /api/homework/sessions/:id/exercises/:exId/complete marks exercise COMPLETED", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "hw.png", { type: "image/png" }));
      const session = await (
        await harness.request("/api/homework/sessions/scan", { method: "POST", body: form })
      ).json();
      const exId = session.exercises[0].id;

      const compRes = await harness.request(
        `/api/homework/sessions/${session.id}/exercises/${exId}/complete`,
        { method: "POST" },
      );
      expect(compRes.status).toBe(200);
      const ex = await compRes.json();
      expect(ex.status).toBe("COMPLETED");
    });

    it("[api] POST /api/homework/help handles both question-only and image-only requests", async () => {
      const f1 = new FormData();
      f1.append("question", "O que significa patinho?");
      const r1 = await harness.request("/api/homework/help", { method: "POST", body: f1 });
      expect(r1.status).toBe(200);
      const b1 = await r1.json();
      expect(b1.taskExplanationNative).toBeTruthy();
      expect(Array.isArray(b1.stepByStepHints)).toBe(true);

      const f2 = new FormData();
      f2.append("image", new File([makeValidPngBytes()], "q.png", { type: "image/png" }));
      const r2 = await harness.request("/api/homework/help", { method: "POST", body: f2 });
      expect(r2.status).toBe(200);
    });

    it("[static] public/index.html preserves Owly dock & chat drawer interactive DOM IDs", () => {
      const html = fs.readFileSync(path.join(REPO_ROOT, "public/index.html"), "utf8");
      for (const id of [
        "hw-owl-dock",
        "hw-owl-svg",
        "hw-explain-pt",
        "hw-explain-no",
        "hw-chat-toggle",
        "hw-chat-drawer",
        "hw-chat-messages",
        "hw-chat-form",
        "hw-chat-input",
      ]) {
        expect(html).toContain(`id="${id}"`);
      }
    });
  });

  // ===========================================================================
  // Feature D: /api/audio/stream, /api/audio/speak (POST/QUERY), R2 & Prewarm
  // ===========================================================================
  describe("Feature D: Audio Streaming, Speak (POST & QUERY), R2 Cache & Prewarm Isolation", () => {
    it("[api] POST /api/audio/stream emits PCM16 SSE stream on MISS and cached WAV on HIT", async () => {
      const res1 = await harness.request("/api/audio/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Olá Sofia!", languageCode: "pt-PT", slow: false }),
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("Content-Type")).toContain("audio/l16");
      expect(res1.headers.get("X-Audio-Stream")).toBe("1");
      expect(res1.headers.get("X-Audio-Provider")).toBe("gemini-tts");
      expect(res1.headers.get("X-Audio-Cache")).toBe("MISS");
      const pcmBytes = new Uint8Array(await res1.arrayBuffer());
      expect(pcmBytes.byteLength).toBeGreaterThan(100);
      await harness.flushWaitUntil();

      const callsAfterMiss = harness.geminiMock.getRequests().length;
      const res2 = await harness.request("/api/audio/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Olá Sofia!", languageCode: "pt-PT", slow: false }),
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("Content-Type")).toBe("audio/wav");
      expect(res2.headers.get("X-Audio-Cache")).toBe("HIT");
      expect(harness.geminiMock.getRequests().length).toBe(callsAfterMiss);
    });

    it("[api] POST /api/audio/speak synthesizes WAV via Gemini TTS and sets Content-Location", async () => {
      const res = await harness.request("/api/audio/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Bom dia", languageCode: "pt-PT", slow: false }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("audio/wav");
      expect(res.headers.get("X-Audio-Provider")).toBe("gemini-tts");
      expect(res.headers.get("Content-Location")).toMatch(/^\/api\/uploads\/audio\//);
      const wav = new Uint8Array(await res.arrayBuffer());
      expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    });

    it("[api-tcp] OPTIONS & RFC 10008 QUERY /api/audio/speak work over real TCP HTTP", async () => {
      const optRes = await fetch(`${baseUrl}/api/audio/speak`, { method: "OPTIONS" });
      expect(optRes.status).toBe(204);
      expect(optRes.headers.get("Allow")).toContain("QUERY");
      expect(optRes.headers.get("Accept-Query")).toContain("application/json");

      const qRes = await fetch(`${baseUrl}/api/audio/speak`, {
        method: "QUERY",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Boa tarde", languageCode: "pt-PT", slow: false }),
      });
      expect(qRes.status).toBe(200);
      expect(qRes.headers.get("Content-Type")).toBe("audio/wav");
    });

    it("[api] retries Gemini TTS without languageCode on 400 and falls back across models on 429", async () => {
      harness.geminiMock.setScenario({ ttsMode: "fail_400_then_ok" });
      const r1 = await harness.request("/api/audio/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Teste 400", languageCode: "pt-PT" }),
      });
      expect(r1.status).toBe(200);
      const ttsReqs1 = harness.geminiMock.getRequests();
      expect(ttsReqs1.length).toBe(2);
      expect(ttsReqs1[0].bodyJson.generationConfig.speechConfig.languageCode).toBe("pt-PT");
      expect(ttsReqs1[1].bodyJson.generationConfig.speechConfig.languageCode).toBeUndefined();

      harness.geminiMock.clearRequests();
      harness.geminiMock.setScenario({ ttsMode: "fail_429_lite" });
      const r2 = await harness.request("/api/audio/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Teste 429", languageCode: "pt-PT" }),
      });
      expect(r2.status).toBe(200);
      const ttsReqs2 = harness.geminiMock.getRequests();
      expect(ttsReqs2[0].url).toContain("flash-lite-tts");
      expect(ttsReqs2[1].url).toContain("gemini-3.8-flash-tts");
    });

    it("[api] P0 R2 Prewarm Cache Isolation: prewarm must NEVER store Cloud TTS MP3 under Gemini TTS cacheKey", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "book.png", { type: "image/png" }));
      const scanRes = await harness.request("/api/reading/scan", { method: "POST", body: form });
      expect(scanRes.status).toBe(200);
      await harness.flushWaitUntil();

      // Request /api/audio/stream for the first sentence from the reading fixture
      const streamRes = await harness.request("/api/audio/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "O gato preto dorme na almofada macia.",
          languageCode: "pt-PT",
          slow: false,
        }),
      });
      expect(streamRes.status).toBe(200);
      // Must NEVER serve mechanical Cloud TTS MP3 (audio/mpeg) for primary Gemini playback!
      expect(streamRes.headers.get("Content-Type")).not.toContain("audio/mpeg");
      expect(streamRes.headers.get("X-Audio-Provider")).not.toBe("google-cloud-tts");
    });

    it("[api] returns 501 with X-Audio-Fallback-Reason when TTS API keys are missing", async () => {
      const res = await harness.request(
        "/api/audio/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Sem chave", languageCode: "pt-PT" }),
        },
        { envOverrides: { GEMINI_API_KEY: "", GOOGLE_TTS_API_KEY: "" } },
      );
      expect(res.status).toBe(501);
      expect(res.headers.get("X-Audio-Fallback-Reason")).toBe("no-api-key");
    });
  });

  // ===========================================================================
  // Feature E: Upload Security, R2 Range Serving & Deletion Cleanup
  // ===========================================================================
  describe("Feature E: Upload Progress, Compression & Security", () => {
    it("[api] serves R2 uploads with X-Content-Type-Options: nosniff and Content-Security-Policy sandbox", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "hw.png", { type: "image/png" }));
      const session = await (
        await harness.request("/api/homework/sessions/scan", { method: "POST", body: form })
      ).json();
      expect(session.imageUrl).toBeTruthy();

      const imgRes = await harness.request(session.imageUrl);
      expect(imgRes.status).toBe(200);
      expect(imgRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(imgRes.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
      expect(imgRes.headers.get("Content-Security-Policy")).toContain("sandbox");
    });

    it("[api] GET /api/uploads/:folder/:filename supports HTTP Range (206 start-end, open-end, suffix)", async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      await harness.r2.put("audio/sample.wav", data, { httpMetadata: { contentType: "audio/wav" } });

      const r1 = await harness.request("/api/uploads/audio/sample.wav", {
        headers: { Range: "bytes=2-5" },
      });
      expect(r1.status).toBe(206);
      expect(r1.headers.get("Content-Range")).toBe("bytes 2-5/10");
      expect(Array.from(new Uint8Array(await r1.arrayBuffer()))).toEqual([2, 3, 4, 5]);

      const r2 = await harness.request("/api/uploads/audio/sample.wav", {
        headers: { Range: "bytes=7-" },
      });
      expect(r2.status).toBe(206);
      expect(r2.headers.get("Content-Range")).toBe("bytes 7-9/10");
      expect(Array.from(new Uint8Array(await r2.arrayBuffer()))).toEqual([7, 8, 9]);

      const r3 = await harness.request("/api/uploads/audio/sample.wav", {
        headers: { Range: "bytes=-3" },
      });
      expect(r3.status).toBe(206);
      expect(r3.headers.get("Content-Range")).toBe("bytes 7-9/10");
      expect(Array.from(new Uint8Array(await r3.arrayBuffer()))).toEqual([7, 8, 9]);
    });

    it("[api] rejects image/svg+xml uploads with 400 and prevents R2 storage", async () => {
      const form = new FormData();
      form.append(
        "image",
        new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "evil.svg", {
          type: "image/svg+xml",
        }),
      );
      const res = await harness.request("/api/homework/sessions/scan", { method: "POST", body: form });
      expect(res.status).toBe(400);
      expect(harness.r2.listKeys("homework/")).toEqual([]);
    });

    it("[api] DELETE /api/homework/sessions/:id removes DB records and deletes R2 image", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "hw.png", { type: "image/png" }));
      const session = await (
        await harness.request("/api/homework/sessions/scan", { method: "POST", body: form })
      ).json();
      expect(harness.r2.listKeys("homework/").length).toBe(1);

      const delRes = await harness.request(`/api/homework/sessions/${session.id}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      expect((await delRes.json()).deleted).toBe(true);
      expect(harness.r2.listKeys("homework/")).toEqual([]);
      expect((await harness.request(`/api/homework/sessions/${session.id}`)).status).toBe(404);
    });

    it("[static] public/app.js uses Canvas compression (and modern createImageBitmap) for uploads", () => {
      const appJs = fs.readFileSync(path.join(REPO_ROOT, "public/app.js"), "utf8");
      expect(appJs).toContain("createImageBitmap");
      expect(appJs).toContain("toBlob");
    });
  });

  // ===========================================================================
  // Feature F: Stars, Progress, Streak, recentWords & No Star-Farming
  // ===========================================================================
  describe("Feature F: Stars, Progress, Streak & recentWords", () => {
    it("[browser] awards stars once per exercise (no star-farming) and displays recentWords in Stars modal", async () => {
      await browser.runCase("t1_stars_recent_words_and_no_farming");
    });

    it("[api] GET /api/progress returns initial zero state with recentWords array", async () => {
      const res = await harness.request("/api/progress");
      expect(res.status).toBe(200);
      const p = await res.json();
      expect(p).toEqual({
        profileId: 1,
        totalStars: 0,
        currentStreakDays: 0,
        lastActivityDate: null,
        pagesReadCount: 0,
        recentWords: [],
      });
    });

    it("[api] POST /api/progress/complete increments pagesReadCount only for READING and adds stars for HOMEWORK", async () => {
      const r1 = await harness.request("/api/progress/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityType: "HOMEWORK", starsEarned: 2, trickyWords: ["patinho"] }),
      });
      const p1 = await r1.json();
      expect(p1.totalStars).toBe(2);
      expect(p1.pagesReadCount).toBe(0);
      expect(p1.currentStreakDays).toBe(1);

      const r2 = await harness.request("/api/progress/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityType: "READING", starsEarned: 3, trickyWords: ["almofada"] }),
      });
      const p2 = await r2.json();
      expect(p2.totalStars).toBe(5);
      expect(p2.pagesReadCount).toBe(1);
    });

    it("[api] streak increments on consecutive day and resets after multi-day gap", async () => {
      const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      harness.db.execRaw(
        `UPDATE child_progress SET current_streak_days = 4, last_activity_date = ? WHERE profile_id = 1`,
        yesterday,
      );
      const pConsec = await (
        await harness.request("/api/progress/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityType: "READING", starsEarned: 1 }),
        })
      ).json();
      expect(pConsec.currentStreakDays).toBe(5);

      const oldDate = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
      harness.db.execRaw(
        `UPDATE child_progress SET current_streak_days = 9, last_activity_date = ? WHERE profile_id = 1`,
        oldDate,
      );
      const pGap = await (
        await harness.request("/api/progress/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityType: "READING", starsEarned: 1 }),
        })
      ).json();
      expect(pGap.currentStreakDays).toBe(1);
    });

    it("[api] recentWords deduplicates case-insensitively and returns newest-first LIMIT 20", async () => {
      const words = Array.from({ length: 25 }, (_, i) => `Palavra${i + 1}`);
      words.push("palavra1", "PALAVRA2");
      const res = await harness.request("/api/progress/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityType: "READING", starsEarned: 1, trickyWords: words }),
      });
      const p = await res.json();
      expect(p.recentWords.length).toBe(20);
      const totalSaved = harness.db.execRaw("SELECT COUNT(*) AS cnt FROM saved_word WHERE profile_id = 1");
      expect(totalSaved[0].cnt).toBe(25);
    });
  });

  // ===========================================================================
  // Feature G: Parent Profile Settings, Dynamic Dialect Rules & Voice Choice
  // ===========================================================================
  describe("Feature G: Parent Profile, Dynamic Dialect Rules & Voice Choice", () => {
    it("[browser] Parent Settings saves profile with targetLanguageName/nativeLanguageName and persists", async () => {
      await browser.runCase("t1_parent_settings_save_and_hint");
    });

    it("[api] GET /api/profile returns default Sofia pt-PT/nb-NO profile with Sulafat voice", async () => {
      const res = await harness.request("/api/profile");
      expect(res.status).toBe(200);
      const p = await res.json();
      expect(p.id).toBe(1);
      expect(p.name).toBe("Sofia");
      expect(p.targetLanguageCode).toBe("pt-PT");
      expect(p.nativeLanguageCode).toBe("nb-NO");
      expect(p.ttsVoiceName).toBe("Sulafat");
    });

    it("[api] PUT /api/profile updates all 8 fields and persists in D1", async () => {
      const payload = {
        name: "Sofia Maria",
        age: 9,
        targetLanguageCode: "pt-PT",
        targetLanguageName: "European Portuguese",
        nativeLanguageCode: "nb-NO",
        nativeLanguageName: "Norwegian",
        dialectRules: "Lisbon European Portuguese only.",
        ttsVoiceName: "Aoede",
      };
      const putRes = await harness.request("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(putRes.status).toBe(200);
      expect(await putRes.json()).toEqual({ id: 1, ...payload });
    });

    it("[api] dynamic dialectRules and targetLanguageName are injected into reading, homework, and audio prompts", async () => {
      const p2Id = harness.db.seedProfile({
        name: "Lucas",
        age: 11,
        targetLanguageCode: "es-ES",
        targetLanguageName: "Spanish",
        nativeLanguageCode: "nb-NO",
        nativeLanguageName: "Norwegian",
        dialectRules: "STRICT_CASTILIAN_SPANISH_RULE_XYZ",
        ttsVoiceName: "Puck",
      });

      await harness.request("/api/audio/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Profile-Id": String(p2Id) },
        body: JSON.stringify({ text: "Hola amigos", languageCode: "es-ES" }),
      });
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "es.png", { type: "image/png" }));
      await harness.request("/api/reading/scan", {
        method: "POST",
        headers: { "X-Profile-Id": String(p2Id) },
        body: form,
      });

      const reqs = harness.geminiMock.getRequests();
      const audioReq = reqs.find((r) => r.url.includes("-tts:"));
      const readReq = reqs.find((r) => r.url.includes("hydrogen"));
      const audioStyle = audioReq.bodyJson.contents[0].parts[0].speechMetadata.style;
      expect(audioStyle).toContain("Spanish");
      expect(audioStyle).not.toContain("European Portuguese");
      expect(readReq.bodyJson.systemInstruction.parts[0].text).toContain("STRICT_CASTILIAN_SPANISH_RULE_XYZ");
    });

    it("[api] multi-profile isolation via X-Profile-Id keeps sessions & progress separate", async () => {
      const p2Id = harness.db.seedProfile({ name: "Emil" });
      await harness.request("/api/progress/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Profile-Id": String(p2Id) },
        body: JSON.stringify({ activityType: "READING", starsEarned: 7, trickyWords: ["sol"] }),
      });

      const p1 = await (await harness.request("/api/progress")).json();
      const p2 = await (
        await harness.request("/api/progress", { headers: { "X-Profile-Id": String(p2Id) } })
      ).json();
      expect(p1.totalStars).toBe(0);
      expect(p2.totalStars).toBe(7);
      expect(p2.recentWords.map((w) => w.word)).toContain("sol");
    });
  });

  // ===========================================================================
  // Feature H: System Constraints (ALLOWED_IPS, D1_DATABASE_ID, No-Build, MCP)
  // ===========================================================================
  describe("Feature H: System Constraints, ALLOWED_IPS, No-Build Assets & MCP", () => {
    it("[config] wrangler.jsonc preserves literal D1_DATABASE_ID placeholder REPLACE_WITH_YOUR_D1_DATABASE_ID", () => {
      const wrangler = fs.readFileSync(path.join(REPO_ROOT, "wrangler.jsonc"), "utf8");
      expect(wrangler).toContain('"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"');
    });

    it("[api] ALLOWED_IPS guard blocks unauthorized/missing CF-Connecting-IP with 403 and allows listed IPs", async () => {
      const denied1 = await harness.request(
        "/api/health",
        {},
        { envOverrides: { ALLOWED_IPS: "203.0.113.10, 198.51.100.4" } },
      );
      expect(denied1.status).toBe(403);

      const denied2 = await harness.request(
        "/api/profile",
        { headers: { "CF-Connecting-IP": "192.0.2.99" } },
        { envOverrides: { ALLOWED_IPS: "203.0.113.10, 198.51.100.4" } },
      );
      expect(denied2.status).toBe(403);

      const allowed = await harness.request(
        "/api/health",
        { headers: { "CF-Connecting-IP": "198.51.100.4" } },
        { envOverrides: { ALLOWED_IPS: "203.0.113.10, 198.51.100.4" } },
      );
      expect(allowed.status).toBe(200);
    });

    it("[api-tcp] serves static public/ assets directly without build step via ASSETS binding", async () => {
      for (const [assetPath, expectedMime] of [
        ["/", "text/html"],
        ["/styles.css", "text/css"],
        ["/app.js", "application/javascript"],
        ["/icon.svg", "image/svg+xml"],
        ["/manifest.webmanifest", "application/manifest+json"],
      ]) {
        const res = await fetch(`${baseUrl}${assetPath}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain(expectedMime);
      }
    });

    it("[api] POST /mcp implements initialize, tools/list (4 tools), and tools/call respecting X-Profile-Id", async () => {
      const initRes = await (
        await harness.request("/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        })
      ).json();
      expect(initRes.result.serverInfo.name).toBe("socratic");

      const listRes = await (
        await harness.request("/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        })
      ).json();
      expect(listRes.result.tools.map((t) => t.name)).toEqual([
        "getLearnerProfile",
        "getProgressAndTrickyWords",
        "listHomeworkSessions",
        "getHomeworkSession",
      ]);

      const p2Id = harness.db.seedProfile({ name: "Maja" });
      const callRes = await (
        await harness.request("/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Profile-Id": String(p2Id) },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "getLearnerProfile", arguments: {} },
          }),
        })
      ).json();
      const parsedProfile = JSON.parse(callRes.result.content[0].text);
      expect(parsedProfile.name).toBe("Maja");
    });

    it("[api-tcp] GET and QUERY /api/homework/sessions filter by search query and status", async () => {
      const form = new FormData();
      form.append("image", new File([makeValidPngBytes()], "hw.png", { type: "image/png" }));
      await harness.request("/api/homework/sessions/scan", { method: "POST", body: form });

      const getRes = await fetch(`${baseUrl}/api/homework/sessions?q=patinho`);
      expect(getRes.status).toBe(200);
      expect((await getRes.json()).length).toBe(1);

      const qRes = await fetch(`${baseUrl}/api/homework/sessions`, {
        method: "QUERY",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "borboleta", status: "PENDING" }),
      });
      expect(qRes.status).toBe(200);
      expect((await qRes.json()).length).toBe(1);

      const textQ = await fetch(`${baseUrl}/api/homework/sessions`, {
        method: "QUERY",
        headers: { "Content-Type": "text/plain" },
        body: "inexistente",
      });
      expect(textQ.status).toBe(200);
      expect(await textQ.json()).toEqual([]);
    });
  });

  // ===========================================================================
  // Feature I: Zero-Emoji SVG Craft, Warm Atelier Tokens, 44px Ergonomics, Popover & 2-Tap Delete
  // ===========================================================================
  describe("Feature I: Visual Craft, Warm Atelier Tokens, 44px Ergonomics & 2-Tap Delete", () => {
    it("[browser] contains zero raw Unicode emojis or transport symbols across views & modals", async () => {
      await browser.runCase("t1_zero_emoji_svg_craft");
    });

    it("[browser] uses Warm Atelier vellum/ink tokens, Plus Jakarta Sans/Lexend, no cyan scan beam, and dark/light theme", async () => {
      await browser.runCase("t1_warm_atelier_tokens");
    });

    it("[browser] enforces >= 44px touch targets on controls and opens/dismisses #word-popover cleanly", async () => {
      await browser.runCase("t1_touch_ergonomics_and_popover");
    });

    it("[browser] uses inline 2-tap delete confirmation in Pages drawer without browser window.confirm()", async () => {
      await browser.runCase("t1_inline_2tap_delete_confirm");
    });

    it("[static] public/styles.css eliminates .karaoke-word.is-active font-weight jump & scale transform", () => {
      const css = fs.readFileSync(path.join(REPO_ROOT, "public/styles.css"), "utf8");
      const activeMatch = css.match(/\.karaoke-word\.is-active\s*\{([^}]*)\}/);
      expect(activeMatch).not.toBeNull();
      const block = activeMatch[1];
      expect(block).not.toMatch(/transform:\s*scale\(/);
      expect(block).not.toMatch(/font-weight:\s*800/);
    });
  });
});
