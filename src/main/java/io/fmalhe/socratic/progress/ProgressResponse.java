package io.fmalhe.socratic.progress;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.ProfileId;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@NullMarked
public final class ProgressResponse {

    private final ProfileId profileId;
    private final int totalStars;
    private final int currentStreakDays;
    private final @Nullable LocalDate lastActivityDate;
    private final int pagesReadCount;
    private final List<SavedWordDto> recentWords;

    public ProgressResponse(
            ProfileId profileId,
            int totalStars,
            int currentStreakDays,
            @Nullable LocalDate lastActivityDate,
            int pagesReadCount,
            List<SavedWordDto> recentWords) {
        this.profileId = profileId;
        this.totalStars = totalStars;
        this.currentStreakDays = currentStreakDays;
        this.lastActivityDate = lastActivityDate;
        this.pagesReadCount = pagesReadCount;
        this.recentWords = List.copyOf(recentWords);
    }

    @JsonProperty("profileId")
    public ProfileId profileId() {
        return profileId;
    }

    @JsonProperty("totalStars")
    public int totalStars() {
        return totalStars;
    }

    @JsonProperty("currentStreakDays")
    public int currentStreakDays() {
        return currentStreakDays;
    }

    @JsonProperty("lastActivityDate")
    public Optional<LocalDate> lastActivityDate() {
        return Optional.ofNullable(lastActivityDate);
    }

    @JsonProperty("pagesReadCount")
    public int pagesReadCount() {
        return pagesReadCount;
    }

    @JsonProperty("recentWords")
    public List<SavedWordDto> recentWords() {
        return recentWords;
    }

    @NullMarked
    public record SavedWordDto(
            long id,
            String word,
            LanguageCode languageCode,
            String createdAt) {
    }
}
