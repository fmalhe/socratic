package io.fmalhe.socratic.reading.internal;

import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.reading.ReadingPageResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.content.Media;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Objects;

@NullMarked
@Service
@RequiredArgsConstructor
class ReadingService {

    private final ProfileFacade profileFacade;
    private final ReadingPromptFactory promptFactory;
    private final ChatClient.Builder chatClientBuilder;

    ReadingPageResponse scanPage(@Nullable Long profileId, MultipartFile image) {
        if (image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image file must not be empty");
        }
        var profile = profileFacade.getActiveProfile(profileId);
        var systemPrompt = promptFactory.renderSystemPrompt(profile);

        byte[] bytes;
        try {
            bytes = image.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to read uploaded image", ex);
        }

        var mimeType = image.getContentType() != null
                ? MimeTypeUtils.parseMimeType(image.getContentType())
                : MimeTypeUtils.IMAGE_JPEG;

        var media = Media.builder()
                .mimeType(mimeType)
                .data(new ByteArrayResource(bytes))
                .build();

        var result = chatClientBuilder.build().prompt()
                .system(systemPrompt)
                .user(u -> u.text("Please read and break down this book page.").media(media))
                .call()
                .entity(ReadingPageResponse.class);

        return Objects.requireNonNull(result, "AI returned empty reading response");
    }
}
