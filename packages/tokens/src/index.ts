import palette from "./palette.json";

/**
 * Palette du design system, en valeurs JS.
 *
 * Pour l'UI, on passe par les classes Tailwind/NativeWind (`bg-cmv-*`, `text-cmv-*`) — c'est la
 * règle. Cet export ne sert QUE là où une API native exige une couleur en valeur : le thème de la
 * navigation React Navigation (barre d'onglets, fond des écrans), qui ne lit pas de className.
 * Même source que le preset Tailwind (palette.json) : aucune couleur ne peut diverger.
 */
export const cmvColors = palette;
