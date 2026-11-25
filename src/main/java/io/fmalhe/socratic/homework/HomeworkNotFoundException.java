package io.fmalhe.socratic.homework;

import org.jspecify.annotations.NullMarked;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@NullMarked
@ResponseStatus(HttpStatus.NOT_FOUND)
public class HomeworkNotFoundException extends RuntimeException {

    public HomeworkNotFoundException(String message) {
        super(message);
    }
}
