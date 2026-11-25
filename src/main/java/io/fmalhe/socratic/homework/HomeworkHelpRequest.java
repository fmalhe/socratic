package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.Optional;

@NullMarked
public final class HomeworkHelpRequest {

    private final @Nullable MultipartFile image;
    private final @Nullable HomeworkQuestion question;

    public HomeworkHelpRequest(@Nullable MultipartFile image, @Nullable String question) {
        this.image = image != null && !image.isEmpty() ? image : null;
        this.question = StringUtils.hasText(question) ? HomeworkQuestion.of(question) : null;
    }

    public Optional<MultipartFile> image() {
        return Optional.ofNullable(image);
    }

    public Optional<HomeworkQuestion> question() {
        return Optional.ofNullable(question);
    }
}
