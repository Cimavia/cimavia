import { describe, expect, it } from "vitest";
import { MediaType } from "../dto/feedback.schema";
import { createAthleteFeedbackApi, myFeedbackKeys } from "./athlete-feedback.api";
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

describe("createAthleteFeedbackApi", () => {
  /**
   * PUT et non POST : le débrief est idempotent et se complète en plusieurs fois (texte puis
   * médias, ou l'inverse). Un POST créerait un second débrief là où le modèle en impose UN par
   * séance (`scheduledSessionId` unique).
   */
  it("lit et écrit le débrief sur la même route, en PUT", async () => {
    const { api, calls } = spyClient();
    const feedback = createAthleteFeedbackApi(api);

    await feedback.get("ss_1");
    await feedback.upsert("ss_1", { content: "Bien tenu." });

    expect(calls).toEqual([
      { method: "GET", path: "/me/scheduled-sessions/ss_1/feedback", body: undefined },
      {
        method: "PUT",
        path: "/me/scheduled-sessions/ss_1/feedback",
        body: { content: "Bien tenu." },
      },
    ]);
  });

  /**
   * Le flux média en TROIS temps, dans l'ordre : signer, envoyer au bucket (hors de ce module),
   * rattacher. Le binaire ne passe jamais par l'API — la deuxième étape n'apparaît donc pas ici,
   * et c'est le signe que le contrat est respecté.
   */
  it("signe puis rattache un média, sur deux routes distinctes", async () => {
    const { api, calls } = spyClient();
    const feedback = createAthleteFeedbackApi(api);

    await feedback.requestMediaUploadUrl("ss_1", {
      type: MediaType.IMAGE,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    await feedback.attachMedia("ss_1", {
      type: MediaType.IMAGE,
      storagePath: "feedback/abc.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /me/scheduled-sessions/ss_1/feedback/media/upload-url",
      "POST /me/scheduled-sessions/ss_1/feedback/media",
    ]);
  });

  it("supprime un média par son id", async () => {
    const { api, calls } = spyClient();
    await createAthleteFeedbackApi(api).deleteMedia("ss_1", "med_9");

    expect(calls).toEqual([
      {
        method: "DELETE",
        path: "/me/scheduled-sessions/ss_1/feedback/media/med_9",
        body: undefined,
      },
    ]);
  });
});

describe("myFeedbackKeys", () => {
  /**
   * La racine ne doit pas être celle du coach (`["feedbacks", …]` côté web, pour `/feedbacks`).
   * Un singulier contre un pluriel « marcherait » tant qu'un rôle exclut l'autre, et deviendrait
   * un bug silencieux avec la double capacité (#7) — même piège que les clés de séance.
   */
  it("n'emprunte pas la racine de la surface coach", () => {
    expect(myFeedbackKeys.all[0]).not.toBe("feedbacks");
    expect(myFeedbackKeys.all[0]).not.toBe("feedback");
  });

  it("sépare les débriefs par séance", () => {
    expect(myFeedbackKeys.detail("ss_1")[0]).toBe(myFeedbackKeys.all[0]);
    expect(myFeedbackKeys.detail("ss_1")).not.toEqual(myFeedbackKeys.detail("ss_2"));
  });
});
