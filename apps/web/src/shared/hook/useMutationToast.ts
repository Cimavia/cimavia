import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Colle entre TanStack Query et les toasts : chaque mutation confirme son effet, et toute erreur
 * remonte à l'utilisateur — au lieu de rester dans `mutation.error` que l'écran doit penser à
 * afficher. Les messages passent par i18next (aucune string en dur).
 */
export function useMutationToast() {
  const { t } = useTranslation();
  const toast = useToast();

  return {
    onSuccess: (key: string, values?: Record<string, string>) =>
      toast.success(t(key, values ?? {})),
    // L'app a décidé quelque chose à la place de l'utilisateur (date recalée, valeur normalisée) :
    // ça se signale, sinon l'écran change « tout seul » sans explication.
    onInfo: (key: string, values?: Record<string, string>) => toast.info(t(key, values ?? {})),
    // Le message de l'API est déjà actionnable (« La date ne tombe pas dans la semaine 2 ») ;
    // on ne retombe sur le message générique que s'il n'y en a pas (panne réseau, 500 muet).
    onError: (error: unknown) => toast.error(apiErrorMessage(error) ?? t("common.error")),
  };
}
