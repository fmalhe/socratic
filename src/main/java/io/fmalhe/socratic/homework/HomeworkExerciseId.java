package io.fmalhe.socratic.homework;

import com.fasterxml.jackson.annotation.JsonValue;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record HomeworkExerciseId(@JsonValue long value) {

    public HomeworkExerciseId {
        if (value <= 0) {
            throw new IllegalArgumentException("HomeworkExerciseId must be positive, got: " + value);
        }
    }

    public static HomeworkExerciseId of(long value) {
        return new HomeworkExerciseId(value);
    }

    public static HomeworkExerciseId valueOf(String raw) {
        return new HomeworkExerciseId(Long.parseLong(raw.trim()));
    }

    public int asInt() {
        return Math.toIntExact(value);
    }
}
