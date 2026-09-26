import { describe, expect, it } from "vitest";
import { authClient, recheckSession } from "./auth";

describe("recheckSession", () => {
  it("bascule le signal que Better Auth écoute pour relire la session", () => {
    // Pas d'espion : `authClient` est un proxy qui refuse `vi.spyOn`. On lit l'atome lui-même.
    const signal = authClient.$store.atoms.$sessionSignal;
    const before = signal?.get();

    recheckSession();

    // C'est ce signal, et lui seul, qui remet à jour tous les `useSession()` montés — dont celui
    // de la garde, qui pose alors la fenêtre de reconnexion (#336).
    expect(signal?.get()).toBe(!before);
  });
});
