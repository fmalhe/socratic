package io.fmalhe.socratic.profile.web;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.UpdateLearnerProfileRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
class ProfileController {

    private final ProfileFacade profileFacade;

    @GetMapping
    LearnerProfileDto getProfile(ProfileId profileId) {
        return profileFacade.getActiveProfile(profileId);
    }

    @PutMapping
    LearnerProfileDto updateProfile(ProfileId profileId, @Valid @RequestBody UpdateLearnerProfileRequest request) {
        return profileFacade.updateActiveProfile(profileId, request);
    }
}
