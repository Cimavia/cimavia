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
    primary: cmvColors.accent.DEFAULT,
    background: cmvColors.bg["0"],
    card: cmvColors.bg["1"],
    text: cmvColors.text.hi,
    border: cmvColors.border.DEFAULT,
    notification: cmvColors.accent.DEFAULT,
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" },
    medium: { fontFamily: "System", fontWeight: "500" },
    bold: { fontFamily: "System", fontWeight: "700" },
    heavy: { fontFamily: "System", fontWeight: "800" },
  },
};

// Couleurs de la barre d'onglets (mêmes tokens, API impérative de React Navigation).
export const tabBarTheme = {
  activeTintColor: cmvColors.accent.DEFAULT,
  inactiveTintColor: cmvColors.text.mid,
  backgroundColor: cmvColors.bg["1"],
  borderColor: cmvColors.border.DEFAULT,
};
