import { Hono } from "hono";
import type { Env } from "../types";

const ALLOWED_FOLDERS = new Set(["reading", "homework", "audio"]);
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  return "jpg";
}

export function buildUploadUrl(imageKey: string | null | undefined): string | null {
  return imageKey ? `/api/uploads/${imageKey}` : null;
}

export async function storeUploadedImage(
  env: Env,
  file: File,
  folder: "reading" | "homework",
): Promise<{ imageKey: string | null; imageUrl: string | null }> {
  if (!env.UPLOADS) {
    return { imageKey: null, imageUrl: null };
  }
  try {
    const contentType = file.type || "image/jpeg";
    const ext = extensionForMime(contentType);
    const imageKey = `${folder}/${crypto.randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();

    await env.UPLOADS.put(imageKey, bytes, {
      httpMetadata: {
        contentType,
        cacheControl: "private, max-age=86400",
      },
    });

    return {
      imageKey,
      imageUrl: buildUploadUrl(imageKey),
    };
  } catch (err) {
    console.error("R2 upload failed (non-fatal):", err);
    return { imageKey: null, imageUrl: null };
  }
}

export const uploadRoutes = new Hono<{ Bindings: Env }>();

uploadRoutes.get("/:folder/:filename", async (c) => {
  if (!c.env.UPLOADS) {
    return c.json({ error: "R2 image storage is not configured" }, 404);
  }
  const folder = c.req.param("folder");
  const filename = c.req.param("filename");
  if (!ALLOWED_FOLDERS.has(folder) || !SAFE_FILENAME.test(filename)) {
    return c.json({ error: "Invalid image key" }, 400);
  }

  const key = `${folder}/${filename}`;
  const obj = await c.env.UPLOADS.get(key);
  if (!obj) {
    return c.json({ error: "Image not found" }, 404);
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "image/jpeg");
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, max-age=86400");
  }
  headers.set("ETag", obj.httpEtag);

  return new Response(obj.body, { headers });
});
