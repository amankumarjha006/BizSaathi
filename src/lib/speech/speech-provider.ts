import { BrowserSpeechProvider } from "./browser-speech-provider";
import type { SpeechProvider } from "./speech-types";

export * from "./speech-types";
export { BrowserSpeechProvider } from "./browser-speech-provider";

/**
 * Factory for the active speech recognition provider.
 * Replace BrowserSpeechProvider here to integrate a dedicated multilingual STT service later.
 */
export function createSpeechProvider(): SpeechProvider {
  return new BrowserSpeechProvider();
}
