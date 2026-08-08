import type {
  CreateReminderInput,
  ReminderDto,
  ReminderStatusType,
  ReminderSummaryDto,
} from "@cmv/shared";
import { notificationKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reminderApi, reminderKeys } from "@/feature/reminder/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

export function useReminders() {
  return useQuery<ReminderDto[]>({
    queryKey: reminderKeys.list(),
    queryFn: reminderApi.list,
  });
}

/**
 * Les compteurs seuls, pour une tuile de tableau de bord : deux entiers plutôt que les 200 lignes
 * de `useReminders`. Même racine de cache que la liste, donc toute mutation de rappel le périme
 * déjà (cf. `useReminderMutation`) — il n'y a pas d'invalidation de plus à écrire.
 */
export function useReminderSummary() {
  return useQuery<ReminderSummaryDto>({
    queryKey: reminderKeys.summary(),
    queryFn: reminderApi.summary,
  });
}

/**
 * Toute mutation de rappel invalide AUSSI le centre de notifications : un rappel dû y figure comme
 * entrée calculée (#51), et le badge le compte. Sans cette seconde invalidation, marquer un rappel
 * fait le retirait de la liste mais le laissait dans la cloche jusqu'au prochain polling.
 *
 * C'est un couplage assumé et explicite, dans un seul sens (les rappels connaissent le centre, pas
 * l'inverse) — les deux racines de cache sont distinctes précisément pour qu'on ait à l'écrire.
 */
function useReminderMutation<TInput>(mutationFn: (input: TInput) => Promise<ReminderDto>) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: toast.onError,
  });
}

export function useCreateReminder() {
  const toast = useMutationToast();
  const mutation = useReminderMutation((input: CreateReminderInput) => reminderApi.create(input));

  return {
    ...mutation,
    mutate: (input: CreateReminderInput, onDone?: () => void) =>
      mutation.mutate(input, {
        onSuccess: () => {
          toast.onSuccess("reminder.toast.created");
          onDone?.();
        },
      }),
  };
}

export function useUpdateReminderStatus() {
  const toast = useMutationToast();
  const mutation = useReminderMutation(
    ({ id, status }: { id: string; status: ReminderStatusType }) =>
      reminderApi.updateStatus(id, { status }),
  );

  return {
    ...mutation,
    mutate: (input: { id: string; status: ReminderStatusType }) =>
      mutation.mutate(input, {
        // Un seul toast par transition, la clé étant dérivée du statut visé : trois messages
        // distincts plutôt qu'un « rappel mis à jour » qui ne dirait pas ce qui a changé.
        onSuccess: (reminder) => toast.onSuccess(`reminder.toast.${reminder.status}`),
      }),
  };
}
