package io.fmalhe.socratic.profile;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record UpdateLearnerProfileRequest(
        @NotBlank String name,
        @NotNull Age age,
        @NotNull LanguageCode targetLanguageCode,
        @NotBlank String targetLanguageName,
        @NotNull LanguageCode nativeLanguageCode,
        @NotBlank String nativeLanguageName,
        @NotBlank String dialectRules,
        @NotNull TtsVoiceName ttsVoiceName) {
}
