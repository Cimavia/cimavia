import type { EnvSchema } from "@cmv/shared";

/**
 * La documentation Swagger (`/docs`) est-elle publiée ?
 *
 * Elle décrit TOUTE la surface de l'API — chaque route, chaque champ attendu, chaque forme de
 * réponse — et elle ne demande aucune authentification pour être lue. Sur un environnement
 * joignable publiquement, c'est la carte remise à qui veut chercher une porte (#263).
 *
 * Le critère est `NODE_ENV`, et c'est un choix, pas une commodité : le NAS tourne une IMAGE, donc
 * `NODE_ENV=production`, avec `APP_ENV=development` comme simple label de tier. Conditionner sur
 * `APP_ENV` laisserait donc la carte ouverte exactement là où l'on vient de fermer la porte. Le
 * seul environnement qui la garde est celui qui tourne depuis les sources : ta machine.
 */
export function docsEnabled(nodeEnv: EnvSchema["NODE_ENV"]): boolean {
  return nodeEnv !== "production";
}
