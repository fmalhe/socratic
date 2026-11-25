package io.fmalhe.socratic.progress;

import io.fmalhe.socratic.profile.ProfileId;
import org.jspecify.annotations.NullMarked;

@NullMarked
public interface ProgressFacade {

    ProgressResponse getProgress(ProfileId profileId);

    ProgressResponse completeActivity(ProfileId profileId, CompleteActivityRequest request);
}
