import { Hono } from "hono";
import { callGeminiStructured, fileToInlineImage, renderReadingSystemPrompt } from "../lib/gemini";
import type { Env, ReadingPageResponse } from "../types";
import { getActiveProfile, resolveProfileId } from "./profile";

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
        required: ["targetText", "nativeSummary", "trickyWords"],
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
  if (!(image instanceof File) || image.size === 0) {
    return c.json({ error: "Image file must not be empty" }, 400);
  }

  const profile = await getActiveProfile(c.env.DB, profileId);
  const inlineImage = await fileToInlineImage(image);

  const response = await callGeminiStructured<ReadingPageResponse>(c.env, {
    systemPrompt: renderReadingSystemPrompt(profile),
    userText: "Please read and break down this book page.",
    image: inlineImage,
    responseSchema: READING_SCHEMA,
  });

  return c.json(response);
});
