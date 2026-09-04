import { Locale } from "@cmv/shared";
import type { MailStrings } from "../mail.catalog";

/**
 * Textes français des e-mails transactionnels. Tutoiement, comme les libellés de notification
 * (`NotificationService`) et le reste du produit — un e-mail n'est pas un autre interlocuteur.
 */
export const fr = {
  code: Locale.FR,
  common: {
    signature: "L'équipe Cimavia",
    linkFallback:
      "Si le lien ci-dessus ne fonctionne pas, copie cette adresse dans ton navigateur :",
  },
  resetPassword: {
    subject: "Réinitialise ton mot de passe Cimavia",
    heading: "Nouveau mot de passe",
    intro:
      "Tu as demandé à réinitialiser ton mot de passe Cimavia. Suis le lien ci-dessous pour en choisir un nouveau.",
    cta: "Choisir un nouveau mot de passe",
    expiry: (hours: number) =>
      hours > 1 ? `Ce lien est valable ${hours} heures.` : "Ce lien est valable une heure.",
    ignore:
      "Si tu n'es pas à l'origine de cette demande, ignore cet e-mail : ton mot de passe reste inchangé.",
  },
} satisfies MailStrings;
