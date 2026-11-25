package io.fmalhe.socratic.profile.web;

import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProfileController.class)
class ProfileControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProfileFacade profileFacade;

    @Test
    void defaultsToDefaultProfileIdWhenHeaderIsMissing() throws Exception {
        given(profileFacade.getActiveProfile(ProfileId.DEFAULT)).willReturn(new LearnerProfileDto(
                ProfileId.DEFAULT,
                "Sofia",
                Age.of(8),
                LanguageCode.of("pt-PT"),
                "European Portuguese",
                LanguageCode.of("nb-NO"),
                "Norwegian",
                "Use PT-PT.",
                TtsVoiceName.of("pt-PT-Wavenet-A")));

        mockMvc.perform(get("/api/profile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.age").value(8))
                .andExpect(jsonPath("$.targetLanguageCode").value("pt-PT"))
                .andExpect(jsonPath("$.ttsVoiceName").value("pt-PT-Wavenet-A"));
    }

    @Test
    void resolvesProfileIdFromHeaderWhenPresent() throws Exception {
        var profileId = ProfileId.of(2L);
        given(profileFacade.getActiveProfile(profileId)).willReturn(new LearnerProfileDto(
                profileId,
                "Mateus",
                Age.of(10),
                LanguageCode.of("pt-PT"),
                "European Portuguese",
                LanguageCode.of("nb-NO"),
                "Norwegian",
                "Use PT-PT.",
                TtsVoiceName.of("pt-PT-Wavenet-B")));

        mockMvc.perform(get("/api/profile").header("X-Profile-Id", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(2))
                .andExpect(jsonPath("$.name").value("Mateus"));
    }

    @Test
    void returnsBadRequestWhenProfileIdHeaderIsInvalid() throws Exception {
        mockMvc.perform(get("/api/profile").header("X-Profile-Id", "not-a-number"))
                .andExpect(status().isBadRequest());
    }
}
