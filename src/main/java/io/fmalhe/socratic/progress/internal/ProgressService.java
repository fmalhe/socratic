package io.fmalhe.socratic.progress.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.progress.ActivityCompletedEvent;
import io.fmalhe.socratic.progress.ActivityType;
import io.fmalhe.socratic.progress.CompleteActivityRequest;
import io.fmalhe.socratic.progress.ProgressFacade;
import io.fmalhe.socratic.progress.ProgressResponse;
import io.fmalhe.socratic.progress.internal.JooqProgressRepository.ChildProgressRow;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@NullMarked
@Service
@RequiredArgsConstructor
public class ProgressService implements ProgressFacade {

    private final ProfileFacade profileFacade;
    private final JooqProgressRepository repository;
    private final StreakCalculator streakCalculator;

    @Override
    @Transactional(readOnly = true)
    public ProgressResponse getProgress(ProfileId profileId) {
        var profile = profileFacade.getActiveProfile(profileId);
        return repository.findProgressResponse(profile.id());
    }

    @Override
    @Transactional
    public ProgressResponse completeActivity(ProfileId profileId, CompleteActivityRequest request) {
        var profile = profileFacade.getActiveProfile(profileId);
        return recordCompletion(
                profile,
                request.activityType(),
                request.starsEarned(),
                request.trickyWords(),
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
                .orElse(ChildProgressRow.empty(profile.id()));

        var nextStreak = streakCalculator.computeNextStreak(
                current.currentStreakDays(), current.lastActivityDate(), activityDate);
        var nextStars = current.totalStars() + starsEarned;
        var nextPages = current.pagesReadCount() + (activityType == ActivityType.READING ? 1 : 0);

        repository.upsertChildProgress(
                profile.id(),
                nextStars,
                nextStreak,
                activityDate,
                nextPages);
        repository.insertSavedWords(profile.id(), profile.targetLanguageCode(), trickyWords);

        return repository.findProgressResponse(profile.id());
    }
}
