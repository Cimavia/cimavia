import { apiErrorMessage, CapabilityBlocker, type UpdateCapabilitiesInput } from "@cmv/shared";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { capabilityApi } from "@/feature/account/api";
import { useToast } from "@/shared/component";

// i18n-values account.capabilities.blocked: ACTIVE_ATHLETES, ACTIVE_COACH
const BLOCKERS: readonly string[] = [
  CapabilityBlocker.ACTIVE_ATHLETES,
  CapabilityBlocker.ACTIVE_COACH,
];

/**
 * Le message d'un refus 409. L'API renvoie un CODE, pas une phrase : c'est ce qui permet de le
 * traduire ici, et de le faire évoluer sans toucher au serveur. Un code inconnu — API plus récente
 * que ce client — retombe sur l'erreur générique plutôt que d'afficher un identifiant brut.
 */
function blockedKey(error: unknown): string {
  const message = apiErrorMessage(error);
  return message != null && BLOCKERS.includes(message)
    ? `account.capabilities.blocked.${message}`
    : "common.error";
}

/**
 * Modifie les capacités du compte, puis **recharge**.
 *
 * Le rechargement n'est pas une facilité : changer de capacité change la session (les capacités et
 * le persona), donc la navigation entière, l'espace courant et les clés de cache de tous les
 * écrans partagés. Rafraîchir ces états un par un laisserait forcément un endroit en retard —
 * typiquement une sidebar qui propose encore un espace qu'on vient de quitter. La destination est
 * la racine, seule route accessible quelle que soit la capacité restante.
 */
export function useCapabilityUpdate() {
  const { t } = useTranslation();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: UpdateCapabilitiesInput) => capabilityApi.update(input),
    onSuccess: () => {
      window.location.assign("/");
    },
    onError: (error) => toast.error(t(blockedKey(error))),
  });
}
