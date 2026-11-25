package io.fmalhe.socratic.profile;

import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

@NullMarked
public interface ProfileFacade {

    LearnerProfileDto getActiveProfile();

    LearnerProfileDto getActiveProfile(@Nullable Long profileId);

    LearnerProfileDto updateActiveProfile(@Nullable Long profileId, UpdateLearnerProfileRequest request);
}
