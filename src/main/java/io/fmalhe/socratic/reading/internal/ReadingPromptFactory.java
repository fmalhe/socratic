package io.fmalhe.socratic.reading.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import org.jspecify.annotations.NullMarked;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@NullMarked
@Component
public class ReadingPromptFactory {

    private static final String TEMPLATE = """
            You are a warm, encouraging reading tutor helping a {age}-year-old child learn {targetLanguageName}.
            The child's native language is {nativeLanguageName}.

            Language and dialect rules (strictly follow):
            {dialectRules}

            Task:
            1. Carefully transcribe and clean all readable {targetLanguageName} text from the attached book page image into `fullText`.
            2. Split the text into short, readable sentences in `sentences`.
            3. For each sentence:
               - `targetText`: the sentence in {targetLanguageName}.
               - `nativeSummary`: a brief, kid-friendly translation or summary in {nativeLanguageName}.
               - `trickyWords`: pick 2 to 4 harder words from that sentence, each with:
                 - `word`: the word as written
                 - `syllables`: syllable breakdown separated by hyphens (e.g., "bo-rbo-le-ta")
                 - `nativeHint`: a short, encouraging meaning hint in {nativeLanguageName}
            """;

    String renderSystemPrompt(LearnerProfileDto profile) {
        return new PromptTemplate(TEMPLATE).render(Map.of(
                "age", profile.age().value(),
                "targetLanguageName", profile.targetLanguageName(),
                "nativeLanguageName", profile.nativeLanguageName(),
                "dialectRules", profile.dialectRules()));
    }
}
