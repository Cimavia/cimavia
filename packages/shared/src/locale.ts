import type { TypesValuesOf } from "./type/generics.type";

// Langue de l'utilisateur. FR au lancement ; EN activé en v1.0 (i18n prêt dès le MVP).
export const Locale = {
  FR: "fr",
  EN: "en",
} as const;

export type Locale = TypesValuesOf<typeof Locale>;
