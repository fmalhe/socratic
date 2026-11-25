package io.fmalhe.socratic.progress.internal;

import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@NullMarked
@Component
class StreakCalculator {

    int computeNextStreak(int currentStreak, @Nullable LocalDate lastActivityDate, LocalDate today) {
        if (lastActivityDate == null) {
            return 1;
        }
        if (lastActivityDate.equals(today)) {
            return Math.max(1, currentStreak);
        }
        if (lastActivityDate.equals(today.minusDays(1))) {
            return currentStreak + 1;
        }
        return 1;
    }
}
