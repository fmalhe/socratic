package io.fmalhe.socratic.homework;

import io.fmalhe.socratic.profile.ProfileId;
import org.jspecify.annotations.NullMarked;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@NullMarked
public interface HomeworkSessionFacade {

    HomeworkSessionResponse scanPage(ProfileId profileId, MultipartFile image);

    HomeworkSessionResponse getSession(ProfileId profileId, HomeworkSessionId sessionId);

    List<HomeworkSessionResponse> listSessions(ProfileId profileId);

    HomeworkReplyResponse replyToExercise(
            ProfileId profileId,
            HomeworkSessionId sessionId,
            HomeworkExerciseId exerciseId,
            HomeworkReplyRequest request);

    HomeworkExerciseDto completeExercise(
            ProfileId profileId,
            HomeworkSessionId sessionId,
            HomeworkExerciseId exerciseId);
}
