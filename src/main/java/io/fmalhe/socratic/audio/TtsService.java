package io.fmalhe.socratic.audio;

import org.jspecify.annotations.NullMarked;

@NullMarked
public interface TtsService {

    byte[] synthesize(String text, String languageCode, String voiceName, boolean slow);
}
