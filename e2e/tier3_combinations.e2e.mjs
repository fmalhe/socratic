import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBrowserSession } from "./helpers/browser_bridge.mjs";
import { createTestHarness, makeValidPngBytes } from "./helpers/test_server.mjs";

describe("Tier 3 — Cross-Feature Combinations (Pairwise)", () => {
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

  it("[browser+api] Scan -> passage hydrate -> exercise -> PT/NO explain -> chat DTO -> complete -> stars/recentWords modal", async () => {
    await browser.runCase("t3_homework_full_combo");

    // Verify MCP server sees the persisted progress, recentWords, and completed exercise
    const mcpRes = await harness.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "getProgressAndTrickyWords", arguments: {} },
      }),
    });
    const mcpJson = await mcpRes.json();
    const progress = JSON.parse(mcpJson.result.content[0].text);
    expect(progress.totalStars).toBeGreaterThanOrEqual(2);
    expect(progress.recentWords.map((w) => w.word.toLowerCase())).toContain("patinho");
  });

  it("[browser] Read Mode scan -> play -> slow toggle -> finish -> stars + reload persistence", async () => {
    await browser.runCase("t3_read_mode_slow_and_reload_persistence");
  });

  it("[browser+api] Settings voice change -> client CacheStorage & server R2 cache key isolation", async () => {
    await browser.runCase("t3_voice_change_client_cache_isolation");

    // Also verify backend R2 key isolation directly on /api/audio/speak
    harness.resetAll();
    const r1 = await harness.request("/api/audio/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Mesma frase", languageCode: "pt-PT" }),
    });
    expect(r1.headers.get("X-Audio-Cache")).toBe("MISS");
    const loc1 = r1.headers.get("Content-Location");

    await harness.request("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sofia",
        age: 8,
        targetLanguageCode: "pt-PT",
        targetLanguageName: "European Portuguese",
        nativeLanguageCode: "nb-NO",
        nativeLanguageName: "Norwegian",
        dialectRules: "European Portuguese only.",
        ttsVoiceName: "Puck",
      }),
    });

    const r2 = await harness.request("/api/audio/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Mesma frase", languageCode: "pt-PT" }),
    });
    expect(r2.headers.get("X-Audio-Cache")).toBe("MISS");
    const loc2 = r2.headers.get("Content-Location");
    expect(loc2).not.toBe(loc1);
  });

  it("[api] Settings dialect change -> dynamic Gemini prompt injection across reading, homework & audio", async () => {
    await harness.request("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sofia",
        age: 8,
        targetLanguageCode: "fr-FR",
        targetLanguageName: "French",
        nativeLanguageCode: "nb-NO",
        nativeLanguageName: "Norwegian",
        dialectRules: "METROPOLITAN_FRENCH_DIALECT_MARKER_88",
        ttsVoiceName: "Kore",
      }),
    });

    const fRead = new FormData();
    fRead.append("image", new File([makeValidPngBytes()], "fr_book.png", { type: "image/png" }));
    await harness.request("/api/reading/scan", { method: "POST", body: fRead });

    const fHw = new FormData();
    fHw.append("image", new File([makeValidPngBytes()], "fr_hw.png", { type: "image/png" }));
    await harness.request("/api/homework/sessions/scan", { method: "POST", body: fHw });

    await harness.request("/api/audio/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Bonjour!", languageCode: "fr-FR" }),
    });

    const reqs = harness.geminiMock.getRequests();
    const structuredReqs = reqs.filter((r) => r.url.includes("hydrogen"));
    expect(structuredReqs.length).toBe(2);
    for (const r of structuredReqs) {
      expect(r.bodyJson.systemInstruction.parts[0].text).toContain("METROPOLITAN_FRENCH_DIALECT_MARKER_88");
      expect(r.bodyJson.systemInstruction.parts[0].text).toContain("French");
    }
    const ttsReq = reqs.find((r) => r.url.includes("-tts:"));
    expect(ttsReq.bodyJson.contents[0].parts[0].speechMetadata.style).toContain("French");
    expect(ttsReq.bodyJson.contents[0].parts[0].speechMetadata.style).not.toContain("European Portuguese");
  });

  it("[browser] Upload cancel during scan -> progress resets without error -> valid retry succeeds", async () => {
    await browser.runCase("t3_upload_cancel_and_retry");
  });

  it("[browser+api] TPC <-> Ler tab switching stops floating audio dock + 2-tap delete removes R2 upload", async () => {
    await browser.runCase("t3_tab_switch_dock_stop_and_2tap_delete");
    expect(harness.r2.listKeys("homework/")).toEqual([]);
  });
});
