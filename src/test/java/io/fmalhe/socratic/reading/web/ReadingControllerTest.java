package io.fmalhe.socratic.reading.web;

import io.fmalhe.socratic.profile.Age;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.profile.TtsVoiceName;
import io.fmalhe.socratic.reading.ReadingPageResponse;
import io.fmalhe.socratic.reading.ReadingPageResponse.SentenceItem;
import io.fmalhe.socratic.reading.ReadingPageResponse.WordHint;
import io.fmalhe.socratic.reading.internal.ReadingPromptFactory;
import io.fmalhe.socratic.reading.internal.ReadingService;
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
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ReadingController.class)
@Import({ReadingService.class, ReadingPromptFactory.class})
class ReadingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProfileFacade profileFacade;

    @MockitoBean
    private ChatClient.Builder chatClientBuilder;

    @Test
    void scansBookPageAndReturnsStructuredReadingResponse() throws Exception {
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
        given(callResponseSpec.entity(ReadingPageResponse.class)).willReturn(new ReadingPageResponse(
                "A borboleta está a voar.",
                List.of(new SentenceItem(
                        "A borboleta está a voar.",
                        "Sommerfuglen flyr.",
                        List.of(new WordHint("borboleta", "bor-bo-le-ta", "sommerfugl"))))));

        var image = new MockMultipartFile(
                "image",
                "page.jpg",
                MediaType.IMAGE_JPEG_VALUE,
                new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/reading/scan").file(image))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullText").value("A borboleta está a voar."))
                .andExpect(jsonPath("$.sentences[0].trickyWords[0].syllables").value("bor-bo-le-ta"));
    }
}
