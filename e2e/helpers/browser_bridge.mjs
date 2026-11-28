import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = path.resolve(__dirname, "../browser/browser_runner.py");

function resolvePythonBin() {
  if (fs.existsSync("/opt/pyenv/shims/python3")) {
    return "/opt/pyenv/shims/python3";
  }
  return "python3";
}

export async function createBrowserSession(baseUrl) {
  const pythonBin = resolvePythonBin();
  const child = spawn(pythonBin, [RUNNER_PATH, "--server"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
  });

  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  let stderrBuf = "";
  let nextId = 1;
  let closed = false;

  child.stderr.on("data", (chunk) => {
    stderrBuf += chunk.toString("utf8");
  });

  let readyResolve;
  let readyReject;
  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (msg.ready) {
      readyResolve();
      return;
    }
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      waiter.resolve(msg);
    }
  });

  child.on("exit", (code) => {
    closed = true;
    const err = new Error(`Browser runner exited unexpectedly (code=${code}): ${stderrBuf}`);
    readyReject(err);
    for (const waiter of pending.values()) {
      waiter.reject(err);
    }
    pending.clear();
  });

  await readyPromise;

  async function runCase(caseName, options = {}) {
    if (closed) {
      throw new Error(`Browser runner already closed: ${stderrBuf}`);
    }
    const id = nextId++;
    const payload = JSON.stringify({ id, case: caseName, baseUrl, options });
    const resultPromise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    child.stdin.write(payload + "\n");
    const result = await resultPromise;
    if (!result.passed) {
      throw new Error(
        `[Browser ${result.tier} :: ${result.name}] FAILED\n${result.error || "Unknown browser error"}\nDetails: ${JSON.stringify(result.details)}`,
      );
    }
    return result;
  }

  async function close() {
    if (closed) return;
    closed = true;
    try {
      child.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n");
      child.stdin.end();
    } catch {}
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  return { runCase, close };
}
