import type {
  EmailableNotificationType,
  NotificationEmailPreferenceDto,
} from "../dto/notification.schema";
import type { CacheClient } from "./cache-client";
import { type NotificationPreferenceApi, notificationPreferenceKeys } from "./notification.api";

/**
 * Ce qu'une bascule envoie : le type touché, et l'ENSEMBLE qui en résulte.
 *
 * Les deux, et pas seulement le type, parce que l'ensemble est calculé par l'appelant à partir de
 * la grille qu'il AFFICHE (`toggledPreferences`). Le premier jet le recalculait depuis le cache — et
 * le recalculait FAUX : `onMutate` bascule le cache avant que `mutationFn` s'exécute, si bien que le
 * type cliqué s'y trouvait déjà inversé et repartait en arrière. Il disparaissait donc de la
 * requête, en silence : l'interrupteur s'allumait à l'écran et rien n'était enregistré.
 */
export type NotificationPreferenceToggle = {
  type: EmailableNotificationType;
  enabled: EmailableNotificationType[];
};

/** La grille avec UN type basculé — la supposition optimiste, avant que le serveur réponde. */
export function withToggledPreference(
  grid: readonly NotificationEmailPreferenceDto[] | undefined,
  type: EmailableNotificationType,
): NotificationEmailPreferenceDto[] | undefined {
  return grid?.map((row) => (row.type === type ? { ...row, enabled: !row.enabled } : row));
}

/**
 * La bascule d'un réglage d'e-mail et ce qu'elle fait au cache, communes aux deux clients — les
 * options de leur `useMutation`, telles quelles. Écrites deux fois, elles ne différaient que par
 * le toast du web (#505).
 *
 * **Optimiste**, et ce n'est pas du confort : attendre l'aller-retour laisserait l'interrupteur
 * figé sous le doigt le temps de la requête. On pose donc l'état voulu tout de suite, et on le
 * REMET à sa place si l'écriture échoue — un interrupteur resté allumé sur une écriture perdue
 * ferait attendre des e-mails qui ne viendront jamais.
 *
 * `onSettled` relit dans les deux cas : après un succès, c'est la réponse du serveur qui gagne sur
 * la supposition.
 *
 * `onError` est ce que l'ÉCRAN dit de l'échec. Le web y branche son toast ; le mobile n'en a pas
 * (#137) et laisse l'interrupteur revenir sans un mot.
 */
export function preferenceToggleMutation(
  cache: CacheClient,
  api: Pick<NotificationPreferenceApi, "replace">,
  onError?: (error: unknown) => void,
) {
  return {
    mutationFn: ({ enabled }: NotificationPreferenceToggle) => api.replace({ enabled }),
    onMutate: ({ type }: NotificationPreferenceToggle) => {
      const previous = cache.getQueryData(notificationPreferenceKeys.all) as
        | NotificationEmailPreferenceDto[]
        | undefined;
      cache.setQueryData(
        notificationPreferenceKeys.all,
        (grid: NotificationEmailPreferenceDto[] | undefined) => withToggledPreference(grid, type),
      );
      return { previous };
    },
    onError: (
      error: unknown,
      _toggle: NotificationPreferenceToggle,
      context: { previous: NotificationEmailPreferenceDto[] | undefined } | undefined,
    ) => {
      cache.setQueryData(notificationPreferenceKeys.all, context?.previous);
      onError?.(error);
    },
    onSettled: () => {
      cache.invalidateQueries({ queryKey: notificationPreferenceKeys.all });
    },
  };
}
