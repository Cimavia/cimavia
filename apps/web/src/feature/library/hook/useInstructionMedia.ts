import type { ExerciseDocumentDto, InstructionImageMimeType } from "@cmv/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Une image choisie dans la consigne mais pas encore envoyée. Elle porte un `mediaId` PROVISOIRE :
 * un document ne peut être rattaché qu'à un exercice qui existe déjà, or le coach pose ses images
 * avant d'avoir enregistré. L'id définitif est celui de l'`ExerciseDocument`, posé à
 * l'enregistrement (cf. `useSaveExercise`).
 */
export type PendingImage = {
  mediaId: string;
  file: File;
  mimeType: InstructionImageMimeType;
  objectUrl: string;
};

/** Préfixe reconnaissable : un id définitif est un cuid, il ne peut pas commencer par ça. */
const PENDING_PREFIX = "pending:";

export function isPendingMediaId(mediaId: string): boolean {
  return mediaId.startsWith(PENDING_PREFIX);
}

export type InstructionMedia = {
  /** Enregistre le fichier et rend le `mediaId` provisoire à poser dans le document. */
  register: (file: File, mimeType: InstructionImageMimeType) => string;
  /** URL affichable — blob local pour une image posée, URL signée pour une image enregistrée. */
  resolve: (mediaId: string) => string | null;
  /** Les images pas encore envoyées. */
  pending: readonly PendingImage[];
  /** Id définitif (celui de l'`ExerciseDocument`) de chaque image déjà envoyée, par `mediaId`. */
  sent: ReadonlyMap<string, string>;
  /**
   * Retient qu'une image est envoyée et rattachée. Elle ne quitte pas le magasin pour autant :
   * l'éditeur porte toujours son id provisoire, que seule cette table sait encore traduire si
   * l'enregistrement échoue après elle — et qu'un réessai ne doit pas renvoyer (#302).
   */
  markSent: (mediaId: string, documentId: string) => void;
  /** Progression d'envoi par `mediaId` (0–100), alimentée pendant l'enregistrement. */
  progress: Readonly<Record<string, number>>;
  setProgress: (mediaId: string, percent: number) => void;
};

/**
 * Le magasin des images de consigne, partagé par l'éditeur (qui les pose), l'aperçu (qui les
 * affiche) et l'enregistrement (qui les envoie).
 *
 * Les URLs d'objet sont révoquées au démontage : sans ça, chaque image posée fuit tant que
 * l'onglet vit, et le constructeur est un écran qu'on ouvre et ferme des dizaines de fois.
 */
export function useInstructionMedia(documents: readonly ExerciseDocumentDto[]): InstructionMedia {
  const [images, setImages] = useState<PendingImage[]>([]);
  const [sent, setSent] = useState<ReadonlyMap<string, string>>(new Map());
  const [progressByMedia, setProgressByMedia] = useState<Record<string, number>>({});

  // Une ref en plus de l'état : le nettoyage au démontage doit voir la DERNIÈRE liste, pas celle
  // capturée au premier rendu.
  const imagesRef = useRef<PendingImage[]>([]);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.objectUrl);
    };
  }, []);

  const pending = useMemo(() => images.filter((image) => !sent.has(image.mediaId)), [images, sent]);

  const savedUrlById = useMemo(() => {
    return new Map(documents.map((document) => [document.id, document.url]));
  }, [documents]);

  const register = useCallback((file: File, mimeType: InstructionImageMimeType) => {
    const mediaId = `${PENDING_PREFIX}${crypto.randomUUID()}`;
    setImages((current) => [
      ...current,
      { mediaId, file, mimeType, objectUrl: URL.createObjectURL(file) },
    ]);
    return mediaId;
  }, []);

  const resolve = useCallback(
    (mediaId: string) => {
      const waiting = imagesRef.current.find((image) => image.mediaId === mediaId);
      if (waiting != null) return waiting.objectUrl;
      return savedUrlById.get(mediaId) ?? null;
    },
    [savedUrlById],
  );

  const setProgress = useCallback((mediaId: string, percent: number) => {
    setProgressByMedia((current) => ({ ...current, [mediaId]: percent }));
  }, []);

  const markSent = useCallback((mediaId: string, documentId: string) => {
    setSent((current) => new Map(current).set(mediaId, documentId));
  }, []);

  return { register, resolve, pending, sent, markSent, progress: progressByMedia, setProgress };
}
