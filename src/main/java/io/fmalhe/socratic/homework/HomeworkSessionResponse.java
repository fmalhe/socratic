package io.fmalhe.socratic.homework;

import io.fmalhe.socratic.profile.ProfileId;
import org.jspecify.annotations.NullMarked;

import java.util.List;

@NullMarked
public record HomeworkSessionResponse(
        HomeworkSessionId id,
        ProfileId profileId,
        String pageSummaryNative,
        String pageTextTarget,
        String createdAt,
        List<HomeworkExerciseDto> exercises) {
}
