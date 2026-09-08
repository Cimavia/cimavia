import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Les trois « managers » globaux de better-auth, neutralisés AVANT qu'ils ne s'installent.
 *
 * Tous trois ont la même garde asymétrique : leur `setup()` vérifie bien `typeof window` ou
 * `typeof document`, mais la fonction de nettoyage qu'il REND les lit sans garde —
 * `window.removeEventListener` dans `broadcast-channel.mjs`, `document.removeEventListener` dans
 * `focus-manager.mjs`, idem dans `online-manager.mjs`. Dans un navigateur c'est sans conséquence ;
 * ici, non.
 *
 * Car ce nettoyage n'est pas appelé au démontage : nanostores le programme À RETARDEMENT (~1 s)
 * quand le dernier abonné de l'atome de session s'en va — donc au `cleanup()` ci-dessous. Une
 * seconde plus tard le fichier est fini, jsdom est démonté, et la fermeture lève un
 * `ReferenceError` HORS de tout test : la suite échoue alors que chaque test est vert.
 *
 * Les trois étant des singletons posés sur `globalThis` par `Symbol.for`, ils survivent au
 * démontage de l'environnement et traversent les fichiers — d'où une erreur imputée au fichier qui
 * tourne à l'instant du minuteur, jamais à celui qui l'a programmé. C'est ce qui rendait le défaut
 * illisible, et pourquoi le corriger fichier par fichier ne menait nulle part.
 *
 * On pose donc les nôtres en premier : chaque `getGlobalX` rend celui qui est déjà là. Rien n'est
 * perdu — ces trois-là ne servent qu'à rafraîchir la session sur un changement d'ONGLET, de FOCUS
 * ou de CONNEXION, trois événements qu'aucun test n'exerce et que jsdom ne produit pas.
 */
const inert = { subscribe: () => () => {}, setup: () => () => {} };
const globals = globalThis as Record<symbol, unknown>;
globals[Symbol.for("better-auth:broadcast-channel")] = { ...inert, post: () => {} };
globals[Symbol.for("better-auth:focus-manager")] = { ...inert, setFocused: () => {} };
globals[Symbol.for("better-auth:online-manager")] = {
  ...inert,
  isOnline: true,
  setOnline: () => {},
};

/**
 * Sans `globals: true` — les tests du monorepo importent `describe`/`it`/`expect` explicitement —
 * Testing Library ne trouve aucun `afterEach` global et ne démonte donc RIEN toute seule. Deux
 * tests d'un même fichier partageraient alors le même DOM, et le second lirait l'écran laissé par
 * le premier : une suite verte qui décrit un état n'ayant jamais existé.
 */
afterEach(() => {
  cleanup();
});
