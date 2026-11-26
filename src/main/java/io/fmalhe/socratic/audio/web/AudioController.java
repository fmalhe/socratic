package io.fmalhe.socratic.audio.web;

import io.fmalhe.socratic.audio.SpeakRequest;
import io.fmalhe.socratic.audio.TtsService;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/audio")
@RequiredArgsConstructor
class AudioController {

    private final ProfileFacade profileFacade;
    private final TtsService ttsService;

    @PostMapping("/speak")
    ResponseEntity<Resource> speak(ProfileId profileId, @Valid @RequestBody SpeakRequest request) {
        var profile = profileFacade.getActiveProfile(profileId);
        var languageCode = request.getLanguageCode().orElse(profile.targetLanguageCode());
        var audio = ttsService.synthesize(request.getText(), languageCode, profile.ttsVoiceName(), request.isSlow());
        return ResponseEntity.ok()
                .contentType(audio.mediaType())
                .body(audio.content());
    }
}
