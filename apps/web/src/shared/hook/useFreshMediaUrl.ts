import { resolveUsableSignedUrl } from "@cmv/shared";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { signedUrlKeeper } from "@/shared/lib/signed-url";

/**
 * De quoi obtenir une URL ouvrable pour un média de la requête `queryKey`, en la re-signant si
 * celle qu'on garde a expiré (#304). La logique vit dans `@cmv/shared`
 * (`resolveUsableSignedUrl`) ; ce hook ne fait que dire QUOI recharger.
 *
 * C'est l'écran qui le dit, pas la table : un même message se lit dans le fil ET sous le débrief
 * qu'il commente — deux requêtes, et seule la surface sait laquelle elle affiche.
 */
export function useFreshMediaUrl(queryKey: QueryKey) {
  const queryClient = useQueryClient();

  return (mediaId: string): Promise<string | null> =>
    resolveUsableSignedUrl(
      signedUrlKeeper,
      mediaId,
      () => queryClient.refetchQueries({ queryKey, exact: true }),
      Date.now,
    );
}
