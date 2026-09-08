import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * Les trois « managers » globaux de better-auth, neutralisés AVANT qu'ils ne s'installent — même
 * garde que le harnais web, et pour la même raison : le mobile construit son client avec
 * `createAuthClient` de `better-auth/react`, donc le même atome de session, et il rend lui aussi
 * sous jsdom.
 *
 * Leur `setup()` vérifie `typeof window` / `typeof document`, mais la fonction de nettoyage qu'il
 * REND les lit sans garde. Or nanostores programme ce nettoyage À RETARDEMENT (~1 s) au départ du
 * dernier abonné — donc au `cleanup()` plus bas. Une seconde après, le fichier est fini, jsdom est
 * démonté, et la fermeture lève hors de tout test : la suite échoue alors que tout est vert.
 *
 * Posé ici par PRÉVENTION : le défaut s'est manifesté côté web (suite plus lente), jamais encore
 * ici. Les trois singletons vivant sur `globalThis` par `Symbol.for`, ils survivent au démontage et
 * traversent les fichiers — l'erreur accuse alors le fichier qui tourne, jamais celui qui l'a
 * programmée, et devient très coûteuse à retrouver. Rien n'est perdu : ces trois-là ne réagissent
 * qu'à un changement d'onglet, de focus ou de connexion, qu'aucun test n'exerce.
 */
const inertAuthManager = { subscribe: () => () => {}, setup: () => () => {} };
const authGlobals = globalThis as Record<symbol, unknown>;
authGlobals[Symbol.for("better-auth:broadcast-channel")] = { ...inertAuthManager, post: () => {} };
authGlobals[Symbol.for("better-auth:focus-manager")] = {
  ...inertAuthManager,
  setFocused: () => {},
};
authGlobals[Symbol.for("better-auth:online-manager")] = {
  ...inertAuthManager,
  isOnline: true,
  setOnline: () => {},
};

/**
 * `AsyncStorage` remplacé par une Map, pour TOUS les tests du mobile.
 *
 * Posé dans le harnais et non fichier par fichier : le vrai module est natif, et un test qui
 * l'atteindrait échouerait sur un pont React Native absent — un échec qui ne dirait rien du code
 * testé. Le mock ici est une garantie, pas une commodité locale.
 *
 * La Map est vidée avant CHAQUE test : sans ça, un suivi écrit par un test se relirait dans le
 * suivant, qui passerait pour de mauvaises raisons.
 */
const { store, asyncStorage } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    asyncStorage: {
      getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    },
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({ default: asyncStorage }));

/**
 * `@sentry/react-native` remplacé pour TOUS les tests, même raison que ci-dessus : c'est un module
 * natif, et tout fichier testé qui traverse cet import échouerait sur un pont React Native absent.
 * Un échec de ce genre ne dirait rien du code testé.
 *
 * `wrap` rend le composant tel quel — sa version réelle l'enveloppe d'instrumentation, ce qui
 * ajouterait un niveau à l'arbre rendu et déplacerait les assertions des tests d'écran.
 */
vi.mock("@sentry/react-native", () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  wrap: <T>(component: T) => component,
}));

/** Ce que le disque contient — pour affirmer sur ce qui a été PERSISTÉ, pas sur l'état du hook. */
export const storedItems = store;
export const asyncStorageMock = asyncStorage;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

/**
 * Sans `globals: true` — les tests du monorepo importent `describe`/`it`/`expect` explicitement —
 * Testing Library ne trouve aucun `afterEach` global et ne démonte donc RIEN toute seule. Deux
 * tests d'un même fichier partageraient alors le même DOM, et le second lirait l'écran laissé par
 * le premier. Ce n'est pas théorique : c'est exactement ce qui a fait passer un `getAllByText()[0]`
 * sur le bouton du test PRÉCÉDENT pendant la mise au point de ce harnais.
 */
afterEach(() => {
  cleanup();
});
