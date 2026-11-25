package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;

import java.util.List;

@NullMarked
public record HomeworkExerciseDto(
        HomeworkExerciseId id,
        int position,
        String label,
        String promptTarget,
        String explanationNative,
        List<HomeworkWordHint> trickyWords,
        String openingQuestionNative,
        ExerciseStatus status,
        List<HomeworkMessageDto> messages) {
}
