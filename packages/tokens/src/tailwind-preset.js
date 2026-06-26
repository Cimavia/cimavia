// @ts-check
/**
 * @cmv/tokens — preset Tailwind partagé (web + Expo/NativeWind).
 *
 * Source de vérité unique des tokens du design system Cimavia
 * (« Granite A · Rondeur 8px · Type A »).
 *
 * Contraintes :
 *  - Tailwind CSS v3.4  (NativeWind 4 ne supporte pas encore Tailwind v4).
 *  - Couleurs en hex brut (pas de variables CSS) pour rester lisible par
 *    NativeWind ET par le web. Thème sombre unique pour le MVP.
 *  - Côté web : components.json -> "tailwind": { "cssVariables": false },
 *    pour que les primitives shadcn/ui consomment ces couleurs directement.
 *
 * Consommation :
 *  apps/web/tailwind.config.js     -> presets: [require('@cmv/tokens/tailwind-preset')]
 *  apps/mobile/tailwind.config.js  -> presets: [require('@cmv/tokens/tailwind-preset')]
 */

const granite = {
  "bg-0": "#0A0F14", // fond le plus profond
  "bg-1": "#0E141A", // fond surélevé / zones "muted"
  surface: "#141D25", // cartes
  "surface-hi": "#1C2630", // cartes survolées / popovers / segments actifs
  border: "#2B3742",
  "border-hi": "#3A4854",
};

const text = {
  hi: "#DCEFF3", // texte principal
  mid: "#AAB6C2", // texte secondaire
  lo: "#6B93A0", // texte tertiaire — contraste AA limite : réservé aux métadonnées
};

const accent = {
  DEFAULT: "#C2603A", // terracotta — action primaire
  hi: "#D07049", // hover / état actif
  soft: "rgba(194, 96, 58, 0.16)", // accent à 16% — fonds discrets
};

const semantic = {
  success: "#4E9A6A",
  warning: "#D6A23F",
  error: "#D2564B",
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // —— Échelle canonique (à utiliser dans les composants Cmv*) ——
        granite,
        text,
        accent,
        success: semantic.success,
        warning: semantic.warning,
        error: semantic.error,

        // —— Alias shadcn/ui (cssVariables: false) ——
        background: granite["bg-0"],
        foreground: text.hi,
        card: granite.surface,
        "card-foreground": text.hi,
        popover: granite["surface-hi"],
        "popover-foreground": text.hi,
        primary: accent.DEFAULT,
        "primary-foreground": text.hi,
        secondary: granite["surface-hi"],
        "secondary-foreground": text.hi,
        muted: granite["bg-1"],
        "muted-foreground": text.mid,
        destructive: semantic.error,
        "destructive-foreground": text.hi,
        input: granite.border,
        ring: accent.DEFAULT,
        // (la couleur "border" est déjà fournie via colors.granite.border ;
        //  on l'expose aussi à plat pour les utilitaires border-border de shadcn)
        border: granite.border,
      },

      // Familles logiques. Les NOMS réels enregistrés diffèrent par plateforme :
      //  - web    : @fontsource ou next/font  -> 'Space Grotesk', 'IBM Plex Sans', 'IBM Plex Mono'
      //  - mobile : @expo-google-fonts        -> p.ex. 'SpaceGrotesk_600SemiBold'
      // Le chargement des polices se fait PAR APP ; ne pas le mettre ici.
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        heading: ["Space Grotesk", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },

      // Rôles typographiques (taille / interligne / graisse / interlettrage).
      fontSize: {
        display: ["40px", { lineHeight: "44px", letterSpacing: "-0.025em", fontWeight: "700" }],
        title: ["24px", { lineHeight: "28px", fontWeight: "600" }],
        subtitle: ["16px", { lineHeight: "21px", fontWeight: "600" }],
        body: ["15px", { lineHeight: "25px", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "18px", fontWeight: "500" }],
      },

      // Rayons (md = 8px = "Rondeur 8px" verrouillée).
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "999px",
      },

      // Échelle d'espacement Base 4 du design system (ajoutée, pas substituée).
      // À privilégier : p-sm, gap-md, etc.
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "22px",
        "2xl": "32px",
        "3xl": "48px",
      },
    },
  },
};
