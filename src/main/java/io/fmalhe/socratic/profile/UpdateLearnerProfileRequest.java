package io.fmalhe.socratic.profile;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record UpdateLearnerProfileRequest(
        @NotBlank String name,
        @Min(3) @Max(18) int age,
        @NotBlank String targetLanguageCode,
        @NotBlank String targetLanguageName,
        @NotBlank String nativeLanguageCode,
        @NotBlank String nativeLanguageName,
        @NotBlank String dialectRules,
        @NotBlank String ttsVoiceName) {
}
