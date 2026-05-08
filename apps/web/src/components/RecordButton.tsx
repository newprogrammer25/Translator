import { Mic, MicOff } from "lucide-react";

interface Props {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: "md" | "lg";
}

export function RecordButton({ recording, onStart, onStop, disabled, size = "lg" }: Props) {
  const dim = size === "lg" ? "w-20 h-20" : "w-14 h-14";
  const iconDim = size === "lg" ? "w-8 h-8" : "w-6 h-6";
  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      aria-label={recording ? "Stop recording" : "Start recording"}
      aria-pressed={recording}
      className={`${dim} rounded-full flex items-center justify-center transition shadow-xl
        ${
          recording
            ? "bg-red-500 text-white shadow-red-500/40 animate-pulse-soft"
            : "bg-brand-500 text-ink-950 hover:bg-brand-400 shadow-brand-500/40"
        }
        disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
    >
      {recording ? <MicOff className={iconDim} /> : <Mic className={iconDim} />}
    </button>
  );
}
