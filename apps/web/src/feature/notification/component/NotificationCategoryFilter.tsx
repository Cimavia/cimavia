import { NOTIFICATION_CATEGORY_LABEL_KEY, type NotificationCategoryType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvToggleChip } from "@/shared/component";

type NotificationCategoryFilterProps = {
  /** Ce que le compte peut recevoir, dans l'ordre des pastilles (`notificationCategoriesFor`). */
  categories: NotificationCategoryType[];
  /** `null` = « Toutes ». */
  category: NotificationCategoryType | null;
  onChange: (category: NotificationCategoryType | null) => void;
};

/**
 * Les filtres du centre (#694) : « Toutes », puis une pastille par catégorie. Un seul choix à la
 * fois — retoucher la pastille active ne fait rien, « Toutes » est le chemin du retour.
 *
 * Retour à la ligne plutôt que défilement : le panneau est étroit, et une rangée qui défile sous
 * une liste qui défile aussi cacherait des catégories sans le dire.
 */
export function NotificationCategoryFilter({
  categories,
  category,
  onChange,
}: Readonly<NotificationCategoryFilterProps>) {
  const { t } = useTranslation();

  // Une seule catégorie n'a rien à filtrer : « Toutes » la montre déjà. Un compte Entreprise n'en a
  // aucune.
  if (categories.length < 2) return null;

  return (
    <fieldset className="flex flex-wrap gap-cmv-xs border-cmv-border border-b px-cmv-md py-cmv-sm">
      <legend className="sr-only">{t("notification.category.legend")}</legend>
      <CmvToggleChip pressed={category == null} onToggle={() => onChange(null)}>
        {t("notification.category.all")}
      </CmvToggleChip>
      {categories.map((value) => (
        <CmvToggleChip key={value} pressed={value === category} onToggle={() => onChange(value)}>
          {t(NOTIFICATION_CATEGORY_LABEL_KEY[value])}
        </CmvToggleChip>
      ))}
    </fieldset>
  );
}
