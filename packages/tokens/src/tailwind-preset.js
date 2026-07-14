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

const cmv = {
  // Neutres · Granite
  bg: {
    0: "#0A0F14", // fond le plus profond        -> bg-cmv-bg-0
    1: "#0E141A", // fond surélevé / "muted"      -> bg-cmv-bg-1
  },
  surface: {
    DEFAULT: "#141D25", // cartes                 -> bg-cmv-surface
    hi: "#1C2630", // hover / popover / segment actif -> bg-cmv-surface-hi
  },
  border: {
    DEFAULT: "#2B3742", // -> border-cmv-border
    hi: "#3A4854", // -> border-cmv-border-hi
  },

  // Texte (sur fond sombre)
  text: {
    hi: "#DCEFF3", // principal     -> text-cmv-text-hi
    mid: "#AAB6C2", // secondaire    -> text-cmv-text-mid
    lo: "#6B93A0", // tertiaire — contraste AA limite, métadonnées seulement
  },

  // Accent & sémantiques
  accent: {
    DEFAULT: "#C2603A", // action primaire -> bg-cmv-accent
    hi: "#D07049", // hover / actif   -> bg-cmv-accent-hi
    soft: "rgba(194, 96, 58, 0.16)", // fond discret (accent @16%) -> bg-cmv-accent-soft
  },
  success: "#4E9A6A", // -> text-cmv-success
  warning: "#D6A23F", // -> text-cmv-warning
  error: "#D2564B", // -> text-cmv-error
};

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
