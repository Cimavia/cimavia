import { describe, expect, it } from "vitest";
import {
  athleteKeys,
  coachKeys,
  counterpartKeys,
  createAccountApi,
  invitationKeys,
} from "./account.api";
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

describe("createAccountApi — moitié coach", () => {
  it("liste ses athlètes et leurs invitations", async () => {
    const { api, calls } = spyClient();
    const account = createAccountApi(api);

    await account.listAthletes();
    await account.listInvitations();
    await account.createInvitation({ email: "lea@example.test" });

    expect(calls).toEqual([
      { method: "GET", path: "/athletes", body: undefined },
      { method: "GET", path: "/invitations", body: undefined },
      { method: "POST", path: "/invitations", body: { email: "lea@example.test" } },
    ]);
  });

  // PUT et non PATCH : la fiche est UN champ texte libre, remplacé en entier à chaque
  // enregistrement. Il n'y a rien à fusionner.
  it("lit et remplace la fiche d'un athlète", async () => {
    const { api, calls } = spyClient();
    const account = createAccountApi(api);

    await account.getAthleteSheet("ath_1");
    await account.saveAthleteSheet("ath_1", { content: "Épaule droite sensible." });

    expect(calls).toEqual([
      { method: "GET", path: "/athletes/ath_1/sheet", body: undefined },
      {
        method: "PUT",
        path: "/athletes/ath_1/sheet",
        body: { content: "Épaule droite sensible." },
      },
    ]);
  });
});

describe("createAccountApi — moitié athlète", () => {
  /**
   * Deux chemins DIFFÉRENTS pour la même ligne `CoachAthlete`, lue par ses deux bouts : le coach
   * liste ses athlètes, l'athlète demande son coach. Ce n'est pas une route à facteur commun — le
   * scope tenant ne saurait pas dans quel sens répondre.
   */
  it("demande son coach sur une route qui lui est propre", async () => {
    const { api, calls } = spyClient();
    await createAccountApi(api).myCoach();

    expect(calls).toEqual([{ method: "GET", path: "/me/coach", body: undefined }]);
  });

  it("rejoint un coach en postant le code d'invitation", async () => {
    const { api, calls } = spyClient();
    await createAccountApi(api).acceptInvitation({ code: "7K9M2Q" });

    expect(calls).toEqual([
      { method: "POST", path: "/invitations/accept", body: { code: "7K9M2Q" } },
    ]);
  });
});

describe("createAccountApi — les deux côtés à la fois", () => {
  // Un GET nu, sans paramètre de titre : la route ne demande à choisir aucun espace, c'est ce qui
  // permet à la navigation de l'appeler avant de savoir lequel elle affiche (#198).
  it("demande ses contreparties sans exercer de capacité", async () => {
    const { api, calls } = spyClient();
    await createAccountApi(api).myCounterparts();

    expect(calls).toEqual([{ method: "GET", path: "/me/counterparts", body: undefined }]);
  });
});

describe("clés de cache", () => {
  /**
   * Trois racines DISTINCTES, et c'est volontaire : créer une invitation ne doit pas périmer la
   * fiche d'un athlète, ni rejoindre un coach faire retomber la liste d'athlètes d'un autre compte.
   * Une racine commune rendrait chaque invalidation plus large que son effet.
   */
  it("ne partagent pas de racine entre les quatre ressources", () => {
    const roots = [
      athleteKeys.all[0],
      invitationKeys.all[0],
      coachKeys.all[0],
      counterpartKeys.all[0],
    ];
    expect(new Set(roots).size).toBe(roots.length);
  });

  it("préfixent leurs entrées par leur propre racine", () => {
    expect(athleteKeys.list()[0]).toBe(athleteKeys.all[0]);
    expect(athleteKeys.sheet("ath_1")[0]).toBe(athleteKeys.all[0]);
    expect(invitationKeys.list()[0]).toBe(invitationKeys.all[0]);
    expect(coachKeys.mine()[0]).toBe(coachKeys.all[0]);
    expect(counterpartKeys.mine()[0]).toBe(counterpartKeys.all[0]);
  });

  // La fiche est scopée par athlète : deux athlètes ne doivent jamais partager une entrée de cache.
  it("sépare les fiches par athlète", () => {
    expect(athleteKeys.sheet("ath_1")).not.toEqual(athleteKeys.sheet("ath_2"));
  });
});
