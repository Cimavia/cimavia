import { type AccountApi, endRelationMutation, type TrainingCapability } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// Nommées en entier, pas assemblées : `check:i18n` les retrouve telles quelles au catalogue.
const DONE_KEY = {
  coach: "follow.end.coach.done",
  athlete: "follow.end.athlete.done",
} as const satisfies Record<TrainingCapability, string>;

/**
 * Mettre fin à un suivi (#910), au titre `side` : le Coach détache un athlète, l'athlète quitte un
 * Coach. La mutation et ce qu'elle fait au cache viennent de `@cmv/shared` (`endRelationMutation`),
 * le mobile appellera la même ; ne restent ici que les toasts.
 *
 * Dans `shared/` : les DEUX bouts du lien rompent (#909), le Coach depuis la fiche de son athlète
 * (`feature/athlete`), l'athlète depuis « Mes coachs » (`feature/coach`) — aucune feature ne le
 * possède plus que l'autre. Chacune passe son client : le même, injecté par elle.
 */
export function useEndFollow(
  side: TrainingCapability,
  accountApi: Pick<AccountApi, "endWithAthlete" | "leaveCoach">,
) {
  const toast = useMutationToast();
  const shared = endRelationMutation(useQueryClient(), accountApi, side);
  return useMutation({
    ...shared,
    onSuccess: (relation) => {
      shared.onSuccess(relation);
      toast.onSuccess(DONE_KEY[side], {
        name: side === "coach" ? relation.athleteName : relation.coachName,
      });
    },
    onError: toast.onError,
  });
}
