import {
  isSignedUrlUsable,
  myPlanKeys,
  type PlanDto,
  type ScheduledSessionDto,
  type ScheduledSessionSummaryDto,
} from "@cmv/shared";
import type { QueryClient } from "@tanstack/react-query";
import { athletePlanApi } from "@/feature/plan/api";
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

/** Documents à octets manquants pour cette séance — les liens externes n'en sont jamais. */
function missingDocuments(planId: string, session: ScheduledSessionDto) {
  return session.exercises.flatMap((exercise) =>
    exercise.documents.filter((document) => localDocumentUri(planId, document) == null),
  );
}

/**
 * La composition d'une séance, avec des URLs de documents RÉELLEMENT signables à l'instant.
 *
 * Le cache suffit tant qu'il n'y a rien à télécharger. Dès qu'il manque un document, l'URL doit
 * être fraîche : `staleTime` vaut exactement le TTL de signature (5 min), et le cache est persisté
 * une semaine — un démarrage à froid ressort donc des URLs mortes, qu'un téléchargement suivrait
 * jusqu'au 403.
 */
async function sessionWithUsableUrls(
  queryClient: QueryClient,
  sessionId: string,
): Promise<ScheduledSessionDto | null> {
  const queryKey = myPlanKeys.session(sessionId);
  const options = { queryKey, queryFn: () => athletePlanApi.session(sessionId) };

  const cached = await queryClient.ensureQueryData<ScheduledSessionDto>(options);
  const state = queryClient.getQueryState<ScheduledSessionDto>(queryKey);
  if (state != null && isSignedUrlUsable(state.dataUpdatedAt, Date.now())) return cached;

  return queryClient.fetchQuery<ScheduledSessionDto>({ ...options, staleTime: 0 });
}

/**
 * Réconcilie l'appareil avec les cycles visibles. À appeler EN LIGNE : hors réseau elle ne peut
 * rien descendre, et la purge n'a aucune urgence.
 *
 * Séquentielle à dessein : quarante séances tirées de front sur un réseau de salle ne vont pas
 * plus vite, et chaque échec coûterait un fichier à demi écrit.
 */
export async function syncOfflineDocuments(
  queryClient: QueryClient,
  plans: readonly PlanDto[],
): Promise<void> {
  // La purge d'abord : elle rend l'espace des cycles qui ne sont plus visibles avant qu'on
  // demande de la place pour les nouveaux. Cycle terminé et relation rompue passent tous deux ici.
  purgePlansExcept(plans.map((plan) => plan.id));

  // L'époque du magasin AU DÉPART : tout ce qui suit n'a de sens que pour le compte qui l'a
  // ouverte. Une déconnexion la fait changer, et la passe s'arrête là où elle en est.
  const startedAt = storeGeneration();

  for (const summary of scheduledSessionsOf(plans)) {
    if (storeGeneration() !== startedAt) return;
    await cacheSessionDocuments(queryClient, summary.planId, summary.id, startedAt);
  }
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
  planId: string,
  sessionId: string,
  startedAt: number,
): Promise<void> {
  const session = await loadSession(queryClient, planId, sessionId);
  if (session == null) return;

  for (const document of missingDocuments(planId, session)) {
    if (storeGeneration() !== startedAt) return;
    await cacheDocument(planId, document);
  }
}

/**
 * `null` quand la séance n'a pas pu être chargée : réseau tombé en cours de passe, API en panne.
 * On passe à la suivante — une passe partielle vaut mieux qu'une passe abandonnée, et la
 * prochaine ouverture reprendra ce qui manque.
 */
async function loadSession(
  queryClient: QueryClient,
  planId: string,
  sessionId: string,
): Promise<ScheduledSessionDto | null> {
  try {
    const cached = queryClient.getQueryData<ScheduledSessionDto>(myPlanKeys.session(sessionId));
    // Rien à descendre : le cache connaît déjà la séance et tous ses documents sont là. Inutile
    // de rafraîchir des URLs signées dont personne n'a besoin.
    if (cached != null && missingDocuments(planId, cached).length === 0) return cached;

    return await sessionWithUsableUrls(queryClient, sessionId);
  } catch {
    return null;
  }
}
