import { invoiceKeys as sharedInvoiceKeys } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachInvoiceDocument,
  getPlanBilling,
  invoiceKeys,
  removeInvoiceDocument,
  requestInvoiceDocumentUploadUrl,
  savePlanBilling,
} from "./api";

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Le client HTTP est la frontière : verbe, chemin et corps sont tout ce que ce module décide.
vi.mock("@/shared/lib/api", () => ({ api: apiMock }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(apiMock)) fn.mockResolvedValue("réponse");
});

describe("invoiceKeys", () => {
  // Sous la racine partagée : une mutation de facture périme aussi la facturation du cycle.
  it("range la facturation d'un cycle sous la racine des factures", () => {
    expect(invoiceKeys.billing("p-1").slice(0, 1)).toEqual(sharedInvoiceKeys.all);
    expect(invoiceKeys.billing("p-1")).not.toEqual(invoiceKeys.billing("p-2"));
  });
});

const DOCUMENT = { fileName: "facture.pdf", mimeType: "application/pdf", size: 10 } as const;

/**
 * Une ligne par fonction. Le verbe est ce qui se casse en silence : les termes sont un
 * REMPLACEMENT (PUT), l'url signée une demande (POST) — `tsc` ne distingue ni l'un ni l'autre.
 */
describe.each([
  ["getPlanBilling", () => getPlanBilling("p-1"), "get", ["/plans/p-1/billing"]],
  [
    "savePlanBilling",
    () => savePlanBilling("p-1", { amountCents: 100 } as never),
    "put",
    ["/plans/p-1/billing", { amountCents: 100 }],
  ],
  [
    "requestInvoiceDocumentUploadUrl",
    () => requestInvoiceDocumentUploadUrl("p-1", DOCUMENT),
    "post",
    ["/plans/p-1/billing/document/upload-url", DOCUMENT],
  ],
  [
    "attachInvoiceDocument",
    () => attachInvoiceDocument("p-1", { ...DOCUMENT, storagePath: "p/1.pdf" }),
    "put",
    ["/plans/p-1/billing/document", { ...DOCUMENT, storagePath: "p/1.pdf" }],
  ],
  [
    "removeInvoiceDocument",
    () => removeInvoiceDocument("p-1"),
    "delete",
    ["/plans/p-1/billing/document"],
  ],
] as const)("%s", (_, call, verb, args) => {
  it(`part en ${verb.toUpperCase()} sur la bonne ressource`, async () => {
    await expect(call()).resolves.toBe("réponse");

    expect(apiMock[verb]).toHaveBeenCalledWith(...args);
  });
});
