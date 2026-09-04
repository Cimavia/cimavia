import { Locale } from "@cmv/shared";
import type { MailStrings } from "../mail.catalog";

/**
 * Textes anglais, DORMANTS tant qu'aucun compte ne porte `locale: "en"` (les deux apps forcent
 * encore `lng: "fr"` — cf. épic #71). Ils sont écrits maintenant parce que le `satisfies` en fait
 * une obligation de compilation : le jour où l'anglais s'active, il n'y a rien à rattraper.
 */
export const en = {
  code: Locale.EN,
  common: {
    signature: "The Cimavia team",
    linkFallback: "If the link above does not work, copy this address into your browser:",
  },
  resetPassword: {
    subject: "Reset your Cimavia password",
    heading: "New password",
    intro: "You asked to reset your Cimavia password. Follow the link below to choose a new one.",
    cta: "Choose a new password",
    expiry: (hours: number) =>
      hours > 1 ? `This link is valid for ${hours} hours.` : "This link is valid for one hour.",
    ignore: "If you did not ask for this, ignore this email: your password stays unchanged.",
  },
} satisfies MailStrings;
