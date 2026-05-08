import { ArrowRightLeft, Copy, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { HealthBadge } from "../components/HealthBadge";
import { LanguageSelect } from "../components/LanguageSelect";
import { RecordButton } from "../components/RecordButton";
import { useLanguages } from "../hooks/useLanguages";
import { useStreamingText } from "../hooks/useStreamingText";
import { useTTS } from "../hooks/useTTS";
import { streamTranslate } from "../lib/api";
import { isSpeechRecognitionSupported, startRecognition, type RecognitionController } from "../lib/speech";
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
    <div className="flex flex-col gap-4 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Real-time</h1>
          <p className="text-xs text-ink-400">Speak — get translation as you talk.</p>
        </div>
        <HealthBadge />
      </header>

      <div className="card p-3 flex items-center justify-between gap-2">
        <LanguageSelect
          value={prefs.source}
          onChange={(code) => setPrefs((p) => ({ ...p, source: code }))}
          languages={languages}
          ariaLabel="Source language"
          className="flex-1 min-w-0"
        />
        <button
          type="button"
          onClick={swapLanguages}
          className="btn-icon"
          aria-label="Swap languages"
        >
          <ArrowRightLeft className="w-4 h-4" />
        </button>
        <LanguageSelect
          value={prefs.target}
          onChange={(code) => setPrefs((p) => ({ ...p, target: code }))}
          languages={languages}
          excludeAuto
          ariaLabel="Target language"
          className="flex-1 min-w-0"
        />
      </div>

      {!supported ? (
        <div className="card p-4 text-sm text-amber-300">
          Your browser does not support speech recognition. Try Chrome, Edge, or Safari, or use the
          <a href="/translate" className="underline mx-1">
            AI Translation
          </a>
          mode instead.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Pane
          label="Transcript"
          text={transcript}
          partial={partial}
          empty="Press the mic and start talking…"
          onCopy={() => void navigator.clipboard.writeText(transcript)}
          onSpeak={() => void speak(transcript, { lang: prefs.source })}
        />
        <Pane
          label="Translation"
          text={translation.text}
          empty={recording ? "Translating…" : "Translation appears here."}
          accent
          onCopy={() => void navigator.clipboard.writeText(translation.peek())}
          onSpeak={() => void speak(translation.peek(), { lang: prefs.target })}
        />
      </div>

      <div className="flex flex-col items-center gap-3 pt-4">
        <RecordButton
          recording={recording}
          onStart={start}
          onStop={stop}
          disabled={!supported}
        />
        <label className="flex items-center gap-2 text-xs text-ink-300 select-none">
          <input
            type="checkbox"
            checked={prefs.autoSpeak}
            onChange={(e) => setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))}
            className="accent-brand-500"
          />
          Speak translation automatically
        </label>
        {error ? <div className="text-xs text-red-400">{error}</div> : null}
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
  onCopy: () => void;
  onSpeak: () => void;
}

const Pane = memo(function Pane({ label, text, partial, empty, accent, onCopy, onSpeak }: PaneProps) {
  const showPlaceholder = !text && !partial;
  return (
    <div className={`card p-4 min-h-[160px] flex flex-col ${accent ? "ring-1 ring-brand-500/30" : ""}`}>
      <div className="flex items-center justify-between text-xs text-ink-400 mb-2">
        <span className="uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-icon"
            disabled={!text}
            onClick={onSpeak}
            aria-label={`Play ${label}`}
          >
            <Volume2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="btn-icon"
            disabled={!text}
            onClick={onCopy}
            aria-label={`Copy ${label}`}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className={`text-base leading-relaxed stream-pane ${accent ? "text-brand-100" : "text-ink-100"}`}>
        {showPlaceholder ? <span className="text-ink-500">{empty}</span> : text}
        {partial ? <span className="text-ink-400 italic"> {partial}</span> : null}
      </div>
    </div>
  );
});
