import {
  EMAILABLE_NOTIFICATION_TYPES,
  NOTIFICATION_SETTING_LABEL_KEY,
  toggledPreferences,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import {
  useNotificationPreferences,
  useToggleNotificationPreference,
} from "@/feature/notification/hook/useNotificationPreferences";

/**
 * Réglages des notifications par e-mail (#66) — une section de l'écran Compte.
 *
 * **Bascule immédiate, pas de bouton « Enregistrer ».** C'est la grammaire d'un réglage de
 * notification, et l'API la rend sûre : elle attend l'ENSEMBLE des types activés, donc chaque
 * clic envoie un état complet et idempotent, jamais un delta qui pourrait s'appliquer deux fois.
 * L'écart est assumé avec la section « casquettes » juste au-dessus, qui a un bouton : elle édite
 * un état cohérent à valider d'un bloc (« au moins une casquette »), ici chaque ligne est
 * indépendante.
 *
 * La grille rendue vient de l'API, mais l'ORDRE vient de `EMAILABLE_NOTIFICATION_TYPES` : un type
 * que cette version du client ne sait pas nommer n'a pas de libellé, et une ligne sans libellé est
 * pire qu'une ligne absente.
 */
export function NotificationEmailSection() {
  const { t } = useTranslation();
  const { data: grid, isPending, isError } = useNotificationPreferences();
  const toggle = useToggleNotificationPreference();

  // Toutes les lignes se ferment pendant l'écriture : chaque requête part de la grille en cache,
  // et deux écritures en vol pourraient revenir dans le désordre. Le verrou dure un aller-retour.
  const busy = toggle.isPending;

  return (
    <section className="flex max-w-xl flex-col gap-cmv-md">
      <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("notification.setting.title")}</h2>
      <p className="text-cmv-caption text-cmv-text-mid">{t("notification.setting.description")}</p>

      {isPending && <p className="text-cmv-caption text-cmv-text-mid">{t("common.loading")}</p>}
      {isError && <p className="text-cmv-caption text-cmv-error">{t("common.error")}</p>}

      {grid != null && (
        <div className="flex flex-col gap-cmv-sm">
          {EMAILABLE_NOTIFICATION_TYPES.map((type) => {
            const enabled = grid.find((row) => row.type === type)?.enabled === true;
            return (
              <label
                key={type}
                className="flex cursor-pointer items-center justify-between gap-cmv-md rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md focus-within:ring-2 focus-within:ring-cmv-accent"
              >
                <span className="text-cmv-body text-cmv-text-hi">
                  {t(NOTIFICATION_SETTING_LABEL_KEY[type])}
                </span>
                <input
                  type="checkbox"
                  className="size-5 accent-cmv-accent"
                  checked={enabled}
                  disabled={busy}
                  // L'ensemble est calculé ICI, depuis la grille affichée : c'est celle que
                  // l'utilisateur voit au moment du clic, et la seule qui ne soit pas déjà
                  // basculée par la mise à jour optimiste.
                  onChange={() => toggle.mutate({ type, enabled: toggledPreferences(grid, type) })}
                />
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
