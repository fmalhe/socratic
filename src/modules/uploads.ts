import { Hono } from "hono";
import type { Env } from "../types";

const ALLOWED_FOLDERS = new Set(["reading", "homework", "audio"]);
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;
export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const);

export type AllowedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif";

function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("heic")) return "heic";
  if (lower.includes("heif")) return "heif";
  return "jpg";
}

export function detectImageMimeFromBytes(buffer: ArrayBuffer): AllowedImageMime | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 32));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  ) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!).toLowerCase();
    if (brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx") {
      return "image/heic";
    }
    if (brand === "mif1" || brand === "msf1" || brand === "heif") {
      return "image/heif";
    }
  }
  return null;
}

export async function validateImageUpload(
  file: unknown,
): Promise<{ file: File; buffer: ArrayBuffer; mimeType: AllowedImageMime }> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Invalid image: file must not be empty");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("Invalid image: maximum size is 12 MB");
  }
  const declared = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    declared &&
    declared !== "application/octet-stream" &&
    !ALLOWED_IMAGE_MIME_TYPES.has(declared as AllowedImageMime)
  ) {
    throw new Error("Invalid image: unsupported file type");
  }
  const buffer = await file.arrayBuffer();
  const detected = detectImageMimeFromBytes(buffer);
  if (!detected) {
    throw new Error("Invalid image: unsupported file type");
  }
  return { file, buffer, mimeType: detected };
}

export function buildUploadUrl(imageKey: string | null | undefined): string | null {
  return imageKey ? `/api/uploads/${imageKey}` : null;
}

export async function storeUploadedImage(
  env: Env,
  file: File,
  folder: "reading" | "homework",
  preloadedBuffer?: ArrayBuffer,
  resolvedMimeType?: string,
): Promise<{ imageKey: string | null; imageUrl: string | null }> {
  if (!env.UPLOADS) {
    return { imageKey: null, imageUrl: null };
  }
  try {
    const contentType = resolvedMimeType || file.type || "image/jpeg";
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
  headers.set("X-Content-Type-Options", "nosniff");

  const resolvedType = (headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (folder !== "audio" || !resolvedType.startsWith("audio/")) {
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    if (folder !== "audio" && !ALLOWED_IMAGE_MIME_TYPES.has(resolvedType as AllowedImageMime)) {
      headers.set("Content-Type", "application/octet-stream");
    }
  }
  return headers;
}

uploadRoutes.get("/:folder/:filename", async (c) => {
  if (!c.env.UPLOADS) {
    return c.json({ error: "R2 image storage is not configured" }, 404);
  }
  const folder = c.req.param("folder");
  const filename = c.req.param("filename");
  if (
    !ALLOWED_FOLDERS.has(folder) ||
    !SAFE_FILENAME.test(filename) ||
    filename === "." ||
    filename === ".." ||
    filename.includes("..")
  ) {
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
    if (!Number.isSafeInteger(parsedStart) || !Number.isSafeInteger(parsedEnd) || parsedStart > parsedEnd) {
      return new Response("Range Not Satisfiable", { status: 416 });
    }
    rangeOption = { offset: parsedStart, length: parsedEnd - parsedStart + 1 };
  } else if (startRaw) {
    parsedStart = Number(startRaw);
    if (!Number.isSafeInteger(parsedStart)) {
      return new Response("Range Not Satisfiable", { status: 416 });
    }
    rangeOption = { offset: parsedStart };
  } else {
    suffixLength = Number(endRaw);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
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
