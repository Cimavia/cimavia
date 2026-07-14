// @ts-check
import cmvPreset from "@cmv/tokens/tailwind-preset";

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
  plugins: [],
};
