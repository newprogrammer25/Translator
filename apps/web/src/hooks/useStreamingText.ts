import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Buffer streaming text and flush at most once per animation frame.
 *
 * Streaming SSE delivers many tiny chunks per second; calling `setState` on each
 * one forces React to re-render N times per second and trips up the compositor.
 * Funnelling those updates through `requestAnimationFrame` keeps re-renders
 * aligned with the display refresh (60–120 Hz) so streaming stays smooth.
 */
export function useStreamingText() {
  const [text, setText] = useState("");
  const bufferRef = useRef("");
  const frameRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const flush = useCallback(() => {
    frameRef.current = null;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setText(bufferRef.current);
  }, []);

  const append = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      bufferRef.current += chunk;
      dirtyRef.current = true;
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const reset = useCallback((value = "") => {
    bufferRef.current = value;
    dirtyRef.current = false;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setText(value);
  }, []);

  /** Force an immediate flush (e.g. on stream `done` so we don't wait a frame). */
  const finalize = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (dirtyRef.current) {
      dirtyRef.current = false;
      setText(bufferRef.current);
    }
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  /** Read the latest accumulated text without waiting for a re-render. */
  const peek = useCallback(() => bufferRef.current, []);

  return { text, append, reset, finalize, peek };
}
