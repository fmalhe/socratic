package io.fmalhe.socratic.profile;

import org.jspecify.annotations.NullMarked;

@NullMarked
public record LearnerProfileDto(
        long id,
        String name,
        int age,
        String targetLanguageCode,
        String targetLanguageName,
        String nativeLanguageCode,
        String nativeLanguageName,
        String dialectRules,
        String ttsVoiceName) {
}
