package io.fmalhe.socratic.reading.internal;

import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.reading.ReadingPageResponse;
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
public class ReadingService {

    private final ProfileFacade profileFacade;
    private final ReadingPromptFactory promptFactory;
    private final ChatClient.Builder chatClientBuilder;

    public ReadingPageResponse scanPage(ProfileId profileId, MultipartFile image) {
        if (image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image file must not be empty");
        }
        var profile = profileFacade.getActiveProfile(profileId);
        var systemPrompt = promptFactory.renderSystemPrompt(profile);

        var mimeType = Optional.ofNullable(image.getContentType())
                .map(MimeTypeUtils::parseMimeType)
                .orElse(MimeTypeUtils.IMAGE_JPEG);

        var media = Media.builder()
                .mimeType(mimeType)
                .data(image.getResource())
                .build();

        var result = chatClientBuilder.build().prompt()
                .system(systemPrompt)
                .user(u -> u.text("Please read and break down this book page.").media(media))
                .call()
                .entity(ReadingPageResponse.class);

        return Objects.requireNonNull(result, "AI returned empty reading response");
    }
}
