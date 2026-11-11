import { z } from "zod";

/**
 * Zod sans compilation de code, dans les trois couches (#780).
 *
 * Zod 4 compile ses schémas d'objets en JavaScript par `new Function`, après avoir sondé
 * `Function("")`. Sous la CSP du web, sans `'unsafe-eval'`, la sonde échoue et Zod retombe de
 * lui-même sur l'interprétation : rien ne casse. Mais en `Report-Only` elle RÉUSSIT, et chaque
 * sonde comme chaque compilation part chez Sentry en violation `script-src` : 89 rapports sur les
 * seize parcours Playwright, de quoi noyer le cycle d'observation.
 *
 * ICI, et non dans le web : le mode se fige à la DÉFINITION de chaque schéma, pas à sa première
 * validation (`$ZodObject`, `zod/v4/core/schemas.js`) — et nos schémas se définissent au chargement
 * de ce paquet. Le bundler du web range Zod et ce paquet dans un chunk commun, évalué en entier
 * avant le chunk d'entrée : un réglage posé par l'app arrivait après eux (mesuré). Premier module
 * du barrel, il passe avant le premier schéma, où que le bundler range le reste.
 *
 * Pour l'API et le mobile aussi, la configuration étant globale : leurs schémas valident des
 * requêtes et des formulaires de quelques champs, où la compilation ne fait rien gagner.
 */
z.config({ jitless: true });
