import type {
  FeedbackTracking,
  ScheduledSessionDto,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "@cmv/shared";
import { coachFeedbackKeys, myFeedbackKeys, myPlanKeys, withSentTracking } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { ApiError } from "@/shared/lib/api";
import { keepFeedbackUrls } from "@/shared/lib/signed-url";

// `null` tant que la séance n'a pas été débriefée : l'absence est un état normal, pas une erreur.
export function useMyFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: myFeedbackKeys.detail(sessionId),
    queryFn: () => athleteFeedbackApi.get(sessionId),
    // Même raison que côté coach : un rechargement ne doit pas relancer les lecteurs.
    structuralSharing: keepFeedbackUrls,
  });
}

/**
 * Écrit le débrief. Débriefer change AUSSI le statut de la séance (`DONE`) : on invalide donc le
 * détail de la séance et le cycle, sinon le planning continuerait d'afficher « À faire » sur une
 * séance qu'on vient de débriefer.
 *
 * Un REFUS (400) relit la séance aussi, et c'est la seule panne qui le fait. Le serveur refuse un
 * suivi qui cite un exercice absent de la séance (#311) ; l'écran filtre bien ces coches avant
 * l'envoi, mais d'après la séance EN CACHE, tenue pour fraîche une minute. Si le coach vient d'en
 * retirer un exercice, le filtre ne le sait pas encore : relire la séance est ce qui laisse passer
 * l'envoi suivant, sans attendre ni changer d'onglet (#499, comme le mobile en #490). Le suivi
 * local, lui, n'est pas touché — `onSaved` n'est appelé qu'au succès.
 */
export function useUpsertMyFeedback(
  sessionId: string,
  onSaved?: (sent: FeedbackTracking | undefined) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSessionFeedbackInput) => athleteFeedbackApi.upsert(sessionId, input),
    onSuccess: (feedback, input) => {
      // Le cache de la séance d'abord : sitôt le local effacé, c'est lui que l'écran affiche, et il
      // porterait sinon le décompte d'avant l'envoi jusqu'à la fin de la relecture (#499).
      if (input.tracking != null) {
        const sent = input.tracking;
        queryClient.setQueryData<ScheduledSessionDto>(myPlanKeys.session(sessionId), (session) =>
          session == null ? session : withSentTracking(session, sent),
        );
      }
      // Ce qui est PARTI accompagne l'appel, pour qu'une coche posée pendant l'envoi ne soit pas
      // effacée avec lui (#499).
      onSaved?.(input.tracking);
      queryClient.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: myPlanKeys.visible() });
      // La liste COACH des débriefs vit dans le même cache dès qu'un compte cumule les deux
      // capacités (#14) : sans cette invalidation, l'auteur ne retrouve pas son propre débrief
      // côté coach avant l'expiration du `staleTime` (une minute). Sans effet pour un athlète
      // pur, dont le cache ne contient pas cette clé.
      queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      }
    },
  });
}
