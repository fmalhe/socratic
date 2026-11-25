package io.fmalhe.socratic.progress.internal;

import io.fmalhe.socratic.jooq.tables.records.SavedWordRecord;
import io.fmalhe.socratic.progress.ProgressResponse;
import io.fmalhe.socratic.progress.ProgressResponse.SavedWordDto;
import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Repository;

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

    Optional<ChildProgressRow> findChildProgress(long profileId) {
        return dsl.select(
                        CHILD_PROGRESS.PROFILE_ID,
                        CHILD_PROGRESS.TOTAL_STARS,
                        CHILD_PROGRESS.CURRENT_STREAK_DAYS,
                        CHILD_PROGRESS.LAST_ACTIVITY_DATE,
                        CHILD_PROGRESS.PAGES_READ_COUNT)
                .from(CHILD_PROGRESS)
                .where(CHILD_PROGRESS.PROFILE_ID.eq(Math.toIntExact(profileId)))
                .fetchOptional(r -> new ChildProgressRow(
                        r.get(CHILD_PROGRESS.PROFILE_ID).longValue(),
                        r.get(CHILD_PROGRESS.TOTAL_STARS),
                        r.get(CHILD_PROGRESS.CURRENT_STREAK_DAYS),
                        r.get(CHILD_PROGRESS.LAST_ACTIVITY_DATE),
                        r.get(CHILD_PROGRESS.PAGES_READ_COUNT)));
    }

    void upsertChildProgress(
            long profileId,
            int totalStars,
            int currentStreakDays,
            String lastActivityDate,
            int pagesReadCount) {
        int id = Math.toIntExact(profileId);
        int updated = dsl.update(CHILD_PROGRESS)
                .set(CHILD_PROGRESS.TOTAL_STARS, totalStars)
                .set(CHILD_PROGRESS.CURRENT_STREAK_DAYS, currentStreakDays)
                .set(CHILD_PROGRESS.LAST_ACTIVITY_DATE, lastActivityDate)
                .set(CHILD_PROGRESS.PAGES_READ_COUNT, pagesReadCount)
                .where(CHILD_PROGRESS.PROFILE_ID.eq(id))
                .execute();
        if (updated == 0) {
            dsl.insertInto(CHILD_PROGRESS)
                    .set(CHILD_PROGRESS.PROFILE_ID, id)
                    .set(CHILD_PROGRESS.TOTAL_STARS, totalStars)
                    .set(CHILD_PROGRESS.CURRENT_STREAK_DAYS, currentStreakDays)
                    .set(CHILD_PROGRESS.LAST_ACTIVITY_DATE, lastActivityDate)
                    .set(CHILD_PROGRESS.PAGES_READ_COUNT, pagesReadCount)
                    .execute();
        }
    }

    void insertSavedWords(long profileId, String languageCode, List<String> words) {
        if (words.isEmpty()) {
            return;
        }
        int id = Math.toIntExact(profileId);
        List<SavedWordRecord> records = words.stream()
                .map(String::trim)
                .filter(w -> !w.isEmpty())
                .map(word -> {
                    SavedWordRecord record = dsl.newRecord(SAVED_WORD);
                    record.setProfileId(id);
                    record.setWord(word);
                    record.setLanguageCode(languageCode);
                    return record;
                })
                .toList();
        if (!records.isEmpty()) {
            dsl.batchInsert(records).execute();
        }
    }

    List<SavedWordDto> findRecentWords(long profileId) {
        return dsl.select(
                        SAVED_WORD.ID,
                        SAVED_WORD.WORD,
                        SAVED_WORD.LANGUAGE_CODE,
                        SAVED_WORD.CREATED_AT)
                .from(SAVED_WORD)
                .where(SAVED_WORD.PROFILE_ID.eq(Math.toIntExact(profileId)))
                .orderBy(SAVED_WORD.CREATED_AT.desc(), SAVED_WORD.ID.desc())
                .limit(RECENT_WORDS_LIMIT)
                .fetch(r -> new SavedWordDto(
                        r.get(SAVED_WORD.ID).longValue(),
                        r.get(SAVED_WORD.WORD),
                        r.get(SAVED_WORD.LANGUAGE_CODE),
                        r.get(SAVED_WORD.CREATED_AT)));
    }

    ProgressResponse findProgressResponse(long profileId) {
        ChildProgressRow row = findChildProgress(profileId)
                .orElse(new ChildProgressRow(profileId, 0, 0, null, 0));
        List<SavedWordDto> recentWords = findRecentWords(profileId);
        return new ProgressResponse(
                row.profileId(),
                row.totalStars(),
                row.currentStreakDays(),
                row.lastActivityDate(),
                row.pagesReadCount(),
                recentWords);
    }

    record ChildProgressRow(
            long profileId,
            int totalStars,
            int currentStreakDays,
            @Nullable String lastActivityDate,
            int pagesReadCount) {
    }
}
