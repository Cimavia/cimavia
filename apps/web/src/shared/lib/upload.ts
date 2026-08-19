/**
 * Envoi d'un binaire vers l'object storage, via la ou les URL(s) PUT signée(s) délivrées par
 * l'API — le binaire ne transite jamais par l'API (cf. architecture-choice §7 Médias).
 *
 * XMLHttpRequest et non fetch : seul XHR expose la progression d'upload (`upload.onprogress`),
 * nécessaire à la barre de progression. Pas de cookie envoyé (autre origine que l'API).
 */

/**
 * Un PUT signé. La progression est rapportée en OCTETS et non en pourcentage : un envoi découpé
 * doit agréger l'avancement de N parts sur le total du fichier, ce qu'un pourcentage par part ne
 * permet pas de reconstituer.
 */
function putSigned(
  url: string,
  body: Blob,
  contentType: string | null,
  onSentBytes: (sentBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType != null) {
      xhr.setRequestHeader("Content-Type", contentType);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onSentBytes(event.loaded);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // `onprogress` peut s'arrêter avant le dernier octet : on cale sur la taille réelle,
        // sinon une barre resterait bloquée à 98 % sur un envoi pourtant terminé.
        onSentBytes(body.size);
        resolve();
        return;
      }
      reject(new Error(`Échec de l'envoi (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Échec de l'envoi (réseau)"));
    xhr.onabort = () => reject(new Error("Envoi annulé"));

    xhr.send(body);
  });
}

/** Envoi en UNE requête — le cas courant, sous le seuil de découpage. */
export function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // Doit correspondre au Content-Type signé par l'API, sinon la signature est rejetée.
  return putSigned(uploadUrl, file, file.type, (sent) => onProgress(percentOf(sent, file.size)));
}

/**
 * Envoi DÉCOUPÉ : une requête par part, séquentiellement.
 *
 * Séquentiel et non parallèle : la progression reste monotone et lisible, et l'on ne sature pas
 * le lien montant d'un athlète souvent en 4G. Le gain d'un envoi parallèle viendrait au prix d'une
 * barre qui avance par à-coups — à reconsidérer si la lenteur devient le reproche.
 *
 * Les parts ne portent PAS de Content-Type : `UploadPartCommand` ne le signe pas (le type de
 * l'objet est fixé à l'ouverture de l'upload), et `slice()` sans argument rend un Blob de type
 * vide — le navigateur n'en pose donc aucun.
 */
export async function uploadInParts(
  file: File,
  partUrls: readonly string[],
  partSize: number,
  onProgress: (percent: number) => void,
): Promise<void> {
  let sentBytes = 0;

  for (const [index, url] of partUrls.entries()) {
    const start = index * partSize;
    const part = file.slice(start, Math.min(start + partSize, file.size));
    // Figé avant l'envoi : `sentBytes` bouge à chaque part, la fermeture doit voir le cumul des
    // parts DÉJÀ terminées, pas sa valeur au moment où la progression est rapportée.
    const sentBefore = sentBytes;

    await putSigned(url, part, null, (sent) => onProgress(percentOf(sentBefore + sent, file.size)));
    sentBytes += part.size;
  }
}

function percentOf(sentBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 100;
  return Math.min(100, Math.round((sentBytes / totalBytes) * 100));
}
