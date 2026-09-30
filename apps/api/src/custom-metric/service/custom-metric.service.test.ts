import type { CreateCustomMetricInput } from "@cmv/shared";
import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { CustomMetricService } from "./custom-metric.service";

const INPUT: CreateCustomMetricInput = {
  label: "Cotation bloc",
  unit: null,
  valueType: "NUMBER",
  scale: null,
};

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Erreur ${code}`, { code, clientVersion: "test" });

function serviceFailingWith(error: Error) {
  const db = {
    customMetric: { create: () => Promise.reject(error) },
  } as unknown as TenantPrisma;
  return new CustomMetricService(db);
}

/**
 * Le doublon de libellé est la SEULE erreur d'écriture traduite en 409 — les e2e le montrent. Ici,
 * l'autre moitié, qu'une base saine ne produit pas : toute autre panne doit remonter telle quelle.
 * Un 409 « une métrique porte déjà ce nom » sur une base tombée enverrait le coach renommer une
 * métrique qui n'a aucun doublon.
 */
describe("CustomMetricService — erreurs d'écriture", () => {
  it("traduit la violation d'unicité en 409", async () => {
    await expect(serviceFailingWith(knownError("P2002")).create(INPUT)).rejects.toThrow(
      new ConflictException("Une métrique porte déjà ce nom"),
    );
  });

  it.each([
    ["une autre erreur connue de Prisma", knownError("P2000")],
    ["une panne sans code", new Error("base injoignable")],
  ])("laisse remonter %s sans la déguiser en doublon", async (_label, error) => {
    await expect(serviceFailingWith(error).create(INPUT)).rejects.toBe(error);
  });
});
