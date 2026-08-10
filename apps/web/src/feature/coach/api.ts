import { createAccountApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

/**
 * Le versant ATHLÈTE de la relation : « mon coach ». Le versant coach (« mes athlètes ») vit dans
 * `feature/athlete/`, et la symétrie des noms est voulue — chaque feature est nommée d'après ce
 * qu'elle donne à voir, pas d'après qui la regarde.
 *
 * Routes et clés viennent de `@cmv/shared` (le mobile appelle exactement les mêmes) ; ne reste ici
 * que l'injection du client web.
 */
export const accountApi = createAccountApi(api);

export { coachKeys } from "@cmv/shared";
