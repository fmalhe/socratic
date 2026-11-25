package io.fmalhe.socratic.reading.internal;

import io.fmalhe.socratic.reading.ReadingPageResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
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
    ReadingPageResponse scan(
            @RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId,
            @RequestParam("image") MultipartFile image) {
        return readingService.scanPage(profileId, image);
    }
}
