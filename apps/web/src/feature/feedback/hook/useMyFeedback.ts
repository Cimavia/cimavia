import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { coachFeedbackKeys, myFeedbackKeys, myPlanKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi } from "@/feature/feedback/api";

// `null` tant que la séance n'a pas été débriefée : l'absence est un état normal, pas une erreur.
export function useMyFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: myFeedbackKeys.detail(sessionId),
    queryFn: () => athleteFeedbackApi.get(sessionId),
  });
}

/**
 * Écrit le débrief. Débriefer change AUSSI le statut de la séance (`DONE`) : on invalide donc le
 * détail de la séance et le cycle, sinon le planning continuerait d'afficher « À faire » sur une
 * séance qu'on vient de débriefer.
 */
export function useUpsertMyFeedback(sessionId: string, onSaved?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSessionFeedbackInput) => athleteFeedbackApi.upsert(sessionId, input),
    onSuccess: (feedback) => {
      onSaved?.();
      queryClient.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: myPlanKeys.current() });
      // La liste COACH des débriefs vit dans le même cache dès qu'un compte cumule les deux
      // capacités (#14) : sans cette invalidation, l'auteur ne retrouve pas son propre débrief
      // côté coach avant l'expiration du `staleTime` (une minute). Sans effet pour un athlète
      // pur, dont le cache ne contient pas cette clé.
      queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });
    },
  });
}
