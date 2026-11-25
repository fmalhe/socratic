package io.fmalhe.socratic.progress;

import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.util.List;

@NullMarked
public record ProgressResponse(
        long profileId,
        int totalStars,
        int currentStreakDays,
        @Nullable String lastActivityDate,
        int pagesReadCount,
        List<SavedWordDto> recentWords) {

    @NullMarked
    public record SavedWordDto(
            long id,
            String word,
            String languageCode,
            String createdAt) {
    }
}
