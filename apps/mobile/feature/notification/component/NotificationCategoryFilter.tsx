import { NOTIFICATION_CATEGORY_LABEL_KEY, type NotificationCategoryType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { CmvToggleChip } from "@/shared/component";

type NotificationCategoryFilterProps = {
  /** Ce que le compte peut recevoir, dans l'ordre des pastilles (`notificationCategoriesFor`). */
  categories: NotificationCategoryType[];
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
  categories,
  category,
  onChange,
}: Readonly<NotificationCategoryFilterProps>) {
  const { t } = useTranslation();

  // Une seule catégorie n'a rien à filtrer : « Toutes » la montre déjà.
  if (categories.length < 2) return null;

  return (
    <View className="pt-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4"
      >
        <CmvToggleChip
          pressed={category == null}
          onToggle={() => onChange(null)}
          label={t("notification.category.all")}
        />
        {categories.map((value) => (
          <CmvToggleChip
            key={value}
            pressed={value === category}
            onToggle={() => onChange(value)}
            label={t(NOTIFICATION_CATEGORY_LABEL_KEY[value])}
          />
        ))}
      </ScrollView>
    </View>
  );
}
