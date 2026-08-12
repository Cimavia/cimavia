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
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { formatDateTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values reminder.toast: ReminderStatus, created, snoozed

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

/**
 * Report d'échéance et correction de note (#105). Le toast nomme la NOUVELLE échéance plutôt que de
 * dire « rappel mis à jour » : le geste se fait en un clic depuis un raccourci, sans que le coach
 * ait vu la date qu'il vient de choisir — la lui montrer est le seul moyen de la vérifier.
 *
 * `readAt` n'est pas transmis : c'est l'API qui l'efface quand l'échéance bouge. Le laisser au
 * client permettrait à « repousser » d'éteindre son propre badge.
 */
export function useUpdateReminder() {
  const toast = useMutationToast();
  const mutation = useReminderMutation(
    ({ id, input }: { id: string; input: UpdateReminderInput }) => reminderApi.update(id, input),
  );

  return {
    ...mutation,
    mutate: (input: { id: string; input: UpdateReminderInput }) =>
      mutation.mutate(input, {
        onSuccess: (reminder) =>
          toast.onSuccess("reminder.toast.snoozed", { date: formatDateTime(reminder.dueAt) }),
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
