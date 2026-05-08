import { ArrowRightLeft, Copy, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HealthBadge } from "../components/HealthBadge";
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
          { text: trimmed, source: prefs.source, target: prefs.target, formal: prefs.formal },
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

  // Debounced auto-translate so the user can paste / type freely.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void run(input);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [input, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const swapLanguages = () =>
    setPrefs((p) => ({
      ...p,
      source: p.target,
      target: p.source === "auto" ? "en-US" : p.source,
    }));

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Translation</h1>
          <p className="text-xs text-ink-400">Type or paste — translates as you write.</p>
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
        <button type="button" onClick={swapLanguages} className="btn-icon" aria-label="Swap languages">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span className="uppercase tracking-wide">Source</span>
            <span>{input.length} / 5000</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 5000))}
            placeholder="Type or paste text…"
            className="input min-h-[160px] resize-y scrollbar-thin"
          />
          <div className="flex items-center justify-between text-xs text-ink-400">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefs.formal}
                onChange={(e) => setPrefs((p) => ({ ...p, formal: e.target.checked }))}
                className="accent-brand-500"
              />
              Formal tone
            </label>
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!input}
              onClick={() => void speak(input, { lang: prefs.source })}
              aria-label="Play source"
            >
              <Volume2 className="w-3.5 h-3.5" /> Listen
            </button>
          </div>
        </div>

        <div className="card p-4 flex flex-col gap-3 ring-1 ring-brand-500/30">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span className="uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-brand-300" /> Translation
            </span>
            <span>{loading ? "translating…" : ""}</span>
          </div>
          <div className="text-base leading-relaxed text-brand-100 whitespace-pre-wrap min-h-[160px] stream-pane">
            {out.text || <span className="text-ink-500">Translation appears here.</span>}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!out.text}
              onClick={() => void navigator.clipboard.writeText(out.peek())}
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!out.text}
              onClick={() => void speak(out.peek(), { lang: prefs.target })}
            >
              <Volume2 className="w-3.5 h-3.5" /> Speak
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}
    </div>
  );
}
