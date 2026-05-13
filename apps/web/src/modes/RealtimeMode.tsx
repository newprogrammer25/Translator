import { ArrowLeftRight, Copy, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { RecordButton } from "../components/RecordButton";
import { useToast } from "../components/Toast";
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
const DEFAULT_PREFS: Prefs = { source: "en-US", target: "ru-RU", autoSpeak: true };

/** A single entry in the subtitle chat */
interface SubtitleEntry {
  id: string;
  original: string;
  translation: string;
  done: boolean;
  timestamp: number;
}

export function RealtimeMode() {
  const languages = useLanguages();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState("");
  const [entries, setEntries] = useState<SubtitleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [swapAnimating, setSwapAnimating] = useState(false);

  // Streaming translation for the current utterance
  const currentTranslation = useStreamingText();
  const currentIdRef = useRef<string | null>(null);

  const { speak, cancel } = useTTS();
  const recognizerRef = useRef<RecognitionController | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const supported = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [entries, partial, currentTranslation.text]);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setRecording(false);
  }, []);

  // Translate a finalized utterance
  const translate = useCallback(
    async (text: string, entryId: string) => {
      if (!text.trim()) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      currentTranslation.reset();
      currentIdRef.current = entryId;
      setError(null);

      try {
        await streamTranslate(
          { text, source: prefs.source, target: prefs.target },
          {
            signal: ctrl.signal,
            onDelta: (chunk) => currentTranslation.append(chunk),
            onError: (msg) => setError(msg),
            onDone: () => {
              currentTranslation.finalize();
              const finalText = currentTranslation.peek().trim();
              // Move current translation into the entry
              setEntries((prev) => prev.map((e) =>
                e.id === entryId ? { ...e, translation: finalText, done: true } : e
              ));
              currentIdRef.current = null;
              currentTranslation.reset();
              // Auto-speak
              if (prefs.autoSpeak && finalText) {
                speak(finalText, { lang: prefs.target });
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
    [prefs.source, prefs.target, prefs.autoSpeak, speak, currentTranslation],
  );

  // Start recording
  const start = useCallback(() => {
    setError(null);
    setPartial("");
    cancel();
    currentTranslation.reset();

    const controller = startRecognition(prefs.source, {
      onPartial: (text) => setPartial(text),
      onFinal: (text) => {
        setPartial("");
        const id = `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const entry: SubtitleEntry = { id, original: text, translation: "", done: false, timestamp: Date.now() };
        setEntries((prev) => [...prev, entry]);
        void translate(text, id);
      },
      onError: (msg) => { setError(msg); setRecording(false); },
      onEnd: () => setRecording(false),
    });
    if (!controller) return;
    recognizerRef.current = controller;
    setRecording(true);
  }, [prefs.source, translate, cancel, currentTranslation]);

  useEffect(() => () => { recognizerRef.current?.abort(); abortRef.current?.abort(); }, []);

  // Swap languages
  const swapLanguages = useCallback(() => {
    setSwapAnimating(true);
    setTimeout(() => setSwapAnimating(false), 450);
    setPrefs((p) => ({
      ...p,
      source: p.target === "auto" ? "en-US" : p.target,
      target: p.source === "auto" ? "en-US" : p.source,
    }));
  }, []);

  const copyText = useCallback(async (text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  }, [toast]);

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">Real-time</span>
        <h1 className="heading-display text-[32px] sm:text-[38px] lg:text-[48px] leading-[1.08]">
          Speak.{" "}
          <span className="bg-clip-text text-transparent bg-brand-grad">See subtitles live.</span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          Speech recognition + streaming translation. Your words appear as subtitles
          with the translation below — like live captions.
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
          className={`icon-btn ${swapAnimating ? "swap-animate" : ""}`}
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

      {/* Browser support warning */}
      {!supported && (
        <div className="surface px-5 py-4 text-sm text-amber-200/90">
          Your browser doesn't support speech recognition. Try Chrome, Edge, or Safari.
        </div>
      )}

      {/* Subtitle chat area */}
      <div className="surface flex flex-col h-[50dvh] sm:h-[45vh] min-h-[280px] overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3 smooth-scroll scrollbar-thin">
          {entries.length === 0 && !partial ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/[0.06]">
                <Volume2 className="w-5 h-5 text-teal-300" />
              </div>
              <p className="font-display text-lg text-white tracking-tight">Live subtitles</p>
              <p className="text-sm text-ink-400 max-w-xs">
                Tap the mic and start speaking. Your words will appear here with
                translations below — like movie subtitles.
              </p>
            </div>
          ) : (
            <>
              {entries.map((entry) => (
                <SubtitleRow
                  key={entry.id}
                  entry={entry}
                  streamingTranslation={currentIdRef.current === entry.id ? currentTranslation.text : undefined}
                  onSpeak={(text, lang) => speak(text, { lang })}
                  onCopy={copyText}
                  targetLang={prefs.target}
                  sourceLang={prefs.source}
                />
              ))}
              {partial && (
                <div className="rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.04] px-4 py-2.5 animate-fade-in">
                  <p className="text-sm text-ink-300 italic">{partial}...</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mic + controls */}
      <div className="flex flex-col items-center gap-5 pt-2">
        <RecordButton recording={recording} onStart={start} onStop={stop} disabled={!supported} />
        <p
          aria-live="polite"
          className={`text-[13px] font-medium tracking-tight transition-colors duration-200 ${
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
              onChange={(e) => setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))}
              className="peer sr-only"
            />
            <span aria-hidden className="w-9 h-5 rounded-full bg-white/[0.08] ring-1 ring-white/[0.06] peer-checked:bg-brand-grad transition-all duration-200" />
            <span aria-hidden className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
          </span>
          Auto-speak translations
        </label>

        {error && (
          <div className="animate-fade-up text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-2xl px-4 py-2.5">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Subtitle Row ─── */

interface SubtitleRowProps {
  entry: SubtitleEntry;
  streamingTranslation?: string;
  onSpeak: (text: string, lang: string) => void;
  onCopy: (text: string) => Promise<void>;
  targetLang: string;
  sourceLang: string;
}

const SubtitleRow = memo(function SubtitleRow({
  entry, streamingTranslation, onSpeak, onCopy, targetLang, sourceLang,
}: SubtitleRowProps) {
  const translation = streamingTranslation ?? entry.translation;
  const isStreaming = streamingTranslation !== undefined && !entry.done;

  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] px-4 py-3 space-y-2 animate-fade-in">
      {/* Original */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-100 leading-relaxed flex-1">{entry.original}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => onSpeak(entry.original, sourceLang)} className="icon-btn w-7 h-7" aria-label="Play original">
            <Volume2 className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => void onCopy(entry.original)} className="icon-btn w-7 h-7" aria-label="Copy original">
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Translation */}
      <div className="border-t border-white/[0.05] pt-2">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-relaxed flex-1 ${
            translation ? "text-teal-200" : "text-ink-500"
          } ${isStreaming ? "typing-caret" : ""}`}>
            {translation || (entry.done ? "..." : "Translating...")}
          </p>
          {entry.done && translation && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" onClick={() => onSpeak(translation, targetLang)} className="icon-btn w-7 h-7" aria-label="Play translation">
                <Volume2 className="w-3 h-3 text-teal-300" />
              </button>
              <button type="button" onClick={() => void onCopy(translation)} className="icon-btn w-7 h-7" aria-label="Copy translation">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.entry.original === next.entry.original &&
  prev.entry.translation === next.entry.translation &&
  prev.entry.done === next.entry.done &&
  prev.streamingTranslation === next.streamingTranslation
);
