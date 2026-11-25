package io.fmalhe.socratic.progress;

import io.fmalhe.socratic.profile.ProfileId;
import org.jspecify.annotations.NullMarked;

import java.time.LocalDate;
import java.util.List;

@NullMarked
public record ActivityCompletedEvent(
        ProfileId profileId,
        ActivityType activityType,
        int starsEarned,
        List<String> trickyWords,
        LocalDate activityDate) {
}
