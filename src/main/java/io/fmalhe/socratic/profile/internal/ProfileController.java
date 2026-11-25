package io.fmalhe.socratic.profile.internal;

import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.UpdateLearnerProfileRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
class ProfileController {

    private final ProfileFacade profileFacade;

    @GetMapping
    LearnerProfileDto getProfile(@RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId) {
        return profileFacade.getActiveProfile(profileId);
    }

    @PutMapping
    LearnerProfileDto updateProfile(
            @RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId,
            @Valid @RequestBody UpdateLearnerProfileRequest request) {
        return profileFacade.updateActiveProfile(profileId, request);
    }
}
