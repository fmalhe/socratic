package io.fmalhe.socratic.homework;

import jakarta.validation.constraints.NotBlank;
import org.jspecify.annotations.NullMarked;

@NullMarked
public record HomeworkReplyRequest(@NotBlank String message) {
}
