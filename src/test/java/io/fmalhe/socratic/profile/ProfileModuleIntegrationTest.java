package io.fmalhe.socratic.profile;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@ApplicationModuleTest
class ProfileModuleIntegrationTest {

    @DynamicPropertySource
    static void sqliteProps(DynamicPropertyRegistry registry) throws IOException {
        Path tempDir = Files.createTempDirectory("socratic-profile-test");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("profile-test.db"));
    }

    @Autowired
    private ProfileFacade profileFacade;

    @Test
    void loadsSeededDefaultPtPtProfileAndUpdatesIt() {
        LearnerProfileDto seeded = profileFacade.getActiveProfile();

        assertThat(seeded.id()).isOne();
        assertThat(seeded.age()).isEqualTo(8);
        assertThat(seeded.targetLanguageCode()).isEqualTo("pt-PT");
        assertThat(seeded.nativeLanguageCode()).isEqualTo("nb-NO");
        assertThat(seeded.dialectRules()).contains("European Portuguese (PT-PT)");

        LearnerProfileDto updated = profileFacade.updateActiveProfile(
                1L,
                new UpdateLearnerProfileRequest(
                        "Mateus",
                        9,
                        "pt-PT",
                        "European Portuguese",
                        "nb-NO",
                        "Norwegian",
                        seeded.dialectRules(),
                        "pt-PT-Wavenet-B"));

        assertThat(updated.name()).isEqualTo("Mateus");
        assertThat(updated.age()).isEqualTo(9);
        assertThat(updated.ttsVoiceName()).isEqualTo("pt-PT-Wavenet-B");
    }
}
