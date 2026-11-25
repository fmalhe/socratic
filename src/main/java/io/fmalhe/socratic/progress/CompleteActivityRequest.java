package io.fmalhe.socratic.progress;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.util.List;

@NullMarked
public record CompleteActivityRequest(
        @NotNull ActivityType activityType,
        @Min(0) int starsEarned,
        @Nullable List<String> trickyWords) {
}
