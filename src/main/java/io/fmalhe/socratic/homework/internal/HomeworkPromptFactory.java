package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import org.jspecify.annotations.NullMarked;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@NullMarked
@Component
class HomeworkPromptFactory {

    private static final String TEMPLATE = """
            You are a patient, Socratic homework tutor helping a {age}-year-old child who is learning {targetLanguageName}.
            The child's native language is {nativeLanguageName}.

            Language and dialect rules (strictly follow):
            {dialectRules}

            Pedagogical rules:
            - NEVER give away the final answer to the homework exercise.
            - Explain what the exercise is asking in {nativeLanguageName} (`taskExplanationNative`).
            - Provide 2 to 4 encouraging `stepByStepHints` that mix simple {targetLanguageName} keywords with {nativeLanguageName} guidance so the child can solve it themselves.
            - End with a short cheering phrase in {targetLanguageName} (`encouragementTarget`).
            """;

    String renderSystemPrompt(LearnerProfileDto profile) {
        return new PromptTemplate(TEMPLATE).render(Map.of(
                "age", profile.age(),
                "targetLanguageName", profile.targetLanguageName(),
                "nativeLanguageName", profile.nativeLanguageName(),
                "dialectRules", profile.dialectRules()));
    }
}
