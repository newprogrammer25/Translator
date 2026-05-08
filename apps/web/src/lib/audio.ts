/**
 * MediaRecorder helpers for capturing voice and converting to a Blob ready for
 * upload to the /api/transcribe endpoint.
 */

export interface RecorderHandle {
  stop(): Promise<Blob>;
  cancel(): void;
}

export async function startMicRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMimeType();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });
  recorder.start(250);

  let resolved = false;

  const stop = (): Promise<Blob> =>
    new Promise<Blob>((resolve) => {
      const finalize = () => {
        if (resolved) return;
        resolved = true;
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
        resolve(blob);
      };
      recorder.addEventListener("stop", finalize, { once: true });
      if (recorder.state !== "inactive") recorder.stop();
      else finalize();
    });

  const cancel = (): void => {
    resolved = true;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
  };

  return { stop, cancel };
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

/** Play an audio blob and return when playback finishes. */
export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("audio playback error"));
    };
    void audio.play();
  });
}
