import { describe, expect, it } from "vitest";
import { ReminderEntityType, ReminderStatus } from "../dto/reminder.schema";
import type { ApiClient } from "./client";
import { createReminderApi, reminderKeys } from "./reminder.api";

// Client factice : on n'exerce pas le réseau ici (c'est le rôle des e2e), mais le CONTRAT —
// quel verbe sur quel chemin, avec quel corps. C'est ce qui casse en silence quand une route bouge.
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

describe("createReminderApi", () => {
  it("liste les rappels sur une route unique (l'API sert les deux segments)", async () => {
    const { api, calls } = spyClient();
    await createReminderApi(api).list();

    expect(calls).toEqual([{ method: "GET", path: "/reminders", body: undefined }]);
  });

  it("crée un rappel en transmettant la cible, l'échéance et la note", async () => {
    const { api, calls } = spyClient();
    const input = {
      entityType: ReminderEntityType.PLAN,
      entityId: "pln_1",
      dueAt: "2026-08-15T07:00:00.000Z",
      note: "Relancer le renouvellement",
    };
    await createReminderApi(api).create(input);

    expect(calls).toEqual([{ method: "POST", path: "/reminders", body: input }]);
  });

  // Route dédiée au statut (`/status`), et non un PATCH sur la ressource : un rappel ne s'édite pas
  // en première passe, seul son statut bouge.
  it("marque un rappel par PATCH sur sa route de statut", async () => {
    const { api, calls } = spyClient();
    await createReminderApi(api).updateStatus("rmd_1", { status: ReminderStatus.DONE });

    expect(calls).toEqual([
      { method: "PATCH", path: "/reminders/rmd_1/status", body: { status: "DONE" } },
    ]);
  });

  // Le toggle est réversible : la même route sert à rouvrir. Sans ça, l'UI aurait besoin d'un
  // endpoint de plus pour corriger un clic.
  it("rouvre un rappel par la même route", async () => {
    const { api, calls } = spyClient();
    await createReminderApi(api).updateStatus("rmd_1", { status: ReminderStatus.PENDING });

    expect(calls[0]?.body).toEqual({ status: "PENDING" });
  });
});

describe("reminderKeys", () => {
  // La liste doit partager la racine : les mutations invalident `all`, et c'est ce préfixe commun
  // qui fait tomber la liste d'un seul geste.
  it("préfixe la liste par la racine", () => {
    expect(reminderKeys.list()[0]).toBe(reminderKeys.all[0]);
  });

  // Racine distincte de celle des notifications : invalider les rappels ne doit pas vider le centre
  // de notifications, et réciproquement.
  it("ne partage pas sa racine avec une autre feature", () => {
    expect(reminderKeys.all[0]).toBe("reminders");
  });
});
