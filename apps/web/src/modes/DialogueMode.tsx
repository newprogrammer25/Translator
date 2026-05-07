import { Languages, Mic, Send, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HealthBadge } from "../components/HealthBadge";
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
  const { speak, cancel } = useTTS();
  const supportsSpeech = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
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
              setTurns((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            },
            onError: (msg) => setError(msg),
            onDone: () => {},
          },
        );
        if (prefs.autoSpeak && assistantText.trim()) {
          void speak(assistantText, { lang: prefs.botLanguage });
        }
        if (prefs.showTranslation && prefs.userLanguage !== "auto") {
          // Translate the assistant reply into the user's language so they can read along.
          let translation = "";
          await streamTranslate(
            {
              text: assistantText,
              source: prefs.botLanguage,
              target: prefs.userLanguage,
            },
            {
              onDelta: (chunk) => {
                translation += chunk;
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
    <div className="flex flex-col gap-4 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Dialogue</h1>
          <p className="text-xs text-ink-400">Practice or chat — replies appear with translation.</p>
        </div>
        <HealthBadge />
      </header>

      <div className="card p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-400 w-12">You</span>
          <LanguageSelect
            value={prefs.userLanguage}
            onChange={(code) => setPrefs((p) => ({ ...p, userLanguage: code }))}
            languages={languages}
            ariaLabel="Your language"
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-400 w-12">AI</span>
          <LanguageSelect
            value={prefs.botLanguage}
            onChange={(code) => setPrefs((p) => ({ ...p, botLanguage: code }))}
            languages={languages}
            excludeAuto
            ariaLabel="Bot language"
            className="flex-1"
          />
        </div>
        <select
          aria-label="Persona"
          value={prefs.persona}
          onChange={(e) => setPrefs((p) => ({ ...p, persona: e.target.value }))}
          className="bg-ink-900/80 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-100"
        >
          {PERSONAS.map((p) => (
            <option key={p.label} value={p.id} className="bg-ink-900">
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card flex flex-col h-[60vh] min-h-[320px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          {turns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-ink-500 text-sm gap-2">
              <Sparkles className="w-6 h-6 text-brand-400" />
              Start the conversation with a message or the mic.
            </div>
          ) : (
            turns.map((turn, idx) => (
              <Bubble
                key={idx}
                turn={turn}
                onSpeak={() => {
                  if (turn.role === "assistant") void speak(turn.content, { lang: prefs.botLanguage });
                  else void speak(turn.content, { lang: prefs.userLanguage, server: false });
                }}
              />
            ))
          )}
        </div>
        <div className="border-t border-ink-800 p-3 flex items-end gap-2">
          <button
            type="button"
            onClick={recording ? stopRecognition : startMic}
            disabled={!supportsSpeech}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={`btn-icon ${
              recording ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40" : ""
            }`}
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
            className="input resize-none max-h-32"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={!input.trim() || loading}
            className="btn-primary"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-400">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={prefs.autoSpeak}
              onChange={(e) => setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))}
              className="accent-brand-500"
            />
            Speak replies
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={prefs.showTranslation}
              onChange={(e) => setPrefs((p) => ({ ...p, showTranslation: e.target.checked }))}
              className="accent-brand-500"
            />
            Show translation
          </label>
        </div>
        <button type="button" onClick={reset} className="btn-ghost text-xs">
          Clear chat
        </button>
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}
    </div>
  );
}

interface BubbleProps {
  turn: DialogueTurn;
  onSpeak: () => void;
}

function Bubble({ turn, onSpeak }: BubbleProps) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow ${
          isUser
            ? "bg-brand-500 text-ink-950"
            : "bg-ink-800/80 text-ink-100 ring-1 ring-ink-700"
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{turn.content || "…"}</div>
        {turn.translation ? (
          <div
            className={`mt-1.5 pt-1.5 text-[11px] italic border-t ${
              isUser ? "text-ink-900/70 border-ink-950/30" : "text-ink-400 border-ink-700"
            } flex items-start gap-1.5`}
          >
            <Languages className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="whitespace-pre-wrap">{turn.translation}</span>
          </div>
        ) : null}
        {turn.content ? (
          <div className={`mt-1 -mb-1 ${isUser ? "text-right" : "text-left"}`}>
            <button
              type="button"
              onClick={onSpeak}
              className={`text-[11px] inline-flex items-center gap-1 ${
                isUser ? "text-ink-900/70 hover:text-ink-900" : "text-ink-400 hover:text-ink-200"
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
