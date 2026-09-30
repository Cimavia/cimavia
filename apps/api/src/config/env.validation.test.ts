import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const VALID = {
  DATABASE_URL: "postgresql://cmv:cmv@localhost:5432/cmv",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  SIGNUP_MODE: "open",
};

describe("validateEnv", () => {
  // Rendu TRANSFORMÉ : c'est cette valeur, défauts et coercitions compris, que lit ConfigService.
  it("rend l'environnement validé, défauts appliqués", () => {
    expect(validateEnv({ ...VALID, PORT: "3001" })).toMatchObject({
      ...VALID,
      PORT: 3001,
      APP_ENV: "development",
    });
  });

  /**
   * Le démarrage doit s'ARRÊTER, et dire quoi corriger : la variable en faute et la raison, pas
   * une trace Zod brute. Sans ça, l'API partirait avec une config fausse et tomberait plus loin,
   * à la première requête qui la lit.
   */
  it("arrête le démarrage en nommant chaque variable en faute", () => {
    const failure = () => validateEnv({ ...VALID, DATABASE_URL: "pas-une-url", PORT: "0" });

    expect(failure).toThrow("Variables d'environnement invalides");
    expect(failure).toThrow(/DATABASE_URL/);
    expect(failure).toThrow(/PORT/);
  });

  it("refuse un environnement sans les variables requises", () => {
    expect(() => validateEnv({})).toThrow(/BETTER_AUTH_SECRET/);
  });
});
