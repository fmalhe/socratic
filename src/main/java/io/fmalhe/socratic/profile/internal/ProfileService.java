package io.fmalhe.socratic.profile.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.ProfileNotFoundException;
import io.fmalhe.socratic.profile.UpdateLearnerProfileRequest;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@NullMarked
@Service
@RequiredArgsConstructor
class ProfileService implements ProfileFacade {

    private final JooqProfileRepository repository;

    @Override
    @Transactional(readOnly = true)
    public LearnerProfileDto getActiveProfile() {
        return getActiveProfile(ProfileId.DEFAULT);
    }

    @Override
    @Transactional(readOnly = true)
    public LearnerProfileDto getActiveProfile(ProfileId profileId) {
        return repository.findById(profileId)
                .orElseThrow(() -> new ProfileNotFoundException(profileId));
    }

    @Override
    @Transactional
    public LearnerProfileDto updateActiveProfile(ProfileId profileId, UpdateLearnerProfileRequest request) {
        return repository.update(profileId, request)
                .orElseThrow(() -> new ProfileNotFoundException(profileId));
    }
}
