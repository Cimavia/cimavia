import { useEffect, useRef, useState } from "react";
import {
  localVideoThumbnailUri,
  type ResolveVideoUrl,
  videoThumbnail,
} from "@/shared/lib/video-thumbnail";

/**
 * La vignette d'une vidéo pour un rendu : l'URI d'un fichier local, ou `null` tant qu'elle n'existe
 * pas — en cours de tirage, ou ratée. `null` ne veut donc jamais dire « pas de vidéo » : l'appelant
 * garde sa pastille.
 *
 * Le disque est lu AU PREMIER RENDU : une vignette déjà tirée s'affiche d'emblée, sans passer par
 * la pastille puis clignoter.
 */
export function useVideoThumbnail(
  mediaId: string,
  resolveUrl: ResolveVideoUrl,
  durationSeconds: number | null,
): string | null {
  const [uri, setUri] = useState(() => localVideoThumbnailUri(mediaId));
  // Le résolveur change à chaque rendu (flèche de l'écran) : lu par ref, il ne relance rien.
  const resolveUrlRef = useRef(resolveUrl);
  resolveUrlRef.current = resolveUrl;

  useEffect(() => {
    const local = localVideoThumbnailUri(mediaId);
    setUri(local);
    if (local != null) return;

    // Démonté (ou un autre média) : la réponse n'est plus pour ce rendu, et la file le sait — une
    // vignette que plus personne n'attend n'est pas tirée (#809).
    const left = new AbortController();
    void videoThumbnail(mediaId, () => resolveUrlRef.current(), durationSeconds, left.signal).then(
      (result) => {
        if (!left.signal.aborted) setUri(result);
      },
    );
    return () => left.abort();
  }, [mediaId, durationSeconds]);

  return uri;
}
