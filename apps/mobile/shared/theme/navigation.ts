import { cmvColors } from "@cmv/tokens";
import type { Theme } from "@react-navigation/native";

/**
 * Thème de React Navigation. Les écrans, eux, utilisent les classes NativeWind (`bg-cmv-*`) —
 * mais la navigation native (fond de l'écran sous les vues, barre d'onglets) ne lit pas de
 * className : elle exige des valeurs. Sans ce thème, le fond par défaut est BLANC et transparaît
 * partout autour du contenu.
 * Les valeurs viennent de @cmv/tokens (même source que Tailwind) : zéro hex ici (règle dure n°3).
 */
export const navigationTheme: Theme = {
  dark: true,
  colors: {
    // `primary` teinte du TEXTE (retour d'en-tête sur iOS) : la nuance `on`, comme tout texte d'état
    // (#218). `notification` est l'aplat de la pastille, qui porte un chiffre : `fill`, sous un texte
    // blanc.
    primary: cmvColors.accent.on,
    background: cmvColors.bg["0"],
    card: cmvColors.bg["1"],
    text: cmvColors.text.hi,
    border: cmvColors.border.DEFAULT,
    notification: cmvColors.accent.fill,
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" },
    medium: { fontFamily: "System", fontWeight: "500" },
    bold: { fontFamily: "System", fontWeight: "700" },
    heavy: { fontFamily: "System", fontWeight: "800" },
  },
};

// Couleurs de la barre d'onglets (mêmes tokens, API impérative de React Navigation). L'onglet actif
// colore son LIBELLÉ : la nuance `on`, le DEFAULT tombant sous AA sur `bg-1` (#218).
export const tabBarTheme = {
  activeTintColor: cmvColors.accent.on,
  inactiveTintColor: cmvColors.text.mid,
  backgroundColor: cmvColors.bg["1"],
  borderColor: cmvColors.border.DEFAULT,
  // La pastille porte un chiffre : l'aplat `fill` sous un texte blanc, comme tout texte posé sur un
  // aplat d'état (4.58:1, #218). Les deux sont posés par `tabBarBadgeStyle`, sans attendre
  // `notification` : faute du thème, la pastille tombait sur le rouge par défaut de React
  // Navigation, où le blanc ne tient que 3.55:1.
  badgeBackgroundColor: cmvColors.accent.fill,
  badgeTextColor: cmvColors.text["on-fill"],
};
