package io.fmalhe.socratic.progress.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.progress.ActivityCompletedEvent;
import io.fmalhe.socratic.progress.ActivityType;
import io.fmalhe.socratic.progress.CompleteActivityRequest;
import io.fmalhe.socratic.progress.ProgressResponse;
import io.fmalhe.socratic.progress.internal.JooqProgressRepository.ChildProgressRow;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@NullMarked
@Service
@RequiredArgsConstructor
class ProgressService {

    private final ProfileFacade profileFacade;
    private final JooqProgressRepository repository;
    private final StreakCalculator streakCalculator;

    @Transactional(readOnly = true)
    ProgressResponse getProgress(@Nullable Long profileId) {
        var profile = profileFacade.getActiveProfile(profileId);
        return repository.findProgressResponse(profile.id());
    }

    @Transactional
    ProgressResponse completeActivity(@Nullable Long profileId, CompleteActivityRequest request) {
        var profile = profileFacade.getActiveProfile(profileId);
        var words = request.trickyWords() != null ? request.trickyWords() : List.<String>of();
        return recordCompletion(
                profile,
                request.activityType(),
                request.starsEarned(),
                words,
                LocalDate.now(ZoneOffset.UTC));
    }

    @ApplicationModuleListener
    void on(ActivityCompletedEvent event) {
        var profile = profileFacade.getActiveProfile(event.profileId());
        recordCompletion(
                profile,
                event.activityType(),
                event.starsEarned(),
                event.trickyWords(),
                event.activityDate());
    }

    private ProgressResponse recordCompletion(
            LearnerProfileDto profile,
            ActivityType activityType,
            int starsEarned,
            List<String> trickyWords,
            LocalDate activityDate) {
        var current = repository.findChildProgress(profile.id())
                .orElse(new ChildProgressRow(profile.id(), 0, 0, null, 0));

        var lastDate = current.lastActivityDate() != null
                ? LocalDate.parse(current.lastActivityDate())
                : null;

        var nextStreak = streakCalculator.computeNextStreak(current.currentStreakDays(), lastDate, activityDate);
        var nextStars = current.totalStars() + starsEarned;
        var nextPages = current.pagesReadCount() + (activityType == ActivityType.READING ? 1 : 0);

        repository.upsertChildProgress(
                profile.id(),
                nextStars,
                nextStreak,
                activityDate.toString(),
                nextPages);
        repository.insertSavedWords(profile.id(), profile.targetLanguageCode(), trickyWords);

        return repository.findProgressResponse(profile.id());
    }
}
