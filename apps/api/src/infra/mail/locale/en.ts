import { InvitationRole, Locale, NotificationType } from "@cmv/shared";
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
    manageNotifications: "Manage my email notifications",
    linkExpiry: (hours: number) =>
      hours > 1 ? `This link is valid for ${hours} hours.` : "This link is valid for one hour.",
  },
  resetPassword: {
    subject: "Reset your Cimavia password",
    heading: "New password",
    intro: "You asked to reset your Cimavia password. Follow the link below to choose a new one.",
    cta: "Choose a new password",
    ignore: "If you did not ask for this, ignore this email: your password stays unchanged.",
  },
  verifyEmail: {
    subject: "Confirm your Cimavia email address",
    heading: "Confirm your address",
    intro:
      "You just created your Cimavia account. Follow the link below to confirm this address is yours: you will then be able to sign in.",
    cta: "Confirm my address",
    ignore:
      "If you did not create an account, ignore this email: without confirmation, nobody can sign in with this address.",
  },
  existingAccount: {
    subject: "Your address already has a Cimavia account",
    heading: "You already have an account",
    intro:
      "Someone just asked to create a Cimavia account with this address. It already has one: no new account was created.",
    hint: "If it was you, sign in with your usual password. Forgot it? The sign-in page lets you choose a new one.",
    cta: "Sign in",
    ignore: "If it was not you, ignore this email: your account and password stay unchanged.",
  },
  accountErased: {
    subject: "Your Cimavia account has been deleted",
    heading: "Your account is deleted",
    intro: "Your Cimavia account and the data attached to it have just been deleted.",
    backups: "Backups that still hold a copy clear themselves as they are renewed.",
    notYou: "If this wasn't you, write to us right away at contact@cimavia.fr.",
  },
  pendingAccount: {
    subject: "Choose your Cimavia password",
    heading: "An account is waiting for your confirmation",
    intro:
      "Someone just asked to create a Cimavia account with this address. An account was already waiting for it, never confirmed: as a precaution, its password has been erased.",
    hint: "If it is you, choose a new password from “Forgot password”: your address will be confirmed at the same time, and you will be able to sign in.",
    cta: "Choose my password",
    ignore:
      "If it was not you, ignore this email: nobody can sign in to this account any more without going through your inbox.",
  },
  invitation: {
    subject: (coachName) =>
      coachName != null
        ? `${coachName} invited you to Cimavia`
        : "An invitation is waiting for you on Cimavia",
    heading: "Join your coach on Cimavia",
    intro: (coachName) =>
      `${coachName ?? "A coach"} invited you to their Cimavia space, to follow your training plans and debrief your sessions.`,
    addressLine:
      "Create your account with the address that received this email: your invitation will be waiting there, nothing else to type.",
    expiry: (days) =>
      days > 1
        ? `This invitation is valid for ${days} days.`
        : "This invitation is valid for one day.",
    cta: "Create my account",
    ignore:
      "If you do not know this person, ignore this email: nothing will happen, and nobody will learn that you received it.",
  },
  organizationInvitation: {
    [InvitationRole.COACH]: {
      subject: (organizationName) =>
        `${organizationName} invited you to join their team on Cimavia`,
      heading: (organizationName) => `Join the ${organizationName} team`,
      intro: (organizationName) =>
        `${organizationName} invited you to join their team of coaches on Cimavia. Once a member, you will follow the athletes of ${organizationName}.`,
      addressLine:
        'Create your account with the address that received this email, ticking "I coach": your invitation will be waiting on your dashboard.',
      cta: "Create my account",
      ignore:
        "If you do not know this company, ignore this email: nothing will happen, and nobody will learn that you received it.",
    },
    [InvitationRole.ATHLETE]: {
      subject: (organizationName) => `${organizationName} invited you to Cimavia`,
      heading: (organizationName) => `Join ${organizationName} on Cimavia`,
      intro: (organizationName) =>
        `${organizationName} invited you to join their athletes on Cimavia. Their coaches will follow you there, for your training plans and the debrief of your sessions.`,
      addressLine:
        'Create your account with the address that received this email, ticking "I train": your invitation will be waiting in "My coaches".',
      cta: "Create my account",
      ignore:
        "If you do not know this company, ignore this email: nothing will happen, and nobody will learn that you received it.",
    },
  },
  // Deux formulations par gabarit, comme en français : le sujet est nullable, et des guillemets
  // vides seraient pires qu'une phrase générique.
  notification: {
    [NotificationType.PLAN_PUBLISHED]: ({ subjectLabel }) => ({
      subject: subjectLabel != null ? `New training plan: ${subjectLabel}` : "New training plan",
      heading: "Your coach published a plan",
      body:
        subjectLabel != null
          ? `Your coach just published "${subjectLabel}". Open the app to have a look.`
          : "Your coach just published a new plan. Open the app to have a look.",
    }),
    [NotificationType.FEEDBACK_RECEIVED]: ({ actorName, subjectLabel }) => ({
      subject: actorName != null ? `Debrief from ${actorName}` : "New debrief",
      heading: "A debrief is waiting for you",
      body: `${actorName ?? "One of your athletes"} debriefed ${
        subjectLabel != null ? `"${subjectLabel}"` : "a session"
      }.`,
    }),
    [NotificationType.MESSAGE_RECEIVED]: ({ actorName }) => ({
      subject: actorName != null ? `Message from ${actorName}` : "New message",
      heading: "You have a new message",
      body: `${actorName ?? "Someone"} wrote to you. Open the app to read the conversation.`,
    }),
    [NotificationType.INVOICE_ISSUED]: () => ({
      subject: "New invoice",
      heading: "An invoice is waiting for you",
      body: "Your coach issued an invoice. You can review it in the app.",
    }),
  },
} satisfies MailStrings;
