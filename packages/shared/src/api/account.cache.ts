import type { CoachAthleteDto } from "../dto/coach-athlete.schema";
import { type AccountApi, athleteKeys, coachKeys } from "./account.api";
import type { CacheClient } from "./cache-client";

/**
 * Rejoindre un coach depuis son invitation, et ce que ça fait au cache — les options du
 * `useMutation` des deux clients, telles quelles.
 *
 * L'invalidation est **globale**, comme au toucher d'une notification et pour la même raison en
 * plus fort : rejoindre un coach ne change pas une donnée, il change *tout ce que l'athlète peut
 * voir*. Sa planification, ses factures, sa messagerie n'existaient pas une seconde plus tôt, et
 * chaque réponse déjà en cache (« aucun coach », « aucune facture ») serait resservie jusqu'à
 * expiration — la carte de l'invitation acceptée comprise, qui resterait au-dessus du coach obtenu
 * (#146). Énumérer les clés coûterait plus cher que de tout refetcher après un geste qu'on ne fait
 * qu'une fois.
 *
 * Partagée parce qu'écrite deux fois, elle avait divergé : le mobile énumérait ses clés et oubliait
 * les contreparties, dont dépend sa BARRE D'ONGLETS — l'athlète qui venait de rejoindre n'avait pas
 * d'onglet Messages avant d'avoir mis l'app en arrière-plan (#308). Leur `staleTime: 0` n'y pouvait
 * rien : la barre reste montée sous l'écran « Rejoindre », rien ne la remonte, seule une
 * invalidation relance sa requête.
 *
 * `invalidateQueries()` SANS filtre — que `CacheClient` ne décrit pas, ses autres mutations visant
 * toutes une clé : le `QueryClient` de TanStack le satisfait tel quel.
 */
export function acceptInvitationMutation(
  cache: Pick<CacheClient, "setQueryData"> & { invalidateQueries(): unknown },
  api: Pick<AccountApi, "acceptInvitation">,
) {
  return {
    mutationFn: (invitationId: string) => api.acceptInvitation(invitationId),
    onSuccess: (relations: CoachAthleteDto[]) => {
      // Posé tout de suite : la liste montre les coachs obtenus sans attendre la relecture.
      cache.setQueryData(coachKeys.list(), (coaches: CoachAthleteDto[] | undefined) =>
        withJoinedCoaches(coaches, relations),
      );
      cache.invalidateQueries();
    },
  };
}

/**
 * La liste des coachs, ceux qu'on vient de rejoindre en tête — l'ordre de `GET /me/coaches`, le
 * plus récent lien d'abord (#599). Un coach qui y figurait déjà est remplacé : une ligne par coach.
 * Plusieurs d'un coup depuis #602 : accepter l'invitation d'une entreprise lie à chacun de ses
 * Coachs.
 *
 * `undefined` quand la liste n'a jamais été lue : on n'invente pas une liste aux seuls coachs
 * obtenus pour un athlète qui en a peut-être d'autres — la relecture qui suit dira la vraie.
 * TanStack laisse alors le cache intact.
 */
export function withJoinedCoaches(
  coaches: readonly CoachAthleteDto[] | undefined,
  relations: readonly CoachAthleteDto[],
): CoachAthleteDto[] | undefined {
  if (coaches == null) return undefined;
  const joined = new Set(relations.map((relation) => relation.coachId));
  return [...relations, ...coaches.filter((coach) => !joined.has(coach.coachId))];
}

/**
 * Mettre fin à un suivi (#909), d'un côté ou de l'autre, et ce que ça fait au cache — les options
 * du `useMutation` des deux clients, telles quelles.
 *
 * Le lien rompu est posé tout de suite dans la liste de qui rompt : la ligne quitte les suivis en
 * cours sans attendre la relecture. Puis l'invalidation est **globale**, pour la raison de
 * l'acceptation prise à l'envers : rompre change tout ce que le couple peut écrire — ses cycles,
 * ses séances, son fil direct passent en lecture (`followEndedAt`), ses contreparties peuvent
 * tomber. Chaque réponse en cache serait resservie ouverte, et le geste suivant prendrait un 409.
 */
export function endRelationMutation(
  cache: Pick<CacheClient, "setQueryData"> & { invalidateQueries(): unknown },
  api: Pick<AccountApi, "endWithAthlete" | "leaveCoach">,
  side: "coach" | "athlete",
) {
  return {
    // L'autre partie : l'athlète que le Coach détache, ou le Coach que l'athlète quitte.
    mutationFn: (counterpartId: string) =>
      side === "coach" ? api.endWithAthlete(counterpartId) : api.leaveCoach(counterpartId),
    onSuccess: (relation: CoachAthleteDto) => {
      const key = side === "coach" ? athleteKeys.list() : coachKeys.list();
      cache.setQueryData(key, (links: CoachAthleteDto[] | undefined) =>
        withEndedLink(links, relation),
      );
      cache.invalidateQueries();
    },
  };
}

/**
 * La liste, le lien rompu à la place de sa version d'avant — même ligne, même place : c'est le rendu
 * (`splitFollows`) qui le range parmi les suivis terminés. `undefined` quand la liste n'a jamais été
 * lue : la relecture qui suit dira la vraie.
 */
export function withEndedLink(
  links: readonly CoachAthleteDto[] | undefined,
  relation: CoachAthleteDto,
): CoachAthleteDto[] | undefined {
  if (links == null) return undefined;
  return links.map((link) => (link.id === relation.id ? relation : link));
}
