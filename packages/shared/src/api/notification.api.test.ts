import { describe, expect, it } from "vitest";
import type { ApiClient } from "./client";
import { createNotificationApi, notificationKeys } from "./notification.api";

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

describe("createNotificationApi", () => {
  it("lit la liste et le compteur sur DEUX routes distinctes", async () => {
    const { api, calls } = spyClient();
    const notifications = createNotificationApi(api);

    await notifications.list();
    await notifications.unreadCount();

    expect(calls).toEqual([
      { method: "GET", path: "/me/notifications", body: undefined },
      { method: "GET", path: "/me/notifications/unread-count", body: undefined },
    ]);
  });

  it("marque une notification lue par PATCH sur son id", async () => {
    const { api, calls } = spyClient();
    await createNotificationApi(api).markRead("ntf_123");

    expect(calls).toEqual([
      { method: "PATCH", path: "/me/notifications/ntf_123/read", body: undefined },
    ]);
  });

  // Le corps vide est nécessaire : sans lui le client n'envoie pas de Content-Type, et Fastify
  // refuse un POST sans corps déclaré.
  it("solde tout par POST, avec un corps vide", async () => {
    const { api, calls } = spyClient();
    await createNotificationApi(api).markAllRead();

    expect(calls).toEqual([{ method: "POST", path: "/me/notifications/read-all", body: {} }]);
  });
});

describe("notificationKeys", () => {
  // Les deux clés doivent partager la racine : les mutations invalident `all`, et c'est ce
  // préfixe commun qui fait tomber la liste ET le compteur d'un seul geste.
  it("préfixe la liste et le compteur par la racine", () => {
    expect(notificationKeys.list()[0]).toBe(notificationKeys.all[0]);
    expect(notificationKeys.unreadCount()[0]).toBe(notificationKeys.all[0]);
    expect(notificationKeys.list()).not.toEqual(notificationKeys.unreadCount());
  });
});
