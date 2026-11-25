package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;

@NullMarked
public record HomeworkReplyResponse(
        HomeworkExerciseId exerciseId,
        ExerciseStatus status,
        String replyNative,
        String targetPhrase,
        String followUpQuestionNative) {
}
