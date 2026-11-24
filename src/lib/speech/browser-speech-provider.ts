import type {
  SpeechLocale,
  SpeechProvider,
  SpeechProviderCallbacks,
} from "./speech-types";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const DEFAULT_TIMEOUT_MS = 12000;

export class BrowserSpeechProvider implements SpeechProvider {
  private recognition: SpeechRecognitionInstanceLike | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private lastTranscript = "";

  isSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  private clearTimer() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  async start(
    locale: SpeechLocale,
    callbacks: SpeechProviderCallbacks
  ): Promise<void> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onStateChange("ERROR");
      callbacks.onError(
        "Voice recognition is not supported in this browser. Please type your command below."
      );
      return;
    }

    this.cancelled = false;
    this.lastTranscript = "";
    callbacks.onStateChange("REQUESTING_PERMISSION");

    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        callbacks.onStateChange("ERROR");
        callbacks.onError(
          "Microphone permission was denied. Allow microphone access or type your command below."
        );
        return;
      }
    }

    const rec = new Ctor();
    this.recognition = rec;
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      callbacks.onStateChange("LISTENING");
      this.clearTimer();
      this.timeoutId = setTimeout(() => {
        this.stop();
      }, DEFAULT_TIMEOUT_MS);
    };

    rec.onresult = (event) => {
      let combined = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        combined += res[0]?.transcript ?? "";
        if (res.isFinal) isFinal = true;
      }
      this.lastTranscript = combined.trim();
      callbacks.onTranscript(this.lastTranscript, isFinal);
      if (isFinal) {
        this.clearTimer();
        callbacks.onStateChange("TRANSCRIPT_READY");
      }
    };

    rec.onerror = (event) => {
      this.clearTimer();
      if (this.cancelled) return;
      callbacks.onStateChange("ERROR");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        callbacks.onError(
          "Microphone permission denied. Please enable microphone access or use text input."
        );
      } else if (event.error === "no-speech") {
        callbacks.onError(
          "No speech detected. Please speak clearly and try again."
        );
      } else {
        callbacks.onError(
          `Speech recognition error (${event.error}). You can edit or type your command below.`
        );
      }
    };

    rec.onend = () => {
      this.clearTimer();
      this.recognition = null;
      if (this.cancelled) {
        callbacks.onStateChange("IDLE");
        return;
      }
      if (this.lastTranscript.length > 0) {
        callbacks.onStateChange("TRANSCRIPT_READY");
      }
    };

    try {
      rec.start();
    } catch {
      this.clearTimer();
      callbacks.onStateChange("ERROR");
      callbacks.onError("Could not start microphone recognition.");
    }
  }

  stop(): void {
    this.clearTimer();
    try {
      this.recognition?.stop();
    } catch {
      // Ignore if already stopped
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.clearTimer();
    try {
      this.recognition?.abort();
    } catch {
      // Ignore
    }
    this.recognition = null;
  }
}
