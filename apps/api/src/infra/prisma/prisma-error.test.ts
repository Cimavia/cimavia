import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  explainForeignKeyViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "./prisma-error";

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

describe("isForeignKeyViolation", () => {
  it("reconnaît la violation de clé étrangère", () => {
    expect(isForeignKeyViolation(knownError("P2003"))).toBe(true);
  });

  it.each([
    ["un doublon", knownError("P2002")],
    ["une panne sans code", new Error("base injoignable")],
  ])("ne prend pas %s pour une clé étrangère", (_label, error) => {
    expect(isForeignKeyViolation(error)).toBe(false);
  });
});

describe("explainForeignKeyViolation", () => {
  it("rend l'écriture qui passe, sans refaire le contrôle", async () => {
    const explain = vi.fn(async () => undefined);
    await expect(explainForeignKeyViolation(async () => "écrit", explain)).resolves.toBe("écrit");
    expect(explain).not.toHaveBeenCalled();
  });

  it("lève l'erreur lisible du contrôle quand une clé étrangère bloque l'écriture", async () => {
    const readable = new Error("Exercice utilisé dans 1 séance(s)");
    const write = () => Promise.reject(knownError("P2003"));
    await expect(explainForeignKeyViolation(write, () => Promise.reject(readable))).rejects.toBe(
      readable,
    );
  });

  it("laisse remonter la violation si le contrôle passe malgré tout", async () => {
    const violation = knownError("P2003");
    await expect(
      explainForeignKeyViolation(
        () => Promise.reject(violation),
        async () => undefined,
      ),
    ).rejects.toBe(violation);
  });

  it("ne refait pas le contrôle pour une autre erreur", async () => {
    const failure = new Error("base injoignable");
    const explain = vi.fn(async () => undefined);
    await expect(explainForeignKeyViolation(() => Promise.reject(failure), explain)).rejects.toBe(
      failure,
    );
    expect(explain).not.toHaveBeenCalled();
  });
});
