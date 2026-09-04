import { describe, expect, it } from "vitest";
import { NotificationType } from "../dto/notification.schema";
import type { ApiClient } from "./client";
import {
  createNotificationApi,
  createNotificationPreferenceApi,
  notificationKeys,
  notificationPreferenceKeys,
  toggledPreferences,
} from "./notification.api";

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

describe("createNotificationPreferenceApi", () => {
  it("lit et remplace sur la MÊME route, en GET puis PUT", async () => {
    const { api, calls } = spyClient();
    const preferences = createNotificationPreferenceApi(api);

    await preferences.list();
    await preferences.replace({ enabled: [NotificationType.PLAN_PUBLISHED] });

    expect(calls).toEqual([
      { method: "GET", path: "/me/notification-preferences", body: undefined },
      {
        method: "PUT",
        path: "/me/notification-preferences",
        body: { enabled: [NotificationType.PLAN_PUBLISHED] },
      },
    ]);
  });

  /**
   * Clés SÉPARÉES de celles des notifications : régler un canal ne change rien à ce qui a déjà été
   * reçu. Les fondre ferait réinvalider la liste et le badge à chaque bascule d'interrupteur.
   */
  it("ne partage aucune clé de cache avec les notifications elles-mêmes", () => {
    expect(notificationPreferenceKeys.all[0]).not.toBe(notificationKeys.all[0]);
  });
});

describe("toggledPreferences", () => {
  const grid = [
    { type: NotificationType.PLAN_PUBLISHED, enabled: true },
    { type: NotificationType.FEEDBACK_RECEIVED, enabled: false },
    { type: NotificationType.MESSAGE_RECEIVED, enabled: true },
    { type: NotificationType.INVOICE_ISSUED, enabled: false },
  ] as const;

  // L'API attend l'ENSEMBLE des types activés, pas un delta : une bascule renvoie donc tout.
  it("allume un type éteint sans toucher aux autres", () => {
    expect(toggledPreferences(grid, NotificationType.FEEDBACK_RECEIVED)).toEqual([
      NotificationType.PLAN_PUBLISHED,
      NotificationType.FEEDBACK_RECEIVED,
      NotificationType.MESSAGE_RECEIVED,
    ]);
  });

  it("éteint un type allumé sans toucher aux autres", () => {
    expect(toggledPreferences(grid, NotificationType.PLAN_PUBLISHED)).toEqual([
      NotificationType.MESSAGE_RECEIVED,
    ]);
  });

  // Éteindre le dernier actif doit produire une liste VIDE, pas `undefined` ni la grille entière :
  // c'est le geste « je coupe tout », et l'API le comprend comme tel.
  it("rend une liste vide quand on éteint le dernier type actif", () => {
    const single = [{ type: NotificationType.PLAN_PUBLISHED, enabled: true }] as const;
    expect(toggledPreferences(single, NotificationType.PLAN_PUBLISHED)).toEqual([]);
  });

  // L'ordre suit la grille reçue : deux bascules successives ne doivent pas réordonner la requête,
  // sinon deux appels équivalents produiraient des corps différents.
  it("conserve l'ordre de la grille", () => {
    const twice = toggledPreferences(
      toggledPreferences(grid, NotificationType.INVOICE_ISSUED).map((type) => ({
        type,
        enabled: true,
      })),
      NotificationType.PLAN_PUBLISHED,
    );
    expect(twice).toEqual([NotificationType.MESSAGE_RECEIVED, NotificationType.INVOICE_ISSUED]);
  });
});
