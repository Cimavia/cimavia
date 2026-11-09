import { describe, expect, it } from "vitest";
import { isSessionLost } from "./session-loss.util";

const OWNER = { id: "lea" };

describe("isSessionLost", () => {
  it("ne dit rien tant qu'aucun écran n'a été ouvert", () => {
    expect(isSessionLost(null, null)).toBe(false);
    expect(isSessionLost(null, { user: { id: "lea" } })).toBe(false);
  });

  it("garde la session du compte qui a ouvert l'écran", () => {
    expect(isSessionLost(OWNER, { user: { id: "lea" } })).toBe(false);
  });

  it.each([
    ["absente", null],
    ["inconnue", undefined],
  ])("voit une perte sur une session %s", (_, session) => {
    expect(isSessionLost(OWNER, session)).toBe(true);
  });

  it("voit une perte quand un autre compte a pris la session", () => {
    expect(isSessionLost(OWNER, { user: { id: "tom" } })).toBe(true);
  });

  // Le portail captif d'une salle répond en 200 : Better Auth en fait une « session ».
  it.each([
    ["une page HTML", "<html></html>" as never],
    ["un objet sans utilisateur", {}],
    ["un utilisateur sans identifiant", { user: {} }],
  ])("ne prend pas %s pour une perte", (_, session) => {
    expect(isSessionLost(OWNER, session)).toBe(false);
  });
});
