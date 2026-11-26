package io.fmalhe.socratic.homework;

import com.fasterxml.jackson.annotation.JsonValue;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record HomeworkSessionId(@JsonValue long value) {

    public HomeworkSessionId {
        if (value <= 0) {
            throw new IllegalArgumentException("HomeworkSessionId must be positive, got: " + value);
        }
    }

    public static HomeworkSessionId of(long value) {
        return new HomeworkSessionId(value);
    }

    public static HomeworkSessionId valueOf(String raw) {
        return new HomeworkSessionId(Long.parseLong(raw.trim()));
    }

    public int asInt() {
        return Math.toIntExact(value);
    }
}
