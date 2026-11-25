package com.project.app.web;

import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

import java.time.Instant;

@NullMarked
public record AppInfoResponse(
        String status,
        String name,
        String version,
        @Nullable String description,
        String javaVersion,
        boolean virtualThreads,
        @Nullable String requestedBy,
        Instant timestamp) {
}
