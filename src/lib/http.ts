import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
}

export async function parseFormDataBody(c: Context): Promise<FormData> {
  try {
    return await c.req.formData();
  } catch {
    throw new HTTPException(400, { message: "Invalid multipart form data" });
  }
}

export function parsePositiveIntParam(raw: string | undefined, paramName: string): number {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) {
    throw new HTTPException(400, { message: `Invalid ${paramName}` });
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HTTPException(400, { message: `Invalid ${paramName}` });
  }
  return value;
}
