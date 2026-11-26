package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.HomeworkHelpRequest;
import io.fmalhe.socratic.homework.HomeworkHelpResponse;
import io.fmalhe.socratic.homework.HomeworkQuestion;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.content.Media;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Objects;
import java.util.Optional;

@NullMarked
@Service
@RequiredArgsConstructor
public class HomeworkService {

    private final ProfileFacade profileFacade;
    private final HomeworkPromptFactory promptFactory;
    private final ChatClient.Builder chatClientBuilder;

    public HomeworkHelpResponse help(ProfileId profileId, HomeworkHelpRequest request) {
        if (request.image().isEmpty() && request.question().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Either an image or a question must be provided");
        }

        var profile = profileFacade.getActiveProfile(profileId);
        var systemPrompt = promptFactory.renderSystemPrompt(profile);
        var userText = request.question()
                .map(HomeworkQuestion::value)
                .orElse("Please explain this homework exercise without giving away the answer.");

        var media = request.image().map(HomeworkService::toMedia);

        var result = chatClientBuilder.build().prompt()
                .system(systemPrompt)
                .user(u -> {
                    u.text(userText);
                    media.ifPresent(u::media);
                })
                .call()
                .entity(HomeworkHelpResponse.class);

        return Objects.requireNonNull(result, "AI returned empty homework response");
    }

    private static Media toMedia(MultipartFile image) {
        var mimeType = Optional.ofNullable(image.getContentType())
                .map(MimeTypeUtils::parseMimeType)
                .orElse(MimeTypeUtils.IMAGE_JPEG);
        return Media.builder()
                .mimeType(mimeType)
                .data(image.getResource())
                .build();
    }
}
