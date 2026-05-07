import { ArrowDownUp, Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HealthBadge } from "../components/HealthBadge";
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
  const { speak, cancel } = useTTS();
  const supportsSpeech = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  const upsertUtterance = useCallback((u: CallUtterance) => {
    utteranceMap.current.set(u.id, u);
    setUtterances((prev) => {
      const idx = prev.findIndex((x) => x.id === u.id);
      if (idx === -1) return [...prev, u].sort((a, b) => a.createdAt - b.createdAt);
      const copy = [...prev];
      copy[idx] = u;
      return copy;
    });
  }, []);

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
    <div className="flex flex-col gap-4 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Call Translation</h1>
          <p className="text-xs text-ink-400">
            Two people, two languages — pass the device or use one mic each.
          </p>
        </div>
        <HealthBadge />
      </header>

      <div className="card p-3 flex items-center justify-between gap-2">
        <LanguageSelect
          value={prefs.langA}
          onChange={(code) => setPrefs((p) => ({ ...p, langA: code }))}
          languages={languages}
          excludeAuto
          ariaLabel="Person A language"
          className="flex-1 min-w-0"
        />
        <button type="button" onClick={swapLanguages} className="btn-icon" aria-label="Swap">
          <ArrowDownUp className="w-4 h-4" />
        </button>
        <LanguageSelect
          value={prefs.langB}
          onChange={(code) => setPrefs((p) => ({ ...p, langB: code }))}
          languages={languages}
          excludeAuto
          ariaLabel="Person B language"
          className="flex-1 min-w-0"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {connected ? (
            <button type="button" onClick={disconnect} className="btn bg-red-500 text-white hover:bg-red-400">
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
          <span
            className={`chip ${
              connected ? "ring-1 ring-emerald-500/40 text-emerald-300" : "text-ink-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? "bg-emerald-400" : "bg-ink-500"
              }`}
            />
            {connected ? "Live" : "Idle"}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-300 select-none">
          <input
            type="checkbox"
            checked={prefs.autoSpeak}
            onChange={(e) => setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))}
            className="accent-brand-500"
          />
          Auto-speak translation
        </label>
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}
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
  const accent = speaker === "A" ? "ring-brand-500/30" : "ring-emerald-500/30";
  const tag = speaker === "A" ? "Person A" : "Person B";
  return (
    <div className={`card p-4 flex flex-col gap-3 ring-1 ${accent} min-h-[280px]`}>
      <div className="flex items-center justify-between text-xs text-ink-400">
        <span className="uppercase tracking-wide">{tag}</span>
        <span className="chip">{lang} → {targetLang}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1 max-h-[40vh]">
        {utterances.length === 0 && !state.partial ? (
          <div className="text-ink-500 text-sm py-6 text-center">No turns yet.</div>
        ) : null}
        {utterances.map((u) => (
          <div key={u.id} className="bg-ink-900/50 rounded-xl p-3 space-y-1.5">
            <div className="text-sm text-ink-200">{u.original}</div>
            <div className="text-sm text-brand-200 flex items-start gap-1.5">
              <span className="flex-1 whitespace-pre-wrap">{u.translation || (u.done ? "…" : "translating…")}</span>
              {u.translation ? (
                <button
                  type="button"
                  onClick={() => onPlay(u.translation)}
                  className="btn-icon w-7 h-7"
                  aria-label="Play translation"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {state.partial ? (
          <div className="bg-ink-900/30 rounded-xl p-3 italic text-ink-400 text-sm">{state.partial}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={state.recording ? onStop : onStart}
        disabled={disabled}
        className={`btn ${
          state.recording
            ? "bg-red-500 text-white hover:bg-red-400 animate-pulse-soft"
            : "bg-brand-500 text-ink-950 hover:bg-brand-400"
        }`}
      >
        {state.recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        {state.recording ? "Hold to stop" : `Talk as ${tag}`}
      </button>
    </div>
  );
}
