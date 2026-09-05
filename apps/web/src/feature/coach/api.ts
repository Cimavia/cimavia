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

// `invitationKeys` sert aux DEUX bouts : la liste du coach (`feature/athlete`) et celle qui
// attend l'athlète (#146). Même racine, donc un refus périme les deux d'un coup.
export { coachKeys, invitationKeys } from "@cmv/shared";
