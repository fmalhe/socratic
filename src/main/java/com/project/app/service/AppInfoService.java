package com.project.app.service;

import com.project.app.config.AppProperties;
import com.project.app.web.AppInfoResponse;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import java.time.Instant;

@NullMarked
@Service
public class AppInfoService {

    private final AppProperties properties;

    public AppInfoService(AppProperties properties) {
        this.properties = properties;
    }

    public AppInfoResponse getInfo(@Nullable String requestedBy) {
        String javaVersion = System.getProperty("java.version");
        return new AppInfoResponse(
                "UP",
                properties.name(),
                properties.version(),
                properties.description(),
                javaVersion,
                Thread.currentThread().isVirtual(),
                requestedBy,
                Instant.now());
    }
}
