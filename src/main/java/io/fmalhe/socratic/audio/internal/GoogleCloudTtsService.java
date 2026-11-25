package io.fmalhe.socratic.audio.internal;

import com.google.cloud.texttospeech.v1.AudioConfig;
import com.google.cloud.texttospeech.v1.AudioEncoding;
import com.google.cloud.texttospeech.v1.SynthesisInput;
import com.google.cloud.texttospeech.v1.SynthesizeSpeechResponse;
import com.google.cloud.texttospeech.v1.TextToSpeechClient;
import com.google.cloud.texttospeech.v1.VoiceSelectionParams;
import io.fmalhe.socratic.audio.TtsNotConfiguredException;
import io.fmalhe.socratic.audio.TtsService;
import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.TtsVoiceName;
import jakarta.annotation.PreDestroy;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

@NullMarked
@Service
class GoogleCloudTtsService implements TtsService {

    private static final double SLOW_SPEAKING_RATE = 0.75;
    private static final double NORMAL_SPEAKING_RATE = 1.0;

    private final boolean enabled;
    private volatile @Nullable TextToSpeechClient client;

    GoogleCloudTtsService(@Value("${app.tts.enabled:true}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    public byte[] synthesize(String text, LanguageCode languageCode, TtsVoiceName voiceName, boolean slow) {
        if (!enabled) {
            throw new TtsNotConfiguredException("Google Cloud TTS is disabled; use browser speechSynthesis fallback");
        }
        TextToSpeechClient ttsClient = getOrCreateClient();

        SynthesisInput input = SynthesisInput.newBuilder()
                .setText(text)
                .build();

        VoiceSelectionParams voice = VoiceSelectionParams.newBuilder()
                .setLanguageCode(languageCode.value())
                .setName(voiceName.value())
                .build();

        AudioConfig audioConfig = AudioConfig.newBuilder()
                .setAudioEncoding(AudioEncoding.MP3)
                .setSpeakingRate(slow ? SLOW_SPEAKING_RATE : NORMAL_SPEAKING_RATE)
                .build();

        SynthesizeSpeechResponse response = ttsClient.synthesizeSpeech(input, voice, audioConfig);
        return response.getAudioContent().toByteArray();
    }

    private TextToSpeechClient getOrCreateClient() {
        TextToSpeechClient existing = client;
        if (existing != null) {
            return existing;
        }
        synchronized (this) {
            if (client == null) {
                try {
                    client = TextToSpeechClient.create();
                } catch (IOException | RuntimeException ex) {
                    throw new TtsNotConfiguredException(
                            "Google Cloud TTS credentials are not configured; use browser speechSynthesis fallback",
                            ex);
                }
            }
            return client;
        }
    }

    @PreDestroy
    void close() {
        TextToSpeechClient existing = client;
        if (existing != null) {
            existing.close();
        }
    }
}
