import type {
  InvoiceDocumentMimeType,
  InvoiceDto,
  PlanBillingInput,
  UpdateInvoiceStatusInput,
} from "@cmv/shared";
import { InvoiceStatus, notificationKeys, reminderKeys } from "@cmv/shared";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachInvoiceDocument,
  getPlanBilling,
  invoiceApi,
  invoiceKeys,
  removeInvoiceDocument,
  requestInvoiceDocumentUploadUrl,
  savePlanBilling,
} from "@/feature/invoice/api";
import { planKeys } from "@/feature/plan/api";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { uploadToSignedUrl } from "@/shared/lib/upload";

export function useInvoices() {
  // Le titre auquel on lit : `null` sauf pour un compte à double capacité, seul cas où « émises »
  // et « reçues » sont deux réponses différentes. Il fait partie de la clé, sinon changer de titre
  // servirait le cache de l'autre côté.
  const as = useExercisedCapability();
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.list(as),
    queryFn: () => invoiceApi.list(as),
  });
}

/**
 * Ce qu'un changement de statut de facture périme : les factures, mais AUSSI les rappels et le
 * centre de notifications. Depuis #349, payer ou annuler une facture clôt son rappel « en retard »
 * dans la même requête ; ne périmer que les factures laissait ce rappel dans la liste, la tuile
 * « à traiter » et le badge jusqu'au polling suivant (#485). Même dispositif que
 * `useReminderMutation`.
 *
 * Invalidé à chaque transition, remise à régler comprise, alors que l'API ne rouvre pas le rappel
 * dans ce cas : décider ici quelle transition touche un rappel recopierait une règle du serveur.
 */
function invalidateAfterInvoiceTransition(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
  queryClient.invalidateQueries({ queryKey: reminderKeys.all });
  queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateInvoiceStatusInput["status"] }) =>
      invoiceApi.updateStatus(id, { status }),
    onSuccess: (invoice) => {
      invalidateAfterInvoiceTransition(queryClient);
      toast.onSuccess(
        invoice.status === InvoiceStatus.PAID ? "invoice.toast.paid" : "invoice.toast.reopened",
      );
    },
    onError: toast.onError,
  });
}

export function useCancelInvoice() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.cancel(id),
    onSuccess: () => {
      invalidateAfterInvoiceTransition(queryClient);
      toast.onSuccess("invoice.toast.cancelled");
    },
    onError: toast.onError,
  });
}

/**
 * Les termes de facturation DRAFT du cycle, ou `null` tant que rien n'est saisi.
 *
 * `enabled` n'est plus un garde-fou : depuis #211 l'API TOLÈRE cette lecture partout, et rend
 * `null` sur un cycle diffusé, sans destinataire ou écrit pour soi — les trois cas où aucun
 * brouillon ne peut exister. C'est donc une économie, pas une protection : on ne pose pas une
 * question dont on tient déjà la réponse.
 *
 * Un SEUL appelant décide (`PlanBuilderScreen`), et c'est délibéré. Deux observateurs sur cette
 * clé rendaient la garde inopérante — il suffisait que l'un des deux soit actif pour que la
 * requête parte, et c'est exactement ce qui a produit #211.
 */
export function usePlanBilling(planId: string, enabled = true) {
  return useQuery<InvoiceDto | null>({
    queryKey: invoiceKeys.billing(planId),
    queryFn: () => getPlanBilling(planId),
    enabled,
  });
}

export function useSavePlanBilling(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: (input: PlanBillingInput) => savePlanBilling(planId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billing(planId) });
      // Le compteur de complétude du cycle (gating de la diffusion) dépend de la facturation.
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      toast.onSuccess("invoice.toast.billingSaved");
    },
    onError: toast.onError,
  });
}

/**
 * Le justificatif choisi, avec son type DÉJÀ vérifié : le hook n'affirme plus un type qu'il n'a
 * pas lu (#368), c'est l'appelant qui doit l'avoir établi pour le passer.
 */
export type PickedInvoiceDocument = { file: File; mimeType: InvoiceDocumentMimeType };

// Joint (ou remplace) le justificatif PDF de la facture DRAFT : URL signée → PUT direct vers le
// storage → rattachement. Le binaire ne transite jamais par l'API (règle 7).
export function useAttachInvoiceDocument(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: async ({ file, mimeType }: PickedInvoiceDocument) => {
      const { uploadUrl, storagePath } = await requestInvoiceDocumentUploadUrl(planId, {
        fileName: file.name,
        mimeType,
        size: file.size,
      });
      await uploadToSignedUrl(uploadUrl, file, () => {});
      return attachInvoiceDocument(planId, {
        storagePath,
        fileName: file.name,
        mimeType,
        size: file.size,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billing(planId) });
      toast.onSuccess("invoice.toast.documentAttached");
    },
    onError: toast.onError,
  });
}

export function useRemoveInvoiceDocument(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: () => removeInvoiceDocument(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billing(planId) });
      toast.onSuccess("invoice.toast.documentRemoved");
    },
    onError: toast.onError,
  });
}
