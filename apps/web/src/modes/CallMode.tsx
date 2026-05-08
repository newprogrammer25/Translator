import { ArrowDownUp, Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { useLanguages } from "../hooks/useLanguages";
import { useTTS } from "../hooks/useTTS";
import { wsUrl } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startRecognition,
  type RecognitionController,
} from "../lib/speech";
import { loadJSON, saveJSON } from "../lib/storage";
import type { CallUtterance } from "../lib/types";

type SpeakerId = "A" | "B";

interface Prefs {
  langA: string;
  langB: string;
  autoSpeak: boolean;
}

const PREFS_KEY = "translator:call";
const DEFAULT_PREFS: Prefs = { langA: "en-US", langB: "ru-RU", autoSpeak: true };

interface SpeakerState {
  recording: boolean;
  partial: string;
}

const initialSpeakerState: SpeakerState = { recording: false, partial: "" };

export function CallMode() {
  const languages = useLanguages();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [utterances, setUtterances] = useState<CallUtterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<Record<SpeakerId, SpeakerState>>({
    A: { ...initialSpeakerState },
    B: { ...initialSpeakerState },
  });

  const wsRef = useRef<WebSocket | null>(null);
  const recognizersRef = useRef<Record<SpeakerId, RecognitionController | null>>({ A: null, B: null });
  const utteranceMap = useRef<Map<string, CallUtterance>>(new Map());
  const flushFrameRef = useRef<number | null>(null);
  const { speak, cancel } = useTTS();
  const supportsSpeech = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  // rAF-batched flush: with two simultaneous streams, naive setState-per-chunk
  // can exceed display refresh and stutter. Coalesce into one frame's render.
  const flushUtterances = useCallback(() => {
    flushFrameRef.current = null;
    setUtterances(
      Array.from(utteranceMap.current.values()).sort((a, b) => a.createdAt - b.createdAt),
    );
  }, []);

  const upsertUtterance = useCallback(
    (u: CallUtterance) => {
      utteranceMap.current.set(u.id, u);
      if (flushFrameRef.current === null) {
        flushFrameRef.current = requestAnimationFrame(flushUtterances);
      }
    },
    [flushUtterances],
  );

  useEffect(
    () => () => {
      if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current);
    },
    [],
  );

  const handleSocketMessage = useCallback(
    (data: { type: string; id?: string; content?: string; message?: string }) => {
      if (data.type === "delta" && data.id && data.content) {
        const existing = utteranceMap.current.get(data.id);
        if (!existing) return;
        upsertUtterance({ ...existing, translation: existing.translation + data.content });
      } else if (data.type === "done" && data.id) {
        const existing = utteranceMap.current.get(data.id);
        if (!existing) return;
        const finalUtterance = { ...existing, done: true };
        upsertUtterance(finalUtterance);
        if (prefs.autoSpeak && finalUtterance.translation.trim()) {
          void speak(finalUtterance.translation, { lang: finalUtterance.target });
        }
      } else if (data.type === "error" && data.message) {
        setError(data.message);
      }
    },
    [upsertUtterance, prefs.autoSpeak, speak],
  );

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    setError(null);
    let url: string;
    try {
      url = wsUrl("/api/ws/call");
    } catch (err) {
      setError((err as Error).message);
      setConnecting(false);
      return;
    }
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
    };
    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
    };
    ws.onerror = () => {
      setError("WebSocket error");
      setConnecting(false);
    };
    ws.onmessage = (event) => {
      try {
        handleSocketMessage(JSON.parse(event.data));
      } catch {
        /* ignore non-json frames */
      }
    };
  }, [handleSocketMessage]);

  const disconnect = useCallback(() => {
    cancel();
    Object.values(recognizersRef.current).forEach((r) => r?.abort());
    recognizersRef.current = { A: null, B: null };
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setSpeakers({ A: { ...initialSpeakerState }, B: { ...initialSpeakerState } });
  }, [cancel]);

  useEffect(() => () => disconnect(), [disconnect]);

  const finalizeUtterance = useCallback(
    (speaker: SpeakerId, text: string) => {
      if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const id = `${speaker}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const source = speaker === "A" ? prefs.langA : prefs.langB;
      const target = speaker === "A" ? prefs.langB : prefs.langA;
      const utterance: CallUtterance = {
        id,
        speaker,
        source,
        target,
        original: text.trim(),
        translation: "",
        done: false,
        createdAt: Date.now(),
      };
      upsertUtterance(utterance);
      wsRef.current.send(
        JSON.stringify({ type: "translate", id, text: text.trim(), source, target }),
      );
    },
    [prefs.langA, prefs.langB, upsertUtterance],
  );

  const startSpeaker = useCallback(
    (speaker: SpeakerId) => {
      if (!connected) connect();
      const lang = speaker === "A" ? prefs.langA : prefs.langB;
      const controller = startRecognition(lang === "auto" ? "en-US" : lang, {
        onPartial: (text) =>
          setSpeakers((prev) => ({ ...prev, [speaker]: { ...prev[speaker], partial: text } })),
        onFinal: (text) => {
          setSpeakers((prev) => ({ ...prev, [speaker]: { ...prev[speaker], partial: "" } }));
          finalizeUtterance(speaker, text);
        },
        onError: (msg) => {
          setError(msg);
          setSpeakers((prev) => ({ ...prev, [speaker]: { ...initialSpeakerState } }));
        },
        onEnd: () =>
          setSpeakers((prev) => ({ ...prev, [speaker]: { ...prev[speaker], recording: false } })),
      });
      if (!controller) return;
      recognizersRef.current[speaker] = controller;
      setSpeakers((prev) => ({ ...prev, [speaker]: { ...prev[speaker], recording: true } }));
    },
    [connect, connected, prefs.langA, prefs.langB, finalizeUtterance],
  );

  const stopSpeaker = useCallback((speaker: SpeakerId) => {
    recognizersRef.current[speaker]?.stop();
    recognizersRef.current[speaker] = null;
    setSpeakers((prev) => ({ ...prev, [speaker]: { ...prev[speaker], recording: false } }));
  }, []);

  const swapLanguages = () =>
    setPrefs((p) => ({ ...p, langA: p.langB, langB: p.langA }));

  const speakerASide = useMemo(
    () => utterances.filter((u) => u.speaker === "A"),
    [utterances],
  );
  const speakerBSide = useMemo(
    () => utterances.filter((u) => u.speaker === "B"),
    [utterances],
  );

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">Call translation</span>
        <h1 className="heading-display text-[34px] sm:text-[40px] lg:text-[52px] leading-[1.05]">
          Two voices.{" "}
          <span className="bg-clip-text text-transparent bg-brand-grad">
            One shared interpreter.
          </span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          Pass the device between speakers or place it in the middle — each side
          gets an independent mic, language, and streamed response.
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <LanguageSelect
          value={prefs.langA}
          onChange={(code) => setPrefs((p) => ({ ...p, langA: code }))}
          languages={languages}
          excludeAuto
          ariaLabel="Person A language"
          className="min-w-0"
        />
        <button type="button" onClick={swapLanguages} className="icon-btn" aria-label="Swap languages">
          <ArrowDownUp className="w-4 h-4" />
        </button>
        <LanguageSelect
          value={prefs.langB}
          onChange={(code) => setPrefs((p) => ({ ...p, langB: code }))}
          languages={languages}
          excludeAuto
          ariaLabel="Person B language"
          className="min-w-0"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-6">
        <SpeakerColumn
          speaker="A"
          lang={prefs.langA}
          targetLang={prefs.langB}
          state={speakers.A}
          utterances={speakerASide}
          onStart={() => startSpeaker("A")}
          onStop={() => stopSpeaker("A")}
          disabled={!supportsSpeech}
          onPlay={(t) => void speak(t, { lang: prefs.langB })}
        />
        <SpeakerColumn
          speaker="B"
          lang={prefs.langB}
          targetLang={prefs.langA}
          state={speakers.B}
          utterances={speakerBSide}
          onStart={() => startSpeaker("B")}
          onStop={() => stopSpeaker("B")}
          disabled={!supportsSpeech}
          onPlay={(t) => void speak(t, { lang: prefs.langA })}
        />
      </div>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-[28px] border border-white/[0.06] bg-canvas-950/80 px-4 py-3 shadow-glow backdrop-blur-2xl lg:static lg:mx-0 lg:bg-transparent lg:shadow-none lg:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {connected ? (
              <button type="button" onClick={disconnect} className="btn-danger">
                <PhoneOff className="w-4 h-4" /> End call
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={connecting}
                className="btn-primary"
              >
                <Phone className="w-4 h-4" /> {connecting ? "Connecting…" : "Start call"}
              </button>
            )}
            <span className={`pill ${connected ? "text-teal-200" : "text-ink-400"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-teal-300" : "bg-ink-500"}`} />
              {connected ? "Live" : "Idle"}
            </span>
          </div>
          <label className="flex items-center gap-2.5 select-none cursor-pointer text-sm text-ink-300">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={prefs.autoSpeak}
                onChange={(e) => setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))}
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
            Speak translations aloud
          </label>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/25 rounded-xl px-4 py-2">
          {error}
        </div>
      ) : null}
    </div>
  );
}

interface SpeakerColumnProps {
  speaker: SpeakerId;
  lang: string;
  targetLang: string;
  state: SpeakerState;
  utterances: CallUtterance[];
  onStart: () => void;
  onStop: () => void;
  onPlay: (text: string) => void;
  disabled?: boolean;
}

interface UtteranceItemProps {
  utterance: CallUtterance;
  onPlay: (text: string) => void;
}

const UtteranceItem = memo(
  function UtteranceItem({ utterance: u, onPlay }: UtteranceItemProps) {
    return (
      <div className="stream-pane rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.06] space-y-2">
        <div className="text-sm leading-6 text-ink-100">{u.original}</div>
        <div className="flex items-start gap-2 text-sm leading-6 text-teal-200">
          <span className={`flex-1 whitespace-pre-wrap ${!u.done ? "typing-caret" : ""}`}>
            {u.translation || (u.done ? "…" : "translating…")}
          </span>
          {u.translation ? (
            <button
              type="button"
              onClick={() => onPlay(u.translation)}
              className="icon-btn h-8 w-8 shrink-0"
              aria-label="Play translation"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.utterance.translation === next.utterance.translation &&
    prev.utterance.done === next.utterance.done &&
    prev.utterance.original === next.utterance.original &&
    prev.onPlay === next.onPlay,
);

function SpeakerColumn({
  speaker,
  lang,
  targetLang,
  state,
  utterances,
  onStart,
  onStop,
  onPlay,
  disabled,
}: SpeakerColumnProps) {
  const tag = speaker === "A" ? "Person A" : "Person B";
  const aside = speaker === "B" ? "lg:mt-12" : "";
  return (
    <section className={`surface relative flex min-h-[48dvh] flex-col gap-4 overflow-hidden px-5 py-5 lg:min-h-[520px] lg:px-7 lg:py-7 ${aside}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">{tag}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">
            {lang} → {targetLang}
          </p>
        </div>
        <span className={`pill ${state.recording ? "text-rose-200" : "text-ink-400"}`}>
          <span className={`h-2 w-2 rounded-full ${state.recording ? "bg-rose-300" : "bg-ink-500"}`} />
          {state.recording ? "Listening" : "Ready"}
        </span>
      </div>

      <div className="smooth-scroll flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
        {utterances.length === 0 && !state.partial ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-ink-500">
            No turns yet. Tap the mic and start speaking.
          </div>
        ) : null}
        {utterances.map((u) => (
          <UtteranceItem key={u.id} utterance={u} onPlay={onPlay} />
        ))}
        {state.partial ? (
          <div className="rounded-2xl bg-white/[0.03] p-3 text-sm italic text-ink-400 ring-1 ring-white/[0.05]">
            {state.partial}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={state.recording ? onStop : onStart}
        disabled={disabled}
        className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition duration-200 ease-premium active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
          state.recording
            ? "bg-rose-500/90 text-white shadow-[0_18px_50px_-20px_rgba(244,63,94,0.7)] animate-pulse-soft"
            : "bg-white/[0.06] text-white ring-1 ring-white/[0.08] hover:bg-white/[0.1]"
        }`}
      >
        {state.recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        {state.recording ? "Stop" : `Talk as ${tag}`}
      </button>
    </section>
  );
}
