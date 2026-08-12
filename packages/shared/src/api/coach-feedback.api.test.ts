import { describe, expect, it } from "vitest";
import { myFeedbackKeys } from "./athlete-feedback.api";
import type { ApiClient } from "./client";
import { coachFeedbackKeys, createCoachFeedbackApi } from "./coach-feedback.api";

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

describe("createCoachFeedbackApi", () => {
  /**
   * Les routes du COACH ne sont pas sous `/me` : c'est `CoachFeedbackController`
   * (`@Roles([COACH])`), pas `SessionFeedbackController` (`@Roles([ATHLETE])`). Même entité, deux
   * surfaces — s'y tromper donne un 403, pas une liste vide.
   */
  it("lit les débriefs reçus hors de la surface /me", async () => {
    const { api, calls } = spyClient();
    const feedbacks = createCoachFeedbackApi(api);

    await feedbacks.list();
    await feedbacks.getBySession("ss_1");

    expect(calls).toEqual([
      { method: "GET", path: "/feedbacks", body: undefined },
      { method: "GET", path: "/scheduled-sessions/ss_1/feedback", body: undefined },
    ]);
  });

  /**
   * Le marquage est une ROUTE, pas un effet de bord de la lecture : `coachReadAt` repasse à `null`
   * quand l'athlète complète son débrief, donc « lu » doit vouloir dire lu — un rendu ne suffit pas
   * à le décider.
   */
  it("marque lu par POST sur l'id du débrief", async () => {
    const { api, calls } = spyClient();
    await createCoachFeedbackApi(api).markRead("fb_1");

    expect(calls).toEqual([{ method: "POST", path: "/feedbacks/fb_1/read", body: undefined }]);
  });
});

describe("coachFeedbackKeys", () => {
  // Les deux surfaces de la même entité ne doivent pas partager de racine : un singulier contre un
  // pluriel casserait en silence dès qu'un compte porte les deux capacités (#7).
  it("n'emprunte pas la racine de la surface athlète", () => {
    expect(coachFeedbackKeys.all[0]).not.toBe(myFeedbackKeys.all[0]);
  });

  it("préfixe ses entrées par sa propre racine", () => {
    expect(coachFeedbackKeys.list()[0]).toBe(coachFeedbackKeys.all[0]);
    expect(coachFeedbackKeys.bySession("ss_1")[0]).toBe(coachFeedbackKeys.all[0]);
    expect(coachFeedbackKeys.bySession("ss_1")).not.toEqual(coachFeedbackKeys.bySession("ss_2"));
  });
});
