package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;

@NullMarked
public record HomeworkWordHint(
        String word,
        String syllables,
        String nativeHint) {
}
