import { ConflictException, ForbiddenException } from "@nestjs/common";
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

/** Les gardes privées de lecture du cycle sont hors sujet ici : on les remplace, le rattachement reste réel. */
function build(previousPath: string | null = null) {
  const assertUploadedAsDeclared = vi.fn().mockResolvedValue(undefined);
  const deleteObject = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue({ id: "i1" });
  const service = new InvoiceService(
    { invoice: { update } } as unknown as TenantPrisma,
    {} as UserDirectoryService,
    { assertUploadedAsDeclared, deleteObject } as unknown as StorageService,
    {} as ReminderService,
    {} as AccessService,
    {} as ClsService,
  );
  const guards = service as unknown as Record<string, unknown>;
  guards.getDraftablePlanOrThrow = vi.fn().mockResolvedValue({ athleteId: ATHLETE_ID });
  guards.getDraftInvoiceOrThrow = vi
    .fn()
    .mockResolvedValue({ id: "i1", documentPath: previousPath });
  guards.toDto = vi.fn().mockResolvedValue({ id: "i1" });
  return { service, assertUploadedAsDeclared, deleteObject, update };
}

describe("InvoiceService.attachDocument", () => {
  // La taille et le type enregistrés sont ceux de l'objet reçu, pas ceux que le client annonce (#468).
  it("confronte l'objet reçu à ce que le rattachement déclare", async () => {
    const { service, assertUploadedAsDeclared, update } = build();

    await service.attachDocument(PLAN_ID, DOCUMENT);

    expect(assertUploadedAsDeclared).toHaveBeenCalledExactlyOnceWith(
      DOCUMENT.storagePath,
      DOCUMENT,
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Un rattachement refusé laisse le justificatif précédent en place, objet compris.
  it("n'écrit ni ne purge rien quand le storage dément la déclaration", async () => {
    const { service, assertUploadedAsDeclared, update, deleteObject } = build("ancien.pdf");
    assertUploadedAsDeclared.mockRejectedValueOnce(new ConflictException());

    await expect(service.attachDocument(PLAN_ID, DOCUMENT)).rejects.toThrow(ConflictException);

    expect(update).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  // La clé d'un autre cycle est refusée avant tout appel au storage.
  it("ne relit pas le storage pour une clé hors du cycle", async () => {
    const { service, assertUploadedAsDeclared } = build();

    await expect(
      service.attachDocument(PLAN_ID, {
        ...DOCUMENT,
        storagePath: "athlete/autre/invoice/x/f.pdf",
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(assertUploadedAsDeclared).not.toHaveBeenCalled();
  });

  it("purge l'ancien objet une fois le nouveau confronté", async () => {
    const { service, deleteObject } = build("ancien.pdf");

    await service.attachDocument(PLAN_ID, DOCUMENT);

    expect(deleteObject).toHaveBeenCalledExactlyOnceWith("ancien.pdf");
  });
});
