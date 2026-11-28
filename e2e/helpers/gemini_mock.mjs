function encodeBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/** Generate deterministic 16-bit LE mono PCM sine wave bytes. */
export function makePcm16Bytes(numSamples = 4800, sampleRate = 24000, freqHz = 440) {
  const pcm = new Uint8Array(numSamples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 12000);
    view.setInt16(i * 2, val, true);
  }
  return pcm;
}

/** Build a RIFF WAV with optional extra metadata chunks (e.g. JUNK, LIST) before the `data` chunk. */
export function makeRiffWavWithExtraChunks(pcm, sampleRate = 24000, includeExtraChunks = false) {
  const extraChunks = [];
  if (includeExtraChunks) {
    const junkPayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const junk = new Uint8Array(8 + junkPayload.length);
    junk.set(Buffer.from("JUNK"), 0);
    new DataView(junk.buffer).setUint32(4, junkPayload.length, true);
    junk.set(junkPayload, 8);
    extraChunks.push(junk);

    const listPayload = Buffer.from("INFOISFTabcd");
    const list = new Uint8Array(8 + listPayload.length);
    list.set(Buffer.from("LIST"), 0);
    new DataView(list.buffer).setUint32(4, listPayload.length, true);
    list.set(listPayload, 8);
    extraChunks.push(list);
  }

  const extraLen = extraChunks.reduce((s, c) => s + c.byteLength, 0);
  const totalPayload = 4 + 24 + extraLen + 8 + pcm.byteLength;
  const wav = new Uint8Array(8 + totalPayload);
  const view = new DataView(wav.buffer);

  wav.set(Buffer.from("RIFF"), 0);
  view.setUint32(4, totalPayload, true);
  wav.set(Buffer.from("WAVE"), 8);
  wav.set(Buffer.from("fmt "), 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  let offset = 36;
  for (const ch of extraChunks) {
    wav.set(ch, offset);
    offset += ch.byteLength;
  }
  wav.set(Buffer.from("data"), offset);
  view.setUint32(offset + 4, pcm.byteLength, true);
  wav.set(pcm, offset + 8);
  return wav;
}

export function defaultReadingFixture() {
  return {
    fullText: "O gato preto dorme na almofada macia. A Sofia lê um livro divertido.",
    sentences: [
      {
        targetText: "O gato preto dorme na almofada macia.",
        nativeSummary: "Den svarte katten sover på den myke puten.",
        englishSummary: "The black cat sleeps on the soft cushion.",
        trickyWords: [
          { word: "almofada", syllables: "al-mo-fa-da", nativeHint: "Betyr pute (cushion)" },
          { word: "macia", syllables: "ma-ci-a", nativeHint: "Betyr myk (soft)" },
        ],
      },
      {
        targetText: "A Sofia lê um livro divertido.",
        nativeSummary: "Sofia leser en morsom bok.",
        englishSummary: "Sofia reads a fun book.",
        trickyWords: [
          { word: "divertido", syllables: "di-ver-ti-do", nativeHint: "Betyr morsom (fun)" },
        ],
      },
    ],
  };
}

export function defaultHomeworkScanFixture() {
  return {
    pageTitle: "O Patinho Curioso",
    pageSummaryNative: "En liten historie om en nysgjerrig andunge og to oppgaver.",
    pageTextTarget: "O patinho anda perto do lago azul. Ele vê uma borboleta amarela.",
    readingPassage: {
      titleTarget: "O Patinho e a Borboleta",
      sentences: [
        {
          targetText: "O patinho anda perto do lago azul.",
          nativeSummary: "Andungen går nær den blå innsjøen.",
          englishSummary: "The duckling walks near the blue lake.",
          trickyWords: [
            { word: "patinho", syllables: "pa-ti-nho", nativeHint: "Liten and (duckling)" },
          ],
        },
        {
          targetText: "Ele vê uma borboleta amarela.",
          nativeSummary: "Han ser en gul sommerfugl.",
          englishSummary: "He sees a yellow butterfly.",
          trickyWords: [
            { word: "borboleta", syllables: "bor-bo-le-ta", nativeHint: "Sommerfugl (butterfly)" },
          ],
        },
      ],
    },
    exercises: [
      {
        label: "1",
        promptTarget: "Onde anda o patinho no texto?",
        promptNative: "Hvor går andungen i teksten?",
        promptEnglish: "Where does the duckling walk in the text?",
        explanationNative: "Se på den første setningen i teksten for å finne stedet ved vannet.",
        explanationTarget: "Olha para a primeira frase do texto para encontrar o lugar perto da água.",
        explanationEnglish: "Look at the first sentence of the text to find the place near the water.",
        trickyWords: [
          { word: "patinho", syllables: "pa-ti-nho", nativeHint: "Liten and (duckling)" },
          { word: "lago", syllables: "la-go", nativeHint: "Innsjø (lake)" },
        ],
        openingQuestionNative: "Hvilket ord i den første setningen forteller hvor andungen går?",
      },
      {
        label: "2",
        promptTarget: "De que cor é a borboleta?",
        promptNative: "Hvilken farge har sommerfuglen?",
        promptEnglish: "What color is the butterfly?",
        explanationNative: "Les den andre setningen nøye og finn fargeordet etter borboleta.",
        explanationTarget: "Lê a segunda frase com atenção e procura a cor depois de borboleta.",
        explanationEnglish: "Read the second sentence carefully and find the color word after butterfly.",
        trickyWords: [
          { word: "borboleta", syllables: "bor-bo-le-ta", nativeHint: "Sommerfugl (butterfly)" },
          { word: "amarela", syllables: "a-ma-re-la", nativeHint: "Gul (yellow)" },
        ],
        openingQuestionNative: "Klarer du å finne fargen i den siste setningen?",
      },
    ],
  };
}

export function createGeminiMock() {
  const originalFetch = globalThis.fetch;
  let installed = false;
  const requests = [];
  let scenario = {};

  function reset() {
    requests.length = 0;
    scenario = {
      readingResponse: null,
      homeworkScanResponse: null,
      homeworkHelpResponse: null,
      passageHydrateResponse: null,
      exerciseHydrateResponse: null,
      homeworkReplyResponse: null,
      // Error / fault injection
      structuredErrorStatus: null,
      structuredInvalidJson: false,
      structuredEmpty: false,
      // Audio TTS modes: "ok" | "fail_400_then_ok" | "fail_429_lite" | "fail_429_all" | "fail_500"
      ttsMode: "ok",
      // Streaming modes: "pcm24k" | "pcm16k" | "riff_junk_24k" | "short1word" | "fail_429_lite" | "fail_429_all" | "fail_500"
      streamMode: "pcm24k",
      // Cloud TTS modes: "ok" | "fail_500"
      cloudTtsMode: "ok",
      customHandler: null,
    };
  }

  reset();

  function setScenario(patch = {}) {
    scenario = { ...scenario, ...patch };
  }

  function classifyStructuredRequest(bodyJson) {
    const sys = bodyJson?.systemInstruction?.parts?.[0]?.text ?? "";
    const props = bodyJson?.generationConfig?.responseSchema?.properties ?? {};
    if ("fullText" in props) return "reading_scan";
    if ("readingPassage" in props) return "homework_scan";
    if ("taskExplanationNative" in props) return "homework_help";
    if ("replyNative" in props) return "homework_reply";
    if ("titleTarget" in props) return "passage_hydrate";
    if ("promptNative" in props && "explanationTarget" in props) return "exercise_hydrate";
    if (sys.includes("reading")) return "reading_scan";
    return "unknown";
  }

  function makeGeminiJsonResponse(payloadObj) {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: JSON.stringify(payloadObj) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function handleStructured(url, bodyJson) {
    if (scenario.structuredErrorStatus) {
      return new Response(
        JSON.stringify({ error: { message: `Injected Gemini ${scenario.structuredErrorStatus}` } }),
        { status: scenario.structuredErrorStatus, headers: { "Content-Type": "application/json" } },
      );
    }
    if (scenario.structuredInvalidJson) {
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{not-valid-json" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (scenario.structuredEmpty) {
      return new Response(
        JSON.stringify({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const kind = classifyStructuredRequest(bodyJson);
    if (kind === "reading_scan") {
      const payload =
        typeof scenario.readingResponse === "function"
          ? scenario.readingResponse(bodyJson, url)
          : scenario.readingResponse ?? defaultReadingFixture();
      return makeGeminiJsonResponse(payload);
    }
    if (kind === "homework_scan") {
      const payload =
        typeof scenario.homeworkScanResponse === "function"
          ? scenario.homeworkScanResponse(bodyJson, url)
          : scenario.homeworkScanResponse ?? defaultHomeworkScanFixture();
      return makeGeminiJsonResponse(payload);
    }
    if (kind === "homework_help") {
      const payload = scenario.homeworkHelpResponse ?? {
        taskExplanationNative: "Les oppgaven sakte og finn nøkkelordet.",
        stepByStepHints: ["Se på første setning.", "Let etter ordet patinho."],
        encouragementTarget: "Muito bem, Sofia!",
      };
      return makeGeminiJsonResponse(payload);
    }
    if (kind === "passage_hydrate") {
      const payload = scenario.passageHydrateResponse ?? {
        titleTarget: "Texto de Leitura",
        sentences: [
          {
            targetText: "O gato dorme.",
            nativeSummary: "Katten sover.",
            englishSummary: "The cat sleeps.",
            trickyWords: [],
          },
        ],
      };
      return makeGeminiJsonResponse(payload);
    }
    if (kind === "exercise_hydrate") {
      const payload = scenario.exerciseHydrateResponse ?? {
        promptNative: "Hva betyr denne oppgaven?",
        promptEnglish: "What does this exercise ask?",
        explanationTarget: "Olha para o texto com calma.",
        explanationEnglish: "Look at the text carefully.",
      };
      return makeGeminiJsonResponse(payload);
    }
    if (kind === "homework_reply") {
      const payload =
        typeof scenario.homeworkReplyResponse === "function"
          ? scenario.homeworkReplyResponse(bodyJson, url)
          : scenario.homeworkReplyResponse ?? {
              replyNative: "Kjempebra forsøk! Du er veldig nær.",
              targetPhrase: "perto do lago azul",
              followUpQuestionNative: "Hvilket ord i teksten betyr innsjø?",
            };
      return makeGeminiJsonResponse(payload);
    }

    return makeGeminiJsonResponse({});
  }

  function handleGeminiTtsGenerate(url, bodyJson) {
    const mode = scenario.ttsMode;
    const isLite = url.includes("flash-lite-tts");
    const hasLangCode = Boolean(bodyJson?.generationConfig?.speechConfig?.languageCode);

    if (mode === "fail_500") {
      return new Response(JSON.stringify({ error: { message: "TTS 500" } }), { status: 500 });
    }
    if (mode === "fail_429_all") {
      return new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), { status: 429 });
    }
    if (mode === "fail_429_lite" && isLite) {
      return new Response(JSON.stringify({ error: { message: "Lite quota exceeded" } }), { status: 429 });
    }
    if (mode === "fail_400_then_ok" && hasLangCode) {
      return new Response(JSON.stringify({ error: { message: "languageCode unsupported" } }), {
        status: 400,
      });
    }

    const pcm = makePcm16Bytes(4800, 24000);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/pcm",
                    data: encodeBase64(pcm),
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function handleGeminiTtsStream(url, bodyJson) {
    const mode = scenario.streamMode;
    const isLite = url.includes("flash-lite-tts");
    const hasLangCode = Boolean(bodyJson?.generationConfig?.speechConfig?.languageCode);

    if (mode === "fail_500") {
      return new Response(JSON.stringify({ error: { message: "Stream 500" } }), { status: 500 });
    }
    if (mode === "fail_429_all") {
      return new Response(JSON.stringify({ error: { message: "Stream 429" } }), { status: 429 });
    }
    if (mode === "fail_429_lite" && isLite) {
      return new Response(JSON.stringify({ error: { message: "Lite stream 429" } }), { status: 429 });
    }
    if (mode === "fail_400_then_ok" && hasLangCode) {
      return new Response(JSON.stringify({ error: { message: "languageCode unsupported" } }), {
        status: 400,
      });
    }

    let chunks = [];
    let mimeType = "audio/l16;rate=24000;channels=1";

    if (mode === "pcm16k") {
      mimeType = "audio/l16;rate=16000;channels=1";
      const pcm = makePcm16Bytes(3200, 16000);
      chunks = [pcm.slice(0, 3200), pcm.slice(3200)];
    } else if (mode === "riff_junk_24k") {
      mimeType = "audio/wav";
      const pcm = makePcm16Bytes(2400, 24000);
      const wavWithJunk = makeRiffWavWithExtraChunks(pcm, 24000, true);
      chunks = [wavWithJunk];
    } else if (mode === "short1word") {
      // Short 1-word clip (< 2400 bytes PCM)
      const pcm = makePcm16Bytes(400, 24000);
      chunks = [pcm];
    } else {
      // Default pcm24k multi-chunk SSE
      const pcm1 = makePcm16Bytes(2400, 24000);
      const pcm2 = makePcm16Bytes(2400, 24000);
      chunks = [pcm1, pcm2];
    }

    const sseBody = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          const event = `data: ${JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType,
                        data: encodeBase64(chunk),
                      },
                    },
                  ],
                },
              },
            ],
          })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }

  function handleCloudTts() {
    if (scenario.cloudTtsMode === "fail_500") {
      return new Response(JSON.stringify({ error: { message: "Cloud TTS 500" } }), { status: 500 });
    }
    // Minimal synthetic MP3-like frame header (ID3 / MPEG sync) for unmistakable MP3 vs WAV identification
    const fakeMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x64]);
    return new Response(
      JSON.stringify({ audioContent: encodeBase64(fakeMp3) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function install() {
    if (installed) return;
    installed = true;
    globalThis.fetch = async (input, init) => {
      const urlStr = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const parsed = new URL(urlStr);

      // Leave local loopback traffic untouched
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        return originalFetch(input, init);
      }

      if (
        parsed.hostname === "generativelanguage.googleapis.com" ||
        parsed.hostname === "texttospeech.googleapis.com"
      ) {
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        const headersObj = {};
        if (init?.headers) {
          new Headers(init.headers).forEach((v, k) => {
            headersObj[k] = v;
          });
        }
        let bodyText = "";
        if (typeof init?.body === "string") {
          bodyText = init.body;
        }
        let bodyJson = null;
        try {
          if (bodyText) bodyJson = JSON.parse(bodyText);
        } catch {}

        const record = {
          url: urlStr,
          hostname: parsed.hostname,
          pathname: parsed.pathname,
          method,
          headers: headersObj,
          bodyJson,
        };
        requests.push(record);

        if (typeof scenario.customHandler === "function") {
          const customRes = await scenario.customHandler(record);
          if (customRes) return customRes;
        }

        if (parsed.hostname === "texttospeech.googleapis.com") {
          return handleCloudTts();
        }

        if (urlStr.includes(":streamGenerateContent")) {
          return handleGeminiTtsStream(urlStr, bodyJson);
        }

        if (urlStr.includes("-tts:") || (bodyJson?.generationConfig?.responseModalities ?? []).includes("AUDIO")) {
          return handleGeminiTtsGenerate(urlStr, bodyJson);
        }

        return handleStructured(urlStr, bodyJson);
      }

      throw new Error(`Unexpected external network request in E2E test: ${urlStr}`);
    };
  }

  function restore() {
    if (!installed) return;
    globalThis.fetch = originalFetch;
    installed = false;
  }

  return {
    install,
    restore,
    reset,
    setScenario,
    getRequests() {
      return requests.slice();
    },
    clearRequests() {
      requests.length = 0;
    },
  };
}
