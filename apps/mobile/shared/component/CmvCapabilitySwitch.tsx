import type { CapabilityName } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvText } from "@/shared/component/CmvText";
import { useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";

// i18n-values nav.section: coach, athlete
const OPTIONS: readonly CapabilityName[] = ["coach", "athlete"];

/**
 * À quel titre un compte à DOUBLE capacité lit l'écran courant — Factures, Messagerie (#129).
 *
 * Ne rend **rien** pour tout autre compte, et c'est le point : la question ne se pose que quand
 * les deux réponses existent. Un compte mono-capacité verrait sinon un sélecteur à une seule
 * option, qui ne dit rien et occupe une place.
 *
 * Ce pattern est propre au mobile. Sur le web, les deux titres sont deux entrées de navigation
 * distinctes, avec leur adresse (`?as=`) ; une barre d'onglets ne peut pas doubler ses entrées
 * sans en compter dix, d'où ce sélecteur local plutôt qu'une nav sectionnée.
 */
export function CmvCapabilitySwitch() {
  const { t } = useTranslation();
  const { visible, current, select } = useCapabilitySwitch();

  if (!visible) return null;

  return (
    <View className="flex-row gap-2 px-4 pb-2" accessibilityRole="tablist">
      {OPTIONS.map((capability) => {
        const active = current === capability;
        return (
          <Pressable
            key={capability}
            onPress={() => select(capability)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={
              active
                ? "rounded-full border border-cmv-accent bg-cmv-accent-soft px-3 py-1"
                : "rounded-full border border-cmv-border bg-cmv-surface px-3 py-1"
            }
          >
            <CmvText className={active ? "text-cmv-text-hi text-sm" : "text-cmv-text-mid text-sm"}>
              {t(`nav.section.${capability}`)}
            </CmvText>
          </Pressable>
        );
      })}
    </View>
  );
}
