package io.fmalhe.socratic.audio.web;

import io.fmalhe.socratic.audio.TtsNotConfiguredException;
import io.fmalhe.socratic.audio.TtsService;
import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AudioController.class)
class AudioControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProfileFacade profileFacade;

    @MockitoBean
    private TtsService ttsService;

    private static final LearnerProfileDto PROFILE = new LearnerProfileDto(
            ProfileId.DEFAULT,
            "Sofia",
            Age.of(8),
            LanguageCode.of("pt-PT"),
            "European Portuguese",
            LanguageCode.of("nb-NO"),
            "Norwegian",
            "Use PT-PT.",
            TtsVoiceName.of("pt-PT-Wavenet-A"));

    @Test
    void returnsMp3AudioWhenTtsIsConfigured() throws Exception {
        given(profileFacade.getActiveProfile(ProfileId.DEFAULT)).willReturn(PROFILE);
        given(ttsService.synthesize(
                "Olá!", LanguageCode.of("pt-PT"), TtsVoiceName.of("pt-PT-Wavenet-A"), true))
                .willReturn(new byte[]{10, 20, 30});

        mockMvc.perform(post("/api/audio/speak")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text": "Olá!", "slow": true}
                                """))
                .andExpect(status().isOk())
                .andExpect(content().contentType("audio/mpeg"))
                .andExpect(content().bytes(new byte[]{10, 20, 30}));
    }

    @Test
    void returns501WhenTtsCredentialsAreNotConfigured() throws Exception {
        given(profileFacade.getActiveProfile(ProfileId.DEFAULT)).willReturn(PROFILE);
        given(ttsService.synthesize(
                "Olá!", LanguageCode.of("pt-PT"), TtsVoiceName.of("pt-PT-Wavenet-A"), false))
                .willThrow(new TtsNotConfiguredException("Not configured"));

        mockMvc.perform(post("/api/audio/speak")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text": "Olá!", "languageCode": "pt-PT", "slow": false}
                                """))
                .andExpect(status().isNotImplemented());
    }
}
