package io.fmalhe.socratic.homework;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.util.Optional;

@NullMarked
public final class HomeworkMessageDto {

    private final long id;
    private final MessageSender sender;
    private final String content;
    private final @Nullable String targetPhrase;
    private final String createdAt;

    public HomeworkMessageDto(
            long id,
            MessageSender sender,
            String content,
            @Nullable String targetPhrase,
            String createdAt) {
        this.id = id;
        this.sender = sender;
        this.content = content;
        this.targetPhrase = targetPhrase;
        this.createdAt = createdAt;
    }

    @JsonProperty("id")
    public long id() {
        return id;
    }

    @JsonProperty("sender")
    public MessageSender sender() {
        return sender;
    }

    @JsonProperty("content")
    public String content() {
        return content;
    }

    @JsonProperty("targetPhrase")
    public Optional<String> targetPhrase() {
        return Optional.ofNullable(targetPhrase);
    }

    @JsonProperty("createdAt")
    public String createdAt() {
        return createdAt;
    }
}
