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
   * UNE seule route de liste pour les deux capacités : c'est le scope tenant qui décide de ce
   * qu'elle rend, pas un chemin `/me/…` distinct (#27). Un compte mono-capacité n'a donc rien à
   * préciser — l'API n'a qu'une réponse possible pour lui, et l'URL reste nue.
   */
  it("lit la liste sur une route unique, sans titre pour un compte mono-capacité", async () => {
    const { api, calls } = spyClient();
    await createInvoiceApi(api).list(null);

    expect(calls).toEqual([{ method: "GET", path: "/invoices", body: undefined }]);
  });

  /**
   * Avec un titre, il part dans l'URL : c'est ce que l'API EXIGE d'un compte à double capacité,
   * faute de quoi elle répond 400 plutôt que de choisir à sa place (#10).
   */
  it("porte le titre dans l'URL quand il est donné", async () => {
    const { api, calls } = spyClient();
    await createInvoiceApi(api).list("coach");
    await createInvoiceApi(api).list("athlete");

    expect(calls.map((c) => c.path)).toEqual(["/invoices?as=coach", "/invoices?as=athlete"]);
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
    expect(invoiceKeys.list(null)[0]).toBe(invoiceKeys.all[0]);
  });

  /**
   * Les deux titres lisent la MÊME URL et rendent des listes différentes — émises contre reçues.
   * Une clé qui les confondrait servirait à l'un le cache de l'autre : un compte à double capacité
   * verrait ses factures reçues sous ses factures émises.
   */
  it("distingue les deux titres, et le compte sans titre", () => {
    const coach = JSON.stringify(invoiceKeys.list("coach"));
    const athlete = JSON.stringify(invoiceKeys.list("athlete"));
    const none = JSON.stringify(invoiceKeys.list(null));

    expect(new Set([coach, athlete, none]).size).toBe(3);
  });
});
