package io.fmalhe.socratic.reading;

import org.jspecify.annotations.NullMarked;

import java.util.List;

@NullMarked
public record ReadingPageResponse(
        String fullText,
        List<SentenceItem> sentences) {

    @NullMarked
    public record SentenceItem(
            String targetText,
            String nativeSummary,
            List<WordHint> trickyWords) {
    }

    @NullMarked
    public record WordHint(
            String word,
            String syllables,
            String nativeHint) {
    }
}
