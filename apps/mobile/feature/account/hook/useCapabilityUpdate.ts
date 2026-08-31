import { apiErrorMessage, CapabilityBlocker, type UpdateCapabilitiesInput } from "@cmv/shared";
import { useMutation } from "@tanstack/react-query";
import { capabilityApi } from "@/feature/account/api";

// i18n-values account.capabilities.blocked: ACTIVE_ATHLETES, ACTIVE_COACH
const BLOCKERS: readonly string[] = [
  CapabilityBlocker.ACTIVE_ATHLETES,
  CapabilityBlocker.ACTIVE_COACH,
];

/**
 * La clé du message d'un refus 409. L'API renvoie un CODE, pas une phrase — traduisible ici, et
 * modifiable sans toucher au serveur. Un code inconnu (API plus récente que ce binaire) retombe
 * sur l'erreur générique plutôt que d'afficher un identifiant brut à l'utilisateur.
 */
export function capabilityErrorKey(error: unknown): string {
  const message = apiErrorMessage(error);
  return message != null && BLOCKERS.includes(message)
    ? `account.capabilities.blocked.${message}`
    : "common.error";
}

/**
 * Modifie les capacités du compte.
 *
 * Contrairement au web, pas de rechargement possible : l'appelant remet la session à jour en la
 * redemandant (`authClient.getSession`), ce qui suffit ici — la barre d'onglets et l'espace courant
 * dérivent tous deux de la session, et se recalculent au rendu suivant.
 */
export function useCapabilityUpdate(onDone: () => void) {
  return useMutation({
    mutationFn: (input: UpdateCapabilitiesInput) => capabilityApi.update(input),
    onSuccess: onDone,
  });
}
