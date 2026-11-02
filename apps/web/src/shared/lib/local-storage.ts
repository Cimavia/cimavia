/**
 * Le `localStorage` du navigateur, qui ne lève jamais (#695).
 *
 * Il peut manquer — navigation privée, politique du navigateur, quota plein — ou rendre un JSON
 * abîmé. Ce qu'on y garde n'est jamais que du confort : chaque appelant sait repartir sans, et le
 * dit là où il appelle. Une seule copie de ces trois accès, pour qu'un cas de panne découvert demain
 * se corrige pour tous. `purgeLegacyTracking` garde le sien : il parcourt les clés, ce n'est aucun
 * des trois.
 */

/** `null` = rien d'utilisable : absent, illisible ou corrompu. Le contenu reste à valider. */
export function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Écriture refusée : la page ouverte garde son état, seul un rechargement le perdra. */
export function writeStoredJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Voir l'en-tête : rien à réparer ici, l'appelant a déjà l'état en mémoire.
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Voir l'en-tête : la clé restera, et l'appelant ne la relira que pour la valider.
  }
}
