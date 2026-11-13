import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { AccessService } from "../../access/service/access.service";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { StorageService } from "../../infra/storage/storage.service";
import type { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { InvoiceService } from "./invoice.service";

const PLAN_ID = "p1";
const ATHLETE_ID = "a1";
const DOCUMENT = {
  storagePath: `athlete/${ATHLETE_ID}/invoice/${PLAN_ID}/0b6f3c2e-8d1a-4c5e-9f7b-2a4d6e8c0f13-facture.pdf`,
  fileName: "facture.pdf",
  mimeType: "application/pdf",
  size: 2_000,
} as const;

/** Un cycle diffusable à l'athlète `a1`, géré par un autre coach que lui. */
const PLAN = { id: PLAN_ID, status: "DRAFT", coachId: "c1", athleteId: ATHLETE_ID };

/** Hors cycle : la lecture du DTO n'a pas à relire le cycle, et ce n'est pas le sujet ici. */
const INVOICE = {
  id: "i1",
  planId: null,
  athleteId: ATHLETE_ID,
  coachId: "c1",
  status: "DRAFT",
  amountCents: 4_000,
  dueDate: new Date("2026-11-01"),
  documentPath: null,
  documentFileName: null,
  documentMimeType: null,
  documentSizeBytes: null,
  erasedAthleteName: null,
  period: null,
  currency: "EUR",
  issuedAt: null,
  paidAt: null,
  note: null,
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
};

function build(setup: { draft?: { documentPath: string | null } | null } = {}) {
  const draft = setup.draft === undefined ? { documentPath: null } : setup.draft;
  const assertAttachable = vi.fn().mockResolvedValue(undefined);
  const deleteObject = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(INVOICE);
  const db = {
    plan: { findFirst: vi.fn().mockResolvedValue(PLAN) },
    invoice: {
      findFirst: vi.fn().mockResolvedValue(draft == null ? null : { id: "i1", ...draft }),
      update,
    },
  } as unknown as TenantPrisma;
  // Le droit d'écriture est hors sujet : l'accès rend la ligne chargée, comme s'il l'accordait.
  const access = {
    loadFor: async (load: Promise<unknown>) => ({ row: await load, context: {} }),
    context: async () => ({}),
  } as unknown as AccessService;
  const service = new InvoiceService(
    db,
    {
      namesByIds: vi.fn().mockResolvedValue(
        new Map([
          ["c1", "Camille"],
          [ATHLETE_ID, "Alex"],
        ]),
      ),
    } as unknown as UserDirectoryService,
    { assertAttachable, deleteObject } as unknown as StorageService,
    {} as ReminderService,
    access,
    { get: () => ({ userId: "c1", exercised: "coach" }) } as unknown as ClsService,
  );
  return { service, assertAttachable, deleteObject, update };
}

describe("InvoiceService.attachDocument", () => {
  // La taille et le type enregistrés sont ceux de l'objet reçu, pas ceux que le client annonce (#468).
  it("confronte la clé et l'objet reçu au préfixe du cycle", async () => {
    const { service, assertAttachable, update } = build();

    await service.attachDocument(PLAN_ID, DOCUMENT);

    expect(assertAttachable).toHaveBeenCalledExactlyOnceWith(
      `athlete/${ATHLETE_ID}/invoice/${PLAN_ID}/`,
      DOCUMENT.storagePath,
      DOCUMENT,
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Sans termes de facturation, le coach lit la bonne erreur — pas celle du storage.
  it("refuse sans facture en brouillon, avant d'interroger le storage (400)", async () => {
    const { service, assertAttachable } = build({ draft: null });

    await expect(service.attachDocument(PLAN_ID, DOCUMENT)).rejects.toThrow(BadRequestException);

    expect(assertAttachable).not.toHaveBeenCalled();
  });

  // Un rattachement refusé laisse le justificatif précédent en place, objet compris.
  it("n'écrit ni ne purge rien quand le storage refuse", async () => {
    const { service, assertAttachable, update, deleteObject } = build({
      draft: { documentPath: "ancien.pdf" },
    });
    assertAttachable.mockRejectedValueOnce(new ConflictException());

    await expect(service.attachDocument(PLAN_ID, DOCUMENT)).rejects.toThrow(ConflictException);

    expect(update).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("n'écrit rien pour une clé hors du cycle (403)", async () => {
    const { service, assertAttachable, update } = build();
    assertAttachable.mockRejectedValueOnce(new ForbiddenException());

    await expect(service.attachDocument(PLAN_ID, DOCUMENT)).rejects.toThrow(ForbiddenException);

    expect(update).not.toHaveBeenCalled();
  });

  it("purge l'ancien objet une fois le nouveau confronté", async () => {
    const { service, deleteObject } = build({ draft: { documentPath: "ancien.pdf" } });

    await service.attachDocument(PLAN_ID, DOCUMENT);

    expect(deleteObject).toHaveBeenCalledExactlyOnceWith("ancien.pdf");
  });
});
