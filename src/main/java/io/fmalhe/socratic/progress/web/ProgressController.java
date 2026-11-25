package io.fmalhe.socratic.progress.web;

import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.progress.CompleteActivityRequest;
import io.fmalhe.socratic.progress.ProgressResponse;
import io.fmalhe.socratic.progress.internal.ProgressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/progress")
@RequiredArgsConstructor
class ProgressController {

    private final ProgressService progressService;

    @GetMapping
    ProgressResponse getProgress(ProfileId profileId) {
        return progressService.getProgress(profileId);
    }

    @PostMapping("/complete")
    ProgressResponse completeActivity(ProfileId profileId, @Valid @RequestBody CompleteActivityRequest request) {
        return progressService.completeActivity(profileId, request);
    }
}
