import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export function createAssetsFs(publicDir = PUBLIC_DIR) {
  const resolvedRoot = path.resolve(publicDir);

  return {
    async fetch(input) {
      const urlStr = typeof input === "string" ? input : input.url;
      const url = new URL(urlStr, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        pathname = "/index.html";
      }

      const relPath = pathname.replace(/^\/+/, "");
      const candidate = path.resolve(resolvedRoot, relPath);

      // Path traversal protection
      if (!candidate.startsWith(resolvedRoot + path.sep) && candidate !== resolvedRoot) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const stat = await fs.stat(candidate);
        if (!stat.isFile()) {
          return new Response("Not Found", { status: 404 });
        }
        const content = await fs.readFile(candidate);
        const ext = path.extname(candidate).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        return new Response(content, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(content.byteLength),
          },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    },
  };
}
