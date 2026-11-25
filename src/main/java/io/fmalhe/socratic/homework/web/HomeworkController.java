package io.fmalhe.socratic.homework.web;

import io.fmalhe.socratic.homework.HomeworkHelpRequest;
import io.fmalhe.socratic.homework.HomeworkHelpResponse;
import io.fmalhe.socratic.homework.internal.HomeworkService;
import io.fmalhe.socratic.profile.ProfileId;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@NullMarked
@RestController
@RequestMapping("/api/homework")
@RequiredArgsConstructor
class HomeworkController {

    private final HomeworkService homeworkService;

    @PostMapping(value = "/help", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    HomeworkHelpResponse help(ProfileId profileId, @ModelAttribute HomeworkHelpRequest request) {
        return homeworkService.help(profileId, request);
    }
}
