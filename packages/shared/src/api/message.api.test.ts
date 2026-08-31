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

    await messages.openConversation({ athleteId: "ath_1" }, null);
    await messages.openConversation({}, null);

    expect(calls).toEqual([
      { method: "POST", path: "/conversations", body: { athleteId: "ath_1" } },
      { method: "POST", path: "/conversations", body: {} },
    ]);
  });

  it("lit et envoie les messages d'un fil", async () => {
    const { api, calls } = spyClient();
    const messages = createMessageApi(api);

    await messages.listConversations(null);
    await messages.getMessages("cnv_1", null);
    await messages.sendMessage("cnv_1", { type: "TEXT", content: "Salut" }, null);

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
    await createMessageApi(api).markRead("cnv_1", null);

    expect(calls).toEqual([{ method: "POST", path: "/conversations/cnv_1/read", body: {} }]);
  });
});

describe("createMessageApi — titre exercé", () => {
  /**
   * Un compte à double capacité a des fils des DEUX côtés : coach avec ses athlètes, athlète avec
   * son coach. Toutes les routes de messagerie portent donc le titre, pas seulement la liste —
   * le scope tenant filtre `coachId` ou `athleteId` jusque dans le contenu d'un fil.
   */
  it("porte le titre sur toutes les routes du fil", async () => {
    const { api, calls } = spyClient();
    const messages = createMessageApi(api);

    await messages.listConversations("coach");
    await messages.openConversation({ athleteId: "ath_1" }, "coach");
    await messages.getMessages("cnv_1", "athlete");
    await messages.sendMessage("cnv_1", { type: "TEXT", content: "Salut" }, "athlete");
    await messages.markRead("cnv_1", "athlete");

    expect(calls.map((c) => c.path)).toEqual([
      "/conversations?as=coach",
      "/conversations?as=coach",
      "/conversations/cnv_1/messages?as=athlete",
      "/conversations/cnv_1/messages?as=athlete",
      "/conversations/cnv_1/read?as=athlete",
    ]);
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
    expect(messageKeys.conversations(null)[0]).toBe(root);
    expect(messageKeys.conversationWith("ath_1")[0]).toBe(root);
    expect(messageKeys.myConversation()[0]).toBe(root);
    expect(messageKeys.thread("cnv_1", null)[0]).toBe(root);
  });

  /**
   * Le fil de l'athlète ne peut PAS emprunter `conversationWith` : il n'a pas d'`athleteId` à
   * donner (c'est lui, l'athlète). Une clé à part évite qu'un identifiant vide se confonde avec
   * le fil d'un athlète réel.
   */
  it("distingue le fil de l'athlète d'un fil ciblé par le coach", () => {
    expect(messageKeys.myConversation()).not.toEqual(messageKeys.conversationWith(""));
    expect(messageKeys.myConversation()).not.toEqual(messageKeys.conversations(null));
  });

  /**
   * Le MÊME fil lu à deux titres n'est pas le même contenu : le scope tenant filtre sur une
   * colonne différente. Confondre les deux clés servirait le cache de l'un à l'autre.
   */
  it("sépare un fil selon le titre auquel il est lu", () => {
    expect(messageKeys.thread("cnv_1", "coach")).not.toEqual(
      messageKeys.thread("cnv_1", "athlete"),
    );
    expect(messageKeys.conversations("coach")).not.toEqual(messageKeys.conversations("athlete"));
  });

  it("sépare les fils entre eux", () => {
    expect(messageKeys.thread("cnv_1", null)).not.toEqual(messageKeys.thread("cnv_2", null));
    expect(messageKeys.conversationWith("a")).not.toEqual(messageKeys.conversationWith("b"));
  });
});
