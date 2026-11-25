package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.HomeworkHelpResponse;
import io.fmalhe.socratic.profile.ProfileFacade;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.content.Media;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Objects;

@NullMarked
@Service
@RequiredArgsConstructor
class HomeworkService {

    private final ProfileFacade profileFacade;
    private final HomeworkPromptFactory promptFactory;
    private final ChatClient.Builder chatClientBuilder;

    HomeworkHelpResponse help(
            @Nullable Long profileId,
            @Nullable MultipartFile image,
            @Nullable String question) {
        var hasImage = image != null && !image.isEmpty();
        var hasQuestion = StringUtils.hasText(question);
        if (!hasImage && !hasQuestion) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Either an image or a question must be provided");
        }

        var profile = profileFacade.getActiveProfile(profileId);
        var systemPrompt = promptFactory.renderSystemPrompt(profile);
        var userText = hasQuestion
                ? question
                : "Please explain this homework exercise without giving away the answer.";

        var media = hasImage ? toMedia(image) : null;

        var result = chatClientBuilder.build().prompt()
                .system(systemPrompt)
                .user(u -> {
                    u.text(userText);
                    if (media != null) {
                        u.media(media);
                    }
                })
                .call()
                .entity(HomeworkHelpResponse.class);

        return Objects.requireNonNull(result, "AI returned empty homework response");
    }

    private static Media toMedia(MultipartFile image) {
        byte[] bytes;
        try {
            bytes = image.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to read uploaded image", ex);
        }
        var mimeType = image.getContentType() != null
                ? MimeTypeUtils.parseMimeType(image.getContentType())
                : MimeTypeUtils.IMAGE_JPEG;
        return Media.builder()
                .mimeType(mimeType)
                .data(new ByteArrayResource(bytes))
                .build();
    }
}
