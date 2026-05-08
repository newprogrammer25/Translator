/**
 * Browser-side speech utilities.
 *
 * SpeechRecognition gives us partial transcripts in real time which we can stream
 * straight to the translation endpoint, avoiding the round-trip latency of sending
 * audio chunks to Whisper. SpeechSynthesis gives us instant offline TTS as a
 * fallback when a server-rendered MP3 isn't ready yet.
 */

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  onstart: ((ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export interface RecognitionHandlers {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}

export interface RecognitionController {
  stop(): void;
  abort(): void;
}

export function startRecognition(
  lang: string,
  handlers: RecognitionHandlers,
): RecognitionController | null {
  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    handlers.onError?.("Speech recognition not supported in this browser");
    return null;
  }
  const rec = new Ctor();
  rec.lang = lang === "auto" ? "en-US" : lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let lastFinalIndex = 0;

  rec.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) {
        if (i >= lastFinalIndex) {
          handlers.onFinal?.(transcript.trim());
          lastFinalIndex = i + 1;
        }
      } else {
        interim += transcript;
      }
    }
    if (interim) handlers.onPartial?.(interim.trim());
  };
  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    handlers.onError?.(event.error || "speech recognition error");
  };
  rec.onend = () => {
    handlers.onEnd?.();
  };

  try {
    rec.start();
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : String(err));
    return null;
  }
  return {
    stop: () => {
      try { rec.stop(); } catch { /* already stopped */ }
    },
    abort: () => {
      try { rec.abort(); } catch { /* already aborted */ }
    },
  };
}

export function speakWithBrowser(text: string, lang: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang === "auto" ? "en-US" : lang;
  utter.rate = 1.0;
  utter.pitch = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export function cancelBrowserSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
