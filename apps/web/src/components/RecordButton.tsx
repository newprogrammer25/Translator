import { Mic, Square } from "lucide-react";

interface Props {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: "md" | "lg";
}

/**
 * Premium recording FAB with animated halos.
 * Idle = teal gradient with glow; Recording = rose pulse.
 */
export function RecordButton({
  recording,
  onStart,
  onStop,
  disabled,
  size = "lg",
}: Props) {
  const dim = size === "lg" ? "w-20 h-20" : "w-14 h-14";
  const iconDim = size === "lg" ? "w-6 h-6" : "w-5 h-5";

  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      aria-label={recording ? "Stop recording" : "Start recording"}
      aria-pressed={recording}
      className={`fab ${dim} relative group`}
    >
      {/* Outer halo */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full transition-all duration-300 ease-premium ${
          recording
            ? "bg-rose-500/15 ring-2 ring-rose-400/40 scale-110 animate-pulse-soft"
            : "ring-1 ring-white/[0.06] group-hover:ring-teal-400/20 group-hover:scale-105"
        }`}
      />
      {/* Inner fill */}
      <span
        aria-hidden
        className={`absolute inset-2 rounded-full transition-all duration-300 ${
          recording
            ? "bg-rose-500 shadow-[0_20px_60px_-16px_rgba(244,63,94,0.6)]"
            : "bg-brand-grad shadow-glow-teal group-hover:shadow-[0_24px_70px_-20px_rgba(20,184,166,0.65)]"
        }`}
      />
      {/* Icon */}
      <span className={`relative inline-flex items-center justify-center ${recording ? "text-white" : "text-canvas-950"}`}>
        {recording ? <Square className={iconDim} /> : <Mic className={iconDim} />}
      </span>
    </button>
  );
}
