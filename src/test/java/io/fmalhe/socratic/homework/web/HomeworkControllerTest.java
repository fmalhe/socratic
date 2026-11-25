package io.fmalhe.socratic.homework.web;

import io.fmalhe.socratic.homework.HomeworkHelpResponse;
import io.fmalhe.socratic.homework.internal.HomeworkPromptFactory;
import io.fmalhe.socratic.homework.internal.HomeworkService;
import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.function.Consumer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(HomeworkController.class)
@Import({HomeworkService.class, HomeworkPromptFactory.class})
class HomeworkControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProfileFacade profileFacade;

    @MockitoBean
    private ChatClient.Builder chatClientBuilder;

    @Test
    void helpsWithHomeworkQuestionWithoutGivingAnswer() throws Exception {
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

        var chatClient = mock(ChatClient.class);
        var requestSpec = mock(ChatClient.ChatClientRequestSpec.class);
        var callResponseSpec = mock(ChatClient.CallResponseSpec.class);

        given(chatClientBuilder.build()).willReturn(chatClient);
        given(chatClient.prompt()).willReturn(requestSpec);
        given(requestSpec.system(anyString())).willReturn(requestSpec);
        given(requestSpec.user(any(Consumer.class))).willReturn(requestSpec);
        given(requestSpec.call()).willReturn(callResponseSpec);
        given(callResponseSpec.entity(HomeworkHelpResponse.class)).willReturn(new HomeworkHelpResponse(
                "Oppgaven ber deg telle eplene.",
                List.of("Se på ordet 'maçãs' (epler).", "Tell én etter én!"),
                "Tu consegues!"));

        mockMvc.perform(multipart("/api/homework/help").param("question", "Quantas maçãs há?"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskExplanationNative").value("Oppgaven ber deg telle eplene."))
                .andExpect(jsonPath("$.encouragementTarget").value("Tu consegues!"));
    }

    @Test
    void returnsBadRequestWhenNeitherImageNorQuestionProvided() throws Exception {
        mockMvc.perform(multipart("/api/homework/help"))
                .andExpect(status().isBadRequest());
    }
}
