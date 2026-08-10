import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
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
