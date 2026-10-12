import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./prisma-error";

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Erreur ${code}`, { code, clientVersion: "test" });

describe("isUniqueViolation", () => {
  it("reconnaît la violation d'unicité", () => {
    expect(isUniqueViolation(knownError("P2002"))).toBe(true);
  });

  it.each([
    ["une autre erreur connue de Prisma", knownError("P2025")],
    ["une panne sans code", new Error("base injoignable")],
    ["une valeur qui n'est pas une erreur", null],
  ])("ne prend pas %s pour un doublon", (_label, error) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});
