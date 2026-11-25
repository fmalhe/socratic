package io.fmalhe.socratic.progress.internal;

import io.fmalhe.socratic.jooq.tables.records.SavedWordRecord;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.progress.ProgressResponse;
import io.fmalhe.socratic.progress.ProgressResponse.SavedWordDto;
import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static io.fmalhe.socratic.jooq.Tables.CHILD_PROGRESS;
import static io.fmalhe.socratic.jooq.Tables.SAVED_WORD;

@NullMarked
@Repository
@RequiredArgsConstructor
class JooqProgressRepository {

    private static final int RECENT_WORDS_LIMIT = 20;

    private final DSLContext dsl;

    Optional<ChildProgressRow> findChildProgress(ProfileId profileId) {
        return dsl.select(
                        CHILD_PROGRESS.PROFILE_ID,
                        CHILD_PROGRESS.TOTAL_STARS,
                        CHILD_PROGRESS.CURRENT_STREAK_DAYS,
                        CHILD_PROGRESS.LAST_ACTIVITY_DATE,
                        CHILD_PROGRESS.PAGES_READ_COUNT)
                .from(CHILD_PROGRESS)
                .where(CHILD_PROGRESS.PROFILE_ID.eq(profileId.asInt()))
                .fetchOptional(r -> new ChildProgressRow(
                        ProfileId.of(r.get(CHILD_PROGRESS.PROFILE_ID)),
                        r.get(CHILD_PROGRESS.TOTAL_STARS),
                        r.get(CHILD_PROGRESS.CURRENT_STREAK_DAYS),
                        Optional.ofNullable(r.get(CHILD_PROGRESS.LAST_ACTIVITY_DATE))
                                .map(LocalDate::parse)
                                .orElse(null),
                        r.get(CHILD_PROGRESS.PAGES_READ_COUNT)));
    }

    void upsertChildProgress(
            ProfileId profileId,
            int totalStars,
            int currentStreakDays,
            LocalDate lastActivityDate,
            int pagesReadCount) {
        int id = profileId.asInt();
        var dateStr = lastActivityDate.toString();
        int updated = dsl.update(CHILD_PROGRESS)
                .set(CHILD_PROGRESS.TOTAL_STARS, totalStars)
                .set(CHILD_PROGRESS.CURRENT_STREAK_DAYS, currentStreakDays)
                .set(CHILD_PROGRESS.LAST_ACTIVITY_DATE, dateStr)
                .set(CHILD_PROGRESS.PAGES_READ_COUNT, pagesReadCount)
                .where(CHILD_PROGRESS.PROFILE_ID.eq(id))
                .execute();
        if (updated == 0) {
            dsl.insertInto(CHILD_PROGRESS)
                    .set(CHILD_PROGRESS.PROFILE_ID, id)
                    .set(CHILD_PROGRESS.TOTAL_STARS, totalStars)
                    .set(CHILD_PROGRESS.CURRENT_STREAK_DAYS, currentStreakDays)
                    .set(CHILD_PROGRESS.LAST_ACTIVITY_DATE, dateStr)
                    .set(CHILD_PROGRESS.PAGES_READ_COUNT, pagesReadCount)
                    .execute();
        }
    }

    void insertSavedWords(ProfileId profileId, LanguageCode languageCode, List<String> words) {
        if (words.isEmpty()) {
            return;
        }
        int id = profileId.asInt();
        List<SavedWordRecord> records = words.stream()
                .map(String::trim)
                .filter(w -> !w.isEmpty())
                .map(word -> {
                    SavedWordRecord record = dsl.newRecord(SAVED_WORD);
                    record.setProfileId(id);
                    record.setWord(word);
                    record.setLanguageCode(languageCode.value());
                    return record;
                })
                .toList();
        if (!records.isEmpty()) {
            dsl.batchInsert(records).execute();
        }
    }

    List<SavedWordDto> findRecentWords(ProfileId profileId) {
        return dsl.select(
                        SAVED_WORD.ID,
                        SAVED_WORD.WORD,
                        SAVED_WORD.LANGUAGE_CODE,
                        SAVED_WORD.CREATED_AT)
                .from(SAVED_WORD)
                .where(SAVED_WORD.PROFILE_ID.eq(profileId.asInt()))
                .orderBy(SAVED_WORD.CREATED_AT.desc(), SAVED_WORD.ID.desc())
                .limit(RECENT_WORDS_LIMIT)
                .fetch(r -> new SavedWordDto(
                        r.get(SAVED_WORD.ID).longValue(),
                        r.get(SAVED_WORD.WORD),
                        LanguageCode.of(r.get(SAVED_WORD.LANGUAGE_CODE)),
                        r.get(SAVED_WORD.CREATED_AT)));
    }

    ProgressResponse findProgressResponse(ProfileId profileId) {
        var row = findChildProgress(profileId)
                .orElse(ChildProgressRow.empty(profileId));
        var recentWords = findRecentWords(profileId);
        return new ProgressResponse(
                row.profileId(),
                row.totalStars(),
                row.currentStreakDays(),
                row.lastActivityDate().orElse(null),
                row.pagesReadCount(),
                recentWords);
    }

    static final class ChildProgressRow {

        private final ProfileId profileId;
        private final int totalStars;
        private final int currentStreakDays;
        private final @Nullable LocalDate lastActivityDate;
        private final int pagesReadCount;

        ChildProgressRow(
                ProfileId profileId,
                int totalStars,
                int currentStreakDays,
                @Nullable LocalDate lastActivityDate,
                int pagesReadCount) {
            this.profileId = profileId;
            this.totalStars = totalStars;
            this.currentStreakDays = currentStreakDays;
            this.lastActivityDate = lastActivityDate;
            this.pagesReadCount = pagesReadCount;
        }

        static ChildProgressRow empty(ProfileId profileId) {
            return new ChildProgressRow(profileId, 0, 0, null, 0);
        }

        ProfileId profileId() {
            return profileId;
        }

        int totalStars() {
            return totalStars;
        }

        int currentStreakDays() {
            return currentStreakDays;
        }

        Optional<LocalDate> lastActivityDate() {
            return Optional.ofNullable(lastActivityDate);
        }

        int pagesReadCount() {
            return pagesReadCount;
        }
    }
}
