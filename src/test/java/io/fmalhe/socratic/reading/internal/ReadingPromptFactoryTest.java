package io.fmalhe.socratic.reading.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReadingPromptFactoryTest {

    private final ReadingPromptFactory factory = new ReadingPromptFactory();

    @Test
    void injectsProfileLanguageAndDialectRulesDynamically() {
        LearnerProfileDto profile = new LearnerProfileDto(
                2L,
                "Kenji",
                10,
                "ja-JP",
                "Japanese",
                "en-GB",
                "British English",
                "Use polite desu/masu forms.",
                "ja-JP-Wavenet-A");

        String prompt = factory.renderSystemPrompt(profile);

        assertThat(prompt)
                .contains("10-year-old")
                .contains("Japanese")
                .contains("British English")
                .contains("Use polite desu/masu forms.");
    }
}
