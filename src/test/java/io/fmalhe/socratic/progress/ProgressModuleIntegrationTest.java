package io.fmalhe.socratic.progress;

import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import static io.fmalhe.socratic.jooq.Tables.CHILD_PROGRESS;
import static io.fmalhe.socratic.jooq.Tables.SAVED_WORD;
import static org.assertj.core.api.Assertions.assertThat;

@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.DIRECT_DEPENDENCIES)
class ProgressModuleIntegrationTest {

    @DynamicPropertySource
    static void sqliteProps(DynamicPropertyRegistry registry) throws IOException {
        Path tempDir = Files.createTempDirectory("socratic-progress-test");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("progress-test.db"));
    }

    @Autowired
    private DSLContext dsl;

    @Test
    void handlesActivityCompletedEventAndPersistsProgressAndWords(Scenario scenario) {
        LocalDate day = LocalDate.of(2026, 11, 25);

        scenario.publish(new ActivityCompletedEvent(
                        1L,
                        ActivityType.READING,
                        10,
                        List.of("borboleta", "pequeno-almoço"),
                        day))
                .andWaitForStateChange(() -> dsl.select(CHILD_PROGRESS.TOTAL_STARS)
                        .from(CHILD_PROGRESS)
                        .where(CHILD_PROGRESS.PROFILE_ID.eq(1))
                        .fetchOneInto(Integer.class))
                .andVerify(stars -> assertThat(stars).isEqualTo(10));

        var progress = dsl.selectFrom(CHILD_PROGRESS)
                .where(CHILD_PROGRESS.PROFILE_ID.eq(1))
                .fetchOne();

        assertThat(progress).isNotNull();
        assertThat(progress.getCurrentStreakDays()).isOne();
        assertThat(progress.getPagesReadCount()).isOne();
        assertThat(progress.getLastActivityDate()).isEqualTo("2026-11-25");

        List<String> savedWords = dsl.select(SAVED_WORD.WORD)
                .from(SAVED_WORD)
                .where(SAVED_WORD.PROFILE_ID.eq(1))
                .fetch(SAVED_WORD.WORD);

        assertThat(savedWords).containsExactlyInAnyOrder("borboleta", "pequeno-almoço");
    }
}
