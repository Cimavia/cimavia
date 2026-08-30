// @ts-check
/**
 * @cmv/tokens — preset Tailwind partagé (web + Expo/NativeWind).
 *
 * Source de vérité unique des tokens du design system Cimavia
 * (« Granite A · Rondeur 8px · Type A »).
 *
 * Convention (CLAUDE.md) : TOUS les tokens custom sont préfixés `cmv`.
 *   couleurs  -> bg-cmv-*, text-cmv-*, border-cmv-*
 *   typo      -> font-cmv-*, text-cmv-<role>
 *   rayons    -> rounded-cmv-*
 *   spacing   -> p-cmv-*, gap-cmv-*, ...
 *
 * La palette elle-même vit dans `palette.json` : c'est la SEULE source des hex, lisible par ce
 * preset (JS) comme par le code applicatif (TS) qui doit thémer la navigation native.
 *
 * Familles d'état (`accent`, `success`, `warning`, `error`, `info`) — quatre nuances, un seul rôle
 * chacune, pour que la pastille d'état se compose sans jamais choisir un hex :
 *   DEFAULT -> aplat (bandeau, barre de toast, point) — PAS du texte : trop sombre sur `surface`.
 *   soft    -> fond de la pastille (teinte à 16 % sur le fond sombre).
 *   line    -> bordure de la pastille (même teinte à 34 %).
 *   on      -> texte/icône POSÉ SUR `soft` — la nuance claire, seule à passer AA (≥ 4.5:1).
 * `hi` garde son sens habituel (variante plus claire du DEFAULT, survol) et n'existe que sur
 * `accent` : sur les états, c'est `on` qu'il faut, jamais `DEFAULT`.
 *
 * Contraintes :
 *   - Tailwind CSS v3.4 (NativeWind 4 ne supporte pas Tailwind v4).
 *   - Hex bruts (pas de variables CSS) : lisibles par NativeWind ET le web.
 *     Thème sombre unique pour le MVP.
 *
 * Design system fait main : aucune bibliothèque de primitives tierce (pas de shadcn/Radix).
 *   Si l'une venait à être introduite pour des primitives complexes (menu, dialog, combobox),
 *   ses composants resteraient NON préfixés, dans un dossier `ui/` à part — sans jamais
 *   introduire de token non préfixé dans ce preset (cf. architecture-choice.md §5).
 *
 * Consommation :
 *   apps/web/tailwind.config.js     -> presets: [require('@cmv/tokens/tailwind-preset')]
 *   apps/mobile/tailwind.config.js  -> presets: [require('@cmv/tokens/tailwind-preset')]
 */

const cmv = require("./palette.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: { cmv },

      // Familles logiques. Noms réels enregistrés PAR APP :
      //   web    : @fontsource / next/font -> 'Space Grotesk', 'IBM Plex Sans', 'IBM Plex Mono'
      //   mobile : @expo-google-fonts      -> ex. 'SpaceGrotesk_600SemiBold'
      // Le chargement des polices ne va PAS ici.
      fontFamily: {
        "cmv-display": ["Space Grotesk", "system-ui", "sans-serif"],
        "cmv-heading": ["Space Grotesk", "system-ui", "sans-serif"],
        "cmv-sans": ["IBM Plex Sans", "system-ui", "sans-serif"],
        "cmv-mono": ["IBM Plex Mono", "ui-monospace", "monospace"],
      },

      // Rôles typographiques -> text-cmv-display, text-cmv-title, ...
      fontSize: {
        // Le chronomètre, lu à bout de bras : posé au sol ou sur un banc, l'athlète doit voir le
        // temps restant sans se pencher. `cmv-display` (40 px) n'y suffit pas — c'est le SEUL
        // usage de ce palier, et il n'a pas vocation à en servir d'autres.
        "cmv-chrono": ["96px", { lineHeight: "100px", letterSpacing: "-0.03em", fontWeight: "700" }],
        "cmv-display": ["40px", { lineHeight: "44px", letterSpacing: "-0.025em", fontWeight: "700" }],
        "cmv-title": ["24px", { lineHeight: "28px", fontWeight: "600" }],
        "cmv-subtitle": ["16px", { lineHeight: "21px", fontWeight: "600" }],
        "cmv-body": ["15px", { lineHeight: "25px", fontWeight: "400" }],
        "cmv-caption": ["13px", { lineHeight: "18px", fontWeight: "500" }],
      },

      // Rayons -> rounded-cmv-md (= 8px = "Rondeur 8px" verrouillée)
      borderRadius: {
        "cmv-sm": "6px",
        "cmv-md": "8px",
        "cmv-lg": "12px",
        "cmv-xl": "16px",
        "cmv-pill": "999px",
      },

      // Échelle Base 4 -> p-cmv-md, gap-cmv-lg, ...
      spacing: {
        "cmv-xs": "4px",
        "cmv-sm": "8px",
        "cmv-md": "12px",
        "cmv-lg": "16px",
        "cmv-xl": "22px",
        "cmv-2xl": "32px",
        "cmv-3xl": "48px",
      },
    },
  },
};
