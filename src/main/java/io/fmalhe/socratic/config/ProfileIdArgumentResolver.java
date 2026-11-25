package io.fmalhe.socratic.config;

import io.fmalhe.socratic.profile.ProfileId;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.server.ResponseStatusException;

@NullMarked
public class ProfileIdArgumentResolver implements HandlerMethodArgumentResolver {

    public static final String PROFILE_ID_HEADER = "X-Profile-Id";

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return ProfileId.class.equals(parameter.getParameterType());
    }

    @Override
    public ProfileId resolveArgument(
            MethodParameter parameter,
            @Nullable ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            @Nullable WebDataBinderFactory binderFactory) {
        var header = webRequest.getHeader(PROFILE_ID_HEADER);
        if (!StringUtils.hasText(header)) {
            return ProfileId.DEFAULT;
        }
        try {
            return ProfileId.valueOf(header);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid " + PROFILE_ID_HEADER + " header: " + header, ex);
        }
    }
}
