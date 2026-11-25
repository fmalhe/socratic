package io.fmalhe.socratic.audio;

import jakarta.validation.constraints.NotBlank;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

@NullMarked
public record SpeakRequest(
        @NotBlank String text,
        @Nullable String languageCode,
        boolean slow) {
}
