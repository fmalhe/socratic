package io.fmalhe.socratic.progress;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.NullMarked;

import java.util.List;

@NullMarked
public record CompleteActivityRequest(
        @NotNull ActivityType activityType,
        @Min(0) int starsEarned,
        List<String> trickyWords) {

    public CompleteActivityRequest {
        trickyWords = trickyWords == null ? List.of() : List.copyOf(trickyWords);
    }
}
