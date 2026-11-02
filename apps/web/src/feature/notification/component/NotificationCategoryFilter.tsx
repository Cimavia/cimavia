import type { NotificationCategoryType, NotificationFilterChoice } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvToggleChip } from "@/shared/component";

type NotificationCategoryFilterProps = {
  /** Les pastilles, « Toutes » comprise (`notificationFilterChoices`) ; vide = pas de rangée. */
  choices: NotificationFilterChoice[];
  /** `null` = « Toutes ». */
  category: NotificationCategoryType | null;
  onChange: (category: NotificationCategoryType | null) => void;
};

/**
 * Les filtres du centre (#694). Un seul choix à la fois — retoucher la pastille active ne fait
 * rien, « Toutes » est le chemin du retour.
 *
 * Retour à la ligne plutôt que défilement : le panneau est étroit, et une rangée qui défile sous
 * une liste qui défile aussi cacherait des catégories sans le dire.
 */
export function NotificationCategoryFilter({
  choices,
  category,
  onChange,
}: Readonly<NotificationCategoryFilterProps>) {
  const { t } = useTranslation();

  if (choices.length === 0) return null;

  return (
    <fieldset className="flex flex-wrap gap-cmv-xs border-cmv-border border-b px-cmv-md py-cmv-sm">
      <legend className="sr-only">{t("notification.category.legend")}</legend>
      {choices.map((choice) => (
        <CmvToggleChip
          key={choice.labelKey}
          pressed={choice.category === category}
          onToggle={() => onChange(choice.category)}
        >
          {t(choice.labelKey)}
        </CmvToggleChip>
      ))}
    </fieldset>
  );
}
