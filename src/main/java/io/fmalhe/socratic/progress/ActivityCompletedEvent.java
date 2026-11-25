package io.fmalhe.socratic.progress;

import org.jspecify.annotations.NullMarked;

import java.time.LocalDate;
import java.util.List;

@NullMarked
public record ActivityCompletedEvent(
        long profileId,
        ActivityType activityType,
        int starsEarned,
        List<String> trickyWords,
        LocalDate activityDate) {
}
