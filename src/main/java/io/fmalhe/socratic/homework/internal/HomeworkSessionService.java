package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.ExerciseStatus;
import io.fmalhe.socratic.homework.HomeworkExerciseDto;
import io.fmalhe.socratic.homework.HomeworkExerciseId;
import io.fmalhe.socratic.homework.HomeworkNotFoundException;
import io.fmalhe.socratic.homework.HomeworkReplyRequest;
import io.fmalhe.socratic.homework.HomeworkReplyResponse;
import io.fmalhe.socratic.homework.HomeworkSessionFacade;
import io.fmalhe.socratic.homework.HomeworkSessionId;
import io.fmalhe.socratic.homework.HomeworkSessionResponse;
import io.fmalhe.socratic.homework.MessageSender;
import io.fmalhe.socratic.homework.internal.JooqHomeworkRepository.ScannedHomeworkPage;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.content.Media;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@NullMarked
@Service
@RequiredArgsConstructor
public class HomeworkSessionService implements HomeworkSessionFacade {

    private final ProfileFacade profileFacade;
    private final HomeworkPromptFactory promptFactory;
    private final JooqHomeworkRepository repository;
    private final ChatClient.Builder chatClientBuilder;

    @Override
    @Transactional
    public HomeworkSessionResponse scanPage(ProfileId profileId, MultipartFile image) {
        if (image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image file must not be empty");
        }
        var profile = profileFacade.getActiveProfile(profileId);
        var systemPrompt = promptFactory.renderScanPageSystemPrompt(profile);
        var media = toMedia(image);

        var scanned = chatClientBuilder.build().prompt()
                .system(systemPrompt)
                .user(u -> u.text("Please scan this homework page and break down each exercise.").media(media))
                .call()
                .entity(ScannedHomeworkPage.class);

        return repository.createSession(profile.id(), Objects.requireNonNull(scanned, "AI returned empty scan"));
    }

    @Override
    @Transactional(readOnly = true)
    public HomeworkSessionResponse getSession(ProfileId profileId, HomeworkSessionId sessionId) {
        var profile = profileFacade.getActiveProfile(profileId);
        return repository.findSession(profile.id(), sessionId)
                .orElseThrow(() -> new HomeworkNotFoundException("Homework session not found: " + sessionId.value()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<HomeworkSessionResponse> listSessions(ProfileId profileId) {
        var profile = profileFacade.getActiveProfile(profileId);
        return repository.findRecentSessions(profile.id());
    }

    @Override
    @Transactional
    public HomeworkReplyResponse replyToExercise(
            ProfileId profileId,
            HomeworkSessionId sessionId,
            HomeworkExerciseId exerciseId,
            HomeworkReplyRequest request) {
        var profile = profileFacade.getActiveProfile(profileId);
        var context = repository.findExercise(profile.id(), sessionId, exerciseId)
                .orElseThrow(() -> new HomeworkNotFoundException(
                        "Homework exercise not found: " + exerciseId.value()));

        var exercise = context.exercise();
        var systemPrompt = promptFactory.renderExercisePingPongSystemPrompt(
                profile, context.pageSummaryNative(), exercise, exercise.messages());

        var reply = Objects.requireNonNull(
                chatClientBuilder.build().prompt()
                        .system(systemPrompt)
                        .user(request.message())
                        .call()
                        .entity(TutorPingPongReply.class),
                "AI returned empty tutor reply");

        repository.appendMessage(exerciseId, MessageSender.CHILD, request.message(), null);
        repository.appendMessage(exerciseId, MessageSender.TUTOR, reply.replyNative(), reply.targetPhrase());

        var nextStatus = exercise.status() == ExerciseStatus.PENDING
                ? ExerciseStatus.IN_PROGRESS
                : exercise.status();
        if (nextStatus != exercise.status()) {
            repository.updateExerciseStatus(exerciseId, nextStatus);
        }

        return new HomeworkReplyResponse(
                exerciseId,
                nextStatus,
                reply.replyNative(),
                reply.targetPhrase(),
                reply.followUpQuestionNative());
    }

    @Override
    @Transactional
    public HomeworkExerciseDto completeExercise(
            ProfileId profileId,
            HomeworkSessionId sessionId,
            HomeworkExerciseId exerciseId) {
        var profile = profileFacade.getActiveProfile(profileId);
        repository.findExercise(profile.id(), sessionId, exerciseId)
                .orElseThrow(() -> new HomeworkNotFoundException(
                        "Homework exercise not found: " + exerciseId.value()));

        repository.updateExerciseStatus(exerciseId, ExerciseStatus.COMPLETED);
        return repository.findExercise(profile.id(), sessionId, exerciseId)
                .orElseThrow(() -> new HomeworkNotFoundException(
                        "Homework exercise not found: " + exerciseId.value()))
                .exercise();
    }

    private static Media toMedia(MultipartFile image) {
        byte[] bytes;
        try {
            bytes = image.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to read uploaded image", ex);
        }
        var mimeType = Optional.ofNullable(image.getContentType())
                .map(MimeTypeUtils::parseMimeType)
                .orElse(MimeTypeUtils.IMAGE_JPEG);
        return Media.builder()
                .mimeType(mimeType)
                .data(new ByteArrayResource(bytes))
                .build();
    }

    record TutorPingPongReply(
            String replyNative,
            String targetPhrase,
            String followUpQuestionNative) {
    }
}
