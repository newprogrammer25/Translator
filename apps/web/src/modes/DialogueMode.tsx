import { Languages, Mic, Send, Sparkles, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { useLanguages } from "../hooks/useLanguages";
import { useTTS } from "../hooks/useTTS";
import { streamDialogue, streamTranslate } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startRecognition,
  type RecognitionController,
} from "../lib/speech";
import { loadJSON, saveJSON } from "../lib/storage";
import type { DialogueTurn } from "../lib/types";

interface Prefs {
  userLanguage: string;
  botLanguage: string;
  persona: string;
  showTranslation: boolean;
  autoSpeak: boolean;
}

const PREFS_KEY = "translator:dialogue";

const DEFAULT_PREFS: Prefs = {
  userLanguage: "auto",
  botLanguage: "en-US",
  persona: "",
  showTranslation: true,
  autoSpeak: true,
};

const PERSONAS = [
  { id: "", label: "Default" },
  { id: "You are a patient language tutor. Correct mistakes gently and offer better phrasings.", label: "Tutor" },
  { id: "You are a friendly traveler making small talk to help me practice.", label: "Traveler" },
  { id: "You are a professional business partner — concise and polite.", label: "Business" },
];

export function DialogueMode() {
  const languages = useLanguages();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [turns, setTurns] = useState<DialogueTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<RecognitionController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const { speak, cancel } = useTTS();
  const supportsSpeech = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  // rAF-throttled auto-scroll: streaming bubbles update many times per second;
  // batching scroll into a single frame avoids janking the compositor.
  useEffect(() => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [turns]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;
      const nextTurns: DialogueTurn[] = [...turns, { role: "user", content: text }];
      setTurns([...nextTurns, { role: "assistant", content: "" }]);
      setInput("");
      setLoading(true);
      setError(null);
      let assistantText = "";
      // rAF batching: streaming chunks arrive faster than the display refreshes.
      // We accumulate into closures and flush once per frame so the bubble re-renders
      // at the screen's native cadence (60-120Hz) instead of per-token.
      let pendingFrame: number | null = null;
      const scheduleFlush = (build: () => DialogueTurn) => {
        if (pendingFrame !== null) return;
        pendingFrame = requestAnimationFrame(() => {
          pendingFrame = null;
          setTurns((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = build();
            return copy;
          });
        });
      };
      try {
        await streamDialogue(
          {
            messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
            bot_language: prefs.botLanguage,
            user_language: prefs.userLanguage,
            persona: prefs.persona || undefined,
          },
          {
            onDelta: (chunk) => {
              assistantText += chunk;
              scheduleFlush(() => ({ role: "assistant", content: assistantText }));
            },
            onError: (msg) => setError(msg),
            onDone: () => {
              if (pendingFrame !== null) {
                cancelAnimationFrame(pendingFrame);
                pendingFrame = null;
              }
              setTurns((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            },
          },
        );
        if (prefs.autoSpeak && assistantText.trim()) {
          void speak(assistantText, { lang: prefs.botLanguage });
        }
        if (prefs.showTranslation && prefs.userLanguage !== "auto") {
          // Translate the assistant reply into the user's language so they can read along.
          let translation = "";
          let trFrame: number | null = null;
          await streamTranslate(
            {
              text: assistantText,
              source: prefs.botLanguage,
              target: prefs.userLanguage,
            },
            {
              onDelta: (chunk) => {
                translation += chunk;
                if (trFrame !== null) return;
                trFrame = requestAnimationFrame(() => {
                  trFrame = null;
                  setTurns((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = {
                      role: "assistant",
                      content: assistantText,
                      translation,
                    };
                    return copy;
                  });
                });
              },
              onDone: () => {
                if (trFrame !== null) {
                  cancelAnimationFrame(trFrame);
                  trFrame = null;
                }
                setTurns((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    role: "assistant",
                    content: assistantText,
                    translation,
                  };
                  return copy;
                });
              },
            },
          );
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loading, turns, prefs, speak],
  );

  const stopRecognition = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setRecording(false);
  }, []);

  const startMic = useCallback(() => {
    cancel();
    setError(null);
    const controller = startRecognition(prefs.userLanguage === "auto" ? "en-US" : prefs.userLanguage, {
      onPartial: (text) => setInput(text),
      onFinal: (text) => {
        stopRecognition();
        void send(text);
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
  }, [prefs.userLanguage, send, stopRecognition, cancel]);

  useEffect(
    () => () => {
      recognizerRef.current?.abort();
    },
    [],
  );

  const reset = () => {
    setTurns([]);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">AI Dialogue</span>
        <h1 className="heading-display text-[34px] sm:text-[40px] lg:text-[52px] leading-[1.05]">
          Practice with{" "}
          <span className="bg-clip-text text-transparent bg-brand-grad">
            an AI partner.
          </span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          Pick a persona, two languages, and chat — replies stream live and come
          with a translation underneath.
        </p>
      </header>

      {/* Controls row: languages + persona pill. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <LangPill label="You" value={prefs.userLanguage} onChange={(code) => setPrefs((p) => ({ ...p, userLanguage: code }))} languages={languages} />
        <LangPill label="AI" value={prefs.botLanguage} onChange={(code) => setPrefs((p) => ({ ...p, botLanguage: code }))} languages={languages} excludeAuto />
        <select
          aria-label="Persona"
          value={prefs.persona}
          onChange={(e) => setPrefs((p) => ({ ...p, persona: e.target.value }))}
          className="select-pill"
        >
          {PERSONAS.map((p) => (
            <option key={p.label} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Chat surface */}
      <div className="surface flex flex-col h-[64dvh] sm:h-[60vh] min-h-[360px] overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6 space-y-4 smooth-scroll scrollbar-thin"
        >
          {turns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-ink-400 text-sm gap-3 text-center px-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-grad text-canvas-950 shadow-glow-teal">
                <Sparkles className="w-5 h-5" />
              </span>
              <div className="font-display text-lg text-white tracking-tight">
                Start the conversation
              </div>
              <p className="max-w-sm text-ink-400">
                Type a message below, or tap the microphone to speak. Try
                "Order coffee in Spanish" or "Quiz me on French verbs."
              </p>
            </div>
          ) : (
            turns.map((turn, idx) => (
              <Bubble
                key={idx}
                turn={turn}
                onSpeak={() => {
                  if (turn.role === "assistant")
                    void speak(turn.content, { lang: prefs.botLanguage });
                  else void speak(turn.content, { lang: prefs.userLanguage });
                }}
              />
            ))
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/[0.05] bg-canvas-900/40 backdrop-blur-md px-3 sm:px-4 py-3 flex items-end gap-2">
          <button
            type="button"
            onClick={recording ? stopRecognition : startMic}
            disabled={!supportsSpeech}
            aria-label={recording ? "Stop recording" : "Start voice input"}
            className={`shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl ring-1 transition ${
              recording
                ? "bg-rose-500/15 text-rose-300 ring-rose-400/40 animate-pulse-soft"
                : "bg-white/[0.04] text-ink-300 ring-white/[0.06] hover:text-white hover:bg-white/[0.07]"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Message…"
            rows={1}
            className="field flex-1 resize-none max-h-32 px-3 py-2.5 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] focus:ring-teal-400/40"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={!input.trim() || loading}
            className="btn-primary shrink-0 h-11 disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>

      {/* Toggles row */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-ink-300">
        <div className="flex items-center gap-4 flex-wrap">
          <Toggle
            checked={prefs.autoSpeak}
            onChange={(v) => setPrefs((p) => ({ ...p, autoSpeak: v }))}
            label="Speak replies"
          />
          <Toggle
            checked={prefs.showTranslation}
            onChange={(v) => setPrefs((p) => ({ ...p, showTranslation: v }))}
            label="Show translation"
          />
        </div>
        <button type="button" onClick={reset} className="btn-ghost">
          Clear chat
        </button>
      </div>

      {error ? (
        <div className="text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/25 rounded-xl px-4 py-2">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function LangPill({
  label,
  value,
  onChange,
  languages,
  excludeAuto,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  languages: ReturnType<typeof useLanguages>;
  excludeAuto?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.18em] text-ink-500 font-medium">
        {label}
      </span>
      <LanguageSelect
        value={value}
        onChange={onChange}
        languages={languages}
        excludeAuto={excludeAuto}
        ariaLabel={`${label} language`}
        className="!pl-12"
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 select-none cursor-pointer">
      <span className="relative inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
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
      {label}
    </label>
  );
}

interface BubbleProps {
  turn: DialogueTurn;
  onSpeak: () => void;
}

// Memoize: only the streaming bubble re-renders per chunk. Past bubbles are
// frozen, so the React diff over a 200-message chat stays cheap.
const Bubble = memo(
  BubbleImpl,
  (prev, next) =>
    prev.turn.role === next.turn.role &&
    prev.turn.content === next.turn.content &&
    prev.turn.translation === next.turn.translation,
);

function BubbleImpl({ turn, onSpeak }: BubbleProps) {
  const isUser = turn.role === "user";
  return (
    <div
      className={`flex animate-fade-up ${isUser ? "justify-end" : "justify-start"}`}
      style={{ animationDuration: "240ms" }}
    >
      <div
        className={`max-w-[88%] sm:max-w-[78%] px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? "rounded-[20px] rounded-br-md bg-brand-grad text-canvas-950 shadow-glow-teal"
            : "rounded-[20px] rounded-bl-md bg-white/[0.04] text-ink-100 ring-1 ring-white/[0.06] backdrop-blur-md"
        }`}
      >
        <div className="whitespace-pre-wrap stream-pane">
          {turn.content || (
            <span className="inline-flex items-center gap-1 text-ink-400">
              <span className="inline-block w-1 h-1 rounded-full bg-current animate-pulse" />
              <span
                className="inline-block w-1 h-1 rounded-full bg-current animate-pulse"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="inline-block w-1 h-1 rounded-full bg-current animate-pulse"
                style={{ animationDelay: "240ms" }}
              />
            </span>
          )}
        </div>
        {turn.translation ? (
          <div
            className={`mt-2 pt-2 text-[12px] italic flex items-start gap-1.5 border-t ${
              isUser ? "text-canvas-900/70 border-canvas-950/15" : "text-ink-400 border-white/[0.06]"
            }`}
          >
            <Languages className="w-3 h-3 mt-0.5 shrink-0 opacity-80" />
            <span className="whitespace-pre-wrap">{turn.translation}</span>
          </div>
        ) : null}
        {turn.content ? (
          <div className={`mt-1.5 -mb-1 ${isUser ? "text-right" : "text-left"}`}>
            <button
              type="button"
              onClick={onSpeak}
              className={`text-[11px] inline-flex items-center gap-1 transition-colors ${
                isUser
                  ? "text-canvas-900/70 hover:text-canvas-950"
                  : "text-ink-400 hover:text-white"
              }`}
              aria-label="Play"
            >
              <Volume2 className="w-3 h-3" /> Listen
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
