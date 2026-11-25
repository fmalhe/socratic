package io.fmalhe.socratic.profile.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.UpdateLearnerProfileRequest;
import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jspecify.annotations.NullMarked;
import org.springframework.stereotype.Repository;

import java.util.Optional;

import static io.fmalhe.socratic.jooq.Tables.LEARNER_PROFILE;

@NullMarked
@Repository
@RequiredArgsConstructor
class JooqProfileRepository {

    private final DSLContext dsl;

    Optional<LearnerProfileDto> findById(long id) {
        return dsl.select(
                        LEARNER_PROFILE.ID,
                        LEARNER_PROFILE.NAME,
                        LEARNER_PROFILE.AGE,
                        LEARNER_PROFILE.TARGET_LANGUAGE_CODE,
                        LEARNER_PROFILE.TARGET_LANGUAGE_NAME,
                        LEARNER_PROFILE.NATIVE_LANGUAGE_CODE,
                        LEARNER_PROFILE.NATIVE_LANGUAGE_NAME,
                        LEARNER_PROFILE.DIALECT_RULES,
                        LEARNER_PROFILE.TTS_VOICE_NAME)
                .from(LEARNER_PROFILE)
                .where(LEARNER_PROFILE.ID.eq(Math.toIntExact(id)))
                .fetchOptional(r -> new LearnerProfileDto(
                        r.get(LEARNER_PROFILE.ID).longValue(),
                        r.get(LEARNER_PROFILE.NAME),
                        r.get(LEARNER_PROFILE.AGE),
                        r.get(LEARNER_PROFILE.TARGET_LANGUAGE_CODE),
                        r.get(LEARNER_PROFILE.TARGET_LANGUAGE_NAME),
                        r.get(LEARNER_PROFILE.NATIVE_LANGUAGE_CODE),
                        r.get(LEARNER_PROFILE.NATIVE_LANGUAGE_NAME),
                        r.get(LEARNER_PROFILE.DIALECT_RULES),
                        r.get(LEARNER_PROFILE.TTS_VOICE_NAME)));
    }

    Optional<LearnerProfileDto> update(long id, UpdateLearnerProfileRequest request) {
        int updated = dsl.update(LEARNER_PROFILE)
                .set(LEARNER_PROFILE.NAME, request.name())
                .set(LEARNER_PROFILE.AGE, request.age())
                .set(LEARNER_PROFILE.TARGET_LANGUAGE_CODE, request.targetLanguageCode())
                .set(LEARNER_PROFILE.TARGET_LANGUAGE_NAME, request.targetLanguageName())
                .set(LEARNER_PROFILE.NATIVE_LANGUAGE_CODE, request.nativeLanguageCode())
                .set(LEARNER_PROFILE.NATIVE_LANGUAGE_NAME, request.nativeLanguageName())
                .set(LEARNER_PROFILE.DIALECT_RULES, request.dialectRules())
                .set(LEARNER_PROFILE.TTS_VOICE_NAME, request.ttsVoiceName())
                .where(LEARNER_PROFILE.ID.eq(Math.toIntExact(id)))
                .execute();
        if (updated == 0) {
            return Optional.empty();
        }
        return findById(id);
    }
}
