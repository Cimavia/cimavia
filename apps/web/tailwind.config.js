// @ts-check
import cmvPreset from "@cmv/tokens/tailwind-preset";
import plugin from "tailwindcss/plugin";

/**
 * Config Tailwind web.
 *
 * `cmvPreset` (@cmv/tokens) fournit TOUS les tokens du design system (couleurs, typo, rayons,
 * spacing), préfixés `cmv-`. Aucun token non préfixé n'est déclaré ici : le design system est
 * fait main (composants `Cmv*`) — pas de bibliothèque de primitives tierce.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [cmvPreset],
  plugins: [
    /**
     * `wrap-anywhere` : un mot plus large que sa colonne — une URL collée dans une consigne — se
     * coupe au caractère (#584). `break-words` n'y suffit pas : `overflow-wrap: break-word` ne
     * réduit pas la largeur min-content, et dans une grille ou une rangée flex dont le `min-width`
     * reste `auto`, le mot impose encore sa largeur à la colonne. `anywhere` la réduit.
     *
     * Sur le TEXTE, jamais sur un conteneur : hérité par une pastille ou un bouton, il les laisse
     * se couper au milieu d'un mot dès que leur rangée se resserre.
     *
     * Le nom est celui de l'utilitaire natif de Tailwind 4 : à la migration, ce plugin se retire
     * et les classes restent.
     */
    plugin(({ addUtilities }) => {
      addUtilities({ ".wrap-anywhere": { "overflow-wrap": "anywhere" } });
    }),
  ],
};
