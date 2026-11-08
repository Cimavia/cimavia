import { InvitationRole, Locale, NotificationType } from "@cmv/shared";
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
    linkExpiry: (hours: number) =>
      hours > 1 ? `Ce lien est valable ${hours} heures.` : "Ce lien est valable une heure.",
  },
  resetPassword: {
    subject: "Réinitialise ton mot de passe Cimavia",
    heading: "Nouveau mot de passe",
    intro:
      "Tu as demandé à réinitialiser ton mot de passe Cimavia. Suis le lien ci-dessous pour en choisir un nouveau.",
    cta: "Choisir un nouveau mot de passe",
    ignore:
      "Si tu n'es pas à l'origine de cette demande, ignore cet e-mail : ton mot de passe reste inchangé.",
  },
  verifyEmail: {
    subject: "Confirme ton adresse e-mail Cimavia",
    heading: "Confirme ton adresse",
    intro:
      "Tu viens de créer ton compte Cimavia. Suis le lien ci-dessous pour confirmer que cette adresse est bien la tienne : tu pourras ensuite te connecter.",
    cta: "Confirmer mon adresse",
    ignore:
      "Si tu n'as pas créé de compte, ignore cet e-mail : sans confirmation, personne ne pourra se connecter avec cette adresse.",
  },
  existingAccount: {
    subject: "Ton adresse a déjà un compte Cimavia",
    heading: "Tu as déjà un compte",
    intro:
      "Quelqu'un vient de demander à créer un compte Cimavia avec cette adresse. Elle en a déjà un : aucun nouveau compte n'a été créé.",
    hint: "Si c'était toi, connecte-toi avec ton mot de passe habituel. Tu l'as oublié ? La page de connexion te permet d'en choisir un nouveau.",
    cta: "Me connecter",
    ignore:
      "Si ce n'était pas toi, ignore cet e-mail : ton compte et ton mot de passe restent inchangés.",
  },
  accountErased: {
    subject: "Ton compte Cimavia a été supprimé",
    heading: "Ton compte est supprimé",
    intro: "Ton compte Cimavia et les données qui lui sont attachées viennent d'être supprimés.",
    backups:
      "Les sauvegardes qui en gardent une copie s'effacent d'elles-mêmes à mesure qu'elles sont renouvelées.",
    notYou: "Si ce n'était pas toi, écris-nous tout de suite à contact@cimavia.fr.",
  },
  pendingAccount: {
    subject: "Choisis ton mot de passe Cimavia",
    heading: "Un compte attend ta confirmation",
    intro:
      "Quelqu'un vient de demander à créer un compte Cimavia avec cette adresse. Un compte l'attendait déjà, jamais confirmé : par prudence, son mot de passe a été effacé.",
    hint: "Si c'est toi, choisis un nouveau mot de passe depuis « Mot de passe oublié » : ton adresse sera confirmée du même coup, et tu pourras te connecter.",
    cta: "Choisir mon mot de passe",
    ignore:
      "Si ce n'était pas toi, ignore cet e-mail : personne ne peut plus se connecter à ce compte sans passer par ta boîte.",
  },
  /**
   * L'invitation d'un athlète sans compte. Tutoiement comme partout, et le nom du coach en objet :
   * c'est ce qui distingue ce message d'un courrier non sollicité dans une boîte qui ne nous
   * connaît pas encore.
   */
  invitation: {
    subject: (coachName) =>
      coachName != null
        ? `${coachName} t'invite sur Cimavia`
        : "Une invitation t'attend sur Cimavia",
    heading: "Rejoins ton coach sur Cimavia",
    intro: (coachName) =>
      `${coachName ?? "Un coach"} t'invite à rejoindre son espace sur Cimavia, pour y suivre tes planifications et débriefer tes séances.`,
    addressLine:
      "Crée ton compte avec l'adresse qui reçoit ce message : ton invitation t'y attendra, il n'y a rien d'autre à saisir.",
    expiry: (days) =>
      days > 1
        ? `Cette invitation est valable ${days} jours.`
        : "Cette invitation est valable une journée.",
    cta: "Créer mon compte",
    ignore:
      "Si tu ne connais pas cette personne, ignore cet e-mail : rien ne se passera, et personne n'apprendra que tu l'as reçu.",
  },
  /**
   * L'invitation d'une entreprise à rejoindre son équipe (#601), vers une adresse sans compte. La
   * case « Je coache » est dans la consigne : sans elle, le compte créé ne pourrait pas accepter.
   */
  organizationInvitation: {
    [InvitationRole.COACH]: {
      subject: (organizationName) =>
        `${organizationName} t'invite à rejoindre son équipe sur Cimavia`,
      heading: (organizationName) => `Rejoins l'équipe de ${organizationName}`,
      intro: (organizationName) =>
        `${organizationName} t'invite à rejoindre son équipe de coachs sur Cimavia. Une fois membre, tu suivras les athlètes de ${organizationName}.`,
      addressLine:
        "Crée ton compte avec l'adresse qui reçoit ce message, en cochant « Je coache » : ton invitation t'attendra sur ton tableau de bord.",
      cta: "Créer mon compte",
      ignore:
        "Si tu ne connais pas cette entreprise, ignore cet e-mail : rien ne se passera, et personne n'apprendra que tu l'as reçu.",
    },
    [InvitationRole.ATHLETE]: {
      subject: (organizationName) => `${organizationName} t'invite sur Cimavia`,
      heading: (organizationName) => `Rejoins ${organizationName} sur Cimavia`,
      intro: (organizationName) =>
        `${organizationName} t'invite à rejoindre ses athlètes sur Cimavia. Tu y seras suivi par ses coachs, pour tes planifications et le débrief de tes séances.`,
      addressLine:
        "Crée ton compte avec l'adresse qui reçoit ce message, en cochant « Je m'entraîne » : ton invitation t'attendra dans « Mes coachs ».",
      cta: "Créer mon compte",
      ignore:
        "Si tu ne connais pas cette entreprise, ignore cet e-mail : rien ne se passera, et personne n'apprendra que tu l'as reçu.",
    },
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
