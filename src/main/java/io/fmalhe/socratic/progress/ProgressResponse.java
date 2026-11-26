package io.fmalhe.socratic.progress;

import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.ProfileId;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@NullMarked
@Getter
@RequiredArgsConstructor
public final class ProgressResponse {

    private final ProfileId profileId;
    private final int totalStars;
    private final int currentStreakDays;
    private final @Nullable LocalDate lastActivityDate;
    private final int pagesReadCount;
    private final List<SavedWordDto> recentWords;

    public Optional<LocalDate> getLastActivityDate() {
        return Optional.ofNullable(lastActivityDate);
    }

    public List<SavedWordDto> getRecentWords() {
        return List.copyOf(recentWords);
    }

    @NullMarked
    public record SavedWordDto(
            long id,
            String word,
            LanguageCode languageCode,
            String createdAt) {
    }
}
