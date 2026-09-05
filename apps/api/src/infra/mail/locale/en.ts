import { Locale, NotificationType } from "@cmv/shared";
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
  invitation: {
    subject: (coachName) =>
      coachName != null
        ? `${coachName} invited you to Cimavia`
        : "An invitation is waiting for you on Cimavia",
    heading: "Join your coach on Cimavia",
    intro: (coachName) =>
      `${coachName ?? "A coach"} invited you to their Cimavia space, to follow your training plans and debrief your sessions.`,
    codeLine: (code) => `Your invitation code: ${code}`,
    expiry: (days) =>
      days > 1 ? `This code is valid for ${days} days.` : "This code is valid for one day.",
    cta: "Create my account",
    ignore:
      "If you do not know this person, ignore this email: nothing will happen, and nobody will learn that you received it.",
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
