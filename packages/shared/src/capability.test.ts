import { describe, expect, it } from "vitest";
import { capabilitiesOf, hasCapability } from "./capability";
import { Role } from "./role";

describe("capabilitiesOf", () => {
  it("dérive la capacité coach du rôle COACH", () => {
    expect(capabilitiesOf({ role: Role.COACH })).toEqual({ isCoach: true, isAthlete: false });
  });

  it("dérive la capacité athlète du rôle ATHLETE", () => {
    expect(capabilitiesOf({ role: Role.ATHLETE })).toEqual({ isCoach: false, isAthlete: true });
  });

  /**
   * Fail closed : c'est la propriété qui rend cette fonction utilisable comme garde. Une session en
   * cours de chargement rend `undefined` côté Better Auth — si l'absence ouvrait quoi que ce soit,
   * chaque écran gardé clignoterait une fraction de seconde avant de se refermer.
   */
  it("n'accorde aucune capacité sans utilisateur", () => {
    const none = { isCoach: false, isAthlete: false };
    expect(capabilitiesOf(null)).toEqual(none);
    expect(capabilitiesOf(undefined)).toEqual(none);
  });

  /**
   * `ADMIN` est dans l'enum (#3) mais n'est attribué à personne, et une API plus récente qu'un
   * client déployé peut envoyer un rôle qu'il ne connaît pas. Les deux se traitent pareil : rien.
   */
  it("n'accorde aucune capacité à un rôle qu'elle ne connaît pas", () => {
    const none = { isCoach: false, isAthlete: false };
    expect(capabilitiesOf({ role: Role.ADMIN })).toEqual(none);
    expect(capabilitiesOf({ role: "SPECTATEUR" })).toEqual(none);
    expect(capabilitiesOf({ role: "" })).toEqual(none);
  });

  /**
   * Les deux drapeaux sont INDÉPENDANTS, pas un booléen et son inverse. Le rôle exclusif d'
   * aujourd'hui n'en produit jamais deux à `true`, mais les appelants ne doivent pas s'y fier :
   * le modèle cible (#7) rend les capacités cumulables.
   */
  it("rend deux drapeaux distincts, jamais un booléen inversé", () => {
    const coach = capabilitiesOf({ role: Role.COACH });
    expect(coach.isAthlete).toBe(false);
    expect(coach.isCoach).not.toBe(coach.isAthlete);
  });
});

describe("hasCapability", () => {
  it("répond à une exigence nommée", () => {
    const coach = capabilitiesOf({ role: Role.COACH });
    expect(hasCapability(coach, "coach")).toBe(true);
    expect(hasCapability(coach, "athlete")).toBe(false);

    const athlete = capabilitiesOf({ role: Role.ATHLETE });
    expect(hasCapability(athlete, "athlete")).toBe(true);
    expect(hasCapability(athlete, "coach")).toBe(false);
  });

  // Sans capacité, aucune exigence n'est satisfaite : c'est ce qui fait qu'une navigation dérivée
  // de cette fonction est VIDE pour un compte non résolu, jamais complète « par défaut ».
  it("ne satisfait aucune exigence sans capacité", () => {
    const none = capabilitiesOf(null);
    expect(hasCapability(none, "coach")).toBe(false);
    expect(hasCapability(none, "athlete")).toBe(false);
  });

  /**
   * Les deux capacités se lisent INDÉPENDAMMENT sur le même compte. Le rôle exclusif d'aujourd'hui
   * n'en produit jamais deux, mais c'est le cas que #7 rendra courant — et la fonction doit déjà y
   * répondre, sinon la nav double capacité se construira sur un ternaire faux.
   */
  it("satisfait les deux exigences d'un compte à double capacité", () => {
    const both = { isCoach: true, isAthlete: true };
    expect(hasCapability(both, "coach")).toBe(true);
    expect(hasCapability(both, "athlete")).toBe(true);
  });
});
