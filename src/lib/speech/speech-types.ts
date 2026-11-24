export type SpeechRecognitionState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "LISTENING"
  | "PROCESSING"
  | "TRANSCRIPT_READY"
  | "ERROR";

export type SpeechLocale = "en-IN" | "hi-IN";

export interface SpeechProviderCallbacks {
  onStateChange: (state: SpeechRecognitionState) => void;
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (message: string) => void;
}

export interface SpeechProvider {
  isSupported(): boolean;
  start(locale: SpeechLocale, callbacks: SpeechProviderCallbacks): Promise<void>;
  stop(): void;
  cancel(): void;
}
