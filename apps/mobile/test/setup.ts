import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

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
