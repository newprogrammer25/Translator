import { Mic, Square } from "lucide-react";

interface Props {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: "md" | "lg";
}

/**
 * Premium record FAB. Idle state = brand gradient with halo glow; recording
 * state = warm rose with double soft-pulse halo. Sized for thumb taps on
 * mobile.
 */
export function RecordButton({
  recording,
  onStart,
  onStop,
  disabled,
  size = "lg",
}: Props) {
  const dim = size === "lg" ? "w-[88px] h-[88px]" : "w-14 h-14";
  const iconDim = size === "lg" ? "w-7 h-7" : "w-6 h-6";

  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      aria-label={recording ? "Stop recording" : "Start recording"}
      aria-pressed={recording}
      className={`fab ${dim} relative`}
    >
      {/* Halo rings (recording = animated; idle = subtle teal glow). */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full transition duration-300 ease-premium ${
          recording
            ? "bg-rose-500/20 ring-2 ring-rose-400/50 animate-ping"
            : "bg-teal-500/0 ring-1 ring-white/[0.06]"
        }`}
      />
      <span
        aria-hidden
        className={`absolute inset-1.5 rounded-full transition duration-300 ${
          recording
            ? "bg-rose-500 shadow-[0_22px_60px_-18px_rgba(244,63,94,0.7)]"
            : "bg-brand-grad shadow-glow-teal"
        }`}
      />
      <span
        className={`relative inline-flex items-center justify-center text-canvas-950 ${
          recording ? "text-white" : ""
        }`}
      >
        {recording ? <Square className={iconDim} /> : <Mic className={iconDim} />}
      </span>
    </button>
  );
}
