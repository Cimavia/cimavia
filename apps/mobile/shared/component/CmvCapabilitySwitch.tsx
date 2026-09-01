import type { CapabilityName } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useUnreadByCapability } from "@/feature/notification";
import { CmvText } from "@/shared/component/CmvText";
import { useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";

// Mêmes icônes que le basculeur web (`react-icons/io5` y sert la même famille Ionicons) : c'est
// le même geste sur les deux plateformes, il doit se reconnaître.
// i18n-values nav.space: coach, athlete
const OPTIONS = [
  { capability: "coach", icon: "person-outline" },
  { capability: "athlete", icon: "barbell-outline" },
] as const satisfies readonly {
  capability: CapabilityName;
  icon: keyof typeof Ionicons.glyphMap;
}[];

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
  const { data: unread } = useUnreadByCapability();

  if (!visible) return null;

  return (
    <View className="flex-row gap-1 rounded-full bg-cmv-surface p-1" accessibilityRole="tablist">
      {OPTIONS.map(({ capability, icon }) => {
        const active = current === capability;
        return (
          <Pressable
            key={capability}
            onPress={() => select(capability)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={
              active
                ? "flex-row items-center gap-1 rounded-full bg-cmv-accent px-3 py-1"
                : "flex-row items-center gap-1 rounded-full px-3 py-1"
            }
          >
            <Ionicons
              name={icon}
              size={14}
              // Couleur native : le composant vient d'une lib tierce et ignore les className.
              color={active ? cmvColors.text.hi : cmvColors.text.mid}
            />
            <CmvText className={active ? "text-cmv-text-hi text-sm" : "text-cmv-text-mid text-sm"}>
              {t(`nav.space.${capability}`)}
            </CmvText>
            {/* Pastille sur l'espace INACTIF seulement : sur celui qu'on regarde, le badge
                d'onglet dit déjà ce qui arrive (#176). */}
            {!active && (unread?.[capability] ?? 0) > 0 && (
              <View
                className="h-2 w-2 rounded-full bg-cmv-accent"
                accessibilityLabel={t("nav.spaceUnread", { count: unread?.[capability] ?? 0 })}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
