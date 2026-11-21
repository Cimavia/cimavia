import type { SessionFeedbackDto } from "@cmv/shared";
import { feedbackSaveMutation, myFeedbackKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";
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
 * Écrit le débrief. Ce que l'écriture fait au cache — séance, cycle, liste coach, refus — est
 * commun aux deux clients : voir `feedbackSaveMutation`.
 *
 * La réussite se dit par un toast, comme tout enregistrement du web (#570) — le message posé
 * sous le bouton, en terracotta, se lisait comme une erreur. Posé ICI, sur la mutation, et non
 * dans le `mutate` de l'écran : un envoi qui aboutit après que l'athlète a quitté l'écran se
 * confirme quand même, et chaque envoi réussi en donne un, pas chaque rendu. L'échec, lui, reste
 * sous le bouton : il doit rester lisible jusqu'au nouvel essai, et un toast s'efface seul.
 */
export function useUpsertMyFeedback(
  sessionId: string,
  onSaved?: Parameters<typeof feedbackSaveMutation>[3],
) {
  const toast = useMutationToast();
  return useMutation(
    feedbackSaveMutation(useQueryClient(), athleteFeedbackApi, sessionId, (sent) => {
      onSaved?.(sent);
      toast.onSuccess("feedback.saved");
    }),
  );
}
