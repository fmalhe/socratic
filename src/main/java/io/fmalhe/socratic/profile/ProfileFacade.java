package io.fmalhe.socratic.profile;

import org.jspecify.annotations.NullMarked;

@NullMarked
public interface ProfileFacade {

    LearnerProfileDto getActiveProfile();

    LearnerProfileDto getActiveProfile(ProfileId profileId);

    LearnerProfileDto updateActiveProfile(ProfileId profileId, UpdateLearnerProfileRequest request);
}
