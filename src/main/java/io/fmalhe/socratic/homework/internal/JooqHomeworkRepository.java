package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.ExerciseStatus;
import io.fmalhe.socratic.homework.HomeworkExerciseDto;
import io.fmalhe.socratic.homework.HomeworkExerciseId;
import io.fmalhe.socratic.homework.HomeworkMessageDto;
import io.fmalhe.socratic.homework.HomeworkSessionId;
import io.fmalhe.socratic.homework.HomeworkSessionResponse;
import io.fmalhe.socratic.homework.HomeworkWordHint;
import io.fmalhe.socratic.homework.MessageSender;
import io.fmalhe.socratic.profile.ProfileId;
import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static io.fmalhe.socratic.jooq.Tables.HOMEWORK_EXERCISE;
import static io.fmalhe.socratic.jooq.Tables.HOMEWORK_MESSAGE;
import static io.fmalhe.socratic.jooq.Tables.HOMEWORK_SESSION;

@NullMarked
@Repository
@RequiredArgsConstructor
class JooqHomeworkRepository {

    private static final int RECENT_SESSIONS_LIMIT = 10;
    private static final TypeReference<List<HomeworkWordHint>> WORD_HINTS_TYPE = new TypeReference<>() {};

    private final DSLContext dsl;
    private final JsonMapper jsonMapper;

    HomeworkSessionResponse createSession(ProfileId profileId, ScannedHomeworkPage scanned) {
        var sessionRecord = Objects.requireNonNull(
                dsl.insertInto(HOMEWORK_SESSION)
                        .set(HOMEWORK_SESSION.PROFILE_ID, profileId.asInt())
                        .set(HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE, scanned.pageSummaryNative())
                        .set(HOMEWORK_SESSION.PAGE_TEXT_TARGET, scanned.pageTextTarget())
                        .returning(HOMEWORK_SESSION.ID)
                        .fetchOne(),
                "Failed to insert homework_session");

        var sessionId = HomeworkSessionId.of(sessionRecord.getId());
        var exercises = scanned.exercises();
        for (int i = 0; i < exercises.size(); i++) {
            var ex = exercises.get(i);
            dsl.insertInto(HOMEWORK_EXERCISE)
                    .set(HOMEWORK_EXERCISE.SESSION_ID, sessionId.asInt())
                    .set(HOMEWORK_EXERCISE.POSITION, i + 1)
                    .set(HOMEWORK_EXERCISE.LABEL, ex.label())
                    .set(HOMEWORK_EXERCISE.PROMPT_TARGET, ex.promptTarget())
                    .set(HOMEWORK_EXERCISE.EXPLANATION_NATIVE, ex.explanationNative())
                    .set(HOMEWORK_EXERCISE.TRICKY_WORDS_JSON, writeWordHints(ex.trickyWords()))
                    .set(HOMEWORK_EXERCISE.OPENING_QUESTION_NATIVE, ex.openingQuestionNative())
                    .set(HOMEWORK_EXERCISE.STATUS, ExerciseStatus.PENDING.name())
                    .execute();
        }

        return findSession(profileId, sessionId)
                .orElseThrow(() -> new IllegalStateException("Inserted homework session not found: " + sessionId));
    }

    Optional<HomeworkSessionResponse> findSession(ProfileId profileId, HomeworkSessionId sessionId) {
        return dsl.select(
                        HOMEWORK_SESSION.ID,
                        HOMEWORK_SESSION.PROFILE_ID,
                        HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE,
                        HOMEWORK_SESSION.PAGE_TEXT_TARGET,
                        HOMEWORK_SESSION.CREATED_AT)
                .from(HOMEWORK_SESSION)
                .where(HOMEWORK_SESSION.ID.eq(sessionId.asInt()))
                .and(HOMEWORK_SESSION.PROFILE_ID.eq(profileId.asInt()))
                .fetchOptional(r -> new HomeworkSessionResponse(
                        HomeworkSessionId.of(r.get(HOMEWORK_SESSION.ID)),
                        ProfileId.of(r.get(HOMEWORK_SESSION.PROFILE_ID)),
                        r.get(HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE),
                        r.get(HOMEWORK_SESSION.PAGE_TEXT_TARGET),
                        r.get(HOMEWORK_SESSION.CREATED_AT),
                        findExercises(sessionId)));
    }

    List<HomeworkSessionResponse> findRecentSessions(ProfileId profileId) {
        return dsl.select(
                        HOMEWORK_SESSION.ID,
                        HOMEWORK_SESSION.PROFILE_ID,
                        HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE,
                        HOMEWORK_SESSION.PAGE_TEXT_TARGET,
                        HOMEWORK_SESSION.CREATED_AT)
                .from(HOMEWORK_SESSION)
                .where(HOMEWORK_SESSION.PROFILE_ID.eq(profileId.asInt()))
                .orderBy(HOMEWORK_SESSION.ID.desc())
                .limit(RECENT_SESSIONS_LIMIT)
                .fetch(r -> {
                    var sessionId = HomeworkSessionId.of(r.get(HOMEWORK_SESSION.ID));
                    return new HomeworkSessionResponse(
                            sessionId,
                            ProfileId.of(r.get(HOMEWORK_SESSION.PROFILE_ID)),
                            r.get(HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE),
                            r.get(HOMEWORK_SESSION.PAGE_TEXT_TARGET),
                            r.get(HOMEWORK_SESSION.CREATED_AT),
                            findExercises(sessionId));
                });
    }

    Optional<ExerciseWithContext> findExercise(
            ProfileId profileId,
            HomeworkSessionId sessionId,
            HomeworkExerciseId exerciseId) {
        return dsl.select(
                        HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE,
                        HOMEWORK_EXERCISE.ID,
                        HOMEWORK_EXERCISE.POSITION,
                        HOMEWORK_EXERCISE.LABEL,
                        HOMEWORK_EXERCISE.PROMPT_TARGET,
                        HOMEWORK_EXERCISE.EXPLANATION_NATIVE,
                        HOMEWORK_EXERCISE.TRICKY_WORDS_JSON,
                        HOMEWORK_EXERCISE.OPENING_QUESTION_NATIVE,
                        HOMEWORK_EXERCISE.STATUS)
                .from(HOMEWORK_EXERCISE)
                .join(HOMEWORK_SESSION).on(HOMEWORK_SESSION.ID.eq(HOMEWORK_EXERCISE.SESSION_ID))
                .where(HOMEWORK_EXERCISE.ID.eq(exerciseId.asInt()))
                .and(HOMEWORK_EXERCISE.SESSION_ID.eq(sessionId.asInt()))
                .and(HOMEWORK_SESSION.PROFILE_ID.eq(profileId.asInt()))
                .fetchOptional(r -> {
                    var id = HomeworkExerciseId.of(r.get(HOMEWORK_EXERCISE.ID));
                    var exercise = new HomeworkExerciseDto(
                            id,
                            r.get(HOMEWORK_EXERCISE.POSITION),
                            r.get(HOMEWORK_EXERCISE.LABEL),
                            r.get(HOMEWORK_EXERCISE.PROMPT_TARGET),
                            r.get(HOMEWORK_EXERCISE.EXPLANATION_NATIVE),
                            readWordHints(r.get(HOMEWORK_EXERCISE.TRICKY_WORDS_JSON)),
                            r.get(HOMEWORK_EXERCISE.OPENING_QUESTION_NATIVE),
                            ExerciseStatus.valueOf(r.get(HOMEWORK_EXERCISE.STATUS)),
                            findMessages(id));
                    return new ExerciseWithContext(r.get(HOMEWORK_SESSION.PAGE_SUMMARY_NATIVE), exercise);
                });
    }

    void appendMessage(
            HomeworkExerciseId exerciseId,
            MessageSender sender,
            String content,
            @Nullable String targetPhrase) {
        dsl.insertInto(HOMEWORK_MESSAGE)
                .set(HOMEWORK_MESSAGE.EXERCISE_ID, exerciseId.asInt())
                .set(HOMEWORK_MESSAGE.SENDER, sender.name())
                .set(HOMEWORK_MESSAGE.CONTENT, content)
                .set(HOMEWORK_MESSAGE.TARGET_PHRASE, targetPhrase)
                .execute();
    }

    void updateExerciseStatus(HomeworkExerciseId exerciseId, ExerciseStatus status) {
        dsl.update(HOMEWORK_EXERCISE)
                .set(HOMEWORK_EXERCISE.STATUS, status.name())
                .where(HOMEWORK_EXERCISE.ID.eq(exerciseId.asInt()))
                .execute();
    }

    private List<HomeworkExerciseDto> findExercises(HomeworkSessionId sessionId) {
        return dsl.select(
                        HOMEWORK_EXERCISE.ID,
                        HOMEWORK_EXERCISE.POSITION,
                        HOMEWORK_EXERCISE.LABEL,
                        HOMEWORK_EXERCISE.PROMPT_TARGET,
                        HOMEWORK_EXERCISE.EXPLANATION_NATIVE,
                        HOMEWORK_EXERCISE.TRICKY_WORDS_JSON,
                        HOMEWORK_EXERCISE.OPENING_QUESTION_NATIVE,
                        HOMEWORK_EXERCISE.STATUS)
                .from(HOMEWORK_EXERCISE)
                .where(HOMEWORK_EXERCISE.SESSION_ID.eq(sessionId.asInt()))
                .orderBy(HOMEWORK_EXERCISE.POSITION.asc())
                .fetch(r -> {
                    var exerciseId = HomeworkExerciseId.of(r.get(HOMEWORK_EXERCISE.ID));
                    return new HomeworkExerciseDto(
                            exerciseId,
                            r.get(HOMEWORK_EXERCISE.POSITION),
                            r.get(HOMEWORK_EXERCISE.LABEL),
                            r.get(HOMEWORK_EXERCISE.PROMPT_TARGET),
                            r.get(HOMEWORK_EXERCISE.EXPLANATION_NATIVE),
                            readWordHints(r.get(HOMEWORK_EXERCISE.TRICKY_WORDS_JSON)),
                            r.get(HOMEWORK_EXERCISE.OPENING_QUESTION_NATIVE),
                            ExerciseStatus.valueOf(r.get(HOMEWORK_EXERCISE.STATUS)),
                            findMessages(exerciseId));
                });
    }

    private List<HomeworkMessageDto> findMessages(HomeworkExerciseId exerciseId) {
        return dsl.select(
                        HOMEWORK_MESSAGE.ID,
                        HOMEWORK_MESSAGE.SENDER,
                        HOMEWORK_MESSAGE.CONTENT,
                        HOMEWORK_MESSAGE.TARGET_PHRASE,
                        HOMEWORK_MESSAGE.CREATED_AT)
                .from(HOMEWORK_MESSAGE)
                .where(HOMEWORK_MESSAGE.EXERCISE_ID.eq(exerciseId.asInt()))
                .orderBy(HOMEWORK_MESSAGE.ID.asc())
                .fetch(r -> new HomeworkMessageDto(
                        r.get(HOMEWORK_MESSAGE.ID).longValue(),
                        MessageSender.valueOf(r.get(HOMEWORK_MESSAGE.SENDER)),
                        r.get(HOMEWORK_MESSAGE.CONTENT),
                        r.get(HOMEWORK_MESSAGE.TARGET_PHRASE),
                        r.get(HOMEWORK_MESSAGE.CREATED_AT)));
    }

    private String writeWordHints(List<HomeworkWordHint> words) {
        return jsonMapper.writeValueAsString(words);
    }

    private List<HomeworkWordHint> readWordHints(String json) {
        return jsonMapper.readValue(json, WORD_HINTS_TYPE);
    }

    record ScannedHomeworkPage(
            String pageSummaryNative,
            String pageTextTarget,
            List<ExtractedExercise> exercises) {
    }

    record ExtractedExercise(
            String label,
            String promptTarget,
            String explanationNative,
            List<HomeworkWordHint> trickyWords,
            String openingQuestionNative) {
    }

    record ExerciseWithContext(
            String pageSummaryNative,
            HomeworkExerciseDto exercise) {
    }
}
