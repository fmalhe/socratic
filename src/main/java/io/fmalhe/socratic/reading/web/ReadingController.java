package io.fmalhe.socratic.reading.web;

import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.reading.ReadingPageResponse;
import io.fmalhe.socratic.reading.internal.ReadingService;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@NullMarked
@RestController
@RequestMapping("/api/reading")
@RequiredArgsConstructor
class ReadingController {

    private final ReadingService readingService;

    @PostMapping(value = "/scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ReadingPageResponse scan(ProfileId profileId, @RequestParam("image") MultipartFile image) {
        return readingService.scanPage(profileId, image);
    }
}
