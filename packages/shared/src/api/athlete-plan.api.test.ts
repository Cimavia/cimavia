import { describe, expect, it } from "vitest";
import { createAthletePlanApi, myPlanKeys } from "./athlete-plan.api";
import type { ApiClient } from "./client";

// Client factice : on n'exerce pas le réseau ici (c'est le rôle des e2e), mais le CONTRAT —
// quel verbe sur quel chemin. C'est ce qui casse en silence quand une route bouge côté API.
function spyClient() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record =
    (method: string) =>
    <T>(path: string, body?: unknown) => {
      calls.push({ method, path, body });
      return Promise.resolve(undefined as T);
    };
  const api: ApiClient = {
    get: record("GET"),
    post: record("POST"),
    patch: record("PATCH"),
    put: record("PUT"),
    delete: record("DELETE"),
  };
  return { api, calls };
}

describe("createAthletePlanApi", () => {
  /**
   * Les deux routes sont sous `/me` et non sous `/plans` : ce sont celles d'`AthletePlanController`,
   * gardées `@Roles([ATHLETE])`. La surface coach est un autre contrôleur, avec d'autres droits —
   * s'y tromper donnerait un 403, pas une liste vide.
   */
  it("lit le cycle courant et une séance sous /me", async () => {
    const { api, calls } = spyClient();
    const plans = createAthletePlanApi(api);

    await plans.current();
    await plans.session("ss_123");

    expect(calls).toEqual([
      { method: "GET", path: "/me/plan", body: undefined },
      { method: "GET", path: "/me/scheduled-sessions/ss_123", body: undefined },
    ]);
  });

  // Aucune écriture : le cycle appartient au coach. Le seul geste de l'athlète est le débrief, qui
  // vit dans sa propre surface.
  it("n'expose que de la lecture", () => {
    const { api } = spyClient();
    expect(Object.keys(createAthletePlanApi(api)).sort()).toEqual(["current", "session"]);
  });
});

describe("myPlanKeys", () => {
  /**
   * LA raison d'être de cette racine : elle ne doit pas être celle du coach. `scheduled-sessions`
   * désigne `/scheduled-sessions/:id` côté builder ; ici c'est `/me/scheduled-sessions/:id`. Deux
   * routes, deux gardes, deux contenus — partager une clé marcherait tant qu'un rôle exclut
   * l'autre, et deviendrait un bug silencieux avec la double capacité (#7).
   */
  it("n'emprunte pas les racines de la surface coach", () => {
    expect(myPlanKeys.all[0]).not.toBe("plans");
    expect(myPlanKeys.all[0]).not.toBe("scheduled-sessions");
  });

  // Racine unique : le détail d'une séance est un zoom sur le cycle, pas une autre ressource. Une
  // invalidation de `all` doit faire tomber les deux — c'est ce dont le débrief a besoin.
  it("range le cycle et ses séances sous la même racine", () => {
    expect(myPlanKeys.current()[0]).toBe(myPlanKeys.all[0]);
    expect(myPlanKeys.session("ss_1")[0]).toBe(myPlanKeys.all[0]);
  });

  it("sépare les séances entre elles", () => {
    expect(myPlanKeys.session("ss_1")).not.toEqual(myPlanKeys.session("ss_2"));
  });
});
