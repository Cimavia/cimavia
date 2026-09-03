/**
 * Ce que `t()` a rendu, ou un texte de secours quand i18next n'a rien résolu.
 *
 * i18next rend **la clé elle-même** quand il ne trouve pas de traduction — catalogue absent,
 * instance non initialisée, ressource qui a échoué à charger. Dans 99 % de l'app c'est sans
 * conséquence : si i18next est cassé, plus rien ne s'affiche correctement de toute façon, et
 * `check:i18n` garde l'existence des clés en amont.
 *
 * L'exception est l'écran de crash, le seul écran dont le travail est de fonctionner QUAND le
 * reste ne fonctionne plus. Sans ce repli il afficherait `common.crash.title` en toutes lettres —
 * un écran de panne qui a l'air en panne, à l'utilisateur qui vient déjà d'en subir une.
 *
 * La comparaison porte sur la CLÉ exacte et non sur une forme (« ça ressemble à un chemin
 * pointé ») : une traduction qui vaudrait légitimement la même chaîne que sa clé est absurde, mais
 * une heuristique de préfixe, elle, se tromperait sur des clés voisines sans qu'on le voie.
 *
 * @param translated ce que `t(key)` a rendu
 * @param key la clé passée à `t()` — littérale au point d'appel, pour que `check:i18n` la voie
 * @param fallback le texte en dur, dans la langue par défaut du produit
 */
export function translatedOr(translated: string, key: string, fallback: string): string {
  return translated === key ? fallback : translated;
}
