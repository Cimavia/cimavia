import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "../dto/invoice.schema";
import type { ApiClient } from "./client";
import { createInvoiceApi, invoiceKeys } from "./invoice.api";

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

describe("createInvoiceApi", () => {
  /**
   * UNE seule route de liste pour les deux rôles : c'est le scope tenant qui décide de ce qu'elle
   * rend, pas un chemin `/me/…` distinct. Le client n'a donc rien à savoir de qui il sert — c'est
   * ce qui rend cet écran ouvrable à l'athlète sans toucher à l'API (#27).
   */
  it("lit la liste sur une route unique, quel que soit le rôle", async () => {
    const { api, calls } = spyClient();
    await createInvoiceApi(api).list();

    expect(calls).toEqual([{ method: "GET", path: "/invoices", body: undefined }]);
  });

  it("bascule le statut par PATCH sur l'id", async () => {
    const { api, calls } = spyClient();
    await createInvoiceApi(api).updateStatus("inv_123", { status: InvoiceStatus.PAID });

    expect(calls).toEqual([
      { method: "PATCH", path: "/invoices/inv_123/status", body: { status: InvoiceStatus.PAID } },
    ]);
  });

  /**
   * L'annulation a sa PROPRE route et non une valeur de plus dans le toggle : elle est gardée
   * (409 hors `PENDING`) et terminale. Les confondre rendrait l'irréversible aussi banal qu'un
   * changement d'avis.
   */
  it("annule par POST sur une route dédiée", async () => {
    const { api, calls } = spyClient();
    await createInvoiceApi(api).cancel("inv_123");

    expect(calls).toEqual([{ method: "POST", path: "/invoices/inv_123/cancel", body: undefined }]);
  });
});

describe("invoiceKeys", () => {
  // La liste partage la racine : toute mutation invalide `all` et la fait tomber d'un seul geste.
  // Les clés propres à une app (la facturation d'un cycle, web seule) s'ajoutent par-dessus.
  it("préfixe la liste par la racine", () => {
    expect(invoiceKeys.list()[0]).toBe(invoiceKeys.all[0]);
  });
});
