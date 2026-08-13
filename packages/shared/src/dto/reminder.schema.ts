import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Rappel du coach (#44) — « relancer le renouvellement de ce cycle », « facture en retard ».
 *
 * Outil PRIVÉ du coach : l'athlète n'en voit jamais aucun (scope `coachId` seul, cf.
 * `TENANT_SCOPES`). Générique par construction : la cible est désignée par un couple
 * `entityType`/`entityId`, pour couvrir de nouveaux cas d'usage sans migration de schéma.
 */

export const REMINDER_NOTE_MAX_LENGTH = 500;

// Bornage de la liste, même famille que NOTIFICATION_PAGE_SIZE : un coach a des dizaines de
// rappels, pas des milliers. Pas de pagination en première passe (dette assumée).
export const REMINDER_PAGE_SIZE = 100;

/**
 * Cycle de vie d'un rappel :
 * - PENDING   : à traiter. Devient « dû » quand `dueAt` est passé (calculé à la LECTURE, cf.
 *               `isReminderDue` — aucun job en arrière-plan tant que #47 n'a pas atterri).
 * - DONE      : traité.
 * - DISMISSED : abandonné. C'est la suppression douce — il n'y a pas de `DELETE` sur un rappel,
 *               un rappel qu'on a renoncé à traiter reste une information.
 *
 * Les trois transitions sont RÉVERSIBLES (simple toggle, comme le statut de facture) : rouvrir un
 * rappel marqué fait par erreur ne doit pas demander d'en recréer un.
 */
export const ReminderStatus = {
  PENDING: "PENDING",
  DONE: "DONE",
  DISMISSED: "DISMISSED",
} as const;
export type ReminderStatus = TypesValuesOf<typeof ReminderStatus>;
export const reminderStatusSchema = z.enum(ReminderStatus);

/**
 * Ce sur quoi un rappel peut porter. Volontairement PLUS ÉTROIT que `NotificationEntityType`, et
 * distinct de lui : ici on décrit ce que le produit permet de rappeler (deux gestes offerts par
 * l'UI), là ce vers quoi une notification peut pointer (quatre écrans). Fondre les deux enums
 * obligerait l'API à refuser applicativement `CONVERSATION` et `SCHEDULED_SESSION` — soit ce
 * sous-ensemble, réécrit à la main. Le pont vers la navigation est la table
 * `REMINDER_TARGET_ENTITY_TYPE` (`util/reminder.util.ts`).
 *
 * Comme pour `Notification`, `entityId` n'a **pas de clé étrangère** : la cible est polymorphe, le
 * modèle visé dépend de `entityType`. Contrepartie assumée, identique (dette N-4).
 */
export const ReminderEntityType = {
  PLAN: "PLAN",
  INVOICE: "INVOICE",
} as const;
export type ReminderEntityType = TypesValuesOf<typeof ReminderEntityType>;
export const reminderEntityTypeSchema = z.enum(ReminderEntityType);

/**
 * Pourquoi un rappel a été généré AUTOMATIQUEMENT (#47). `null` = rappel saisi par le coach.
 *
 * C'est la réponse à la contrainte relevée en construisant #44 : un rappel auto-généré ne doit pas
 * **fabriquer sa `note`**. La note est du texte du COACH (comme `Plan.title`) ; une note écrite par
 * l'API serait un **libellé rendu puis persisté**, exactement ce que le modèle de notification
 * interdit (#48 : on persiste le type et les paramètres, le rendu se fait côté client).
 *
 * On persiste donc le MOTIF, et le libellé se rend à l'affichage via `REMINDER_REASON_KEY` — même
 * dispositif que `NOTIFICATION_LABEL_KEY`. Conséquence voulue : un rappel généré aujourd'hui
 * s'affichera en anglais le jour où `en.json` arrive.
 */
export const ReminderReason = {
  /** La dernière semaine du cycle approche — proposer le renouvellement avant qu'il ne s'arrête. */
  PLAN_ENDING: "PLAN_ENDING",
  /** Facture émise dont l'échéance est dépassée — relancer. */
  INVOICE_OVERDUE: "INVOICE_OVERDUE",
} as const;
export type ReminderReason = TypesValuesOf<typeof ReminderReason>;
export const reminderReasonSchema = z.enum(ReminderReason);

// ── Entrée coach ─────────────────────────────────────────────────────────────

/**
 * Création manuelle par le coach. `coachId` est injecté par le tenancy layer, jamais transmis ;
 * l'appartenance de la cible est vérifiée par le service (une FK n'impose pas le tenant).
 *
 * `dueAt` est un **INSTANT** (`YYYY-MM-DDTHH:mm:ssZ`), pas une date civile comme `Plan.startDate` :
 * un rappel se déclenche à une heure, et s'affiche donc dans le fuseau de son lecteur
 * (`formatIsoDateTime`, jamais `formatIsoDate`). Aucune contrainte de futur : une échéance déjà
 * passée est simplement due tout de suite — la refuser exposerait le formulaire au décalage
 * d'horloge entre le navigateur et l'API.
 *
 * `note` est OBLIGATOIRE : c'est le contenu entier du rappel, et le libellé de sa ligne. C'est du
 * texte du coach (comme `Plan.title`), pas un libellé système — le stocker ne contredit pas la
 * règle « le libellé d'une notification n'est jamais stocké ». Corollaire pour #47 : un rappel
 * auto-généré ne devra pas fabriquer de note, mais porter un `reason` rendu côté client.
 */
export const createReminderSchema = z
  .object({
    entityType: reminderEntityTypeSchema,
    entityId: z.string().min(1),
    dueAt: z.iso.datetime(),
    note: z.string().min(1).max(REMINDER_NOTE_MAX_LENGTH),
  })
  .strict();
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

// Toggle du statut. Les trois valeurs sont acceptées, dans les deux sens (cf. `ReminderStatus`).
export const updateReminderStatusSchema = z.object({ status: reminderStatusSchema }).strict();
export type UpdateReminderStatusInput = z.infer<typeof updateReminderStatusSchema>;

/**
 * Édition d'un rappel (#105) — l'échéance, la note, ou les deux. C'est la dette **R-3** : sans
 * elle, reprogrammer un rappel demandait de le marquer traité puis d'en créer un autre, et
 * l'historique se remplissait de doublons. Or « repousser » est le geste naturel quand un rappel
 * tombe et qu'on n'est pas prêt.
 *
 * **PARTIEL, les deux champs sont optionnels** : « repousser » ne touche que `dueAt`, corriger un
 * libellé que `note`. Un corps VIDE est refusé — il ne demande rien, et l'accepter ferait une
 * écriture (donc un `updatedAt` redaté, donc un rappel qui remonte en tête de l'historique) pour
 * une requête sans intention.
 *
 * `dueAt` garde exactement les règles de la création : un INSTANT, sans contrainte de futur —
 * repousser à hier est licite, le rappel est simplement dû tout de suite. Les raccourcis
 * (« demain », « dans une semaine ») sont calculés **côté client** et envoyés en absolu : l'API ne
 * possède aucun fuseau, et c'est ce qui lui évite d'avoir à en deviner un.
 *
 * `note` reste NON VIDE quand elle est fournie : la vider reviendrait à effacer le contenu du
 * rappel. Elle deviendra nullable en #47, pour les rappels auto-générés qui porteront un `reason`
 * à la place — jamais une note fabriquée par l'API.
 */
export const updateReminderSchema = z
  .object({
    dueAt: z.iso.datetime().optional(),
    note: z.string().min(1).max(REMINDER_NOTE_MAX_LENGTH).optional(),
  })
  .strict()
  .refine((input) => input.dueAt !== undefined || input.note !== undefined, {
    message: "Renseigner au moins l'échéance ou la note",
  });
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

export const reminderDtoSchema = z.object({
  id: z.string(),
  entityType: reminderEntityTypeSchema,
  entityId: z.string(),
  /**
   * De quoi nommer la cible SANS second aller-retour : titre du cycle, ou période de la facture.
   * Résolu côté API par une requête scopée (jamais un `include` imbriqué, qui n'est pas scopé).
   *
   * Volontairement BRUT, pas rendu : c'est le client qui compose (« Cycle — … », « Facture — mars
   * 2026 ») via i18next et `formatInvoicePeriod`. Un libellé assemblé côté API serait figé en
   * français, comme pour les notifications.
   *
   * `null` = la cible a disparu (dette N-4 : pas de FK sur `entityId`). Rendu « — », jamais un
   * repli silencieux.
   */
  targetLabel: z.string().nullable(),
  dueAt: z.iso.datetime(),
  /**
   * Le texte du coach — `null` sur un rappel **auto-généré**, qui porte un `reason` à la place
   * (#47). Nullable depuis, et seulement depuis, l'arrivée de la génération : c'est ce qui évite à
   * l'API d'écrire un libellé français en base.
   */
  note: z.string().nullable(),
  /**
   * Le motif d'une génération automatique, `null` sur un rappel saisi à la main.
   *
   * **Les deux champs ne s'excluent pas** : le coach peut ajouter une note à un rappel généré
   * (`PATCH /reminders/:id`, #105), et c'est utile — il se l'approprie. La règle d'affichage est
   * donc une PRÉCÉDENCE, pas une alternative : la note l'emporte quand elle existe, le motif sert
   * de libellé sinon (`reminderLabel`). Ce qui est garanti, c'est qu'au moins l'un des deux est
   * renseigné.
   */
  reason: reminderReasonSchema.nullable(),
  status: reminderStatusSchema,
  // null = pas encore vu dans le centre de notifications (#51). Distinct du statut : jeter un œil
  // à un rappel dû ne le traite pas.
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ReminderDto = z.infer<typeof reminderDtoSchema>;

/**
 * Résumé chiffré des rappels du coach : ce qu'affiche une tuile de tableau de bord, sans charger la
 * liste. Sans lui, compter deux rappels dus coûterait les 200 lignes que `GET /reminders` renvoie.
 *
 * **`dueCount` ne regarde PAS `readAt`**, contrairement au badge du centre de notifications
 * (`NotificationFeedService.unreadCount`, qui additionne les rappels dus **non lus**). Un rappel
 * aperçu dans la cloche n'est pas un rappel traité : c'est la distinction `readAt` (« vu ») /
 * `status` (« traité ») tranchée en #44. Les confondre viderait une tuile « à traiter » d'un simple
 * coup d'œil.
 *
 * Les deux nombres **s'emboîtent, ils ne partitionnent pas** : un rappel dû est un rappel à traiter
 * dont l'échéance est passée, donc `dueCount <= pendingCount`. Un client qui les afficherait côte à
 * côte présenterait deux fois les mêmes rappels — c'est pourquoi le dashboard n'expose que
 * `dueCount`.
 */
/**
 * Ce que rend un tick du déclencheur (#47). Aucun client ne le lit : il est là pour que le cron
 * externe et les logs disent quelque chose de vérifiable — un job qui répond 200 sans rien annoncer
 * ne distingue pas « rien à faire » de « n'a rien fait ».
 *
 * Vit dans `@cmv/shared` comme tout ce qui transite par l'API HTTP (règle dure n°2), même sans
 * consommateur d'app : c'est aussi ce qui donne un type à l'e2e qui l'exerce.
 */
export const reminderTickResultDtoSchema = z.object({
  /** Coachs balayés — un contexte tenant a été ouvert pour chacun. */
  scannedCoaches: z.number().int().min(0),
  /** Rappels automatiques créés. Les doublons sont ignorés par l'index unique, pas comptés ici. */
  createdReminders: z.number().int().min(0),
  /** Rappels devenus dus dont le push est parti. */
  pushedReminders: z.number().int().min(0),
});
export type ReminderTickResultDto = z.infer<typeof reminderTickResultDtoSchema>;

export const reminderSummaryDtoSchema = z.object({
  dueCount: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
});
export type ReminderSummaryDto = z.infer<typeof reminderSummaryDtoSchema>;
