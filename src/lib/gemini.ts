import type { Env, HomeworkExerciseDto, HomeworkMessageDto, LearnerProfileDto } from "../types";

export interface InlineImage {
  mimeType: string;
  base64Data: string;
}

export function renderReadingSystemPrompt(profile: LearnerProfileDto): string {
  return `You are a warm, encouraging reading tutor helping a ${profile.age}-year-old child learn ${profile.targetLanguageName}.
The child's native language is ${profile.nativeLanguageName}.

Language and dialect rules (strictly follow):
${profile.dialectRules}

Task:
1. Carefully transcribe and clean all readable ${profile.targetLanguageName} text from the attached book page image into \`fullText\`.
2. Split the text into short, readable sentences in \`sentences\`.
3. For each sentence:
   - \`targetText\`: the sentence in ${profile.targetLanguageName}.
   - \`nativeSummary\`: a brief, kid-friendly translation or summary in ${profile.nativeLanguageName}.
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
The child's native language is ${profile.nativeLanguageName}.

Language and dialect rules (strictly follow):
${profile.dialectRules}

Task:
Look at the attached photo of a homework page and break it into individual exercises so we can read and tackle them ONE BY ONE.
Keep explanations SHORT and simple (1 to 2 brief sentences max) so a ${profile.age}-year-old isn't overwhelmed by text.
- \`pageSummaryNative\`: One short, friendly sentence in ${profile.nativeLanguageName} of what this page is about.
- \`pageTextTarget\`: Cleaned transcription of the readable ${profile.targetLanguageName} text on the page.
- \`exercises\`: Each exercise on the page in order:
  - \`label\`: Exercise number or label (e.g., "1", "2a").
  - \`promptTarget\`: The exercise question/instruction in ${profile.targetLanguageName} so the child can read it aloud.
  - \`explanationNative\`: A short, super clear 1–2 sentence spoken explanation in ${profile.nativeLanguageName} of what to do. NEVER give away the final answer.
  - \`explanationTarget\`: The same short, kid-friendly 1–2 sentence spoken explanation in simple ${profile.targetLanguageName}. NEVER give away the final answer.
  - \`explanationEnglish\`: The same short, kid-friendly 1–2 sentence spoken explanation in simple English. NEVER give away the final answer.
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

export async function fileToInlineImage(file: File): Promise<InlineImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return {
    mimeType: file.type || "image/jpeg",
    base64Data: btoa(binary),
  };
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

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
    headers: { "Content-Type": "application/json" },
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
