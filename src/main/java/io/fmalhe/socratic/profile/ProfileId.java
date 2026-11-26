package io.fmalhe.socratic.profile;

import com.fasterxml.jackson.annotation.JsonValue;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record ProfileId(@JsonValue long value) {

    public static final ProfileId DEFAULT = new ProfileId(1L);

    public ProfileId {
        if (value <= 0) {
            throw new IllegalArgumentException("ProfileId must be positive, got: " + value);
        }
    }

    public static ProfileId of(long value) {
        return new ProfileId(value);
    }

    public static ProfileId valueOf(String raw) {
        return new ProfileId(Long.parseLong(raw.trim()));
    }

    public int asInt() {
        return Math.toIntExact(value);
    }
}
