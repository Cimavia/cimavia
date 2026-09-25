import { resolveUsableSignedUrl } from "@cmv/shared";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { signedUrlKeeper } from "@/shared/lib/signed-url";

/**
 * De quoi obtenir une URL de média réellement ouvrable, en re-signant quand celle qu'on garde ne
 * l'est plus (#151, #304).
 *
 * POURQUOI ce détour. Les URLs de lecture sont signées 5 min et « périmé » ne veut PAS dire
 * « redemandé » : TanStack ne recharge que sur un déclencheur. Un coach qui reste six minutes sur
 * un débrief n'en produit aucun. Et depuis #304 une URL peut être GARDÉE d'une réponse à l'autre :
 * l'âge de la requête ne dit plus celui de l'URL — c'est la table qui le sait, média par média.
 * Ouvrir sans vérifier enverrait l'utilisateur sur la réponse 403 du storage, en XML brut.
 *
 * C'est l'écran qui dit QUOI recharger, pas la table : un même message se lit dans le fil ET sous
 * le débrief qu'il commente — deux requêtes, et seule la surface sait laquelle elle affiche.
 *
 * `null` en retour = re-signature impossible (hors réseau, API en panne, média retiré). L'appelant
 * ne doit PAS ouvrir : mieux vaut un message clair qu'une page d'erreur du storage.
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
