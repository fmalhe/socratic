package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;

import java.util.List;

@NullMarked
public record HomeworkHelpResponse(
        String taskExplanationNative,
        List<String> stepByStepHints,
        String encouragementTarget) {
}
