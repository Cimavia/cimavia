import {
  DocumentType,
  myPlanKeys,
  type PlanDto,
  type ScheduledSessionDto,
  type ScheduledSessionSummaryDto,
} from "@cmv/shared";
import type { QueryClient } from "@tanstack/react-query";
import { usableSession } from "@/feature/plan/lib/usable-session";
import {
  cacheDocument,
  localDocumentUri,
  purgePlansExcept,
  storeGeneration,
} from "@/shared/lib/document-cache";

/**
 * Met l'appareil à jour de ce que l'athlète doit pouvoir lire sans réseau (#95) : le DÉROULÉ de
 * chaque séance des cycles visibles, et les documents qui l'accompagnent.
 *
 * POURQUOI le déroulé aussi. `PlanWeekDto.sessions` ne porte que des résumés — un titre, un
 * nombre d'exercices. La composition vit dans `ScheduledSessionDto`, chargée à l'ouverture de la
 * séance et à ce moment-là seulement : rien ne la préchargeait. La lecture hors-ligne ne tenait
 * donc que pour les séances DÉJÀ OUVERTES en ligne, ce que ni la maquette ni le cache persisté
 * n'annonçaient. Il fallait de toute façon la composition pour connaître les documents : la
 * combler ici ne coûte rien de plus.
 *
 * Une seule passe, réentrante et idempotente : elle saute ce qui est déjà sur l'appareil.
 */

/**
 * Documents à octets manquants pour cette séance — les liens externes n'en sont jamais.
 *
 * Le filtre sur le type est ce qui rend cette phrase vraie : `localDocumentUri` rend `null` pour
 * un lien, qui passait donc pour « manquant ». Une séance portant un lien était rechargée à chaque
 * passe, et depuis #307 la passe ne se serait jamais dite complète.
 */
function missingDocuments(planId: string, session: ScheduledSessionDto) {
  return session.exercises.flatMap((exercise) =>
    exercise.documents.filter(
      (document) =>
        document.type === DocumentType.FILE && localDocumentUri(planId, document) == null,
    ),
  );
}

/**
 * Réconcilie l'appareil avec les cycles visibles. À appeler EN LIGNE : hors réseau elle ne peut
 * rien descendre, et la purge n'a aucune urgence.
 *
 * Rend `true` quand la passe est COMPLÈTE : chaque séance chargée, chaque document sur l'appareil.
 * C'est la seule passe que l'appelant peut tenir pour acquise (#307) — une passe coupée dans le
 * métro qu'on aurait retenue ne serait jamais reprise.
 *
 * Séquentielle à dessein : quarante séances tirées de front sur un réseau de salle ne vont pas
 * plus vite, et chaque échec coûterait un fichier à demi écrit.
 */
export async function syncOfflineDocuments(
  queryClient: QueryClient,
  plans: readonly PlanDto[],
): Promise<boolean> {
  // La purge d'abord : elle rend l'espace des cycles qui ne sont plus visibles avant qu'on
  // demande de la place pour les nouveaux. Cycle terminé et relation rompue passent tous deux ici.
  purgePlansExcept(plans.map((plan) => plan.id));

  // L'époque du magasin AU DÉPART : tout ce qui suit n'a de sens que pour le compte qui l'a
  // ouverte. Une déconnexion la fait changer, et la passe s'arrête là où elle en est.
  const startedAt = storeGeneration();

  // Un échec n'arrête pas la passe : une passe partielle vaut mieux qu'une passe abandonnée. Il
  // la rend seulement incomplète, pour qu'elle soit reprise.
  let complete = true;
  for (const summary of scheduledSessionsOf(plans)) {
    if (storeGeneration() !== startedAt) return false;
    complete = (await cacheSessionDocuments(queryClient, summary, startedAt)) && complete;
  }
  return complete;
}

/**
 * Ce qui rend une passe NÉCESSAIRE : des cycles différents, un cycle ajusté, ou une séance
 * ajoutée, retirée ou retouchée depuis. Sans ce repère, l'identité du tableau — neuve à chaque
 * refetch, fût-il identique — relancerait une passe complète toutes les cinq minutes.
 *
 * Les séances y figurent une à une (#307) : retoucher une séance ne touche pas la ligne `Plan`,
 * et `PlanDto.updatedAt` seul laissait l'athlète sur le déroulé d'avant.
 */
export function offlineSignature(plans: readonly PlanDto[]): string {
  return plans
    .map((plan) =>
      [
        `${plan.id}:${plan.updatedAt}`,
        ...plan.weeks.flatMap((week) =>
          week.sessions.map((session) => `${session.id}:${session.updatedAt}`),
        ),
      ].join(","),
    )
    .join("|");
}

/** Les séances de tous les cycles visibles, à plat — chacune sait de quel cycle elle relève. */
function* scheduledSessionsOf(plans: readonly PlanDto[]): Generator<ScheduledSessionSummaryDto> {
  for (const plan of plans) {
    for (const week of plan.weeks) {
      yield* week.sessions;
    }
  }
}

async function cacheSessionDocuments(
  queryClient: QueryClient,
  summary: ScheduledSessionSummaryDto,
  startedAt: number,
): Promise<boolean> {
  const session = await loadSession(queryClient, summary);
  if (session == null) return false;

  let complete = true;
  for (const document of missingDocuments(summary.planId, session)) {
    if (storeGeneration() !== startedAt) return false;
    complete = (await cacheDocument(summary.planId, document)) && complete;
  }
  return complete;
}

/**
 * `null` quand la séance n'a pas pu être chargée : réseau tombé en cours de passe, API en panne.
 * On passe à la suivante, et la passe se dit incomplète.
 */
async function loadSession(
  queryClient: QueryClient,
  summary: ScheduledSessionSummaryDto,
): Promise<ScheduledSessionDto | null> {
  try {
    const cached = queryClient.getQueryData<ScheduledSessionDto>(myPlanKeys.session(summary.id));
    // Rien à descendre : le cache connaît la séance TELLE QUE le planning l'annonce, et tous ses
    // documents sont là. Inutile de rafraîchir des URLs signées dont personne n'a besoin. Sans la
    // comparaison des dates, une séance retouchée depuis restait servie du cache (#307).
    if (
      cached != null &&
      cached.updatedAt === summary.updatedAt &&
      missingDocuments(summary.planId, cached).length === 0
    ) {
      return cached;
    }

    return await usableSession(queryClient, summary.id, summary.updatedAt);
  } catch {
    return null;
  }
}
