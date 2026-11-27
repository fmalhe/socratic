import { Hono } from "hono";
import type { Env } from "../types";

const ALLOWED_FOLDERS = new Set(["reading", "homework", "audio"]);
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;
export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;

function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  return "jpg";
}

export function validateImageUpload(file: unknown): asserts file is File {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Invalid image: file must not be empty");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("Invalid image: maximum size is 12 MB");
  }
  if (file.type && !file.type.toLowerCase().startsWith("image/")) {
    throw new Error("Invalid image: unsupported file type");
  }
}

export function buildUploadUrl(imageKey: string | null | undefined): string | null {
  return imageKey ? `/api/uploads/${imageKey}` : null;
}

export async function storeUploadedImage(
  env: Env,
  file: File,
  folder: "reading" | "homework",
  preloadedBuffer?: ArrayBuffer,
): Promise<{ imageKey: string | null; imageUrl: string | null }> {
  if (!env.UPLOADS) {
    return { imageKey: null, imageUrl: null };
  }
  try {
    const contentType = file.type || "image/jpeg";
    const ext = extensionForMime(contentType);
    const imageKey = `${folder}/${crypto.randomUUID()}.${ext}`;
    const bytes = preloadedBuffer ?? (await file.arrayBuffer());

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

export async function deleteUploadedImage(
  env: Env,
  imageKey: string | null | undefined,
): Promise<void> {
  if (!env.UPLOADS || !imageKey) return;
  try {
    await env.UPLOADS.delete(imageKey);
  } catch (err) {
    console.error("R2 delete failed (non-fatal):", err);
  }
}

export const uploadRoutes = new Hono<{ Bindings: Env }>();

function buildAssetHeaders(obj: R2Object, folder: string): Headers {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", folder === "audio" ? "audio/wav" : "image/jpeg");
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, max-age=86400");
  }
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  return headers;
}

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
  const rangeHeader = c.req.header("Range");

  if (!rangeHeader) {
    const obj = await c.env.UPLOADS.get(key);
    if (!obj) {
      return c.json({ error: "Image not found" }, 404);
    }
    const headers = buildAssetHeaders(obj, folder);
    if (typeof obj.size === "number") {
      headers.set("Content-Length", String(obj.size));
    }
    return new Response(obj.body, { status: 200, headers });
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    return new Response("Range Not Satisfiable", { status: 416 });
  }

  const startRaw = match[1];
  const endRaw = match[2];
  let rangeOption: R2Range;
  let parsedStart = 0;
  let parsedEnd: number | null = null;
  let suffixLength: number | null = null;

  if (startRaw && endRaw) {
    parsedStart = Number(startRaw);
    parsedEnd = Number(endRaw);
    if (parsedStart > parsedEnd) {
      return new Response("Range Not Satisfiable", { status: 416 });
    }
    rangeOption = { offset: parsedStart, length: parsedEnd - parsedStart + 1 };
  } else if (startRaw) {
    parsedStart = Number(startRaw);
    rangeOption = { offset: parsedStart };
  } else {
    suffixLength = Number(endRaw);
    if (suffixLength <= 0) {
      return new Response("Range Not Satisfiable", { status: 416 });
    }
    rangeOption = { suffix: suffixLength };
  }

  const obj = await c.env.UPLOADS.get(key, { range: rangeOption });
  if (!obj) {
    return c.json({ error: "Image not found" }, 404);
  }

  const total = obj.size;
  let start = parsedStart;
  let end = parsedEnd !== null ? Math.min(parsedEnd, total - 1) : total - 1;
  if (suffixLength !== null) {
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  }

  if (total === 0 || start >= total || start > end) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  const contentLength = end - start + 1;
  const headers = buildAssetHeaders(obj, folder);
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  headers.set("Content-Length", String(contentLength));

  if (obj.range) {
    return new Response(obj.body, { status: 206, headers });
  }

  const fullBytes = new Uint8Array(await obj.arrayBuffer());
  const sliced = fullBytes.slice(start, end + 1);
  return new Response(sliced, { status: 206, headers });
});
