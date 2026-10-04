/**
 * Ce que devient le champ de la barre d'envoi quand un texte est PARTI (#339).
 *
 * Le champ ne se vide qu'au succès : vidé au clic, un envoi en échec (502 du tunnel, réseau coupé)
 * emportait le texte avec lui, et un toast ne le rendait pas. Mais le champ reste éditable pendant
 * l'envoi, donc au retour du serveur il peut contenir autre chose que ce qui est parti :
 *
 * - **la suite** de ce qui est parti (on a continué d'écrire) → on retire ce qui est parti et on
 *   garde la suite, sans les blancs qui la séparaient ;
 * - **une réécriture** → on n'y touche pas. La frappe gagne, comme pour le débrief (#284) : mieux
 *   vaut laisser à l'auteur un texte qu'il relira qu'effacer une phrase qu'il vient de corriger.
 *
 * `sent` est le texte tel qu'envoyé, donc déjà débarrassé de ses blancs : la comparaison les
 * ignore aussi en tête du champ.
 */
export function draftAfterSend(draft: string, sent: string): string {
  const current = draft.trimStart();
  return current.startsWith(sent) ? current.slice(sent.length).trimStart() : draft;
}
