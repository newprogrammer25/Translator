import { Copy, Link2, Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { useToast } from "../components/Toast";
import { useLanguages } from "../hooks/useLanguages";
import { useTTS } from "../hooks/useTTS";
import { apiUrl, wsUrl } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startRecognition,
  type RecognitionController,
} from "../lib/speech";
import { loadJSON, saveJSON } from "../lib/storage";

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

interface Prefs {
  myLanguage: string;
  autoSpeak: boolean;
}

const PREFS_KEY = "translator:call-v2";
const DEFAULT_PREFS: Prefs = { myLanguage: "en-US", autoSpeak: true };

type CallState = "idle" | "creating" | "joining" | "waiting" | "connected";

interface Subtitle {
  id: string;
  from: "me" | "peer";
  original: string;
  translation: string;
  done: boolean;
  timestamp: number;
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export function CallMode() {
  const languages = useLanguages();
  const { toast } = useToast();
  const { speak } = useTTS();
  const [prefs, setPrefs] = useState<Prefs>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS));
  const [callState, setCallState] = useState<CallState>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peerLanguage, setPeerLanguage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState("");
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognizerRef = useRef<RecognitionController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const subtitleMapRef = useRef<Map<string, Subtitle>>(new Map());

  const supportsSpeech = isSpeechRecognitionSupported();

  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);

  // Auto-scroll subtitles
  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [subtitles, partial]);

  /* ─── WebRTC Setup ─── */

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          candidate: e.candidate.toJSON(),
        }));
      }
    };

    pc.ontrack = (e) => {
      if (remoteAudioRef.current && e.streams[0]) {
        remoteAudioRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setError("Connection lost");
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  const startLocalAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch {
      setError("Microphone access denied");
      return null;
    }
  }, []);

  /* ─── WebSocket Message Handler ─── */

  const handleWsMessage = useCallback(async (data: Record<string, unknown>) => {
    const type = data.type as string;

    switch (type) {
      case "joined": {
        setPeerId(data.peer_id as string);
        const count = data.peer_count as number;
        if (count === 1) setCallState("waiting");
        break;
      }

      case "peer-joined": {
        setPeerLanguage(data.language as string);
        setCallState("connected");
        toast("Partner joined the call", "success");

        // Initiator creates offer
        const pc = pcRef.current ?? createPeerConnection();
        const stream = localStreamRef.current ?? await startLocalAudio();
        if (stream) {
          stream.getTracks().forEach((t) => {
            if (!pc.getSenders().find((s) => s.track === t)) {
              pc.addTrack(t, stream);
            }
          });
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
        break;
      }

      case "peer-left": {
        setPeerLanguage(null);
        setCallState("waiting");
        toast("Partner left the call", "info");
        pcRef.current?.close();
        pcRef.current = null;
        break;
      }

      case "peer-language": {
        setPeerLanguage(data.language as string);
        break;
      }

      case "offer": {
        const pc = pcRef.current ?? createPeerConnection();
        const stream = localStreamRef.current ?? await startLocalAudio();
        if (stream) {
          stream.getTracks().forEach((t) => {
            if (!pc.getSenders().find((s) => s.track === t)) {
              pc.addTrack(t, stream);
            }
          });
        }
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp as string });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current?.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
        break;
      }

      case "answer": {
        await pcRef.current?.setRemoteDescription({ type: "answer", sdp: data.sdp as string });
        break;
      }

      case "ice-candidate": {
        if (data.candidate) {
          await pcRef.current?.addIceCandidate(data.candidate as RTCIceCandidateInit);
        }
        break;
      }

      case "subtitle": {
        // Peer's original speech (no translation yet)
        const id = data.id as string;
        const sub: Subtitle = {
          id, from: "peer", original: data.text as string,
          translation: "", done: false, timestamp: Date.now(),
        };
        subtitleMapRef.current.set(id, sub);
        flushSubtitles();
        break;
      }

      case "delta": {
        const id = data.id as string;
        const existing = subtitleMapRef.current.get(id);
        if (existing) {
          subtitleMapRef.current.set(id, {
            ...existing,
            translation: existing.translation + (data.content as string),
          });
          flushSubtitles();
        }
        break;
      }

      case "done": {
        const id = data.id as string;
        const existing = subtitleMapRef.current.get(id);
        if (existing) {
          const final = { ...existing, done: true };
          subtitleMapRef.current.set(id, final);
          flushSubtitles();
          // Auto-speak peer's translation
          if (prefs.autoSpeak && final.from === "peer" && final.translation.trim()) {
            speak(final.translation, { lang: prefs.myLanguage });
          }
        }
        break;
      }

      case "error": {
        setError(data.message as string);
        break;
      }

      case "pong":
        break;
    }
  }, [createPeerConnection, startLocalAudio, toast, prefs.autoSpeak, prefs.myLanguage, speak]);

  const flushSubtitles = useCallback(() => {
    setSubtitles(
      Array.from(subtitleMapRef.current.values()).sort((a, b) => a.timestamp - b.timestamp)
    );
  }, []);

  /* ─── Connect to Room ─── */

  const connectToRoom = useCallback(async (rid: string) => {
    setError(null);
    const ws = new WebSocket(wsUrl(`/api/ws/room/${rid}`));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "set-language", language: prefs.myLanguage }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        void handleWsMessage(data);
      } catch {}
    };

    ws.onerror = () => setError("Connection failed");
    ws.onclose = () => {
      if (callState !== "idle") {
        setCallState("idle");
        toast("Disconnected", "info");
      }
    };

    // Setup WebRTC
    createPeerConnection();
    await startLocalAudio();
  }, [prefs.myLanguage, handleWsMessage, createPeerConnection, startLocalAudio, callState, toast]);

  /* ─── Create Room ─── */

  const createRoom = useCallback(async () => {
    setCallState("creating");
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/rooms/create"), { method: "POST" });
      if (!res.ok) throw new Error("Failed to create room");
      const { room_id } = await res.json();
      setRoomId(room_id);
      await connectToRoom(room_id);
    } catch (err) {
      setError((err as Error).message);
      setCallState("idle");
    }
  }, [connectToRoom]);

  /* ─── Join Room ─── */

  const joinRoom = useCallback(async (rid?: string) => {
    const id = rid || joinInput.trim();
    if (!id) return;
    setCallState("joining");
    setError(null);

    try {
      // Verify room exists
      const res = await fetch(apiUrl(`/api/rooms/${id}`));
      if (!res.ok) throw new Error("Room not found");
      const info = await res.json();
      if (info.is_full) throw new Error("Room is full");

      setRoomId(id);
      await connectToRoom(id);
    } catch (err) {
      setError((err as Error).message);
      setCallState("idle");
    }
  }, [joinInput, connectToRoom]);

  /* ─── Hangup ─── */

  const hangup = useCallback(() => {
    recognizerRef.current?.abort();
    recognizerRef.current = null;
    setRecording(false);
    setPartial("");

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    wsRef.current?.close();
    wsRef.current = null;

    setCallState("idle");
    setRoomId(null);
    setPeerId(null);
    setPeerLanguage(null);
    setSubtitles([]);
    subtitleMapRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { hangup(); }, [hangup]);

  /* ─── Speech Recognition ─── */

  const startListening = useCallback(() => {
    if (!supportsSpeech || callState !== "connected") return;
    setPartial("");

    const controller = startRecognition(prefs.myLanguage, {
      onPartial: (text) => setPartial(text),
      onFinal: (text) => {
        setPartial("");
        if (!text.trim()) return;

        // Create subtitle locally
        const id = `me-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const sub: Subtitle = {
          id, from: "me", original: text.trim(),
          translation: "", done: false, timestamp: Date.now(),
        };
        subtitleMapRef.current.set(id, sub);
        flushSubtitles();

        // Send original text to peer as subtitle
        wsRef.current?.send(JSON.stringify({ type: "subtitle", id, text: text.trim() }));

        // Request translation (my language -> peer's language)
        if (peerLanguage && peerLanguage !== prefs.myLanguage) {
          wsRef.current?.send(JSON.stringify({
            type: "translate", id, text: text.trim(),
            source: prefs.myLanguage, target: peerLanguage,
          }));
        }
      },
      onError: (msg) => { setError(msg); setRecording(false); },
      onEnd: () => {
        setRecording(false);
        // Auto-restart if not muted
        if (!muted && callState === "connected") {
          setTimeout(() => startListening(), 200);
        }
      },
    });
    if (controller) {
      recognizerRef.current = controller;
      setRecording(true);
    }
  }, [supportsSpeech, callState, prefs.myLanguage, peerLanguage, muted, flushSubtitles]);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setRecording(false);
    setPartial("");
  }, []);

  // Auto-start listening when connected
  useEffect(() => {
    if (callState === "connected" && !muted && !recording && supportsSpeech) {
      const t = setTimeout(startListening, 500);
      return () => clearTimeout(t);
    }
  }, [callState, muted, recording, supportsSpeech, startListening]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (muted) {
      setMuted(false);
      // Will auto-start via effect
    } else {
      setMuted(true);
      stopListening();
      // Also mute WebRTC audio track
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
    }
  }, [muted, stopListening]);

  // Unmute restores audio track
  useEffect(() => {
    if (!muted) {
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    }
  }, [muted]);

  /* ─── Copy invite link ─── */

  const copyInviteLink = useCallback(async () => {
    if (!roomId) return;
    const link = `${window.location.origin}/call?room=${roomId}`;
    await navigator.clipboard.writeText(link);
    toast("Invite link copied!");
  }, [roomId, toast]);

  /* ─── Check URL for room param on mount ─── */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("room");
    if (rid && callState === "idle") {
      setJoinInput(rid);
      void joinRoom(rid);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Notify language change ─── */

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "set-language", language: prefs.myLanguage }));
    }
  }, [prefs.myLanguage]);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */

  // IDLE STATE — create or join
  if (callState === "idle") {
    return (
      <div className="flex flex-col gap-8 animate-fade-up">
        <header className="flex flex-col gap-2">
          <span className="label-eyebrow">Audio Call</span>
          <h1 className="heading-display text-[32px] sm:text-[38px] lg:text-[44px] leading-[1.08]">
            Call anyone.{" "}
            <span className="bg-clip-text text-transparent bg-brand-grad">Speak freely.</span>
          </h1>
          <p className="text-ink-400 max-w-md text-[15px] leading-relaxed">
            Real-time audio call with live translation subtitles.
            Create a room and share the link — no sign-up needed.
          </p>
        </header>

        {/* My language */}
        <div>
          <span className="label-eyebrow mb-2 block">I speak</span>
          <LanguageSelect
            value={prefs.myLanguage}
            onChange={(code) => setPrefs((p) => ({ ...p, myLanguage: code }))}
            languages={languages}
            excludeAuto
            ariaLabel="My language"
          />
        </div>

        {/* Create / Join */}
        <div className="flex flex-col gap-4">
          <button type="button" onClick={createRoom} className="btn-primary w-full py-4 text-base">
            <Phone className="w-5 h-5" />
            Create Call Room
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-xs text-ink-500 uppercase tracking-widest">or join</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Enter room ID..."
              className="flex-1 rounded-full px-5 py-3 text-sm bg-white/[0.04] border border-white/[0.06] text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
              onKeyDown={(e) => { if (e.key === "Enter") void joinRoom(); }}
            />
            <button
              type="button"
              onClick={() => void joinRoom()}
              disabled={!joinInput.trim()}
              className="btn-secondary px-5"
            >
              Join
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-2xl px-4 py-2.5">
            {error}
          </div>
        )}
      </div>
    );
  }

  // WAITING / CREATING / JOINING STATE
  if (callState === "waiting" || callState === "creating" || callState === "joining") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 min-h-[60vh] animate-fade-up">
        {/* Pulsing icon */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-teal-400/20 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-brand-grad flex items-center justify-center shadow-glow-teal">
            <Phone className="w-8 h-8 text-canvas-950" />
          </div>
        </div>

        <div className="text-center">
          <h2 className="font-display text-xl font-semibold text-white tracking-tight">
            {callState === "waiting" ? "Waiting for partner..." : "Connecting..."}
          </h2>
          {roomId && (
            <p className="text-ink-400 text-sm mt-2">
              Room: <span className="text-white font-mono font-semibold">{roomId}</span>
            </p>
          )}
        </div>

        {/* Invite link */}
        {roomId && (
          <button type="button" onClick={copyInviteLink} className="btn-secondary gap-2">
            <Link2 className="w-4 h-4" />
            Copy Invite Link
          </button>
        )}

        {/* Room ID display */}
        {roomId && (
          <div className="surface px-6 py-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-ink-500 mb-1">Share this ID</p>
            <p className="font-mono text-2xl font-bold text-white tracking-wider">{roomId}</p>
          </div>
        )}

        <button type="button" onClick={hangup} className="btn-ghost text-rose-300 hover:text-rose-200">
          Cancel
        </button>
      </div>
    );
  }

  // CONNECTED STATE — active call with subtitles
  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-6rem)] animate-fade-up">
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top bar — minimal */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-300 font-medium">
            <span className="h-2 w-2 rounded-full bg-teal-300 animate-pulse-soft" />
            Live
          </span>
          {peerLanguage && (
            <span className="text-xs text-ink-400">
              Partner: <span className="text-ink-200">{peerLanguage}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyInviteLink} className="icon-btn w-8 h-8" aria-label="Copy invite link">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-ink-500 font-mono">{roomId}</span>
        </div>
      </div>

      {/* Subtitle chat area */}
      <div className="flex-1 overflow-hidden rounded-3xl bg-canvas-900/40 border border-white/[0.04]">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 sm:px-6 py-5 space-y-3 smooth-scroll scrollbar-thin">
          {subtitles.length === 0 && !partial ? (
            <div className="flex items-center justify-center h-full text-center">
              <p className="text-sm text-ink-500 max-w-xs">
                Start speaking — your words and translations will appear here as live subtitles.
              </p>
            </div>
          ) : (
            <>
              {subtitles.map((s) => (
                <SubtitleRow key={s.id} subtitle={s} onSpeak={(text, lang) => speak(text, { lang })} myLang={prefs.myLanguage} peerLang={peerLanguage ?? "en-US"} />
              ))}
              {partial && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-500/10 ring-1 ring-teal-400/15 px-4 py-2 text-sm text-teal-200/80 italic">
                    {partial}...
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-4 pt-5 pb-2">
        {/* Mute button */}
        <button
          type="button"
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
            muted
              ? "bg-white/[0.08] text-ink-300 ring-1 ring-white/[0.08]"
              : "bg-white/[0.04] text-white ring-1 ring-teal-400/20"
          }`}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Hangup */}
        <button
          type="button"
          onClick={hangup}
          className="w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-[0_16px_40px_-12px_rgba(244,63,94,0.5)] hover:bg-rose-400 active:scale-95 transition-all duration-200"
          aria-label="End call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>

        {/* Auto-speak toggle */}
        <button
          type="button"
          onClick={() => setPrefs((p) => ({ ...p, autoSpeak: !p.autoSpeak }))}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
            prefs.autoSpeak
              ? "bg-white/[0.04] text-teal-300 ring-1 ring-teal-400/20"
              : "bg-white/[0.08] text-ink-400 ring-1 ring-white/[0.08]"
          }`}
          aria-label={prefs.autoSpeak ? "Disable auto-speak" : "Enable auto-speak"}
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </div>

      {/* Status */}
      <p className="text-center text-[11px] text-ink-500 pb-1">
        {recording ? (
          <span className="text-teal-300">Listening...</span>
        ) : muted ? (
          "Muted"
        ) : (
          "Speak naturally"
        )}
      </p>

      {error && (
        <div className="text-sm text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-2xl px-4 py-2 mt-2">
          {error}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SUBTITLE ROW
   ═══════════════════════════════════════════════════════════════════ */

interface SubtitleRowProps {
  subtitle: Subtitle;
  onSpeak: (text: string, lang: string) => void;
  myLang: string;
  peerLang: string;
}

const SubtitleRow = memo(function SubtitleRow({ subtitle: s, onSpeak, myLang, peerLang }: SubtitleRowProps) {
  const isMine = s.from === "me";

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} animate-fade-up`} style={{ animationDuration: "180ms" }}>
      <div className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 space-y-1.5 ${
        isMine
          ? "rounded-br-md bg-teal-500/10 ring-1 ring-teal-400/15"
          : "rounded-bl-md bg-white/[0.03] ring-1 ring-white/[0.05]"
      }`}>
        {/* Original text */}
        <p className="text-[13px] text-ink-200 leading-relaxed">{s.original}</p>

        {/* Translation */}
        {(s.translation || !s.done) && (
          <div className={`border-t pt-1.5 ${isMine ? "border-teal-400/10" : "border-white/[0.04]"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className={`text-[13px] font-medium leading-relaxed ${
                s.translation ? (isMine ? "text-teal-200/80" : "text-violet-200/80") : "text-ink-500"
              } ${!s.done && s.translation ? "typing-caret" : ""}`}>
                {s.translation || (s.done ? "" : "...")}
              </p>
              {s.done && s.translation && (
                <button
                  type="button"
                  onClick={() => onSpeak(s.translation, isMine ? peerLang : myLang)}
                  className="icon-btn w-6 h-6 shrink-0"
                  aria-label="Play"
                >
                  <Volume2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) =>
  prev.subtitle.original === next.subtitle.original &&
  prev.subtitle.translation === next.subtitle.translation &&
  prev.subtitle.done === next.subtitle.done
);
