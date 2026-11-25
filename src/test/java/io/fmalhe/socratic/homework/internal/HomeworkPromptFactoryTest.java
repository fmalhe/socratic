package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HomeworkPromptFactoryTest {

    private final HomeworkPromptFactory factory = new HomeworkPromptFactory();

    @Test
    void injectsProfileLanguageAndDialectRulesDynamically() {
        LearnerProfileDto profile = new LearnerProfileDto(
                1L,
                "Sofia",
                8,
                "pt-PT",
                "European Portuguese",
                "nb-NO",
                "Norwegian",
                "Use tu forms and PT-PT vocabulary.",
                "pt-PT-Wavenet-A");

        String prompt = factory.renderSystemPrompt(profile);

        assertThat(prompt)
                .contains("8-year-old")
                .contains("European Portuguese")
                .contains("Norwegian")
                .contains("Use tu forms and PT-PT vocabulary.")
                .contains("NEVER give away the final answer");
    }
}
