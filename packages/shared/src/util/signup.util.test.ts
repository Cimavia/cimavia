import { describe, expect, it } from "vitest";
import { isEmailAllowed, normalizeEmail, parseEmailList, signUpErrorKey } from "./signup.util";

describe("normalizeEmail", () => {
  /**
   * Le cas RÉEL, et c'est un bug déjà vu en #146 : l'invitation est tapée par le Coach, le compte
   * par l'Athlete. Sans normalisation, `Lea@Exemple.fr` et `lea@exemple.fr` sont deux personnes.
   */
  it.each([
    ["Lea@Exemple.fr", "lea@exemple.fr"],
    ["  lea@exemple.fr  ", "lea@exemple.fr"],
    ["LEA@EXEMPLE.FR", "lea@exemple.fr"],
  ])("compare %s comme %s", (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });
});

describe("parseEmailList", () => {
  it("lit une liste séparée par des virgules, normalisée", () => {
    expect(parseEmailList("Coach@Exemple.fr, kylian@exemple.fr")).toEqual([
      "coach@exemple.fr",
      "kylian@exemple.fr",
    ]);
  });

  /**
   * Une virgule en trop est une faute de frappe, pas une autorisation pour l'adresse vide — qui
   * laisserait passer une inscription dont l'adresse ne serait comparée à rien.
   */
  it.each([
    ",",
    "a@x.fr,",
    ",a@x.fr",
    "a@x.fr,,b@x.fr",
  ])("ignore les entrées vides de %s", (raw) => {
    expect(parseEmailList(raw)).not.toContain("");
  });

  /**
   * Variable absente ou vide : aucune adresse autorisée. Surtout pas « tout le monde » — c'est le
   * sens même d'un environnement fermé (règle dure n°5 : une absence n'est pas une valeur).
   */
  it.each([undefined, null, "", "   "])("rend une liste vide pour %s", (raw) => {
    expect(parseEmailList(raw)).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  const allowed = ["Coach@Exemple.fr", "kylian@exemple.fr"];

  it("reconnaît une adresse de la liste, quelle que soit sa casse", () => {
    expect(isEmailAllowed("coach@exemple.fr", allowed)).toBe(true);
    expect(isEmailAllowed("  KYLIAN@exemple.fr ", allowed)).toBe(true);
  });

  it("refuse une adresse absente de la liste", () => {
    expect(isEmailAllowed("inconnu@exemple.fr", allowed)).toBe(false);
  });

  it("refuse tout quand la liste est vide", () => {
    expect(isEmailAllowed("coach@exemple.fr", [])).toBe(false);
  });
});

describe("signUpErrorKey", () => {
  /**
   * Les deux seuls codes que l'API distingue, et la raison d'être de cette table : le message
   * générique (« une erreur est survenue, réessaie ») ferait recommencer une saisie juste dans les
   * deux cas — une inscription fermée ne passera jamais, une adresse déjà prise non plus.
   */
  it.each([
    [403, "auth.errors.signupClosed"],
    [422, "auth.errors.emailInUse"],
  ])("nomme le refus %s", (status, expected) => {
    expect(signUpErrorKey(status)).toBe(expected);
  });

  // 400 (validation), 500, et l'absence de code — une panne réseau ne porte aucun statut.
  it.each([400, 401, 500, undefined])("retombe sur le générique pour %s", (status) => {
    expect(signUpErrorKey(status)).toBe("auth.errors.generic");
  });
});
