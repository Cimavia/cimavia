import { setupE2eApp } from "./support/app";

/**
 * L'entrée de la suite d'isolation : elle monte l'app, vide la base, puis charge chaque domaine de
 * `isolation/` (#625).
 *
 * UN fichier de spec et non un par domaine, par mesure : chaque fichier de spec réimporte le graphe
 * d'`AppModule` dans un contexte neuf, soit ≈ 1,4 s, et seize domaines coûtaient ≈ 20 s de plus au
 * job E2E. `isolate: false` aurait gardé l'import, mais partagé le cache de modules avec
 * `signup-mode.e2e-spec.ts`, qui a besoin d'un `AppModule` évalué sous SON environnement.
 *
 * Le glob charge TOUT `isolation/*.ts` : un domaine ajouté n'a rien à déclarer ici, et ne peut pas
 * être oublié. Ses règles :
 * - aucun hook de niveau fichier (`beforeAll`, `beforeEach`…) — il vaudrait pour tous les domaines ;
 *   les hooks vivent dans les `describe` ;
 * - des adresses à soi : la base n'est vidée qu'une fois, pour tous ;
 * - le harnais (`support/`) porte les acteurs et les données de base, un domaine n'en recopie rien.
 *
 * Lancer un seul domaine : `-t "<début du titre>"` — le chemin d'un module ne marche pas, ce n'est
 * pas une spec. `-t` est une REGEX : un titre copié avec son « (#44) » n'attrape rien, et la suite
 * passe en vert sans avoir rien lancé. On s'arrête donc avant la parenthèse.
 */
setupE2eApp();
import.meta.glob("./isolation/*.ts", { eager: true });
