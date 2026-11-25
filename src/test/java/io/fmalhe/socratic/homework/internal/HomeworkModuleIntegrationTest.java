package io.fmalhe.socratic.homework.internal;

import io.fmalhe.socratic.homework.ExerciseStatus;
import io.fmalhe.socratic.homework.HomeworkReplyRequest;
import io.fmalhe.socratic.homework.HomeworkWordHint;
import io.fmalhe.socratic.homework.MessageSender;
import io.fmalhe.socratic.homework.internal.HomeworkSessionService.TutorPingPongReply;
import io.fmalhe.socratic.homework.internal.JooqHomeworkRepository.ExtractedExercise;
import io.fmalhe.socratic.homework.internal.JooqHomeworkRepository.ScannedHomeworkPage;
import io.fmalhe.socratic.profile.ProfileId;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.DIRECT_DEPENDENCIES)
class HomeworkModuleIntegrationTest {

    @DynamicPropertySource
    static void sqliteProps(DynamicPropertyRegistry registry) throws IOException {
        Path tempDir = Files.createTempDirectory("socratic-homework-test");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("homework-test.db"));
    }

    @Autowired
    private HomeworkSessionService sessionService;

    @MockitoBean
    private ChatClient.Builder chatClientBuilder;

    @Test
    void scansPagePersistsExercisesPingPongsAndCompletesOneByOne() {
        var chatClient = mock(ChatClient.class);
        var requestSpec = mock(ChatClient.ChatClientRequestSpec.class);
        var callResponseSpec = mock(ChatClient.CallResponseSpec.class);

        given(chatClientBuilder.build()).willReturn(chatClient);
        given(chatClient.prompt()).willReturn(requestSpec);
        given(requestSpec.system(anyString())).willReturn(requestSpec);
        given(requestSpec.user(any(Consumer.class))).willReturn(requestSpec);
        given(requestSpec.user(anyString())).willReturn(requestSpec);
        given(requestSpec.call()).willReturn(callResponseSpec);

        given(callResponseSpec.entity(ScannedHomeworkPage.class)).willReturn(new ScannedHomeworkPage(
                "To små leseoppgaver om hverdagsord.",
                "1. Quantas maçãs há na mesa? 2. Onde está o autocarro?",
                List.of(
                        new ExtractedExercise(
                                "1",
                                "Quantas maçãs há na mesa?",
                                "Oppgaven spør hvor mange epler som ligger på bordet.",
                                List.of(new HomeworkWordHint("maçãs", "ma-çãs", "epler")),
                                "Hva tror du ordet 'mesa' betyr?"),
                        new ExtractedExercise(
                                "2",
                                "Onde está o autocarro?",
                                "Oppgaven spør hvor bussen er.",
                                List.of(new HomeworkWordHint("autocarro", "au-to-car-ro", "buss")),
                                "Ser du bussen på bildet?"))));

        given(callResponseSpec.entity(TutorPingPongReply.class)).willReturn(new TutorPingPongReply(
                "Kjempebra! 'Mesa' betyr bord.",
                "Boa! A mesa!",
                "Klarer du å telle eplene på bordet nå?"));

        var image = new MockMultipartFile("image", "page.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[]{1, 2, 3});
        var session = sessionService.scanPage(ProfileId.DEFAULT, image);

        assertThat(session.exercises()).hasSize(2);
        var firstExercise = session.exercises().getFirst();
        assertThat(firstExercise.label()).isEqualTo("1");
        assertThat(firstExercise.status()).isEqualTo(ExerciseStatus.PENDING);

        var reply = sessionService.replyToExercise(
                ProfileId.DEFAULT,
                session.id(),
                firstExercise.id(),
                new HomeworkReplyRequest("Betyr mesa bord?"));

        assertThat(reply.status()).isEqualTo(ExerciseStatus.IN_PROGRESS);
        assertThat(reply.targetPhrase()).isEqualTo("Boa! A mesa!");

        var completed = sessionService.completeExercise(ProfileId.DEFAULT, session.id(), firstExercise.id());
        assertThat(completed.status()).isEqualTo(ExerciseStatus.COMPLETED);
        assertThat(completed.messages()).hasSize(2);
        assertThat(completed.messages().getFirst().sender()).isEqualTo(MessageSender.CHILD);
        assertThat(completed.messages().get(1).sender()).isEqualTo(MessageSender.TUTOR);
        assertThat(completed.messages().get(1).targetPhrase()).hasValue("Boa! A mesa!");

        var reloaded = sessionService.getSession(ProfileId.DEFAULT, session.id());
        assertThat(reloaded.exercises().getFirst().status()).isEqualTo(ExerciseStatus.COMPLETED);
        assertThat(reloaded.exercises().get(1).status()).isEqualTo(ExerciseStatus.PENDING);
    }
}
