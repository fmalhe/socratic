import http from "node:http";
import { Readable } from "node:stream";
import app from "../../src/index";
import { createAssetsFs } from "./assets_fs.mjs";
import { createD1Sqlite } from "./d1_sqlite.mjs";
import { createGeminiMock } from "./gemini_mock.mjs";
import { createR2Memory } from "./r2_memory.mjs";

/** Create a minimal valid 1x1 RGB PNG byte buffer for multipart upload tests. */
export function makeValidPngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

function readNodeBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createTestHarness(initialEnvOverrides = {}) {
  const db = createD1Sqlite();
  const r2 = createR2Memory();
  const assets = createAssetsFs();
  const geminiMock = createGeminiMock();
  geminiMock.install();

  const pendingWaitUntil = [];
  let envOverrides = { ...initialEnvOverrides };

  function buildEnv(perCallOverrides = {}) {
    return {
      DB: db,
      UPLOADS: r2,
      ASSETS: assets,
      GEMINI_API_KEY: "test-gemini-key",
      GOOGLE_TTS_API_KEY: "test-google-tts-key",
      GEMINI_MODEL: "gemini-4-hydrogen",
      GEMINI_TTS_MODEL: "gemini-3.8-flash-lite-tts",
      GEMINI_TTS_VOICE: "Sulafat",
      ...envOverrides,
      ...perCallOverrides,
    };
  }

  function makeExecutionCtx() {
    return {
      waitUntil(promise) {
        pendingWaitUntil.push(Promise.resolve(promise));
      },
      passThroughOnException() {},
    };
  }

  async function flushWaitUntil() {
    while (pendingWaitUntil.length > 0) {
      const batch = pendingWaitUntil.splice(0, pendingWaitUntil.length);
      await Promise.allSettled(batch);
    }
  }

  async function request(pathOrUrl, init = {}, options = {}) {
    const fullUrl = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `http://127.0.0.1${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    const req = new Request(fullUrl, init);
    const ctx = options.omitExecutionCtx ? undefined : makeExecutionCtx();
    const env = buildEnv(options.envOverrides);
    return app.fetch(req, env, ctx);
  }

  function setEnvOverrides(patch = {}) {
    envOverrides = { ...envOverrides, ...patch };
  }

  function resetAll(options = {}) {
    db.reset();
    r2.clear();
    geminiMock.reset();
    envOverrides = { ...initialEnvOverrides, ...(options.envOverrides ?? {}) };
    if (options.scenario) {
      geminiMock.setScenario(options.scenario);
    }
  }

  let httpServer = null;
  let baseUrl = null;
  let scanDelayMs = 0;

  async function handleTestControlRoute(pathname, req, res) {
    if (pathname === "/__test/reset" && req.method === "POST") {
      const raw = await readNodeBody(req);
      let body = {};
      if (raw.byteLength > 0) {
        body = JSON.parse(raw.toString("utf8"));
      }
      scanDelayMs = 0;
      resetAll(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    if (pathname === "/__test/scenario" && req.method === "POST") {
      const raw = await readNodeBody(req);
      const body = raw.byteLength > 0 ? JSON.parse(raw.toString("utf8")) : {};
      if (typeof body.scanDelayMs === "number") {
        scanDelayMs = body.scanDelayMs;
      }
      if (body.scenario) {
        geminiMock.setScenario(body.scenario);
      }
      if (body.envOverrides) {
        setEnvOverrides(body.envOverrides);
      }
      if (body.seedProfile) {
        const id = db.seedProfile(body.seedProfile);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, profileId: id }));
        return true;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    if (pathname === "/__test/state" && req.method === "GET") {
      await flushWaitUntil();
      const requests = geminiMock.getRequests();
      const r2Keys = r2.listKeys();
      const profiles = db.execRaw("SELECT id, name, tts_voice_name FROM learner_profile ORDER BY id ASC");
      const progress = db.execRaw("SELECT * FROM child_progress ORDER BY profile_id ASC");
      const sessions = db.execRaw("SELECT id, profile_id, page_title, image_key FROM homework_session ORDER BY id ASC");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ requests, r2Keys, profiles, progress, sessions }));
      return true;
    }

    return false;
  }

  async function startHttpServer() {
    if (httpServer && baseUrl) {
      return baseUrl;
    }

    httpServer = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

        if (reqUrl.pathname.startsWith("/__test/")) {
          const handled = await handleTestControlRoute(reqUrl.pathname, req, res);
          if (handled) return;
        }

        if (scanDelayMs > 0 && reqUrl.pathname.endsWith("/scan")) {
          await new Promise((r) => setTimeout(r, scanDelayMs));
        }

        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) {
            for (const item of v) headers.append(k, item);
          } else {
            headers.set(k, v);
          }
        }

        const method = (req.method || "GET").toUpperCase();
        const hasBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
        const bodyBuf = hasBody ? await readNodeBody(req) : undefined;

        const webReq = new Request(reqUrl.toString(), {
          method,
          headers,
          body: hasBody && bodyBuf && bodyBuf.byteLength > 0 ? bodyBuf : undefined,
        });

        const webRes = await app.fetch(webReq, buildEnv(), makeExecutionCtx());
        const outHeaders = {};
        webRes.headers.forEach((v, k) => {
          outHeaders[k] = v;
        });

        res.writeHead(webRes.status, outHeaders);

        if (!webRes.body) {
          res.end();
          await flushWaitUntil();
          return;
        }

        const nodeStream = Readable.fromWeb(webRes.body);
        nodeStream.on("error", (err) => {
          if (!res.writableEnded) res.destroy(err);
        });
        nodeStream.on("end", () => {
          flushWaitUntil().catch(() => {});
        });
        nodeStream.pipe(res);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });

    await new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = httpServer.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    return baseUrl;
  }

  async function close() {
    await flushWaitUntil();
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(() => resolve()));
      httpServer = null;
      baseUrl = null;
    }
    geminiMock.restore();
    db.close();
  }

  return {
    db,
    r2,
    assets,
    geminiMock,
    request,
    flushWaitUntil,
    setEnvOverrides,
    resetAll,
    startHttpServer,
    close,
    get baseUrl() {
      return baseUrl;
    },
  };
}
