import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Sans `globals: true` — les tests du monorepo importent `describe`/`it`/`expect` explicitement —
 * Testing Library ne trouve aucun `afterEach` global et ne démonte donc RIEN toute seule. Deux
 * tests d'un même fichier partageraient alors le même DOM, et le second lirait l'écran laissé par
 * le premier : une suite verte qui décrit un état n'ayant jamais existé.
 */
afterEach(() => {
  cleanup();
});
