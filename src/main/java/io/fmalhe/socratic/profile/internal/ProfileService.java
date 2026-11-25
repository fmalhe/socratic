package io.fmalhe.socratic.profile.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileNotFoundException;
import io.fmalhe.socratic.profile.UpdateLearnerProfileRequest;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@NullMarked
@Service
@RequiredArgsConstructor
class ProfileService implements ProfileFacade {

    static final long DEFAULT_PROFILE_ID = 1L;

    private final JooqProfileRepository repository;

    @Override
    @Transactional(readOnly = true)
    public LearnerProfileDto getActiveProfile() {
        return getActiveProfile(null);
    }

    @Override
    @Transactional(readOnly = true)
    public LearnerProfileDto getActiveProfile(@Nullable Long profileId) {
        long resolvedId = resolveId(profileId);
        return repository.findById(resolvedId)
                .orElseThrow(() -> new ProfileNotFoundException(resolvedId));
    }

    @Override
    @Transactional
    public LearnerProfileDto updateActiveProfile(@Nullable Long profileId, UpdateLearnerProfileRequest request) {
        long resolvedId = resolveId(profileId);
        return repository.update(resolvedId, request)
                .orElseThrow(() -> new ProfileNotFoundException(resolvedId));
    }

    private static long resolveId(@Nullable Long profileId) {
        return profileId != null ? profileId : DEFAULT_PROFILE_ID;
    }
}
