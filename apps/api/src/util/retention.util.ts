/**
 * Combien de temps une trace TRAITÉE reste en base avant que le tick ne la purge (#107, #76) : un
 * rappel fait ou écarté, une notification lue. Six mois — de quoi rouvrir un rappel écarté par
 * erreur ou relire une notification de la saison, sans qu'aucune des deux tables grossisse à vie.
 *
 * Une seule durée pour les deux, parce qu'elles répondent à la même question : combien de temps
 * garder ce que son destinataire a déjà vu ou réglé. Ce qui n'est PAS traité — rappel à faire,
 * notification non lue — n'est jamais purgé, quelle que soit son ancienneté : elle est le signal.
 *
 * En jours de 24 h, et non en mois civils : la borne n'a pas à tomber à minuit, et un changement
 * d'heure qui la décale d'une heure ne change rien à ce qu'elle protège.
 */
export const HANDLED_RETENTION_DAYS = 180;

const DAY_MS = 86_400_000;

/** L'instant avant lequel une trace traitée est purgée — `now` vient de l'appelant. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - HANDLED_RETENTION_DAYS * DAY_MS);
}
