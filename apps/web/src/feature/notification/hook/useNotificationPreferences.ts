import type { EmailableNotificationType, NotificationEmailPreferenceDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationPreferenceApi, notificationPreferenceKeys } from "@/feature/notification/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

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
 * Les deux, et pas seulement le type, parce que l'ensemble est calculé par l'appelant à partir de
 * la grille qu'il AFFICHE. Le premier jet le recalculait ici depuis le cache — et le recalculait
 * FAUX : `onMutate` bascule le cache avant que `mutationFn` s'exécute, si bien que le type cliqué
 * s'y trouvait déjà inversé et repartait en arrière. Il disparaissait donc de la requête, en
 * silence : l'interrupteur s'allumait à l'écran et rien n'était enregistré.
 */
export type NotificationPreferenceToggle = {
  type: EmailableNotificationType;
  enabled: EmailableNotificationType[];
};

/**
 * Bascule un type, et l'enregistre immédiatement — pas de bouton « Enregistrer ».
 *
 * **Optimiste**, et ce n'est pas du confort : l'API répond l'ensemble faisant autorité, mais
 * attendre l'aller-retour laisserait l'interrupteur figé sous le doigt le temps de la requête. On
 * pose donc l'état voulu tout de suite, et on le REMET à sa place si l'écriture échoue — un
 * interrupteur qui revient en arrière avec un message dit la vérité, un interrupteur qui reste
 * allumé sur une écriture perdue ment.
 *
 * `onSettled` réinvalide dans les deux cas : après un succès, c'est la réponse du serveur qui
 * gagne sur notre supposition.
 */
export function useToggleNotificationPreference() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

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
    onError: (error, _toggle, context) => {
      queryClient.setQueryData(notificationPreferenceKeys.all, context?.previous);
      toast.onError(error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationPreferenceKeys.all });
    },
  });
}
