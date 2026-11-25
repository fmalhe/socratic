package io.fmalhe.socratic.progress.web;

import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.progress.ActivityType;
import io.fmalhe.socratic.progress.CompleteActivityRequest;
import io.fmalhe.socratic.progress.ProgressResponse;
import io.fmalhe.socratic.progress.ProgressResponse.SavedWordDto;
import io.fmalhe.socratic.progress.internal.ProgressService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProgressController.class)
class ProgressControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProgressService progressService;

    @Test
    void getsCurrentProgress() throws Exception {
        given(progressService.getProgress(ProfileId.of(1L))).willReturn(new ProgressResponse(
                ProfileId.of(1L),
                25,
                3,
                LocalDate.of(2026, 11, 25),
                4,
                List.of(new SavedWordDto(1L, "autocarro", LanguageCode.of("pt-PT"), "2026-11-25 12:00:00"))));

        mockMvc.perform(get("/api/progress").header("X-Profile-Id", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profileId").value(1))
                .andExpect(jsonPath("$.totalStars").value(25))
                .andExpect(jsonPath("$.currentStreakDays").value(3))
                .andExpect(jsonPath("$.lastActivityDate").value("2026-11-25"))
                .andExpect(jsonPath("$.recentWords[0].word").value("autocarro"))
                .andExpect(jsonPath("$.recentWords[0].languageCode").value("pt-PT"));
    }

    @Test
    void completesActivityAndReturnsUpdatedProgress() throws Exception {
        given(progressService.completeActivity(
                ProfileId.DEFAULT,
                new CompleteActivityRequest(ActivityType.READING, 10, List.of("ecrã"))))
                .willReturn(new ProgressResponse(
                        ProfileId.DEFAULT,
                        10,
                        1,
                        LocalDate.of(2026, 11, 25),
                        1,
                        List.of(new SavedWordDto(1L, "ecrã", LanguageCode.of("pt-PT"), "2026-11-25 12:00:00"))));

        mockMvc.perform(post("/api/progress/complete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"activityType": "READING", "starsEarned": 10, "trickyWords": ["ecrã"]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalStars").value(10))
                .andExpect(jsonPath("$.pagesReadCount").value(1));
    }
}
