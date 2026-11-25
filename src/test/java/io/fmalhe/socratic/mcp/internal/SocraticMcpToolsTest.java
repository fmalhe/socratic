package io.fmalhe.socratic.mcp.internal;

import io.fmalhe.socratic.homework.HomeworkSessionFacade;
import io.fmalhe.socratic.homework.HomeworkSessionId;
import io.fmalhe.socratic.homework.HomeworkSessionResponse;
import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import io.fmalhe.socratic.progress.ProgressFacade;
import io.fmalhe.socratic.progress.ProgressResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class SocraticMcpToolsTest {

    @Test
    void registersAllFourMcpToolsAndDelegatesToFacades() {
        var profileFacade = mock(ProfileFacade.class);
        var progressFacade = mock(ProgressFacade.class);
        var homeworkFacade = mock(HomeworkSessionFacade.class);

        var profile = new LearnerProfileDto(
                ProfileId.DEFAULT,
                "Sofia",
                Age.of(8),
                LanguageCode.of("pt-PT"),
                "European Portuguese",
                LanguageCode.of("nb-NO"),
                "Norwegian",
                "Use PT-PT.",
                TtsVoiceName.of("pt-PT-Wavenet-A"));
        var progress = new ProgressResponse(ProfileId.DEFAULT, 30, 4, null, 3, List.of());
        var session = new HomeworkSessionResponse(
                HomeworkSessionId.of(1L),
                ProfileId.DEFAULT,
                "Summary",
                "Text",
                "2026-11-25 14:00:00",
                List.of());

        given(profileFacade.getActiveProfile(ProfileId.DEFAULT)).willReturn(profile);
        given(progressFacade.getProgress(ProfileId.DEFAULT)).willReturn(progress);
        given(homeworkFacade.listSessions(ProfileId.DEFAULT)).willReturn(List.of(session));
        given(homeworkFacade.getSession(ProfileId.DEFAULT, HomeworkSessionId.of(1L))).willReturn(session);

        var tools = new SocraticMcpTools(profileFacade, progressFacade, homeworkFacade);
        var provider = new McpToolsConfig().socraticToolCallbackProvider(tools);

        assertThat(provider.getToolCallbacks()).hasSize(4);
        assertThat(tools.getLearnerProfile()).isEqualTo(profile);
        assertThat(tools.getProgressAndTrickyWords()).isEqualTo(progress);
        assertThat(tools.listHomeworkSessions()).containsExactly(session);
        assertThat(tools.getHomeworkSession(1L)).isEqualTo(session);
    }
}
