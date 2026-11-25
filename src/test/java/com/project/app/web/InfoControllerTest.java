package com.project.app.web;

import com.project.app.service.AppInfoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(InfoController.class)
class InfoControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AppInfoService appInfoService;

    @Test
    void returnsInfoWithoutCaller() throws Exception {
        given(appInfoService.getInfo(null)).willReturn(new AppInfoResponse(
                "UP",
                "app",
                "0.0.1-SNAPSHOT",
                null,
                "25",
                true,
                null,
                Instant.parse("2026-11-25T20:00:00Z")));

        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.name").value("app"))
                .andExpect(jsonPath("$.virtualThreads").value(true));
    }

    @Test
    void returnsInfoWithCaller() throws Exception {
        given(appInfoService.getInfo("alice")).willReturn(new AppInfoResponse(
                "UP",
                "app",
                "0.0.1-SNAPSHOT",
                null,
                "25",
                true,
                "alice",
                Instant.parse("2026-11-25T20:00:00Z")));

        mockMvc.perform(get("/api/info").param("caller", "alice"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestedBy").value("alice"));
    }
}
