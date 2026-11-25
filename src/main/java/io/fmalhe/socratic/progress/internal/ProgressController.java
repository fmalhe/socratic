package io.fmalhe.socratic.progress.internal;

import io.fmalhe.socratic.progress.CompleteActivityRequest;
import io.fmalhe.socratic.progress.ProgressResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/progress")
@RequiredArgsConstructor
class ProgressController {

    private final ProgressService progressService;

    @GetMapping
    ProgressResponse getProgress(
            @RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId) {
        return progressService.getProgress(profileId);
    }

    @PostMapping("/complete")
    ProgressResponse completeActivity(
            @RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId,
            @Valid @RequestBody CompleteActivityRequest request) {
        return progressService.completeActivity(profileId, request);
    }
}
