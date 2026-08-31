import type { CapabilityName } from "../capability";
import type { InvoiceDto, UpdateInvoiceStatusInput } from "../dto/invoice.schema";
import { asKey, asQuery } from "./as-capability";
import type { ApiClient } from "./client";

/**
 * Appels HTTP des factures ÉMISES, partagés web ↔ mobile.
 *
 * Troisième module de ce genre après `createNotificationApi` (#48) et `createReminderApi` (#44),
 * et le premier où les deux clients existaient DÉJÀ : `GET /invoices` était appelé des deux côtés,
 * sous deux noms et deux clés de cache différents, pour la même route. C'est précisément la dérive
 * que la règle de promotion (architecture-choice §1) existe pour empêcher.
 *
 * Ce qui est ici est ce que **les deux rôles ET les deux plateformes** touchent :
 * - `list` : servie aux deux rôles (le coach voit SES factures émises, l'athlète les siennes — le
 *   scope tenant décide, pas le client) ;
 * - `updateStatus` / `cancel` : coach seul côté API (`@Roles`), mais bi-plateforme dès #32 (écran
 *   de facturation mobile). Les promouvoir maintenant évite de rouvrir ce fichier pour les
 *   déplacer.
 *
 * Ce qui n'est PAS ici, volontairement : la **facturation d'un cycle** (`/plans/:id/billing` et son
 * justificatif PDF). Elle se saisit dans le builder de planification, qui reste **web-only** —
 * décision explicite de #20. Un second client n'est pas « pas encore prévu », il est exclu.
 */
export const invoiceKeys = {
  all: ["invoices"] as const,
  /** `as` fait partie de la clé : les deux titres lisent la même URL et rendent des listes
   * différentes (émises contre reçues) — cf. `asKey`. */
  list: (as: CapabilityName | null) => ["invoices", "list", asKey(as)] as const,
};

export type InvoiceApi = {
  /** Les factures émises de l'acteur courant, de la plus récente à la plus ancienne (ordre imposé
   * par l'API). Les brouillons (`DRAFT`) en sont exclus côté service. */
  list: (as: CapabilityName | null) => Promise<InvoiceDto[]>;
  /** Bascule payé/impayé : le service pose ou efface `paidAt` selon le statut visé. Coach seul. */
  updateStatus: (id: string, input: UpdateInvoiceStatusInput) => Promise<InvoiceDto>;
  /**
   * Annulation : route dédiée plutôt qu'une valeur du toggle, parce qu'elle est gardée (409 si la
   * facture n'est pas en attente de règlement) et irréversible. Coach seul.
   */
  cancel: (id: string) => Promise<InvoiceDto>;
};

export function createInvoiceApi(api: ApiClient): InvoiceApi {
  return {
    list: (as) => api.get<InvoiceDto[]>(`/invoices${asQuery(as)}`),
    updateStatus: (id, input) => api.patch<InvoiceDto>(`/invoices/${id}/status`, input),
    cancel: (id) => api.post<InvoiceDto>(`/invoices/${id}/cancel`),
  };
}
