package io.fmalhe.socratic.profile;

import com.fasterxml.jackson.annotation.JsonValue;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record LanguageCode(@JsonValue String value) {

    public LanguageCode {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("LanguageCode must not be blank");
        }
        value = value.trim();
    }

    public static LanguageCode of(String value) {
        return new LanguageCode(value);
    }

    public static LanguageCode valueOf(String value) {
        return of(value);
    }
}
