import { ArrowDownUp, Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { useToast } from "../components/Toast";
import { useLanguages } from "../hooks/useLanguages";
import { useTTS } from "../hooks/useTTS";
import { wsUrl } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startRecognition,
  type RecognitionController,
} from "../lib/speech";
import { loadJSON, saveJSON } from "../lib/storage";

type SpeakerId = "A" | "B";

interface Prefs {
  langA: string;
  langB: string;
  autoSpeak: boolean;
}

const PREFS_KEY = "translator:call";
const DEFAULT_PREFS: Prefs = { langA: "en-US", langB: "ru-RU", autoSpeak: true };

/** A single utterance in the shared conversation timeline */
interface Utterance {
  id: string;
  speaker: SpeakerId;
  sourceLang: string;
  targetLang: string;
  original: string;
  translation: string;
  done: boolean;
  timestamp: number;
}

export function CallMode() {
  const languages = useLanguages();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<SpeakerId | null>(null);
  const [partial, setPartial] = useState("");
  const [swapAnimating, setSwapAnimating] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recognizerRef = useRef<RecognitionController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const utteranceMapRef = useRef<Map<string, Utterance>>(new Map());
  const flushRef = useRef<number | null>(null);
  const { speak, cancel } = useTTS();
  const supportsSpeech = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  // Auto-scroll chat
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [utterances, partial]);

  // Flush utterances from map to state (rAF batched)
  const flush = useCallback(() => {
    flushRef.current = null;
    setUtterances(
      Array.from(utteranceMapRef.current.values()).sort((a, b) => a.timestamp - b.timestamp)
    );
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushRef.current === null) {
      flushRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  useEffect(() => () => { if (flushRef.current !== null) cancelAnimationFrame(flushRef.current); }, []);

  // WebSocket message handler
  const handleMessage = useCallback((data: { type: string; id?: string; content?: string; message?: string }) => {
    if (data.type === "delta" && data.id && data.content) {
      const existing = utteranceMapRef.current.get(data.id);
      if (existing) {
        utteranceMapRef.current.set(data.id, { ...existing, translation: existing.translation + data.content });
        scheduleFlush();
      }
    } else if (data.type === "done" && data.id) {
      const existing = utteranceMapRef.current.get(data.id);
      if (existing) {
        const final = { ...existing, done: true };
        utteranceMapRef.current.set(data.id, final);
        scheduleFlush();
        // Auto-speak the translation in the target language
        if (prefs.autoSpeak && final.translation.trim()) {
          speak(final.translation, { lang: final.targetLang });
        }
      }
    } else if (data.type === "error" && data.message) {
      setError(data.message);
    }
  }, [scheduleFlush, prefs.autoSpeak, speak]);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    setError(null);
    let url: string;
    try { url = wsUrl("/api/ws/call"); } catch (err) { setError((err as Error).message); setConnecting(false); return; }

    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => { setConnected(true); setConnecting(false); toast("Call connected", "success"); };
    ws.onclose = () => { setConnected(false); setConnecting(false); };
    ws.onerror = () => { setError("Connection failed"); setConnecting(false); };
    ws.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch {} };
  }, [handleMessage, toast]);

  // Disconnect
  const disconnect = useCallback(() => {
    cancel();
    recognizerRef.current?.abort();
    recognizerRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setActiveSpeaker(null);
    setPartial("");
    toast("Call ended", "info");
  }, [cancel, toast]);

  useEffect(() => () => { wsRef.current?.close(); recognizerRef.current?.abort(); }, []);

  // Send text for translation via WebSocket
  const sendForTranslation = useCallback((speaker: SpeakerId, text: string) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const id = `${speaker}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const sourceLang = speaker === "A" ? prefs.langA : prefs.langB;
    const targetLang = speaker === "A" ? prefs.langB : prefs.langA;

    const utterance: Utterance = {
      id, speaker, sourceLang, targetLang,
      original: text.trim(),
      translation: "",
      done: false,
      timestamp: Date.now(),
    };
    utteranceMapRef.current.set(id, utterance);
    scheduleFlush();

    wsRef.current.send(JSON.stringify({
      type: "translate", id, text: text.trim(), source: sourceLang, target: targetLang,
    }));
  }, [prefs.langA, prefs.langB, scheduleFlush]);

  // Start recording for a speaker
  const startRecording = useCallback((speaker: SpeakerId) => {
    if (!connected) connect();
    cancel(); // stop any TTS
    setError(null);
    setPartial("");

    const lang = speaker === "A" ? prefs.langA : prefs.langB;
    const controller = startRecognition(lang === "auto" ? "en-US" : lang, {
      onPartial: (text) => setPartial(text),
      onFinal: (text) => {
        setPartial("");
        sendForTranslation(speaker, text);
      },
      onError: (msg) => { setError(msg); setActiveSpeaker(null); },
      onEnd: () => setActiveSpeaker(null),
    });
    if (!controller) return;
    recognizerRef.current = controller;
    setActiveSpeaker(speaker);
  }, [connected, connect, cancel, prefs.langA, prefs.langB, sendForTranslation]);

  // Stop recording
  const stopRecording = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setActiveSpeaker(null);
    setPartial("");
  }, []);

  // Swap languages
  const swapLanguages = useCallback(() => {
    setSwapAnimating(true);
    setTimeout(() => setSwapAnimating(false), 450);
    setPrefs((p) => ({ ...p, langA: p.langB, langB: p.langA }));
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <span className="label-eyebrow">Call Translation</span>
        <h1 className="heading-display text-[32px] sm:text-[38px] lg:text-[48px] leading-[1.08]">
          Speak.{" "}
          <span className="bg-clip-text text-transparent bg-brand-grad">Hear each other.</span>
        </h1>
        <p className="text-ink-400 max-w-xl text-[15px] leading-relaxed">
          Two people, two languages — speak and hear the translation instantly.
          Everything appears as live subtitles.
        </p>
      </header>

      {/* Language bar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-widest text-ink-500 font-medium block mb-1">Person A</span>
          <LanguageSelect value={prefs.langA} onChange={(code) => setPrefs((p) => ({ ...p, langA: code }))} languages={languages} excludeAuto ariaLabel="Person A language" className="min-w-0" />
        </div>
        <button type="button" onClick={swapLanguages} className={`icon-btn mt-4 ${swapAnimating ? "swap-animate" : ""}`} aria-label="Swap languages">
          <ArrowDownUp className="w-4 h-4" />
        </button>
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-widest text-ink-500 font-medium block mb-1">Person B</span>
          <LanguageSelect value={prefs.langB} onChange={(code) => setPrefs((p) => ({ ...p, langB: code }))} languages={languages} excludeAuto ariaLabel="Person B language" className="min-w-0" />
        </div>
      </div>

      {/* Chat / Subtitle area */}
      <div className="surface flex flex-col h-[55dvh] sm:h-[50vh] min-h-[320px] overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3 smooth-scroll scrollbar-thin">
          {utterances.length === 0 && !partial ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-grad text-canvas-950 shadow-glow-teal">
                <Phone className="w-6 h-6" />
              </div>
              <p className="font-display text-lg text-white tracking-tight">Start a conversation</p>
              <p className="text-sm text-ink-400 max-w-xs">
                Connect the call, then tap "Talk as A" or "Talk as B" to start speaking.
                You'll see subtitles with original text and translation.
              </p>
            </div>
          ) : (
            <>
              {utterances.map((u) => (
                <SubtitleBubble key={u.id} utterance={u} onSpeak={(text, lang) => speak(text, { lang })} />
              ))}
              {partial && (
                <div className="flex justify-center">
                  <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] px-4 py-2 text-sm text-ink-300 italic animate-fade-in">
                    {partial}...
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4">
        {/* Mic buttons */}
        <div className="grid grid-cols-2 gap-3">
          <MicButton
            speaker="A"
            active={activeSpeaker === "A"}
            disabled={!supportsSpeech || !connected || (activeSpeaker !== null && activeSpeaker !== "A")}
            onStart={() => startRecording("A")}
            onStop={stopRecording}
            lang={prefs.langA}
          />
          <MicButton
            speaker="B"
            active={activeSpeaker === "B"}
            disabled={!supportsSpeech || !connected || (activeSpeaker !== null && activeSpeaker !== "B")}
            onStart={() => startRecording("B")}
            onStop={stopRecording}
            lang={prefs.langB}
          />
        </div>

        {/* Connection + settings bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {connected ? (
              <button type="button" onClick={disconnect} className="btn-danger">
                <PhoneOff className="w-4 h-4" /> End
              </button>
            ) : (
              <button type="button" onClick={connect} disabled={connecting} className="btn-primary">
                <Phone className="w-4 h-4" /> {connecting ? "Connecting..." : "Start Call"}
              </button>
            )}
            <span className={`pill ${connected ? "text-teal-200" : "text-ink-400"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-teal-300 animate-pulse-soft" : "bg-ink-500"}`} />
              {connected ? "Live" : "Idle"}
            </span>
          </div>

          <label className="flex items-center gap-2.5 select-none cursor-pointer text-sm text-ink-300">
            <span className="relative inline-flex">
              <input type="checkbox" checked={prefs.autoSpeak} onChange={(e) => setPrefs((p) => ({ ...p, autoSpeak: e.target.checked }))} className="peer sr-only" />
              <span aria-hidden className="w-9 h-5 rounded-full bg-white/[0.08] ring-1 ring-white/[0.06] peer-checked:bg-brand-grad transition-all duration-200" />
              <span aria-hidden className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
            </span>
            Auto-speak translations
          </label>
        </div>
      </div>

      {error && (
        <div className="animate-fade-up text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-2xl px-4 py-2.5">
          {error}
        </div>
      )}
    </div>
  );
}

/* ─── Subtitle Bubble ─── */

interface SubtitleBubbleProps {
  utterance: Utterance;
  onSpeak: (text: string, lang: string) => void;
}

const SubtitleBubble = memo(function SubtitleBubble({ utterance: u, onSpeak }: SubtitleBubbleProps) {
  const isA = u.speaker === "A";
  return (
    <div className={`flex ${isA ? "justify-start" : "justify-end"} animate-fade-up`} style={{ animationDuration: "200ms" }}>
      <div className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-3 space-y-2 ${
        isA
          ? "rounded-bl-md bg-white/[0.04] ring-1 ring-white/[0.06]"
          : "rounded-br-md bg-violet-500/10 ring-1 ring-violet-400/15"
      }`}>
        {/* Speaker label */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] uppercase tracking-widest font-semibold ${isA ? "text-teal-300" : "text-violet-300"}`}>
            Person {u.speaker} · {u.sourceLang}
          </span>
          {u.done && (
            <button type="button" onClick={() => onSpeak(u.translation, u.targetLang)} className="icon-btn w-6 h-6" aria-label="Play translation">
              <Volume2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Original text */}
        <p className="text-sm text-ink-100 leading-relaxed">{u.original}</p>

        {/* Translation */}
        <div className={`border-t pt-2 ${isA ? "border-white/[0.06]" : "border-violet-400/10"}`}>
          <p className={`text-sm font-medium leading-relaxed ${
            u.translation ? "text-teal-200" : "text-ink-400"
          } ${!u.done && u.translation ? "typing-caret" : ""}`}>
            {u.translation || (u.done ? "..." : "Translating...")}
          </p>
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.utterance.translation === next.utterance.translation &&
  prev.utterance.done === next.utterance.done &&
  prev.utterance.original === next.utterance.original
);

/* ─── Mic Button ─── */

function MicButton({ speaker, active, disabled, onStart, onStop, lang }: {
  speaker: SpeakerId; active: boolean; disabled: boolean;
  onStart: () => void; onStop: () => void; lang: string;
}) {
  const isA = speaker === "A";
  return (
    <button
      type="button"
      onClick={active ? onStop : onStart}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl py-5 px-4 text-sm font-semibold transition-all duration-200 ease-premium active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-rose-500/15 text-rose-300 ring-2 ring-rose-400/30 animate-pulse-soft"
          : `bg-white/[0.03] text-white ring-1 ring-white/[0.06] hover:bg-white/[0.06] ${isA ? "hover:ring-teal-400/20" : "hover:ring-violet-400/20"}`
      }`}
    >
      {active ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      <span>{active ? "Stop" : `Talk as ${speaker}`}</span>
      <span className="text-[10px] text-ink-400 font-normal">{lang}</span>
    </button>
  );
}
