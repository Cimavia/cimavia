import { afterEach, describe, expect, it } from "vitest";
import { authClient, holdSessionRecheck, recheckSession, releaseSessionRecheck } from "./auth";

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

describe("la suspension de la relecture", () => {
  const signal = authClient.$store.atoms.$sessionSignal;

  afterEach(releaseSessionRecheck);

  it("retient le signal tant qu'elle dure", () => {
    const before = signal?.get();
    holdSessionRecheck();

    recheckSession();

    expect(signal?.get()).toBe(before);
  });

  it("rattrape au relâchement la relecture retenue, une seule fois", () => {
    const before = signal?.get();
    holdSessionRecheck();
    recheckSession();
    recheckSession();

    releaseSessionRecheck();
    expect(signal?.get()).toBe(!before);

    releaseSessionRecheck();
    expect(signal?.get()).toBe(!before);
  });

  it("n'émet rien au relâchement si personne n'a demandé de relecture", () => {
    const before = signal?.get();
    holdSessionRecheck();

    releaseSessionRecheck();

    expect(signal?.get()).toBe(before);
  });
});
