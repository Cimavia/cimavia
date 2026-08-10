import { describe, expect, it } from "vitest";
import type { ApiClient } from "./client";
import { createMessageApi, messageKeys } from "./message.api";

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

describe("createMessageApi", () => {
  /**
   * UNE route d'ouverture pour les deux rôles, distinguée par le seul corps : `athleteId` présent
   * = le coach cible un athlète, absent = l'athlète et l'API résout son coach. C'est ce qui permet
   * d'ouvrir la messagerie web à l'athlète sans toucher l'API (#29).
   */
  it("ouvre un fil sur la même route, avec ou sans athleteId", async () => {
    const { api, calls } = spyClient();
    const messages = createMessageApi(api);

    await messages.openConversation({ athleteId: "ath_1" });
    await messages.openConversation({});

    expect(calls).toEqual([
      { method: "POST", path: "/conversations", body: { athleteId: "ath_1" } },
      { method: "POST", path: "/conversations", body: {} },
    ]);
  });

  it("lit et envoie les messages d'un fil", async () => {
    const { api, calls } = spyClient();
    const messages = createMessageApi(api);

    await messages.listConversations();
    await messages.getMessages("cnv_1");
    await messages.sendMessage("cnv_1", { type: "TEXT", content: "Salut" });

    expect(calls).toEqual([
      { method: "GET", path: "/conversations", body: undefined },
      { method: "GET", path: "/conversations/cnv_1/messages", body: undefined },
      {
        method: "POST",
        path: "/conversations/cnv_1/messages",
        body: { type: "TEXT", content: "Salut" },
      },
    ]);
  });

  // Corps vide EXPLICITE : sans lui le client n'envoie pas de Content-Type, et l'API refuse un
  // POST sans corps déclaré.
  it("marque le fil lu par POST, avec un corps vide", async () => {
    const { api, calls } = spyClient();
    await createMessageApi(api).markRead("cnv_1");

    expect(calls).toEqual([{ method: "POST", path: "/conversations/cnv_1/read", body: {} }]);
  });
});

describe("messageKeys", () => {
  /**
   * UNE racine pour tout, et c'est ce qui rend l'invalidation après envoi correcte d'un seul
   * geste : un message change le fil (dernier message, non-lus) ET la liste. Le mobile tenait deux
   * racines et devait invalider deux fois — en pensant à chaque fois aux deux.
   */
  it("range fils et messages sous la même racine", () => {
    const root = messageKeys.all[0];
    expect(messageKeys.conversations()[0]).toBe(root);
    expect(messageKeys.conversationWith("ath_1")[0]).toBe(root);
    expect(messageKeys.myConversation()[0]).toBe(root);
    expect(messageKeys.thread("cnv_1")[0]).toBe(root);
  });

  /**
   * Le fil de l'athlète ne peut PAS emprunter `conversationWith` : il n'a pas d'`athleteId` à
   * donner (c'est lui, l'athlète). Une clé à part évite qu'un identifiant vide se confonde avec
   * le fil d'un athlète réel.
   */
  it("distingue le fil de l'athlète d'un fil ciblé par le coach", () => {
    expect(messageKeys.myConversation()).not.toEqual(messageKeys.conversationWith(""));
    expect(messageKeys.myConversation()).not.toEqual(messageKeys.conversations());
  });

  it("sépare les fils entre eux", () => {
    expect(messageKeys.thread("cnv_1")).not.toEqual(messageKeys.thread("cnv_2"));
    expect(messageKeys.conversationWith("a")).not.toEqual(messageKeys.conversationWith("b"));
  });
});
