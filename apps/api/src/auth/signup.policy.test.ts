import { type EnvSchema, InvitationStatus } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../infra/prisma/prisma.service";
import { SignupPolicy } from "./signup.policy";

/**
 * Le strict nécessaire de ce que la politique lit : deux variables et un `count`. Écrit à la main
 * plutôt que monté par Nest — la décision ne dépend d'aucun conteneur, la tester à travers un en
 * fabriquerait un.
 */
function policyWith(
  env: { SIGNUP_MODE: string; SIGNUP_ALLOWED_EMAILS?: string },
  pendingInvitations = 0,
) {
  const count = vi.fn().mockResolvedValue(pendingInvitations);
  const config = {
    get: (key: keyof EnvSchema) => env[key as keyof typeof env],
  } as unknown as ConfigService<EnvSchema, true>;
  const prisma = { invitation: { count } } as unknown as PrismaService;
  return { policy: new SignupPolicy(config, prisma), count };
}

describe("SignupPolicy", () => {
  it("laisse entrer n'importe qui en mode ouvert, sans toucher la base", async () => {
    const { policy, count } = policyWith({ SIGNUP_MODE: "open" });
    await expect(policy.mayCreateAccount("inconnu@exemple.fr")).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });

  /**
   * LE test de cette classe, et la raison d'être de #263 : une adresse que personne n'a invitée
   * n'entre pas sur un environnement fermé, même en connaissant l'URL — elle n'a rien de secret.
   */
  it("refuse une adresse ni listée ni invitée en mode invitation", async () => {
    const { policy } = policyWith({ SIGNUP_MODE: "invitation" }, 0);
    await expect(policy.mayCreateAccount("inconnu@exemple.fr")).resolves.toBe(false);
  });

  // La porte des coachs : personne ne les invite, et sans elle un environnement fermé n'accueille
  // plus jamais le premier compte. Casse comprise : la liste est tapée à la main dans un `.env`.
  it("laisse entrer une adresse listée, quelle que soit sa casse", async () => {
    const { policy, count } = policyWith({
      SIGNUP_MODE: "invitation",
      SIGNUP_ALLOWED_EMAILS: "Coach@Exemple.fr, autre@exemple.fr",
    });
    await expect(policy.mayCreateAccount("  COACH@exemple.fr ")).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });

  // La porte des athlètes : c'est leur coach qui l'ouvre, par une invitation nominative.
  it("laisse entrer une adresse invitée nominativement", async () => {
    const { policy, count } = policyWith({ SIGNUP_MODE: "invitation" }, 1);
    await expect(policy.mayCreateAccount("Lea@Exemple.fr")).resolves.toBe(true);
    // Trois critères, et l'adresse NORMALISÉE : le coach l'a tapée, l'athlète aussi.
    expect(count).toHaveBeenCalledWith({
      where: {
        email: "lea@exemple.fr",
        status: InvitationStatus.PENDING,
        expiresAt: { gt: expect.any(Date) },
      },
    });
  });

  // Une liste absente ne rouvre rien : elle rétrécit la porte au seul jeu des invitations.
  it("ne prend pas une liste vide pour une autorisation", async () => {
    const { policy } = policyWith({ SIGNUP_MODE: "invitation", SIGNUP_ALLOWED_EMAILS: "" }, 0);
    await expect(policy.mayCreateAccount("inconnu@exemple.fr")).resolves.toBe(false);
  });
});
