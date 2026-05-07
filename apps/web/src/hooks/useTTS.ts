import { useCallback, useEffect, useRef } from "react";
import { fetchTTS } from "../lib/api";
import { speakWithBrowser, cancelBrowserSpeech } from "../lib/speech";

interface PlayOptions {
  /** ISO/BCP-47 lang for browser-side fallback */
  lang?: string;
  /** When true, prefer the OpenAI tts-1 endpoint (better quality, ~300-500ms latency).
   *  When false, use the offline `speechSynthesis` API (instant, lower quality). */
  server?: boolean;
  voice?: string;
  speed?: number;
}

/** Returns helpers to speak text and cancel current playback. Cleans up on unmount. */
export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    cancelBrowserSpeech();
  }, []);

  const speak = useCallback(
    async (text: string, opts: PlayOptions = {}): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      cancel();
      if (opts.server === false) {
        speakWithBrowser(trimmed, opts.lang ?? "en-US");
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const blob = await fetchTTS(trimmed, opts.voice ?? "alloy", opts.speed ?? 1.0, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Fall back to browser TTS so the user still hears something.
        speakWithBrowser(trimmed, opts.lang ?? "en-US");
      }
    },
    [cancel],
  );

  useEffect(() => () => cancel(), [cancel]);

  return { speak, cancel };
}
