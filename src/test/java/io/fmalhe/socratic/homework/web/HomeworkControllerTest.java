package io.fmalhe.socratic.homework.web;

import io.fmalhe.socratic.homework.ExerciseStatus;
import io.fmalhe.socratic.homework.HomeworkExerciseDto;
import io.fmalhe.socratic.homework.HomeworkExerciseId;
import io.fmalhe.socratic.homework.HomeworkHelpResponse;
import io.fmalhe.socratic.homework.HomeworkReplyRequest;
import io.fmalhe.socratic.homework.HomeworkReplyResponse;
import io.fmalhe.socratic.homework.HomeworkSessionId;
import io.fmalhe.socratic.homework.HomeworkSessionResponse;
import io.fmalhe.socratic.homework.HomeworkWordHint;
import io.fmalhe.socratic.homework.internal.HomeworkPromptFactory;
import io.fmalhe.socratic.homework.internal.HomeworkService;
import io.fmalhe.socratic.homework.internal.HomeworkSessionService;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.function.Consumer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

    @MockitoBean
    private HomeworkSessionService sessionService;

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

    @Test
    void scansHomeworkPageAndReturnsPersistedSessionWithExercises() throws Exception {
        var session = new HomeworkSessionResponse(
                HomeworkSessionId.of(1L),
                ProfileId.DEFAULT,
                "Denne siden handler om frukt og telling.",
                "1. Quantas maçãs há?",
                "2026-11-25 14:00:00",
                List.of(new HomeworkExerciseDto(
                        HomeworkExerciseId.of(10L),
                        1,
                        "1",
                        "Quantas maçãs há?",
                        "Oppgaven spør hvor mange epler det er.",
                        List.of(new HomeworkWordHint("maçãs", "ma-çãs", "epler")),
                        "Kan du lese første ordet høyt?",
                        ExerciseStatus.PENDING,
                        List.of())));

        given(sessionService.scanPage(eq(ProfileId.DEFAULT), any())).willReturn(session);

        var image = new MockMultipartFile("image", "homework.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/homework/sessions/scan").file(image))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.exercises[0].id").value(10))
                .andExpect(jsonPath("$.exercises[0].label").value("1"))
                .andExpect(jsonPath("$.exercises[0].trickyWords[0].word").value("maçãs"));
    }

    @Test
    void getsSessionAndRepliesToExercise() throws Exception {
        var sessionId = HomeworkSessionId.of(1L);
        var exerciseId = HomeworkExerciseId.of(10L);

        given(sessionService.getSession(ProfileId.DEFAULT, sessionId)).willReturn(new HomeworkSessionResponse(
                sessionId,
                ProfileId.DEFAULT,
                "Side om frukt",
                "1. Quantas maçãs há?",
                "2026-11-25 14:00:00",
                List.of()));

        given(sessionService.replyToExercise(
                ProfileId.DEFAULT, sessionId, exerciseId, new HomeworkReplyRequest("Betyr maçãs epler?")))
                .willReturn(new HomeworkReplyResponse(
                        exerciseId,
                        ExerciseStatus.IN_PROGRESS,
                        "Ja, helt riktig! Maçãs betyr epler.",
                        "Muito bem!",
                        "Hvor mange epler ser du på bildet?"));

        mockMvc.perform(get("/api/homework/sessions/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));

        mockMvc.perform(post("/api/homework/sessions/1/exercises/10/reply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"message": "Betyr maçãs epler?"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.targetPhrase").value("Muito bem!"));
    }
}
