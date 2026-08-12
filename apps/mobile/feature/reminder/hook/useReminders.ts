import type {
  CreateReminderInput,
  ReminderDto,
  ReminderStatusType,
  ReminderSummaryDto,
  UpdateReminderInput,
} from "@cmv/shared";
import { notificationKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reminderApi, reminderKeys } from "@/feature/reminder/api";

export function useReminders() {
  return useQuery<ReminderDto[]>({
    queryKey: reminderKeys.list(),
    queryFn: reminderApi.list,
  });
}

/**
 * Les deux compteurs seuls, pour la tuile du tableau de bord : deux entiers plutôt que les 200
 * lignes de `useReminders`. Même racine de cache que la liste, donc toute mutation le périme déjà.
 */
export function useReminderSummary() {
  return useQuery<ReminderSummaryDto>({
    queryKey: reminderKeys.summary(),
    queryFn: reminderApi.summary,
  });
}

/**
 * Toute mutation de rappel invalide AUSSI le centre de notifications : un rappel dû y figure comme
 * entrée calculée (#51), et le badge de l'onglet Notifs le compte. Sans cette seconde invalidation,
 * marquer un rappel fait le retirerait de la liste mais le laisserait dans la pastille.
 *
 * Couplage assumé et explicite, dans un seul sens (les rappels connaissent le centre, pas
 * l'inverse) — les deux racines sont distinctes précisément pour qu'on ait à l'écrire. Même
 * dispositif que côté web.
 */
function useReminderMutation<TInput>(mutationFn: (input: TInput) => Promise<ReminderDto>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useCreateReminder() {
  return useReminderMutation((input: CreateReminderInput) => reminderApi.create(input));
}

// Fait / abandonné / rouvert : un toggle réversible dans les deux sens, idempotent côté API.
export function useUpdateReminderStatus() {
  return useReminderMutation(({ id, status }: { id: string; status: ReminderStatusType }) =>
    reminderApi.updateStatus(id, { status }),
  );
}

// Report d'échéance (#105). `readAt` n'est pas transmis : c'est l'API qui l'efface quand
// l'échéance bouge, sans quoi « repousser » pourrait éteindre son propre badge.
export function useUpdateReminder() {
  return useReminderMutation(({ id, input }: { id: string; input: UpdateReminderInput }) =>
    reminderApi.update(id, input),
  );
}
