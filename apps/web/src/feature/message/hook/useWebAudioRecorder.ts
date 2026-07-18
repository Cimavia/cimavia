import { useEffect, useRef, useState } from "react";

export type RecordedWebAudio = { blob: Blob; durationSeconds: number };

// Types que MediaRecorder produit selon le navigateur, restreints à ce que le schéma accepte
// (webm sur Chrome/Firefox, mp4 sur Safari). Le premier supporté gagne.
const PREFERRED_MIME_TYPES = ["audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  return PREFERRED_MIME_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/**
 * Enregistreur audio navigateur (MediaRecorder) : démarrer, arrêter (envoyer) ou annuler. Libère
 * toujours le micro (pistes du flux) en fin de vie, y compris au démontage.
 */
export function useWebAudioRecorder(
  onRecorded: (audio: RecordedWebAudio) => void,
  onError: (reasonKey: string) => void,
) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  const cleanup = () => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  };

  // Libère le micro si le composant est démonté en cours d'enregistrement.
  useEffect(() => cleanup, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType != null ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        cleanup();
        if (durationSeconds > 0) onRecorded({ blob, durationSeconds });
      };

      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setIsRecording(true);
      intervalRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      cleanup();
      onError("messages.audio.permission");
    }
  };

  // Arrête l'enregistrement. `keep=false` jette la capture (onstop neutralisé).
  const stop = (keep: boolean) => {
    const recorder = recorderRef.current;
    if (recorder == null) return;
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!keep) {
      recorder.onstop = () => cleanup();
    }
    recorder.stop();
    setIsRecording(false);
  };

  return { isRecording, seconds, start, stop };
}
