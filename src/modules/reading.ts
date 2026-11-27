import { Hono } from "hono";
import { arrayBufferToInlineImage, callGeminiStructured, renderReadingSystemPrompt } from "../lib/gemini";
import type { Env, ReadingPageResponse } from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";
import { storeUploadedImage, validateImageUpload } from "./uploads";

const READING_SCHEMA = {
  type: "OBJECT",
  properties: {
    fullText: { type: "STRING" },
    sentences: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          targetText: { type: "STRING" },
          nativeSummary: { type: "STRING" },
          englishSummary: { type: "STRING" },
          trickyWords: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                word: { type: "STRING" },
                syllables: { type: "STRING" },
                nativeHint: { type: "STRING" },
              },
              required: ["word", "syllables", "nativeHint"],
            },
          },
        },
        required: ["targetText", "nativeSummary", "englishSummary", "trickyWords"],
      },
    },
  },
  required: ["fullText", "sentences"],
};

export const readingRoutes = new Hono<{ Bindings: Env }>();

readingRoutes.post("/scan", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));
  const form = await c.req.formData();
  const image = form.get("image");
  validateImageUpload(image);

  const profile = await getActiveProfile(c.env.DB, profileId);
  const buffer = await image.arrayBuffer();
  const inlineImage = arrayBufferToInlineImage(buffer, image.type || "image/jpeg");
  const stored = await storeUploadedImage(c.env, image, "reading", buffer);

  const response = await callGeminiStructured<ReadingPageResponse>(c.env, {
    systemPrompt: renderReadingSystemPrompt(profile),
    userText: "Please read and break down this book page.",
    image: inlineImage,
    responseSchema: READING_SCHEMA,
  });

  return c.json({
    ...response,
    imageUrl: stored.imageUrl,
  });
});
