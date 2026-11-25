package io.fmalhe.socratic.audio.internal;

import io.fmalhe.socratic.audio.SpeakRequest;
import io.fmalhe.socratic.audio.TtsService;
import io.fmalhe.socratic.profile.ProfileFacade;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/audio")
@RequiredArgsConstructor
class AudioController {

    private static final MediaType AUDIO_MPEG = MediaType.parseMediaType("audio/mpeg");

    private final ProfileFacade profileFacade;
    private final TtsService ttsService;

    @PostMapping("/speak")
    ResponseEntity<byte[]> speak(
            @RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId,
            @Valid @RequestBody SpeakRequest request) {
        var profile = profileFacade.getActiveProfile(profileId);
        var languageCode = StringUtils.hasText(request.languageCode())
                ? request.languageCode()
                : profile.targetLanguageCode();
        var audio = ttsService.synthesize(request.text(), languageCode, profile.ttsVoiceName(), request.slow());
        return ResponseEntity.ok()
                .contentType(AUDIO_MPEG)
                .body(audio);
    }
}
