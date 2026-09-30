/**
 * Une origine sans ses barres obliques finales — « https://app.cimavia.fr/ » → « https://app.cimavia.fr ».
 *
 * L'entrée est une variable d'environnement copiée à la main (`WEB_URL`, `EXPO_PUBLIC_WEB_URL`), à
 * laquelle on colle ensuite un chemin : sans ce nettoyage, `…/` + `/register` produirait un
 * `//register` que le routeur web ignore.
 *
 * Une boucle et non `/\/+$/` : la regex est linéaire en pratique, mais Sonar la signale (S8786)
 * pour son backtracking, et elle était recopiée à l'identique dans trois fichiers (#504).
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}
