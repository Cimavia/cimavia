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

// Statut manuel (CDC §5.10) : PENDING → PAID au marquage du coach, réversible (retour arrière
// confirmé côté UI). Le PSP (Stripe) qui automatiserait ce statut est différé v1.0.
export const InvoiceStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
} as const;
export type InvoiceStatus = TypesValuesOf<typeof InvoiceStatus>;
export const invoiceStatusSchema = z.enum(InvoiceStatus);

// Période facturée : mois civil "YYYY-MM" (ex. "2026-07"). Pas un jour — une facture couvre un
// mois de prestation. Source unique du format (l'API valide, les clients affichent via
// formatInvoicePeriod).
export const INVOICE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const invoicePeriodSchema = z
  .string()
  .regex(INVOICE_PERIOD_PATTERN, "Période attendue au format YYYY-MM");

// ── Entrée coach ─────────────────────────────────────────────────────────────

/**
 * Émission d'une facture. `athleteId` est validé côté service (l'athlète doit être un athlète DU
 * coach — la FK n'impose pas le tenant, cf. règle multi-tenant). `currency` optionnelle → EUR.
 * `dueDate` est une date civile (comme Plan.startDate), sans contrainte de jour de semaine.
 */
export const createInvoiceSchema = z
  .object({
    athleteId: z.string().min(1),
    period: invoicePeriodSchema,
    amountCents: z.number().int().positive().max(INVOICE_AMOUNT_MAX_CENTS),
    currency: invoiceCurrencySchema.default(DEFAULT_INVOICE_CURRENCY),
    dueDate: z.iso.date(),
    note: z.string().max(INVOICE_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// Marquage manuel du statut (toggle payé/impayé). `paidAt` est posé/effacé par le service selon
// la valeur — jamais transmis par le client.
export const updateInvoiceStatusSchema = z
  .object({
    status: invoiceStatusSchema,
  })
  .strict();
export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

/**
 * Forme UNIQUE servie aux deux rôles : le web coach lit `athleteName` (il suit N athlètes), le
 * mobile athlète lit `coachName` (il a 1 coach). Les noms sont résolus côté API (table User, hors
 * scope tenant) — le DTO n'a donc pas à brancher selon le rôle.
 */
export const invoiceDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  coachName: z.string(),
  athleteId: z.string(),
  athleteName: z.string(),
  period: z.string(),
  amountCents: z.number().int(),
  currency: invoiceCurrencySchema,
  status: invoiceStatusSchema,
  issuedAt: z.iso.datetime(),
  dueDate: z.iso.date(),
  // null tant qu'impayée (rendu « — ») — jamais un fallback silencieux.
  paidAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;
