/**
 * Ce qu'une erreur de lecture native peut dire d'une URL signée sans la livrer (#701).
 *
 * Les messages d'ExoPlayer ou d'AVPlayer citent parfois l'URL entière : sa signature donne de quoi
 * lire le média sans être connecté, son chemin porte des identifiants. Seul l'HÔTE en sort — c'est
 * lui qui départage « le stockage ne répond pas » (NAS, tunnel) d'un défaut du lecteur.
 */
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/gi;

export type PlaybackErrorReport = {
  // `null` : l'URL jouée est illisible, on ne devine pas son hôte.
  host: string | null;
  message: string;
};

// `@cmv/shared` n'a pas `URL` dans ses types : l'hôte se lit à la main, entre le schéma et le premier
// séparateur. Sans schéma, ce n'est pas une URL.
function hostOf(url: string): string | null {
  return /^https?:\/\/([^/?#\s]+)/i.exec(url)?.[1] ?? null;
}

export function describePlaybackError(message: string, sourceUrl: string): PlaybackErrorReport {
  return {
    host: hostOf(sourceUrl),
    message: message.replace(URL_IN_TEXT, (found) => hostOf(found) ?? "[url]"),
  };
}
