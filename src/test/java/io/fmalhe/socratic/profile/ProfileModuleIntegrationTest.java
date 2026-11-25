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
        var seeded = profileFacade.getActiveProfile();

        assertThat(seeded.id()).isEqualTo(ProfileId.DEFAULT);
        assertThat(seeded.age()).isEqualTo(Age.of(8));
        assertThat(seeded.targetLanguageCode()).isEqualTo(LanguageCode.of("pt-PT"));
        assertThat(seeded.nativeLanguageCode()).isEqualTo(LanguageCode.of("nb-NO"));
        assertThat(seeded.dialectRules()).contains("European Portuguese (PT-PT)");

        var updated = profileFacade.updateActiveProfile(
                ProfileId.of(1L),
                new UpdateLearnerProfileRequest(
                        "Mateus",
                        Age.of(9),
                        LanguageCode.of("pt-PT"),
                        "European Portuguese",
                        LanguageCode.of("nb-NO"),
                        "Norwegian",
                        seeded.dialectRules(),
                        TtsVoiceName.of("pt-PT-Wavenet-B")));

        assertThat(updated.name()).isEqualTo("Mateus");
        assertThat(updated.age()).isEqualTo(Age.of(9));
        assertThat(updated.ttsVoiceName()).isEqualTo(TtsVoiceName.of("pt-PT-Wavenet-B"));
    }
}
