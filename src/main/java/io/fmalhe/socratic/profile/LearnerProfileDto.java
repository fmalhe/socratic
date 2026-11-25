package io.fmalhe.socratic.profile;

import org.jspecify.annotations.NullMarked;

@NullMarked
public record LearnerProfileDto(
        ProfileId id,
        String name,
        Age age,
        LanguageCode targetLanguageCode,
        String targetLanguageName,
        LanguageCode nativeLanguageCode,
        String nativeLanguageName,
        String dialectRules,
        TtsVoiceName ttsVoiceName) {
}
