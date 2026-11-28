import { Hono } from "hono";
import { arrayBufferToInlineImage, callGeminiStructured, renderReadingSystemPrompt } from "../lib/gemini";
import { parseFormDataBody } from "../lib/http";
import type { Env, ReadingPageResponse } from "../types";
import { prewarmAudioItems } from "./audio";
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
  const form = await parseFormDataBody(c);
  const { file: image, buffer, mimeType } = await validateImageUpload(form.get("image"));

  const profile = await getActiveProfile(c.env.DB, profileId);
  const inlineImage = arrayBufferToInlineImage(buffer, mimeType);

  const response = await callGeminiStructured<ReadingPageResponse>(c.env, {
    systemPrompt: renderReadingSystemPrompt(profile),
    userText: "Please read and break down this book page.",
    image: inlineImage,
    responseSchema: READING_SCHEMA,
  });

  const stored = await storeUploadedImage(c.env, image, "reading", buffer, mimeType);

  const warmItems = (response.sentences ?? []).slice(0, 6).flatMap((s) => [
    { text: s.targetText, languageCode: profile.targetLanguageCode, slow: false },
    ...(s.nativeSummary ? [{ text: s.nativeSummary, languageCode: profile.nativeLanguageCode, slow: false }] : []),
  ]);
  if (warmItems.length > 0) {
    try {
      c.executionCtx.waitUntil(prewarmAudioItems(c.env, profile, warmItems));
    } catch {}
  }

  return c.json({
    ...response,
    imageUrl: stored.imageUrl,
  });
});
