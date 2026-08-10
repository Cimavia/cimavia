import { describe, expect, it } from "vitest";
import { capabilitiesOf } from "./capability";
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
