package io.fmalhe.socratic.profile;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record Age(@JsonValue int value) {

    private static final int MIN_AGE = 3;
    private static final int MAX_AGE = 18;

    public Age {
        if (value < MIN_AGE || value > MAX_AGE) {
            throw new IllegalArgumentException(
                    "Age must be between " + MIN_AGE + " and " + MAX_AGE + ", got: " + value);
        }
    }

    @JsonCreator
    public static Age of(int value) {
        return new Age(value);
    }
}
