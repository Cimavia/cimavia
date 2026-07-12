/**
 * Envoie un fichier directement à l'object storage via une URL PUT signée délivrée par l'API
 * (le binaire ne transite jamais par l'API — cf. architecture-choice §7 Médias).
 *
 * XMLHttpRequest et non fetch : seul XHR expose la progression d'upload (`upload.onprogress`),
 * nécessaire à la barre de progression. Pas de cookie envoyé (autre origine que l'API).
 */
export function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    // Doit correspondre au Content-Type signé par l'API, sinon la signature est rejetée.
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`Échec de l'envoi (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Échec de l'envoi (réseau)"));
    xhr.onabort = () => reject(new Error("Envoi annulé"));

    xhr.send(file);
  });
}
