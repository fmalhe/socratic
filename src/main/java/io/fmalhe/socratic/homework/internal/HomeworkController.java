package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.HomeworkHelpResponse;
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
@RequestMapping("/api/homework")
@RequiredArgsConstructor
class HomeworkController {

    private final HomeworkService homeworkService;

    @PostMapping(value = "/help", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    HomeworkHelpResponse help(
            @RequestHeader(value = "X-Profile-Id", required = false) @Nullable Long profileId,
            @RequestParam(value = "image", required = false) @Nullable MultipartFile image,
            @RequestParam(value = "question", required = false) @Nullable String question) {
        return homeworkService.help(profileId, image, question);
    }
}
