import { createFormatters } from "@cmv/shared";
import i18n from "@/shared/lib/i18n";

/**
 * Le point UNIQUE où la locale du web entre dans les formateurs de `@cmv/shared`.
 *
 * Les formateurs du paquet prennent leur `locale` en dernier paramètre pour rester purs. Injectée
 * appel par appel, cette ligne se réécrivait pour chacun d'eux, dans chaque app — la duplication
 * que #137 vient fermer. Elle ne s'écrit plus qu'ici.
 *
 * `date.util.ts` et `money.util.ts` n'en sont plus que des tranches nommées : leurs noms d'export
 * n'ont pas bougé, donc aucun de leurs vingt appelants n'a eu à changer.
 */
export const formatters = createFormatters(
  () => i18n.language,
  (key, params) => i18n.t(key, params),
);
