import { type CounterpartsDto, counterpartKeys, UNKNOWN_COUNTERPARTS } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { accountApi } from "@/feature/account/api";

/**
 * A-t-on quelqu'un en face, de chaque côté ? (#198)
 *
 * Dans `feature/account/` et non dans `feature/message/` : la barre d'onglets la lit, et `app/` ne
 * doit importer que des shells. C'est aussi une donnée du COMPTE — ni du coach ni de l'athlète —,
 * au même titre que ses capacités.
 *
 * Rend `UNKNOWN_COUNTERPARTS` tant que la réponse n'est pas là : « pas encore su » ne vaut jamais
 * « absent », et un onglet qui disparaît au démarrage à froid vaut bien pire qu'un onglet qui
 * apparaît. La constante vit dans `@cmv/shared` — le web fait le même pari, et deux copies
 * divergeraient en silence.
 */
export function useCounterparts(): CounterpartsDto {
  const { data } = useQuery<CounterpartsDto>({
    queryKey: counterpartKeys.mine(),
    queryFn: accountApi.myCounterparts,
  });
  return data ?? UNKNOWN_COUNTERPARTS;
}
