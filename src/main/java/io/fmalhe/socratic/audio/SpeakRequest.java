package io.fmalhe.socratic.audio;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.fmalhe.socratic.profile.LanguageCode;
import jakarta.validation.constraints.NotBlank;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.util.Optional;

@NullMarked
public final class SpeakRequest {

    private final @NotBlank String text;
    private final @Nullable LanguageCode languageCode;
    private final boolean slow;

    @JsonCreator
    public SpeakRequest(
            @JsonProperty("text") String text,
            @JsonProperty("languageCode") @Nullable LanguageCode languageCode,
            @JsonProperty("slow") boolean slow) {
        this.text = text;
        this.languageCode = languageCode;
        this.slow = slow;
    }

    public String text() {
        return text;
    }

    public Optional<LanguageCode> languageCode() {
        return Optional.ofNullable(languageCode);
    }

    public boolean slow() {
        return slow;
    }
}
