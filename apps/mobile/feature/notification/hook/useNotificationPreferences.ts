import type { EmailableNotificationType, NotificationEmailPreferenceDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationPreferenceApi, notificationPreferenceKeys } from "@/feature/notification/api";

/**
 * La grille des réglages d'e-mail : un état par type envoyable (#65).
 *
 * Clé de cache distincte de celle des notifications : régler un canal ne change rien à ce qui a
 * déjà été reçu, et les fondre ferait réinvalider la liste et le badge à chaque bascule.
 */
export function useNotificationPreferences() {
  return useQuery<NotificationEmailPreferenceDto[]>({
    queryKey: notificationPreferenceKeys.all,
    queryFn: () => notificationPreferenceApi.list(),
  });
}

/**
 * Ce qu'une bascule envoie : le type touché, et l'ENSEMBLE qui en résulte.
 *
 * Les deux, et pas seulement le type, parce que l'ensemble est calculé par l'appelant depuis la
 * grille qu'il AFFICHE. Le recalculer ici depuis le cache serait faux : `onMutate` l'a déjà
 * basculé, et le type cliqué repartirait en arrière — donc disparaîtrait de la requête, en
 * silence. Même contrat que le hook web, pour la même raison.
 */
export type NotificationPreferenceToggle = {
  type: EmailableNotificationType;
  enabled: EmailableNotificationType[];
};

/**
 * Bascule un type et l'enregistre aussitôt — pas de bouton « Enregistrer ».
 *
 * **Optimiste** : l'interrupteur suit le doigt, et REVIENT si l'écriture échoue. Sur mobile
 * l'aller-retour peut durer, et un interrupteur figé sous le doigt passe pour une panne ; un
 * interrupteur resté allumé sur une écriture perdue, lui, ferait attendre des e-mails qui ne
 * viendront jamais.
 */
export function useToggleNotificationPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ enabled }: NotificationPreferenceToggle) =>
      notificationPreferenceApi.replace({ enabled }),
    onMutate: ({ type }) => {
      const previous = queryClient.getQueryData<NotificationEmailPreferenceDto[]>(
        notificationPreferenceKeys.all,
      );
      queryClient.setQueryData<NotificationEmailPreferenceDto[]>(
        notificationPreferenceKeys.all,
        (grid) => grid?.map((row) => (row.type === type ? { ...row, enabled: !row.enabled } : row)),
      );
      return { previous };
    },
    onError: (_error, _toggle, context) => {
      queryClient.setQueryData(notificationPreferenceKeys.all, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationPreferenceKeys.all });
    },
  });
}
