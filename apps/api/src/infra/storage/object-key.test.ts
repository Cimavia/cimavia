import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertKeyUnder, buildObjectKey } from "./object-key";

const PREFIX = "athlete/a1/feedback/s1/";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("buildObjectKey", () => {
  it("préfixe, UUID puis nom assaini", () => {
    const key = buildObjectKey(PREFIX, "ma voie (été).jpg");
    expect(key).toMatch(/^athlete\/a1\/feedback\/s1\/[0-9a-f-]{36}-ma_voie_t_\.jpg$/);
  });

  it("deux envois du même fichier ne partagent pas la clé", () => {
    expect(buildObjectKey(PREFIX, "a.jpg")).not.toBe(buildObjectKey(PREFIX, "a.jpg"));
  });

  it("produit une clé que la garde accepte, quel que soit le nom", () => {
    for (const name of ["a.jpg", "../../etc/passwd", "é", "a/b\\c.pdf"]) {
      expect(() => assertKeyUnder(PREFIX, buildObjectKey(PREFIX, name))).not.toThrow();
    }
  });
});

describe("assertKeyUnder", () => {
  it("accepte une clé construite sous ce préfixe", () => {
    expect(() => assertKeyUnder(PREFIX, `${PREFIX}${UUID}-voie.jpg`)).not.toThrow();
  });

  it.each([
    ["un autre préfixe", `athlete/b1/feedback/s1/${UUID}-voie.jpg`],
    ["une autre séance du même athlète", `athlete/a1/feedback/s2/${UUID}-voie.jpg`],
    ["une remontée d'arborescence", `${PREFIX}../../../coach/c1/exercises/e1/${UUID}-doc.pdf`],
    ["une remontée après un uuid", `${PREFIX}${UUID}-x/../../../coach/c1/doc.pdf`],
    ["un sous-dossier", `${PREFIX}sous/${UUID}-voie.jpg`],
    ["le préfixe seul", PREFIX],
    ["un suffixe sans uuid", `${PREFIX}voie.jpg`],
    ["un uuid sans nom", `${PREFIX}${UUID}-`],
    ["un nom non assaini", `${PREFIX}${UUID}-ma voie.jpg`],
    ["le préfixe sans sa barre finale", `athlete/a1/feedback/s1${UUID}-voie.jpg`],
  ])("refuse %s (403)", (_, key) => {
    expect(() => assertKeyUnder(PREFIX, key)).toThrow(ForbiddenException);
  });
});
