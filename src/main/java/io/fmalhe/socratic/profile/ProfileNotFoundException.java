package io.fmalhe.socratic.profile;

import org.jspecify.annotations.NullMarked;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@NullMarked
@ResponseStatus(HttpStatus.NOT_FOUND)
public class ProfileNotFoundException extends RuntimeException {

    public ProfileNotFoundException(long profileId) {
        super("Learner profile not found for id: " + profileId);
    }
}
