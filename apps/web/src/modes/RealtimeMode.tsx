import { ArrowLeftRight, Copy, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { RecordButton } from "../components/RecordButton";
import { useLanguages } from "../hooks/useLanguages";
import { useStreamingText } from "../hooks/useStreamingText";
import { useTTS } from "../hooks/useTTS";
import { streamTranslate } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startRecognition,
  type RecognitionController,
} from "../lib/speech";
import { loadJSON, saveJSON } from "../lib/storage";

interface Prefs {
  source: string;
  target: string;
  autoSpeak: boolean;
}

const PREFS_KEY = "translator:realtime";

const DEFAULT_PREFS: Prefs = {
  source: "en-US",
  target: "ru-RU",
  autoSpeak: true,
};

export function RealtimeMode() {
  const languages = useLanguages();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState("");
  const [transcript, setTranscript] = useState("");
  const translation = useStreamingText();
  const [error, setError] = useState<string | null>(null);

  const { speak, cancel } = useTTS();
  const recognizerRef = useRef<RecognitionController | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const supported = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setRecording(false);
  }, []);

  const translate = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      translation.reset();
      setError(null);
      try {
        await streamTranslate(
          { text, source: prefs.source, target: prefs.target },
          {
            signal: ctrl.signal,
            onDelta: (chunk) => translation.append(chunk),
            onError: (msg) => setError(msg),
            onDone: () => {
              translation.finalize();
              const final = translation.peek().trim();
              if (prefs.autoSpeak && final) {
                void speak(final, { lang: prefs.target });
              }
            },
          },
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      }
    },
    [prefs.source, prefs.target, prefs.autoSpeak, speak, translation],
  );

  const start = useCallback(() => {
    setError(null);
    setPartial("");
    setTranscript("");
    translation.reset();
    cancel();
    const controller = startRecognition(prefs.source, {
      onPartial: (text) => setPartial(text),
      onFinal: (text) => {
        setPartial("");
        setTranscript((prev) => (prev ? `${prev} ${text}`.trim() : text));
        void translate(text);
      },
      onError: (msg) => {
        setError(msg);
        setRecording(false);
      },
      onEnd: () => setRecording(false),
    });
    if (!controller) return;
    recognizerRef.current = controller;
    setRecording(true);
  }, [prefs.source, translate, cancel, translation]);

  useEffect(
    () => () => {
      recognizerRef.current?.abort();
      abortRef.current?.abort();
    },
    [],
  );

  const swapLanguages = () =>
    setPrefs((p) => ({
      ...p,
      source: p.target === "auto" ? "en-US" : p.target,
      target: p.source === "auto" ? "en-US" : p.source,
    }));

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">Real-time</span>
        <h1 className="heading-display text-[34px] sm:text-[40px] lg:text-[52px] leading-[1.05]">
          Speak.{" "}
          <span className="bg-clip-text text-transparent bg-brand-grad">
            Hear it translated.
          </span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          On-device speech recognition feeds the cloud streaming translator —
          your words become another language with sub-second turnaround.
        </p>
      </header>

      {/* Language pills */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <LanguageSelect
          value={prefs.source}
          onChange={(code) => setPrefs((p) => ({ ...p, source: code }))}
          languages={languages}
          ariaLabel="Source language"
          className="flex-1 min-w-[140px]"
        />
        <button
          type="button"
          onClick={swapLanguages}
          className="icon-btn"
          aria-label="Swap languages"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
        <LanguageSelect
          value={prefs.target}
          onChange={(code) => setPrefs((p) => ({ ...p, target: code }))}
          languages={languages}
          excludeAuto
          ariaLabel="Target language"
          className="flex-1 min-w-[140px]"
        />
      </div>

      {!supported ? (
        <div className="surface px-5 py-4 text-sm text-amber-200/90 border-amber-400/20">
          Your browser does not support speech recognition. Try Chrome, Edge, or
          Safari, or use{" "}
          <a href="/translate" className="underline decoration-teal-300 underline-offset-4">
            AI Translation
          </a>{" "}
          instead.
        </div>
      ) : null}

      {/* Two-pane: transcript + translation. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <Pane
          label="You said"
          text={transcript}
          partial={partial}
          empty="Tap the mic and start speaking…"
          onCopy={() => void navigator.clipboard.writeText(transcript)}
          onSpeak={() => void speak(transcript, { lang: prefs.source })}
        />
        <Pane
          label="Translation"
          text={translation.text}
          empty={recording ? "Listening…" : "Translation will appear here."}
          accent
          loading={recording && !translation.text}
          streaming={recording && !!translation.text}
          onCopy={() => void navigator.clipboard.writeText(translation.peek())}
          onSpeak={() => void speak(translation.peek(), { lang: prefs.target })}
        />
      </div>

      {/* Mic + auto-speak. Floats nicely above bottom nav on mobile. */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <RecordButton
          recording={recording}
          onStart={start}
          onStop={stop}
          disabled={!supported}
        />
        <p
          aria-live="polite"
          className={`text-[13px] tracking-tight transition-colors duration-200 ${
            recording ? "text-teal-300" : "text-ink-400"
          }`}
        >
          {recording ? "Listening — tap to stop" : "Tap to start speaking"}
        </p>
        <label className="flex items-center gap-3 select-none cursor-pointer text-sm text-ink-300">
          <span className="relative inline-flex">
            <input
              type="checkbox"
              checked={prefs.autoSpeak}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))
              }
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="w-9 h-5 rounded-full bg-white/[0.08] ring-1 ring-white/[0.07] peer-checked:bg-brand-grad transition-colors duration-200"
            />
            <span
              aria-hidden
              className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-4"
            />
          </span>
          Speak the translation aloud
        </label>
        {error ? (
          <div className="text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/25 rounded-xl px-4 py-2">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface PaneProps {
  label: string;
  text: string;
  partial?: string;
  empty: string;
  accent?: boolean;
  loading?: boolean;
  streaming?: boolean;
  onCopy: () => void;
  onSpeak: () => void;
}

const Pane = memo(function Pane({
  label,
  text,
  partial,
  empty,
  accent,
  loading,
  streaming,
  onCopy,
  onSpeak,
}: PaneProps) {
  const showPlaceholder = !text && !partial;
  return (
    <div className="surface relative px-5 py-5 lg:px-7 lg:py-7 min-h-[260px] flex flex-col gap-3 overflow-hidden">
      {accent ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent"
        />
      ) : null}
      <div className="flex items-center justify-between">
        <span className="label-eyebrow">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-btn"
            disabled={!text}
            onClick={onSpeak}
            aria-label={`Play ${label}`}
          >
            <Volume2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={!text}
            onClick={onCopy}
            aria-label={`Copy ${label}`}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        className={`flex-1 stream-pane whitespace-pre-wrap text-lg lg:text-xl leading-relaxed font-medium ${
          accent ? "text-white" : "text-ink-100"
        } ${loading ? "shimmer" : ""}`}
        aria-live="polite"
      >
        {showPlaceholder ? (
          <span className="text-ink-500 text-base">{empty}</span>
        ) : (
          <span className={streaming ? "typing-caret" : undefined}>{text}</span>
        )}
        {partial ? (
          <span className="text-ink-400 italic"> {partial}</span>
        ) : null}
      </div>
    </div>
  );
});
