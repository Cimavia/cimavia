import type { NotificationCategoryType, NotificationFilterChoice } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { CmvToggleChip } from "@/shared/component";

type NotificationCategoryFilterProps = {
  /** Les pastilles, « Toutes » comprise (`notificationFilterChoices`) ; vide = pas de ruban. */
  choices: NotificationFilterChoice[];
  /** `null` = « Toutes ». */
  category: NotificationCategoryType | null;
  onChange: (category: NotificationCategoryType | null) => void;
};

/**
 * Les filtres du centre (#694), en ruban qui défile comme celui des factures : sept pastilles ne
 * tiennent pas en largeur sur un téléphone. Un seul choix à la fois — « Toutes » est le chemin du
 * retour.
 */
export function NotificationCategoryFilter({
  choices,
  category,
  onChange,
}: Readonly<NotificationCategoryFilterProps>) {
  const { t } = useTranslation();

  if (choices.length === 0) return null;

  return (
    <View className="pt-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        contentContainerClassName="gap-2 px-4"
      >
        {choices.map((choice) => (
          <CmvToggleChip
            key={choice.labelKey}
            pressed={choice.category === category}
            onToggle={() => onChange(choice.category)}
            label={t(choice.labelKey)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
