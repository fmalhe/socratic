package io.fmalhe.socratic.audio;

import io.fmalhe.socratic.profile.LanguageCode;
import io.fmalhe.socratic.profile.TtsVoiceName;
import org.jspecify.annotations.NullMarked;

@NullMarked
public interface TtsService {

    SynthesizedAudio synthesize(String text, LanguageCode languageCode, TtsVoiceName voiceName, boolean slow);
}
