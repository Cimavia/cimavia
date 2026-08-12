import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coachFeedbackApi, coachFeedbackKeys } from "@/feature/feedback/api";

/**
 * Les débriefs reçus par le coach. Le tableau de bord n'en tire qu'un COMPTEUR — d'où l'absence de
 * sondage : sur mobile, le rafraîchissement vient du retour au premier plan (`focusManager`, p4-6)
 * et du tirer-pour-rafraîchir, pas d'un intervalle qui viderait la batterie.
 */
export function useCoachFeedbacks() {
  return useQuery<CoachFeedbackSummaryDto[]>({
    queryKey: coachFeedbackKeys.list(),
    queryFn: coachFeedbackApi.list,
  });
}

/**
 * Le débrief d'une séance, vu par le coach : texte ET médias, que le résumé de la liste ne porte
 * pas (il n'en donne que le compte).
 */
export function useCoachFeedbackDetail(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: coachFeedbackKeys.bySession(sessionId),
    queryFn: () => coachFeedbackApi.getBySession(sessionId),
  });
}

/**
 * Pose `coachReadAt`. Idempotent côté API — rouvrir ne redate pas la lecture.
 *
 * Invalide la racine entière : la liste des débriefs ET la tuile « Débriefs à relire » du tableau
 * de bord en dépendent, et elles doivent tomber ensemble.
 */
export function useMarkFeedbackRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedbackId: string) => coachFeedbackApi.markRead(feedbackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });
    },
  });
}
