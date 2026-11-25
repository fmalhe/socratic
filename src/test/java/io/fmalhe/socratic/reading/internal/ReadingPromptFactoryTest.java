package io.fmalhe.socratic.reading.internal;

import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReadingPromptFactoryTest {

    private final ReadingPromptFactory factory = new ReadingPromptFactory();

    @Test
    void injectsProfileLanguageAndDialectRulesDynamically() {
        var profile = new LearnerProfileDto(
                ProfileId.of(2L),
                "Kenji",
                Age.of(10),
                LanguageCode.of("ja-JP"),
                "Japanese",
                LanguageCode.of("en-GB"),
                "British English",
                "Use polite desu/masu forms.",
                TtsVoiceName.of("ja-JP-Wavenet-A"));

        var prompt = factory.renderSystemPrompt(profile);

        assertThat(prompt)
                .contains("10-year-old")
                .contains("Japanese")
                .contains("British English")
                .contains("Use polite desu/masu forms.");
    }
}
