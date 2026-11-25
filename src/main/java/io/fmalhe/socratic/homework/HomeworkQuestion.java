package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;

@NullMarked
public record HomeworkQuestion(String value) {

    public HomeworkQuestion {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("HomeworkQuestion must not be blank");
        }
        value = value.trim();
    }

    public static HomeworkQuestion of(String value) {
        return new HomeworkQuestion(value);
    }
}
