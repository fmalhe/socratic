package io.fmalhe.socratic.audio;

import io.fmalhe.socratic.profile.LanguageCode;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.util.Optional;

@NullMarked
@Getter
@RequiredArgsConstructor
public final class SpeakRequest {

    private final @NotBlank String text;
    private final @Nullable LanguageCode languageCode;
    private final boolean slow;

    public Optional<LanguageCode> getLanguageCode() {
        return Optional.ofNullable(languageCode);
    }
}
