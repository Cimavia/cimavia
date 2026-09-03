import {
  type CounterpartsDto,
  counterpartKeys,
  createAccountApi,
  UNKNOWN_COUNTERPARTS,
} from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";

// Dans `shared/` et non dans une feature : la navigation des DEUX espaces en dépend, et aucune des
// deux moitiés de la relation (`feature/athlete`, `feature/coach`) ne la possède plus que l'autre.
const accountApi = createAccountApi(api);

/**
 * A-t-on quelqu'un en face, de chaque côté ? (#198)
 *
 * Rend `UNKNOWN_COUNTERPARTS` tant que la réponse n'est pas là, et **c'est le point** : « pas encore
 * su » ne vaut jamais « absent ». Rendre `{ false, false }` pendant le chargement ferait disparaître
 * l'entrée messagerie à chaque démarrage à froid, le temps d'un aller-retour.
 *
 * Pas de sondage : la relation ne se noue ni ne se dénoue pendant qu'on regarde la barre latérale.
 * Un athlète qui rejoint son coach invalide tout le cache (`useAcceptInvitation`) ; côté coach,
 * c'est le `staleTime` ci-dessous qui fait apparaître l'entrée.
 *
 * `staleTime: 0`, contre les 60 s par défaut du client : c'est la seule requête dont dépend la
 * NAVIGATION, et une nav fausse pendant une minute vaut bien plus cher que deux `COUNT`. Avec les
 * 60 s, un coach dont l'athlète venait d'accepter l'invitation devait recharger la page pour voir
 * sa messagerie apparaître — un retour de bêta, pas une hypothèse. Le refetch part désormais au
 * montage et au retour sur l'onglet (`refetchOnWindowFocus`, défaut TanStack) ; toujours aucun
 * sondage, rien ne bouge quand personne ne regarde.
 */
export function useCounterparts(): CounterpartsDto {
  const { data } = useQuery<CounterpartsDto>({
    queryKey: counterpartKeys.mine(),
    queryFn: accountApi.myCounterparts,
    staleTime: 0,
  });
  return data ?? UNKNOWN_COUNTERPARTS;
}
