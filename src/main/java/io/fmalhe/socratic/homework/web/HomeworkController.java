package io.fmalhe.socratic.homework.web;

import io.fmalhe.socratic.homework.HomeworkExerciseDto;
import io.fmalhe.socratic.homework.HomeworkExerciseId;
import io.fmalhe.socratic.homework.HomeworkHelpRequest;
import io.fmalhe.socratic.homework.HomeworkHelpResponse;
import io.fmalhe.socratic.homework.HomeworkReplyRequest;
import io.fmalhe.socratic.homework.HomeworkReplyResponse;
import io.fmalhe.socratic.homework.HomeworkSessionId;
import io.fmalhe.socratic.homework.HomeworkSessionResponse;
import io.fmalhe.socratic.homework.internal.HomeworkService;
import io.fmalhe.socratic.homework.internal.HomeworkSessionService;
import io.fmalhe.socratic.profile.ProfileId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@NullMarked
@RestController
@RequestMapping("/api/homework")
@RequiredArgsConstructor
class HomeworkController {

    private final HomeworkService homeworkService;
    private final HomeworkSessionService sessionService;

    @PostMapping(value = "/help", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    HomeworkHelpResponse help(ProfileId profileId, @ModelAttribute HomeworkHelpRequest request) {
        return homeworkService.help(profileId, request);
    }

    @PostMapping(value = "/sessions/scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    HomeworkSessionResponse scanPage(ProfileId profileId, @RequestParam("image") MultipartFile image) {
        return sessionService.scanPage(profileId, image);
    }

    @GetMapping("/sessions")
    List<HomeworkSessionResponse> listSessions(ProfileId profileId) {
        return sessionService.listSessions(profileId);
    }

    @GetMapping("/sessions/{sessionId}")
    HomeworkSessionResponse getSession(ProfileId profileId, @PathVariable HomeworkSessionId sessionId) {
        return sessionService.getSession(profileId, sessionId);
    }

    @PostMapping("/sessions/{sessionId}/exercises/{exerciseId}/reply")
    HomeworkReplyResponse replyToExercise(
            ProfileId profileId,
            @PathVariable HomeworkSessionId sessionId,
            @PathVariable HomeworkExerciseId exerciseId,
            @Valid @RequestBody HomeworkReplyRequest request) {
        return sessionService.replyToExercise(profileId, sessionId, exerciseId, request);
    }

    @PostMapping("/sessions/{sessionId}/exercises/{exerciseId}/complete")
    HomeworkExerciseDto completeExercise(
            ProfileId profileId,
            @PathVariable HomeworkSessionId sessionId,
            @PathVariable HomeworkExerciseId exerciseId) {
        return sessionService.completeExercise(profileId, sessionId, exerciseId);
    }
}
