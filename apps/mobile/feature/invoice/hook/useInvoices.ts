import type { InvoiceDto, TrainingCapability, UpdateInvoiceStatusInput } from "@cmv/shared";
import { notificationKeys, reminderKeys } from "@cmv/shared";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceApi, invoiceKeys } from "@/feature/invoice/api";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";

/**
 * Les factures ÉMISES de l'acteur courant — le coach celles qu'il a émises, l'athlète les
 * siennes. Une seule route (`GET /invoices`), scopée par le tenant : d'où un seul hook, et un nom
 * qui ne suppose plus un rôle.
 *
 * `pinned` : titre imposé par un écran mono-titre, voir `useExercisedCapability` (#343).
 */
export function useInvoices(pinned?: TrainingCapability) {
  // Le titre auquel on lit : `null` sauf pour un compte à double capacité, seul cas où « émises »
  // et « reçues » sont deux réponses différentes. Il fait partie de la clé.
  const as = useExercisedCapability(pinned);
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.list(as),
    queryFn: () => invoiceApi.list(as),
  });
}

/**
 * Ce qu'un changement de statut de facture périme. La racine entière des factures : le tableau de
 * bord tire ses deux tuiles de facturation de la même liste. Et AUSSI les rappels et le centre de
 * notifications : depuis #349, payer ou annuler une facture clôt son rappel « en retard » dans la
 * même requête ; ne périmer que les factures le laissait dans la liste, la tuile « à traiter » et
 * la pastille jusqu'au polling suivant (#485). Même dispositif que `useReminderMutation`, et que
 * côté web.
 *
 * Invalidé à chaque transition, remise à régler comprise, alors que l'API ne rouvre pas le rappel
 * dans ce cas : décider ici quelle transition touche un rappel recopierait une règle du serveur.
 */
function invalidateAfterInvoiceTransition(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
  queryClient.invalidateQueries({ queryKey: reminderKeys.all });
  queryClient.invalidateQueries({ queryKey: notificationKeys.all });
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
    onSuccess: () => invalidateAfterInvoiceTransition(queryClient),
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
    onSuccess: () => invalidateAfterInvoiceTransition(queryClient),
  });
}
