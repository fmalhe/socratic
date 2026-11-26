package io.fmalhe.socratic.homework;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.util.Optional;

@NullMarked
@Getter
@RequiredArgsConstructor
public final class HomeworkMessageDto {

    private final long id;
    private final MessageSender sender;
    private final String content;
    private final @Nullable String targetPhrase;
    private final String createdAt;

    public Optional<String> getTargetPhrase() {
        return Optional.ofNullable(targetPhrase);
    }
}
