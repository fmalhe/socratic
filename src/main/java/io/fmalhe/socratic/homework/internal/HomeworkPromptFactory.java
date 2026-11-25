package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.HomeworkExerciseDto;
import io.fmalhe.socratic.homework.HomeworkMessageDto;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import org.jspecify.annotations.NullMarked;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@NullMarked
@Component
public class HomeworkPromptFactory {

    private static final String HELP_TEMPLATE = """
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

    private static final String SCAN_PAGE_TEMPLATE = """
            You are a warm, Socratic homework tutor helping a {age}-year-old child who is learning {targetLanguageName}.
            The child's native language is {nativeLanguageName}.

            Language and dialect rules (strictly follow):
            {dialectRules}

            Task:
            Look at the attached photo of a homework page and break it into individual exercises so we can read and tackle them ONE BY ONE.
            - `pageSummaryNative`: A short, friendly overview in {nativeLanguageName} of what this page is about.
            - `pageTextTarget`: Cleaned transcription of the readable {targetLanguageName} text on the page.
            - `exercises`: Each exercise on the page in order:
              - `label`: Exercise number or label (e.g., "1", "2a").
              - `promptTarget`: The exercise question/instruction in {targetLanguageName} so the child can read it aloud.
              - `explanationNative`: A clear, kid-friendly explanation in {nativeLanguageName} of what this exercise is asking. NEVER give away the final answer.
              - `trickyWords`: 1 to 4 harder {targetLanguageName} words from this exercise, each with `word`, hyphenated `syllables`, and a short `nativeHint` in {nativeLanguageName}.
              - `openingQuestionNative`: A short, gentle first question in {nativeLanguageName} to start ping-ponging together on this exercise.
            """;

    private static final String PING_PONG_TEMPLATE = """
            You are a warm, patient Socratic homework tutor ping-ponging with a {age}-year-old child who is learning {targetLanguageName}.
            The child's native language is {nativeLanguageName}.

            Language and dialect rules (strictly follow):
            {dialectRules}

            Homework page context ({nativeLanguageName}):
            {pageSummaryNative}

            Current exercise ({exerciseLabel}):
            - Text to read together ({targetLanguageName}): {promptTarget}
            - What it asks ({nativeLanguageName}): {explanationNative}

            Conversation so far:
            {conversationHistory}

            Pedagogical rules:
            - Focus on explaining the exercise, reading tricky parts together, and guiding the child step by step.
            - NEVER give away the final answer directly.
            - Keep replies short, warm, and age-appropriate for a {age}-year-old.
            - `replyNative`: Your encouraging response in {nativeLanguageName}.
            - `targetPhrase`: A short {targetLanguageName} word or phrase from the exercise (or cheering phrase) to practice reading together.
            - `followUpQuestionNative`: One small, concrete next question in {nativeLanguageName} to keep the ping-pong going.
            """;

    String renderSystemPrompt(LearnerProfileDto profile) {
        return new PromptTemplate(HELP_TEMPLATE).render(Map.of(
                "age", profile.age().value(),
                "targetLanguageName", profile.targetLanguageName(),
                "nativeLanguageName", profile.nativeLanguageName(),
                "dialectRules", profile.dialectRules()));
    }

    String renderScanPageSystemPrompt(LearnerProfileDto profile) {
        return new PromptTemplate(SCAN_PAGE_TEMPLATE).render(Map.of(
                "age", profile.age().value(),
                "targetLanguageName", profile.targetLanguageName(),
                "nativeLanguageName", profile.nativeLanguageName(),
                "dialectRules", profile.dialectRules()));
    }

    String renderExercisePingPongSystemPrompt(
            LearnerProfileDto profile,
            String pageSummaryNative,
            HomeworkExerciseDto exercise,
            List<HomeworkMessageDto> history) {
        var formattedHistory = history.isEmpty()
                ? "(No messages yet — this is the child's first reply.)"
                : history.stream()
                        .map(m -> m.sender().name() + ": " + m.content())
                        .collect(Collectors.joining("\n"));
        return new PromptTemplate(PING_PONG_TEMPLATE).render(Map.of(
                "age", profile.age().value(),
                "targetLanguageName", profile.targetLanguageName(),
                "nativeLanguageName", profile.nativeLanguageName(),
                "dialectRules", profile.dialectRules(),
                "pageSummaryNative", pageSummaryNative,
                "exerciseLabel", exercise.label(),
                "promptTarget", exercise.promptTarget(),
                "explanationNative", exercise.explanationNative(),
                "conversationHistory", formattedHistory));
    }
}
