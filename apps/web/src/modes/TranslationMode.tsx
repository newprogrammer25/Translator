import { ArrowLeftRight, Check, Copy, Sparkles, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { useToast } from "../components/Toast";
import { useLanguages } from "../hooks/useLanguages";
import { useStreamingText } from "../hooks/useStreamingText";
import { useTTS } from "../hooks/useTTS";
import { streamTranslate } from "../lib/api";
import { loadJSON, saveJSON } from "../lib/storage";

const MAX_CHARS = 5000;

interface Prefs {
  source: string;
  target: string;
  formal: boolean;
}

const DEFAULT_PREFS: Prefs = { source: "auto", target: "en-US", formal: false };
const PREFS_KEY = "translator:translation";

export function TranslationMode() {
  const languages = useLanguages();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [input, setInput] = useState("");
  const out = useStreamingText();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [swapAnimating, setSwapAnimating] = useState(false);

  const { speak } = useTTS();
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  // Character counter state
  const charState = useMemo(() => {
    const ratio = input.length / MAX_CHARS;
    if (ratio >= 0.95) return "char-danger";
    if (ratio >= 0.8) return "char-warn";
    return "char-safe";
  }, [input.length]);

  const run = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        out.reset();
        setLoading(false);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      out.reset();
      setError(null);
      try {
        await streamTranslate(
          {
            text: trimmed,
            source: prefs.source,
            target: prefs.target,
            formal: prefs.formal,
          },
          {
            signal: ctrl.signal,
            onDelta: (chunk) => out.append(chunk),
            onError: (msg) => setError(msg),
            onDone: () => {
              out.finalize();
              setLoading(false);
            },
          },
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    },
    [prefs.source, prefs.target, prefs.formal, out],
  );

  // Debounced auto-translate
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      out.reset();
      setLoading(false);
      setError(null);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void run(trimmed);
    }, 600);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [input, run, out]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Swap languages with animation
  const swapLanguages = useCallback(() => {
    setSwapAnimating(true);
    setTimeout(() => setSwapAnimating(false), 450);
    setPrefs((p) => ({
      ...p,
      source: p.target,
      target: p.source === "auto" ? "en-US" : p.source,
    }));
  }, []);

  // Clear input
  const clearInput = useCallback(() => {
    setInput("");
    out.reset();
    setError(null);
    textareaRef.current?.focus();
  }, [out]);

  // Copy translation
  const handleCopy = useCallback(async () => {
    if (!out.peek()) return;
    await navigator.clipboard.writeText(out.peek());
    setCopied(true);
    toast("Copied to clipboard");
    setTimeout(() => setCopied(false), 1400);
  }, [out, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        swapLanguages();
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        clearInput();
      } else if (ctrl && e.key === "Enter") {
        e.preventDefault();
        void run(input);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [swapLanguages, clearInput, run, input]);

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">AI Translation</span>
        <h1 className="heading-display text-[32px] sm:text-[38px] lg:text-[48px] leading-[1.08]">
          Translate anything,
          <br className="hidden sm:block" />
          <span className="bg-clip-text text-transparent bg-brand-grad">instantly.</span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          24 languages, formal-tone aware, streaming output in under 100ms.
        </p>
      </header>

      {/* Language selector */}
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

      {/* Two-pane translation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Source pane */}
        <section className="surface px-5 py-5 lg:px-7 lg:py-6 flex flex-col gap-4 min-h-[280px]">
          <div className="flex items-center justify-between">
            <span className="label-eyebrow">Source</span>
            <span className={`text-[11px] tabular-nums transition-colors duration-200 ${charState}`}>
              {input.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>

          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Type or paste anything..."
              className="field flex-1 h-full min-h-[160px] scrollbar-thin pr-8"
              rows={6}
              aria-label="Text to translate"
            />
            {/* Clear button */}
            {input && (
              <button
                type="button"
                onClick={clearInput}
                className="absolute top-1 right-1 icon-btn w-7 h-7 opacity-60 hover:opacity-100"
                aria-label="Clear text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-ink-300">
              <span className="relative inline-flex">
                <input
                  type="checkbox"
                  checked={prefs.formal}
                  onChange={(e) => setPrefs((p) => ({ ...p, formal: e.target.checked }))}
                  className="peer sr-only"
                />
                <span aria-hidden className="w-9 h-5 rounded-full bg-white/[0.08] ring-1 ring-white/[0.06] peer-checked:bg-brand-grad transition-all duration-200" />
                <span aria-hidden className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
              </span>
              Formal tone
            </label>
            <button
              type="button"
              className="btn-ghost"
              disabled={!input}
              onClick={() => void speak(input, { lang: prefs.source })}
              aria-label="Listen to source"
            >
              <Volume2 className="w-3.5 h-3.5" /> Listen
            </button>
          </div>
        </section>

        {/* Target pane */}
        <section className="surface relative px-5 py-5 lg:px-7 lg:py-6 flex flex-col gap-4 min-h-[280px] overflow-hidden">
          {/* Top accent line */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/50 to-transparent" />

          <div className="flex items-center justify-between">
            <span className="label-eyebrow inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-teal-300" /> Translation
            </span>
            <span className={`text-[11px] transition-opacity duration-200 ${loading ? "text-teal-300 opacity-100" : "opacity-0"}`}>
              streaming...
            </span>
          </div>

          <div
            className={`flex-1 stream-pane whitespace-pre-wrap text-lg lg:text-xl leading-relaxed font-medium text-white ${
              loading && !out.text ? "shimmer" : ""
            }`}
            aria-live="polite"
          >
            {out.text ? (
              <span className={loading ? "typing-caret" : undefined}>{out.text}</span>
            ) : loading ? (
              <span className="text-ink-400 text-base">Translating...</span>
            ) : (
              <span className="text-ink-500 text-base">Translation will appear here.</span>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button type="button" className="btn-ghost" disabled={!out.text} onClick={handleCopy}>
              {copied ? (
                <><Check className="w-3.5 h-3.5 text-teal-300" /> Copied</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy</>
              )}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!out.text}
              onClick={() => void speak(out.peek(), { lang: prefs.target })}
            >
              <Volume2 className="w-3.5 h-3.5" /> Speak
            </button>
          </div>
        </section>
      </div>

      {/* Error */}
      {error && (
        <div className="animate-fade-up text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-2xl px-4 py-2.5">
          {error}
        </div>
      )}
    </div>
  );
}
