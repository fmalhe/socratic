package io.fmalhe.socratic.audio;

import org.jspecify.annotations.NullMarked;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;

@NullMarked
public record SynthesizedAudio(Resource content, MediaType mediaType) {

    public static final MediaType AUDIO_MPEG = MediaType.parseMediaType("audio/mpeg");

    public static SynthesizedAudio mp3(byte[] bytes) {
        return new SynthesizedAudio(new ByteArrayResource(bytes), AUDIO_MPEG);
    }
}
