import type { VoiceLanguage } from "@/server/ai/voice-schemas";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Speaks the assistant response via browser SpeechSynthesis when available.
 * Never throws or blocks if voices or SpeechSynthesis are unavailable.
 */
export function speakResponse(
  text: string,
  language: VoiceLanguage
): boolean {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    return false;
  }

  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = language === "HI" ? "hi-IN" : "en-IN";
    utterance.lang = targetLang;
    utterance.rate = 0.98;

    const voices = synth.getVoices();
    const matched =
      voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ??
      voices.find((v) =>
        v.lang.toLowerCase().startsWith(language === "HI" ? "hi" : "en")
      );
    if (matched) {
      utterance.voice = matched;
    }

    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore
  }
}
