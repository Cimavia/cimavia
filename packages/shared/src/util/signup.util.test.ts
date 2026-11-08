import { describe, expect, it } from "vitest";
import {
  isEmailAllowed,
  normalizeEmail,
  parseEmailList,
  resendOutcome,
  signInErrorKey,
  signUpErrorKey,
} from "./signup.util";

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
  it.each([",", "a@x.fr,", ",a@x.fr", "a@x.fr,,b@x.fr"])(
    "ignore les entrées vides de %s",
    (raw) => {
      expect(parseEmailList(raw)).not.toContain("");
    },
  );

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
   * Le seul code que l'API distingue, et la raison d'être de cette table : le message générique
   * (« une erreur est survenue, réessaie ») ferait recommencer une saisie juste, alors qu'une
   * inscription fermée ne passera jamais.
   */
  it("nomme le refus d'un environnement fermé", () => {
    expect(signUpErrorKey(403)).toBe("auth.errors.signupClosed");
  });

  // 422 compris : depuis #270, l'API ne le rend plus, et une adresse déjà prise ne se trahit pas.
  it.each([400, 401, 422, 500, undefined])("retombe sur le générique pour %s", (status) => {
    expect(signUpErrorKey(status)).toBe("auth.errors.generic");
  });
});

describe("signInErrorKey", () => {
  it("nomme l'adresse à confirmer", () => {
    expect(signInErrorKey({ status: 403, code: "EMAIL_NOT_VERIFIED" })).toBe(
      "auth.errors.emailNotVerified",
    );
  });

  it("nomme les identifiants refusés", () => {
    expect(signInErrorKey({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "auth.errors.invalidCredentials",
    );
  });

  // Une adresse mal formée se corrige : le générique la ferait renvoyer telle quelle.
  it("prend une saisie refusée pour des identifiants à corriger", () => {
    expect(signInErrorKey({ status: 400, code: "INVALID_EMAIL" })).toBe(
      "auth.errors.invalidCredentials",
    );
  });

  it("dit d'attendre après trop de tentatives", () => {
    expect(signInErrorKey({ status: 429 })).toBe("auth.errors.tooManyAttempts");
  });

  // Une origine refusée est aussi un 403 : aucun lien n'est parti, rien à annoncer.
  it("ne prend pas un autre 403 pour une adresse à confirmer", () => {
    expect(signInErrorKey({ status: 403, code: "INVALID_ORIGIN" })).toBe("auth.errors.generic");
  });

  // Une panne n'est pas un mot de passe faux : la dire telle quelle évite de retaper le bon.
  it.each([500, 503, undefined])("retombe sur le générique pour %s", (status) => {
    expect(signInErrorKey({ status })).toBe("auth.errors.generic");
  });
});

describe("resendOutcome", () => {
  it("dit « renvoyé » quand l'API accepte", async () => {
    await expect(resendOutcome(() => Promise.resolve({ error: null }))).resolves.toBe("sent");
  });

  // Le client Better Auth rend le refus sans lever : le lire, sinon il passerait pour un succès.
  it("dit l'échec quand l'API refuse", async () => {
    await expect(resendOutcome(() => Promise.resolve({ error: { status: 429 } }))).resolves.toBe(
      "failed",
    );
  });

  it("dit l'échec quand l'appel casse", async () => {
    await expect(resendOutcome(() => Promise.reject(new Error("réseau coupé")))).resolves.toBe(
      "failed",
    );
  });
});
