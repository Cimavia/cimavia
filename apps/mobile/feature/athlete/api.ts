import { createAccountApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

/**
 * Le versant COACH de la relation : « mes athlètes ». Le versant athlète (« mon coach ») vit dans
 * `feature/coach/`, et la symétrie des noms est voulue — chaque feature est nommée d'après ce
 * qu'elle donne à voir, pas d'après qui la regarde. Même découpage que côté web.
 *
 * Routes et clés viennent de `@cmv/shared` (#28) ; ne reste ici que l'injection du client mobile.
 */
export const accountApi = createAccountApi(api);

export { athleteKeys, invitationKeys } from "@cmv/shared";
