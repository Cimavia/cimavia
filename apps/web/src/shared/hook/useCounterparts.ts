import { type CounterpartsDto, counterpartKeys, createAccountApi } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";
import { UNKNOWN_COUNTERPARTS } from "@/shared/lib/nav";

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
 * Un athlète qui rejoint son coach invalide tout le cache (`useAcceptInvitation`) ; côté coach, le
 * retour au premier plan suffit à faire apparaître l'entrée après l'acceptation d'une invitation.
 */
export function useCounterparts(): CounterpartsDto {
  const { data } = useQuery<CounterpartsDto>({
    queryKey: counterpartKeys.mine(),
    queryFn: accountApi.myCounterparts,
  });
  return data ?? UNKNOWN_COUNTERPARTS;
}
