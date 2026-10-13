import { useMutationToast } from "@/shared/hook/useMutationToast";
import { isStaleWriteError } from "@/shared/lib/api";

/**
 * Un geste SANS SAISIE refusé sur une version périmée (#604) — glisser, coller, diffuser,
 * supprimer : rien n'est à sauver, l'écran se relit et le toast dit pourquoi il a changé. Toute
 * autre erreur se dit telle quelle. Le bandeau « Recharger » reste aux formulaires, qui ont une
 * saisie à garder.
 */
export function useStaleWriteError(messageKey: string, reload: () => Promise<unknown>) {
  const toast = useMutationToast();
  return async (error: unknown) => {
    if (!isStaleWriteError(error)) {
      toast.onError(error);
      return;
    }
    toast.onFailure(messageKey, error);
    await reload();
  };
}
