package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HomeworkPromptFactoryTest {

    private final HomeworkPromptFactory factory = new HomeworkPromptFactory();

    @Test
    void injectsProfileLanguageAndDialectRulesDynamically() {
        var profile = new LearnerProfileDto(
                ProfileId.of(1L),
                "Sofia",
                Age.of(8),
                LanguageCode.of("pt-PT"),
                "European Portuguese",
                LanguageCode.of("nb-NO"),
                "Norwegian",
                "Use tu forms and PT-PT vocabulary.",
                TtsVoiceName.of("pt-PT-Wavenet-A"));

        var prompt = factory.renderSystemPrompt(profile);

        assertThat(prompt)
                .contains("8-year-old")
                .contains("European Portuguese")
                .contains("Norwegian")
                .contains("Use tu forms and PT-PT vocabulary.")
                .contains("NEVER give away the final answer");
    }
}
