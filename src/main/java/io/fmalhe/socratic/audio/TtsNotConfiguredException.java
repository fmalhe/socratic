package io.fmalhe.socratic.audio;

import org.jspecify.annotations.NullMarked;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@NullMarked
@ResponseStatus(HttpStatus.NOT_IMPLEMENTED)
public class TtsNotConfiguredException extends RuntimeException {

    public TtsNotConfiguredException(String message) {
        super(message);
    }

    public TtsNotConfiguredException(String message, Throwable cause) {
        super(message, cause);
    }
}
