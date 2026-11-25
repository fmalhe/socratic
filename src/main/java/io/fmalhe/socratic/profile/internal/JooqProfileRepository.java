package io.fmalhe.socratic.profile.internal;

import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
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

    Optional<LearnerProfileDto> findById(ProfileId id) {
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
                .where(LEARNER_PROFILE.ID.eq(id.asInt()))
                .fetchOptional(r -> new LearnerProfileDto(
                        ProfileId.of(r.get(LEARNER_PROFILE.ID)),
                        r.get(LEARNER_PROFILE.NAME),
                        Age.of(r.get(LEARNER_PROFILE.AGE)),
                        LanguageCode.of(r.get(LEARNER_PROFILE.TARGET_LANGUAGE_CODE)),
                        r.get(LEARNER_PROFILE.TARGET_LANGUAGE_NAME),
                        LanguageCode.of(r.get(LEARNER_PROFILE.NATIVE_LANGUAGE_CODE)),
                        r.get(LEARNER_PROFILE.NATIVE_LANGUAGE_NAME),
                        r.get(LEARNER_PROFILE.DIALECT_RULES),
                        TtsVoiceName.of(r.get(LEARNER_PROFILE.TTS_VOICE_NAME))));
    }

    Optional<LearnerProfileDto> update(ProfileId id, UpdateLearnerProfileRequest request) {
        int updated = dsl.update(LEARNER_PROFILE)
                .set(LEARNER_PROFILE.NAME, request.name())
                .set(LEARNER_PROFILE.AGE, request.age().value())
                .set(LEARNER_PROFILE.TARGET_LANGUAGE_CODE, request.targetLanguageCode().value())
                .set(LEARNER_PROFILE.TARGET_LANGUAGE_NAME, request.targetLanguageName())
                .set(LEARNER_PROFILE.NATIVE_LANGUAGE_CODE, request.nativeLanguageCode().value())
                .set(LEARNER_PROFILE.NATIVE_LANGUAGE_NAME, request.nativeLanguageName())
                .set(LEARNER_PROFILE.DIALECT_RULES, request.dialectRules())
                .set(LEARNER_PROFILE.TTS_VOICE_NAME, request.ttsVoiceName().value())
                .where(LEARNER_PROFILE.ID.eq(id.asInt()))
                .execute();
        if (updated == 0) {
            return Optional.empty();
        }
        return findById(id);
    }
}
