package io.fmalhe.socratic.progress.internal;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class StreakCalculatorTest {

    private final StreakCalculator calculator = new StreakCalculator();

    @Test
    void startsStreakAtOneWhenNoPreviousActivity() {
        int next = calculator.computeNextStreak(0, Optional.empty(), LocalDate.of(2026, 11, 25));
        assertThat(next).isOne();
    }

    @Test
    void keepsStreakWhenAlreadyActiveToday() {
        LocalDate today = LocalDate.of(2026, 11, 25);
        int next = calculator.computeNextStreak(4, Optional.of(today), today);
        assertThat(next).isEqualTo(4);
    }

    @Test
    void incrementsStreakWhenLastActiveYesterday() {
        LocalDate today = LocalDate.of(2026, 11, 25);
        int next = calculator.computeNextStreak(4, Optional.of(today.minusDays(1)), today);
        assertThat(next).isEqualTo(5);
    }

    @Test
    void resetsStreakToOneWhenDaysWereMissed() {
        LocalDate today = LocalDate.of(2026, 11, 25);
        int next = calculator.computeNextStreak(7, Optional.of(today.minusDays(2)), today);
        assertThat(next).isOne();
    }
}
