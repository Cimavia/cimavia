import { Locale, NotificationType } from "@cmv/shared";
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
    manageNotifications: "Gérer mes notifications par e-mail",
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
  /**
   * Un gabarit par type envoyable. Chacun a DEUX formulations, selon que le sujet est connu ou
   * non : `subjectLabel` est nullable (règle dure n°5), et une phrase à guillemets vides serait
   * pire qu'une phrase générique. Le repli n'est donc pas un défaut silencieux, c'est une seconde
   * rédaction.
   */
  notification: {
    [NotificationType.PLAN_PUBLISHED]: ({ subjectLabel }) => ({
      subject: subjectLabel != null ? `Nouveau cycle : ${subjectLabel}` : "Nouveau cycle",
      heading: "Ton coach t'a diffusé un cycle",
      body:
        subjectLabel != null
          ? `Ton coach vient de te diffuser « ${subjectLabel} ». Ouvre l'application pour le découvrir.`
          : "Ton coach vient de te diffuser un nouveau cycle. Ouvre l'application pour le découvrir.",
    }),
    [NotificationType.FEEDBACK_RECEIVED]: ({ actorName, subjectLabel }) => ({
      subject: actorName != null ? `Débrief de ${actorName}` : "Nouveau débrief",
      heading: "Un débrief t'attend",
      // Un coach suit N athlètes : sans le nom, l'information est inexploitable — d'où la
      // formulation de repli, qui dit franchement qu'on ne sait pas plutôt que de nommer à tort.
      body: `${actorName ?? "Un de tes athlètes"} a débriefé ${
        subjectLabel != null ? `« ${subjectLabel} »` : "une séance"
      }.`,
    }),
    [NotificationType.MESSAGE_RECEIVED]: ({ actorName }) => ({
      subject: actorName != null ? `Message de ${actorName}` : "Nouveau message",
      heading: "Tu as reçu un message",
      // Le CONTENU du message n'est jamais repris : il transiterait en clair dans une boîte mail
      // qu'on ne maîtrise pas, alors que la conversation est une donnée de santé au sens du CDC.
      body: `${actorName ?? "Quelqu'un"} t'a écrit. Ouvre l'application pour lire la conversation.`,
    }),
    [NotificationType.INVOICE_ISSUED]: () => ({
      subject: "Nouvelle facture",
      heading: "Une facture t'attend",
      // Pas de montant : un e-mail n'est pas un relevé, et une somme dans un objet ou un corps se
      // retrouve dans les aperçus de notification d'un téléphone posé sur une table.
      body: "Ton coach t'a émis une facture. Elle est consultable dans l'application.",
    }),
  },
} satisfies MailStrings;
