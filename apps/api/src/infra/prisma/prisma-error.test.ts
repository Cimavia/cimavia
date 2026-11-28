import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  explainForeignKeyViolation,
  isForeignKeyViolation,
  isSerializationFailure,
  isUniqueViolation,
  retryOnSerializationFailure,
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

describe("isSerializationFailure", () => {
  it("reconnaît le conflit d'une lecture répétable", () => {
    expect(isSerializationFailure(knownError("P2034"))).toBe(true);
  });

  it.each([
    ["une clé étrangère", knownError("P2003")],
    ["une panne sans code", new Error("base injoignable")],
  ])("ne prend pas %s pour un conflit", (_label, error) => {
    expect(isSerializationFailure(error)).toBe(false);
  });
});

describe("retryOnSerializationFailure", () => {
  it("rejoue la transaction après un conflit, et rend celle qui passe", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(knownError("P2034"))
      .mockResolvedValueOnce("copie");

    await expect(retryOnSerializationFailure(transaction)).resolves.toBe("copie");
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("rend le dernier conflit une fois les essais épuisés", async () => {
    const conflict = knownError("P2034");
    const transaction = vi.fn().mockRejectedValue(conflict);

    await expect(retryOnSerializationFailure(transaction, 2)).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("ne rejoue pas une autre erreur", async () => {
    const failure = knownError("P2003");
    const transaction = vi.fn().mockRejectedValue(failure);

    await expect(retryOnSerializationFailure(transaction)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
