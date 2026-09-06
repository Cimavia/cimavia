import type { InvoiceDto, UpdateInvoiceStatusInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceApi, invoiceKeys } from "@/feature/invoice/api";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";

/**
 * Les factures ÉMISES de l'acteur courant — le coach celles qu'il a émises, l'athlète les
 * siennes. Une seule route (`GET /invoices`), scopée par le tenant : d'où un seul hook, et un nom
 * qui ne suppose plus un rôle.
 */
export function useInvoices() {
  // Le titre auquel on lit : `null` sauf pour un compte à double capacité, seul cas où « émises »
  // et « reçues » sont deux réponses différentes. Il fait partie de la clé.
  const as = useExercisedCapability();
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.list(as),
    queryFn: () => invoiceApi.list(as),
  });
}

/**
 * Marquage manuel payé / impayé — coach seul (`@Roles([COACH])` sur la route). Le paiement réel est
 * externe en MVP : ce statut est une déclaration du coach, pas la trace d'un encaissement.
 *
 * Réversible, et volontairement : poser un paiement à tort doit pouvoir se corriger. C'est l'UI
 * qui décide si le retour arrière demande une confirmation, pas l'API.
 */
export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateInvoiceStatusInput["status"] }) =>
      invoiceApi.updateStatus(id, { status }),
    onSuccess: () => {
      // Racine entière : le tableau de bord tire ses deux tuiles de facturation de la même liste.
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

/**
 * Annulation d'une facture — coach seul, et gardée en amont : l'API ne l'accepte que depuis
 * `PENDING`, et refuse en 409 toute ré-annulation comme tout retour arrière. TERMINAL, donc, et
 * c'est ce qui justifie la confirmation en deux temps côté UI.
 *
 * Un endpoint dédié plutôt que le toggle de statut, et pas par symétrie : `CANCELLED` ouvert au
 * toggle contournerait précisément cette garde. Le cycle facturé n'est PAS affecté — annuler une
 * facture n'annule pas la prestation.
 */
export function useCancelInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.cancel(id),
    onSuccess: () => {
      // Racine entière : le tableau de bord tire ses deux tuiles de facturation de la même liste.
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
