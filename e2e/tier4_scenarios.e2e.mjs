import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBrowserSession } from "./helpers/browser_bridge.mjs";
import { createTestHarness, makeValidPngBytes } from "./helpers/test_server.mjs";

describe("Tier 4 — Real-World 8-Year-Old Sofia End-to-End Scenarios", () => {
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

  it("Scenario 1: Sofia scans her Portuguese worksheet (reading passage + 2 questions), practices with Owly & completes all", async () => {
    await browser.runCase("t4_sofia_worksheet_journey");

    // Verify full persistence in D1 + MCP session inspection
    const listRes = await fetch(`${baseUrl}/api/homework/sessions`);
    const sessions = await listRes.json();
    expect(sessions.length).toBe(1);
    expect(sessions[0].exercises.every((e) => e.status === "COMPLETED")).toBe(true);
    expect(sessions[0].exercises[0].messages.length).toBe(2);

    const mcpSession = await (
      await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name: "getHomeworkSession", arguments: { sessionId: sessions[0].id } },
        }),
      })
    ).json();
    const dto = JSON.parse(mcpSession.result.content[0].text);
    expect(dto.pageTitle).toBe("O Patinho Curioso");
    expect(dto.exercises.length).toBe(2);
  });

  it("Scenario 2: Sofia reads an evening storybook page in Ler mode at slow speed, finishes, and reloads", async () => {
    await browser.runCase("t4_sofia_evening_storybook");

    const progress = await (await fetch(`${baseUrl}/api/progress`)).json();
    expect(progress.pagesReadCount).toBe(1);
    expect(progress.totalStars).toBeGreaterThanOrEqual(3);
    expect(progress.currentStreakDays).toBe(1);
  });

  it("Scenario 3: Parent updates Sofia's voice/dialect + multi-child profile isolation + MCP query", async () => {
    // 1. Seed second child profile (Lukas) directly in D1
    const lukasId = harness.db.seedProfile({
      name: "Lukas",
      age: 11,
      targetLanguageCode: "es-ES",
      targetLanguageName: "Spanish",
      nativeLanguageCode: "nb-NO",
      nativeLanguageName: "Norwegian",
      dialectRules: "Castilian Spanish (Spain).",
      ttsVoiceName: "Puck",
    });

    // 2. Lukas scans a Spanish homework page and earns 5 stars
    const formLukas = new FormData();
    formLukas.append("image", new File([makeValidPngBytes()], "lukas.png", { type: "image/png" }));
    const lukasScan = await harness.request("/api/homework/sessions/scan", {
      method: "POST",
      headers: { "X-Profile-Id": String(lukasId) },
      body: formLukas,
    });
    expect(lukasScan.status).toBe(200);
    await harness.request("/api/progress/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Profile-Id": String(lukasId) },
      body: JSON.stringify({ activityType: "READING", starsEarned: 5, trickyWords: ["mariposa"] }),
    });

    // 3. Sofia (Profile 1) updates her voice via browser UI and scans & recovers
    await browser.runCase("t4_parent_settings_and_resilient_recovery", { resetBefore: false });

    // 4. Verify Profile 1 and Profile 2 remain strictly isolated via API and MCP
    const sofiaSessions = await (await harness.request("/api/homework/sessions")).json();
    const lukasSessions = await (
      await harness.request("/api/homework/sessions", { headers: { "X-Profile-Id": String(lukasId) } })
    ).json();
    expect(sofiaSessions.length).toBe(1);
    expect(lukasSessions.length).toBe(1);
    expect(sofiaSessions[0].id).not.toBe(lukasSessions[0].id);

    const mcpLukas = await (
      await harness.request("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Profile-Id": String(lukasId) },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 22,
          method: "tools/call",
          params: { name: "getProgressAndTrickyWords", arguments: {} },
        }),
      })
    ).json();
    const lukasProg = JSON.parse(mcpLukas.result.content[0].text);
    expect(lukasProg.totalStars).toBe(5);
    expect(lukasProg.recentWords.map((w) => w.word)).toContain("mariposa");
  });

  it("Scenario 4: Resilient error recovery — Gemini outage, bad SVG upload, ALLOWED_IPS guard, then valid retry", async () => {
    // 1. External IP blocked by ALLOWED_IPS while home IP succeeds
    const blocked = await harness.request(
      "/api/profile",
      { headers: { "CF-Connecting-IP": "198.51.100.200" } },
      { envOverrides: { ALLOWED_IPS: "203.0.113.10" } },
    );
    expect(blocked.status).toBe(403);

    const homeOk = await harness.request(
      "/api/profile",
      { headers: { "CF-Connecting-IP": "203.0.113.10" } },
      { envOverrides: { ALLOWED_IPS: "203.0.113.10" } },
    );
    expect(homeOk.status).toBe(200);

    // 2. Browser outage -> zero R2 orphans -> error card dismiss -> clean retry
    await browser.runCase("t4_parent_settings_and_resilient_recovery");
  });

  it("Scenario 5: Mobile 375x812 dark-mode study session persists theme, zero overflow & clean audio Range fetch", async () => {
    await browser.runCase("t4_mobile_dark_light_study_session");

    // Stream an audio clip over real TCP HTTP and fetch its WAV Range slice
    const speakRes = await fetch(`${baseUrl}/api/audio/speak`, {
      method: "QUERY",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Boa noite, Sofia!", languageCode: "pt-PT", slow: true }),
    });
    expect(speakRes.status).toBe(200);
    const contentLoc = speakRes.headers.get("Content-Location");
    expect(contentLoc).toMatch(/^\/api\/uploads\/audio\//);

    const rangeRes = await fetch(`${baseUrl}${contentLoc}`, {
      headers: { Range: "bytes=0-11" },
    });
    expect(rangeRes.status).toBe(206);
    const headerBytes = new Uint8Array(await rangeRes.arrayBuffer());
    expect(String.fromCharCode(...headerBytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...headerBytes.slice(8, 12))).toBe("WAVE");
  });
});
