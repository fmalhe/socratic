package io.fmalhe.socratic.profile;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record TtsVoiceName(@JsonValue String value) {

    public TtsVoiceName {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("TtsVoiceName must not be blank");
        }
        value = value.trim();
    }

    @JsonCreator
    public static TtsVoiceName of(String value) {
        return new TtsVoiceName(value);
    }
}
