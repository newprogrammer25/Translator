import { ArrowLeftRight, Check, Copy, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { useLanguages } from "../hooks/useLanguages";
import { useStreamingText } from "../hooks/useStreamingText";
import { useTTS } from "../hooks/useTTS";
import { streamTranslate } from "../lib/api";
import { loadJSON, saveJSON } from "../lib/storage";

interface Prefs {
  source: string;
  target: string;
  formal: boolean;
}

const DEFAULT_PREFS: Prefs = { source: "auto", target: "en-US", formal: false };
const PREFS_KEY = "translator:translation";

export function TranslationMode() {
  const languages = useLanguages();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [input, setInput] = useState("");
  const out = useStreamingText();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { speak } = useTTS();
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

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

  // Debounced auto-translate. 600ms is forgiving enough for slow typists,
  // and we suppress single-character pings to avoid useless requests.
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

  const swapLanguages = () =>
    setPrefs((p) => ({
      ...p,
      source: p.target,
      target: p.source === "auto" ? "en-US" : p.source,
    }));

  const handleCopy = async () => {
    if (!out.peek()) return;
    await navigator.clipboard.writeText(out.peek());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">AI Translation</span>
        <h1 className="heading-display text-[34px] sm:text-[40px] lg:text-[52px] leading-[1.05]">
          Translate anything,
          <br className="hidden sm:block" />
          <span className="bg-clip-text text-transparent bg-brand-grad">
            instantly.
          </span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          24 languages, formal-tone aware, with streaming output that starts
          appearing within a hundred milliseconds.
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

      {/* Two-pane translate. Stacks on mobile, side-by-side on lg. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Source */}
        <section className="surface px-5 py-5 lg:px-7 lg:py-7 flex flex-col gap-4 min-h-[280px]">
          <div className="flex items-center justify-between">
            <span className="label-eyebrow">Source</span>
            <span className="text-[11px] tabular-nums text-ink-500">
              {input.length} / 5000
            </span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 5000))}
            placeholder="Type or paste anything…"
            className="field flex-1 scrollbar-thin"
            rows={6}
            aria-label="Text to translate"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-ink-300">
              <span className="relative inline-flex">
                <input
                  type="checkbox"
                  checked={prefs.formal}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, formal: e.target.checked }))
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

        {/* Target */}
        <section className="surface relative px-5 py-5 lg:px-7 lg:py-7 flex flex-col gap-4 min-h-[280px] overflow-hidden">
          {/* Subtle teal edge tint to draw the eye to the result. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent"
          />
          <div className="flex items-center justify-between">
            <span className="label-eyebrow inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-teal-300" /> Translation
            </span>
            <span
              className={`text-[11px] transition-opacity duration-150 ${
                loading ? "text-teal-300 opacity-100" : "opacity-0"
              }`}
            >
              streaming…
            </span>
          </div>

          <div
            className={`flex-1 stream-pane whitespace-pre-wrap text-lg lg:text-xl leading-relaxed font-medium text-white ${
              loading && !out.text ? "shimmer" : ""
            }`}
            aria-live="polite"
          >
            {out.text ? (
              <span className={loading ? "typing-caret" : undefined}>
                {out.text}
              </span>
            ) : loading ? (
              "Working on it…"
            ) : (
              <span className="text-ink-500 text-base">
                Your translation will appear here.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              className="btn-ghost"
              disabled={!out.text}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-300" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </>
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

      {error ? (
        <div className="text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/25 rounded-xl px-4 py-2">
          {error}
        </div>
      ) : null}
    </div>
  );
}
