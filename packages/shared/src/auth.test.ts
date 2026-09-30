import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_TOKEN_TTL_HOURS,
  RESET_PASSWORD_TOKEN_TTL_SECONDS,
} from "./auth";

describe("contraintes d'authentification", () => {
  /**
   * La politique de mot de passe est une décision de sécurité, lue par les formulaires ET par
   * Better Auth. Un changement doit donc être voulu : ce test casse s'il arrive par mégarde.
   */
  it("borne le mot de passe entre 8 et 128 caractères", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  /**
   * Les heures sont la source (l'e-mail les annonce), les secondes en dérivent (Better Auth les
   * lit). Si l'une bougeait sans l'autre, le message mentirait sur la durée réelle du lien.
   */
  it("dérive la validité du lien de réinitialisation en secondes à partir des heures", () => {
    expect(RESET_PASSWORD_TOKEN_TTL_HOURS).toBe(1);
    expect(RESET_PASSWORD_TOKEN_TTL_SECONDS).toBe(RESET_PASSWORD_TOKEN_TTL_HOURS * 3600);
  });
});
