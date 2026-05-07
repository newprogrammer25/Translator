import { useCallback, useEffect } from "react";
import { speakWithBrowser, cancelBrowserSpeech } from "../lib/speech";

interface PlayOptions {
  /** ISO/BCP-47 lang for browser SpeechSynthesis */
  lang?: string;
}

/**
 * Speak text via the browser's offline `speechSynthesis` API.
 *
 * The Gemini-powered backend doesn't expose a TTS endpoint, so we always use the
 * browser's built-in voices. They're instant (no network round-trip) and reasonably
 * natural on Chromium / Safari. Cleans up on unmount.
 */
export function useTTS() {
  const cancel = useCallback(() => {
    cancelBrowserSpeech();
  }, []);

  const speak = useCallback(
    (text: string, opts: PlayOptions = {}): void => {
      const trimmed = text.trim();
      if (!trimmed) return;
      cancel();
      speakWithBrowser(trimmed, opts.lang ?? "en-US");
    },
    [cancel],
  );

  useEffect(() => () => cancel(), [cancel]);

  return { speak, cancel };
}
