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
    // (#218). `notification` est un aplat (pastille), il garde le DEFAULT.
    primary: cmvColors.accent.on,
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

// Couleurs de la barre d'onglets (mêmes tokens, API impérative de React Navigation). L'onglet actif
// colore son LIBELLÉ : la nuance `on`, le DEFAULT tombant sous AA sur `bg-1` (#218).
export const tabBarTheme = {
  activeTintColor: cmvColors.accent.on,
  inactiveTintColor: cmvColors.text.mid,
  backgroundColor: cmvColors.bg["1"],
  borderColor: cmvColors.border.DEFAULT,
  // Le badge choisit seul son texte, blanc sur un fond qu'il juge sombre : sous AA sur `accent`
  // (4.18:1) comme sur le rouge par défaut de React Navigation (3.55:1). Texte sombre, comme tout
  // texte posé sur un aplat d'état (#218) : ≥ 4.6:1 sur l'un comme sur l'autre.
  badgeTextColor: cmvColors.bg["0"],
};
