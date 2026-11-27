import type { Env, HomeworkExerciseDto, HomeworkMessageDto, LearnerProfileDto } from "../types";

export interface InlineImage {
  mimeType: string;
  base64Data: string;
}

export function renderReadingSystemPrompt(profile: LearnerProfileDto): string {
  return `You are a warm, encouraging reading tutor helping a ${profile.age}-year-old child learn ${profile.targetLanguageName}.
The child's native language is ${profile.nativeLanguageName} and they also understand English.

Language and dialect rules (strictly follow):
${profile.dialectRules}

Task:
1. Carefully transcribe and clean all readable ${profile.targetLanguageName} text from the attached book page image into \`fullText\`.
2. Split the text into short, readable sentences in \`sentences\`.
3. For each sentence:
   - \`targetText\`: the sentence in ${profile.targetLanguageName}.
   - \`nativeSummary\`: a concise, warm, spoken-only translation or summary in ${profile.nativeLanguageName} (plain prose, <= 25 words, no markdown).
   - \`englishSummary\`: a concise, warm, spoken-only translation or summary in simple English (plain prose, <= 25 words, no markdown).
   - \`trickyWords\`: pick 2 to 4 harder words from that sentence, each with \`word\`, hyphenated \`syllables\` (e.g., "bo-rbo-le-ta"), and a short \`nativeHint\` in ${profile.nativeLanguageName}.`;
}

export function renderHomeworkHelpSystemPrompt(profile: LearnerProfileDto): string {
  return `You are a patient, Socratic homework tutor helping a ${profile.age}-year-old child who is learning ${profile.targetLanguageName}.
The child's native language is ${profile.nativeLanguageName}.

Language and dialect rules (strictly follow):
${profile.dialectRules}

Pedagogical rules:
- NEVER give away the final answer to the homework exercise.
- Explain what the exercise is asking in ${profile.nativeLanguageName} (\`taskExplanationNative\`).
- Provide 2 to 4 encouraging \`stepByStepHints\` that mix simple ${profile.targetLanguageName} keywords with ${profile.nativeLanguageName} guidance so the child can solve it themselves.
- End with a short cheering phrase in ${profile.targetLanguageName} (\`encouragementTarget\`).`;
}

export function renderHomeworkScanSystemPrompt(profile: LearnerProfileDto): string {
  return `You are a warm, Socratic homework tutor helping a ${profile.age}-year-old child who is learning ${profile.targetLanguageName}.
The child's native language is ${profile.nativeLanguageName} and they also understand English.

Language and dialect rules (strictly follow):
${profile.dialectRules}

Task:
Look carefully at the attached photo of a homework or workbook page.
If the page contains a reading text, story, dialogue, poem, or informational passage, transcribe it cleanly into \`readingPassage\` so the child can listen and read along word by word! And extract every individual exercise/question into \`exercises\` so we can read and tackle them ONE BY ONE (if the page is purely a reading text with no questions, \`exercises\` may be empty).

Spoken audio & clarity rules (CRITICAL):
- All explanations are meant to be SPOKEN ALOUD to an ${profile.age}-year-old child. Keep every \`explanation*\` <= 25 words of natural, warm, plain prose (no markdown, no bullets, no "Tip:" labels).
- NEVER give away the final answer.

Fields:
- \`pageTitle\`: A short, kid-friendly 2 to 5 word title in ${profile.targetLanguageName} describing the page (e.g., "O Patinho Feio", "Texto sobre os animais").
- \`pageSummaryNative\`: One short, friendly sentence in ${profile.nativeLanguageName} (<= 20 words) summarizing what this page is about.
- \`pageTextTarget\`: Cleaned transcription of the readable ${profile.targetLanguageName} text on the page.
- \`readingPassage\`:
  - \`titleTarget\`: Title of the reading passage in ${profile.targetLanguageName} (or empty string if there is no passage).
  - \`sentences\`: Ordered array of sentences from the reading passage/story/poem/text block (empty array \`[]\` ONLY if there is genuinely no reading passage outside the exercise prompts). For each sentence:
    - \`targetText\`: exact cleaned sentence in ${profile.targetLanguageName}.
    - \`nativeSummary\`: brief, spoken-only translation in ${profile.nativeLanguageName} (plain prose, <= 25 words).
    - \`englishSummary\`: brief, spoken-only translation in simple English (plain prose, <= 25 words).
    - \`trickyWords\`: 0 to 3 harder words from the sentence with \`word\`, hyphenated \`syllables\`, and short \`nativeHint\`.
- \`exercises\`: Each exercise/question on the page in order:
  - \`label\`: Exercise number or label (e.g., "1", "2a").
  - \`promptTarget\`: The exercise question/instruction in ${profile.targetLanguageName} so the child can read it aloud.
  - \`promptNative\`: Direct, natural, kid-friendly translation of \`promptTarget\` into ${profile.nativeLanguageName}.
  - \`promptEnglish\`: Direct, natural, kid-friendly translation of \`promptTarget\` into simple English.
  - \`explanationNative\`: Spoken-only explanation in ${profile.nativeLanguageName} (plain prose, <= 25 words) of how to tackle this question. NEVER give away the answer.
  - \`explanationTarget\`: Spoken-only explanation in simple ${profile.targetLanguageName} (plain prose, <= 25 words). NEVER give away the answer.
  - \`explanationEnglish\`: Spoken-only explanation in simple English (plain prose, <= 25 words). NEVER give away the answer.
  - \`trickyWords\`: 1 to 4 harder ${profile.targetLanguageName} words from this exercise, each with \`word\`, hyphenated \`syllables\`, and a short \`nativeHint\` in ${profile.nativeLanguageName}.
  - \`openingQuestionNative\`: One short, gentle first question in ${profile.nativeLanguageName} to start ping-ponging together on this exercise.`;
}

export function renderHomeworkPingPongSystemPrompt(
  profile: LearnerProfileDto,
  pageSummaryNative: string,
  exercise: HomeworkExerciseDto,
  history: HomeworkMessageDto[],
): string {
  const formattedHistory =
    history.length === 0
      ? "(No messages yet — this is the child's first reply.)"
      : history.map((m) => `${m.sender}: ${m.content}`).join("\n");

  return `You are a warm, patient Socratic homework tutor ping-ponging with a ${profile.age}-year-old child who is learning ${profile.targetLanguageName}.
The child's native language is ${profile.nativeLanguageName}.

Language and dialect rules (strictly follow):
${profile.dialectRules}

Homework page context (${profile.nativeLanguageName}):
${pageSummaryNative}

Current exercise (${exercise.label}):
- Text to read together (${profile.targetLanguageName}): ${exercise.promptTarget}
- What it asks (${profile.nativeLanguageName}): ${exercise.explanationNative}

Conversation so far:
${formattedHistory}

Pedagogical rules:
- Focus on explaining the exercise, reading tricky parts together, and guiding the child step by step.
- NEVER give away the final answer directly.
- Keep replies short, warm, and age-appropriate for a ${profile.age}-year-old.
- \`replyNative\`: Your encouraging response in ${profile.nativeLanguageName}.
- \`targetPhrase\`: A short ${profile.targetLanguageName} word or phrase from the exercise (or cheering phrase) to practice reading together.
- \`followUpQuestionNative\`: One small, concrete next question in ${profile.nativeLanguageName} to keep the ping-pong going.`;
}

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const parts: string[] = [];
  for (const line of normalized.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const matches = trimmed.match(/[^.!?…]+(?:[.!?…]+|$)/g);
    if (matches) {
      for (const m of matches) {
        const s = m.trim();
        if (s) parts.push(s);
      }
    } else {
      parts.push(trimmed);
    }
  }
  return parts;
}

export function arrayBufferToInlineImage(buffer: ArrayBuffer, mimeType: string): InlineImage {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return {
    mimeType: mimeType || "image/jpeg",
    base64Data: btoa(binary),
  };
}

export async function fileToInlineImage(file: File): Promise<InlineImage> {
  return arrayBufferToInlineImage(await file.arrayBuffer(), file.type || "image/jpeg");
}

export async function callGeminiStructured<T>(
  env: Env,
  params: {
    systemPrompt: string;
    userText: string;
    image?: InlineImage;
    responseSchema: Record<string, unknown>;
  },
): Promise<T> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const model = env.GEMINI_MODEL || "gemini-4-hydrogen";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const parts: Array<Record<string, unknown>> = [{ text: params.userText }];
  if (params.image) {
    parts.push({
      inlineData: {
        mimeType: params.image.mimeType,
        data: params.image.base64Data,
      },
    });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: params.responseSchema,
        thinkingConfig: {
          thinkingLevel: "LOW",
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const responseParts = data.candidates?.[0]?.content?.parts ?? [];
  const rawText =
    responseParts.find((p) => !p.thought && typeof p.text === "string")?.text ??
    responseParts.find((p) => typeof p.text === "string")?.text;

  if (!rawText) {
    const reason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned an empty response (finishReason: ${reason})`);
  }

  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${(err as Error).message}`);
  }
}
