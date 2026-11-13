import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecorderMimeType } from "@/shared/util/media.util";

export type RecordedWebAudio = { blob: Blob; durationSeconds: number };

export type WebAudioRecorderOptions = {
  /**
   * Les mimes que le SCHÉMA de la feature accepte, pas ceux que le navigateur sait produire : la
   * messagerie accepte `audio/webm`, le débrief non.
   */
  allowedMimeTypes: readonly string[];
  /** Clés i18n LITTÉRALES, fournies par la feature — jamais assemblées ici. */
  errorKeys: { permission: string; unsupported: string };
  onRecorded: (audio: RecordedWebAudio) => void;
  onError: (reasonKey: string) => void;
  /**
   * Le plafond de durée du profil (secondes). Atteint, la capture s'arrête TOUTE SEULE et part
   * comme sur un clic « envoyer » : ce qui a été dit n'est pas perdu (#340).
   */
  maxDurationSeconds?: number;
  /** Appelé après l'arrêt au plafond, pour le dire à l'écran. */
  onLimitReached?: () => void;
};

/**
 * Enregistreur audio navigateur (MediaRecorder) : démarrer, arrêter (envoyer) ou annuler. Libère
 * toujours le micro (pistes du flux) en fin de vie, y compris au démontage.
 *
 * Promu de `feature/message/` : la messagerie et le débrief l'utilisent tous les deux (#26).
 *
 * `isAvailable` à `false` veut dire que ce navigateur ne sait produire AUCUN format que la feature
 * accepte — Firefox et le débrief, par exemple, qui refuse `audio/webm`. L'appelant doit alors ne
 * pas proposer d'enregistrer, plutôt que de laisser capturer trente secondes pour un 400 à la
 * signature de l'URL.
 */
export function useWebAudioRecorder({
  allowedMimeTypes,
  errorKeys,
  onRecorded,
  onError,
  maxDurationSeconds,
  onLimitReached,
}: WebAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  /**
   * Mémoïsé pour une raison de fond, pas de style : cette fonction est le nettoyage de l'effet de
   * démontage ci-dessous. Recréée à chaque render, elle rendrait cet effet dépendant du render —
   * React couperait le micro et remettrait `isRecording` à false au milieu d'un enregistrement.
   * Ses seules dépendances sont des refs et un setter, tous stables : la liste vide est exacte.
   */
  const cleanup = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // AVANT de couper les pistes : un flux terminé fait émettre `stop` à l'enregistreur, et sans
    // cette neutralisation `onstop` livrerait au démontage une capture que personne n'a envoyée
    // (#340). Un arrêt voulu passe par `stop()`, qui lit ses rappels avant d'arriver ici.
    const recorder = recorderRef.current;
    if (recorder != null) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      // Sans cet arrêt, un navigateur qui n'émet pas `stop` à la fin du flux laisserait
      // l'enregistreur actif, et ses morceaux avec lui.
      if (recorder.state !== "inactive") recorder.stop();
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  // Libère le micro si le composant est démonté en cours d'enregistrement.
  useEffect(() => cleanup, [cleanup]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // `null` a déjà éteint le bouton via `isAvailable` ; la garde reste pour ne jamais
      // laisser MediaRecorder choisir seul un format que le schéma refusera.
      const mimeType = pickRecorderMimeType(allowedMimeTypes);
      if (mimeType == null) {
        cleanup();
        onError(errorKeys.unsupported);
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      // Propres à CET enregistreur : un nouveau `start()` lancé avant l'événement `stop` de
      // l'ancien ne doit ni lui voler ses morceaux ni lui couper le micro.
      const chunks: Blob[] = [];
      const startedAt = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const measured = Math.round((Date.now() - startedAt) / 1000);
        // L'arrêt au plafond tombe à quelques millisecondes près : sans ce bornage, 300,6 s
        // arrondies à 301 feraient refuser à l'envoi la note qu'on vient de sauver.
        const durationSeconds =
          maxDurationSeconds == null ? measured : Math.min(measured, maxDurationSeconds);
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (recorderRef.current === recorder) {
          cleanup();
        } else {
          for (const track of stream.getTracks()) track.stop();
        }
        if (durationSeconds > 0) onRecorded({ blob, durationSeconds });
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setIsRecording(true);
      let limitHit = false;
      intervalRef.current = window.setInterval(() => {
        if (limitHit) return;
        // L'horloge, pas le nombre de ticks : un onglet ralenti en retarde, et la capture
        // dépasserait le plafond avant que le compte n'y arrive.
        const elapsedMs = Date.now() - startedAt;
        setSeconds(Math.floor(elapsedMs / 1000));
        if (maxDurationSeconds != null && elapsedMs >= maxDurationSeconds * 1000) {
          limitHit = true;
          stop(true);
          onLimitReached?.();
        }
      }, 1000);
    } catch {
      cleanup();
      onError(errorKeys.permission);
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

  return {
    isRecording,
    seconds,
    start,
    stop,
    isAvailable: pickRecorderMimeType(allowedMimeTypes) != null,
  };
}
