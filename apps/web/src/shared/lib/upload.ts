import type { MultipartPart, PartFailure } from "@cmv/shared";
import { uploadPercentOf } from "@cmv/shared";

/**
 * Envoi d'un binaire vers l'object storage, via la ou les URL(s) PUT signée(s) délivrées par
 * l'API — le binaire ne transite jamais par l'API (cf. architecture-choice §7 Médias).
 *
 * XMLHttpRequest et non fetch : seul XHR expose la progression d'upload (`upload.onprogress`),
 * nécessaire à la barre de progression. Pas de cookie envoyé (autre origine que l'API).
 *
 * Ce module ne connaît QU'UNE requête à la fois. L'ordre des parts, le réessai de celle qui tombe
 * et la clôture vivent dans `runMultipartUpload` (`@cmv/shared`), partagés avec le mobile.
 */

/**
 * Un échec qui porte ce que le storage a répondu, et pas seulement une phrase.
 *
 * Le statut était jusqu'ici perdu dans le texte du message — lisible par un humain, illisible par
 * la politique de réessai, qui doit distinguer un 503 passager d'un 403 de signature.
 */
export class StoragePutError extends Error {
  constructor(
    readonly failure: PartFailure,
    message: string,
  ) {
    super(message);
  }
}

/** Ce que le storage a répondu, ou `null` si l'échec ne vient pas de lui. */
export function webPartFailure(error: unknown): PartFailure | null {
  return error instanceof StoragePutError ? error.failure : null;
}

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
      reject(
        new StoragePutError(
          { kind: "status", status: xhr.status },
          `Échec de l'envoi (${xhr.status})`,
        ),
      );
    };
    xhr.onerror = () =>
      reject(new StoragePutError({ kind: "unreachable" }, "Échec de l'envoi (réseau)"));
    // Une annulation n'est PAS un accroc : c'est une décision, et la réessayer irait contre elle.
    // Elle sort donc sans `PartFailure`, ce qui la rend non réessayable par construction.
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
  return putSigned(uploadUrl, file, file.type, (sent) =>
    onProgress(uploadPercentOf(sent, file.size)),
  );
}

/**
 * UNE part d'un envoi découpé. La boucle qui l'appelle vit dans `@cmv/shared` ; ici, seul le
 * découpage du `File` et le PUT.
 *
 * Les parts ne portent PAS de Content-Type : `UploadPartCommand` ne le signe pas (le type de
 * l'objet est fixé à l'ouverture de l'upload), et `slice()` rend un Blob de type vide — le
 * navigateur n'en pose donc aucun.
 */
export function sendWebPart(
  file: File,
  part: MultipartPart,
  onSentBytes: (sentBytes: number) => void,
): Promise<void> {
  return putSigned(part.url, file.slice(part.start, part.start + part.length), null, onSentBytes);
}
