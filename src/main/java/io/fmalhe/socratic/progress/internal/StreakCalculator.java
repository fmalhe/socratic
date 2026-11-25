package io.fmalhe.socratic.progress.internal;

import org.jspecify.annotations.NullMarked;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Optional;

@NullMarked
@Component
class StreakCalculator {

    int computeNextStreak(int currentStreak, Optional<LocalDate> lastActivityDate, LocalDate today) {
        return lastActivityDate
                .map(last -> {
                    if (last.equals(today)) {
                        return Math.max(1, currentStreak);
                    }
                    if (last.equals(today.minusDays(1))) {
                        return currentStreak + 1;
                    }
                    return 1;
                })
                .orElse(1);
    }
}
