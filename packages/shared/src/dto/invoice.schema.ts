import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

export const INVOICE_NOTE_MAX_LENGTH = 2000;
// Plafond de garde-fou (100 000 €) : borne le champ, pas une règle métier. amountCents est un
// ENTIER de centimes — jamais un float (règle argent).
export const INVOICE_AMOUNT_MAX_CENTS = 100_000_00;

// Devise unique en MVP : le champ existe en base pour l'avenir (facturation multi-devise v1.0),
// mais l'UI n'offre pas de choix. Enum mono-valeur → toute autre valeur est rejetée en 400.
export const INVOICE_CURRENCIES = ["EUR"] as const;
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number];
export const invoiceCurrencySchema = z.enum(INVOICE_CURRENCIES);
export const DEFAULT_INVOICE_CURRENCY: InvoiceCurrency = "EUR";

// Cycle de vie d'une facture, lié à celui de son cycle (1:1 via planId) :
// - DRAFT   : termes saisis dans le builder, cycle pas encore diffusé — invisible de l'athlète.
// - PENDING : émise au `publish` du cycle (issuedAt posé), en attente de règlement.
// - PAID    : marquée réglée par le coach (manuel — paiement réel externe en MVP). Réversible
//             (retour arrière confirmé côté UI). Le PSP (Stripe) est différé v1.0.
export const InvoiceStatus = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  PAID: "PAID",
} as const;
export type InvoiceStatus = TypesValuesOf<typeof InvoiceStatus>;
export const invoiceStatusSchema = z.enum(InvoiceStatus);

// Statuts d'une facture ÉMISE (hors brouillon) — ce que le toggle coach peut poser, et ce que les
// deux rôles voient dans leur liste. DRAFT ne vit que dans le builder de cycle.
export const issuedInvoiceStatusSchema = z.enum([InvoiceStatus.PENDING, InvoiceStatus.PAID]);

// Période facturée : mois civil "YYYY-MM" (ex. "2026-07"). Pas un jour — une facture couvre un
// mois de prestation. Source unique du format (l'API valide, les clients affichent via
// formatInvoicePeriod).
export const INVOICE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const invoicePeriodSchema = z
  .string()
  .regex(INVOICE_PERIOD_PATTERN, "Période attendue au format YYYY-MM");

// ── Entrée coach ─────────────────────────────────────────────────────────────

/**
 * Termes de facturation d'un cycle, saisis dans le builder (sous les semaines). Persiste la facture
 * DRAFT du plan (1:1). L'athlète (déjà porté par le cycle), la période (dérivée du mois de début du
 * cycle) et la devise (EUR) ne sont PAS saisis : ils sont posés par le service. `dueDate` est une
 * date civile (comme Plan.startDate), sans contrainte de jour de semaine.
 */
export const planBillingSchema = z
  .object({
    amountCents: z.number().int().positive().max(INVOICE_AMOUNT_MAX_CENTS),
    dueDate: z.iso.date(),
    note: z.string().max(INVOICE_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type PlanBillingInput = z.infer<typeof planBillingSchema>;

// Marquage manuel du statut d'une facture émise (toggle payé/impayé). `paidAt` est posé/effacé par
// le service selon la valeur — jamais transmis par le client. DRAFT est exclu (non émise).
export const updateInvoiceStatusSchema = z
  .object({
    status: issuedInvoiceStatusSchema,
  })
  .strict();
export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

/**
 * Forme UNIQUE servie aux deux rôles : le web coach lit `athleteName` (il suit N athlètes), le
 * mobile athlète lit `coachName` (il a 1 coach). Les noms et le titre du cycle sont résolus côté
 * API (User et Plan, requêtes scopées) — le DTO n'a donc pas à brancher selon le rôle.
 */
export const invoiceDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  coachName: z.string(),
  athleteId: z.string(),
  athleteName: z.string(),
  // Cycle facturé (1:1). Nullable : le modèle reste ouvert à une facture hors-cycle (v1.0) ; en
  // MVP il est toujours renseigné. `planTitle` suit la même nullabilité.
  planId: z.string().nullable(),
  planTitle: z.string().nullable(),
  period: z.string(),
  amountCents: z.number().int(),
  currency: invoiceCurrencySchema,
  status: invoiceStatusSchema,
  // null tant que DRAFT (non émise) — posé au `publish` du cycle.
  issuedAt: z.iso.datetime().nullable(),
  dueDate: z.iso.date(),
  // null tant qu'impayée (rendu « — ») — jamais un fallback silencieux.
  paidAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;
