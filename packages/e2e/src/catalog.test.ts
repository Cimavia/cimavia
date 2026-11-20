import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";

const label = catalog("test", {
  auth: { submit: "Se connecter" },
  greeting: "Bonjour {{name}}",
  athletes_one: "{{count}} athlète",
  athletes_other: "{{count}} athlètes",
});

describe("catalog", () => {
  it("rend le libellé français, interpolé", () => {
    expect(label("auth.submit")).toBe("Se connecter");
    expect(label("greeting", { name: "Ada" })).toBe("Bonjour Ada");
  });

  it("résout le pluriel d'une clé qui n'existe qu'au pluriel", () => {
    expect(label("athletes", { count: 1 })).toBe("1 athlète");
    expect(label("athletes", { count: 3 })).toBe("3 athlètes");
  });

  // i18next rendrait la clé elle-même : le parcours la chercherait à l'écran, et accuserait l'app.
  it("lève sur une clé absente, en nommant le catalogue", () => {
    expect(() => label("auth.missing")).toThrow("Clé absente du catalogue test : auth.missing");
  });
});
