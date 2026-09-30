import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthConfig, createAuth, type SendResetPassword } from "./auth.config";

/**
 * La fabrique seule, sans base : Better Auth ne touche pas Prisma à la construction. Ce qui se
 * vérifie ici est ce que les e2e ne font pas varier — l'environnement, et la forme de l'utilisateur
 * que la bibliothèque passe au rappel de réinitialisation.
 */
function authWith(overrides: Partial<AuthConfig> = {}) {
  return createAuth({} as PrismaClient, {
    secret: "s".repeat(32),
    baseURL: "http://localhost:3001",
    trustedOrigins: ["http://localhost:5173"],
    sendResetPassword: () => Promise.resolve(),
    mayCreateAccount: () => Promise.resolve(true),
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAuth — origines de confiance", () => {
  // Les origines du tunnel ou du téléphone se tapent à la main dans un `.env` : espaces tolérés.
  it("ajoute les origines de BETTER_AUTH_TRUSTED_ORIGINS, espaces retirés", () => {
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:8081 , http://192.168.1.15:8081");

    expect(authWith().options.trustedOrigins).toEqual([
      "http://localhost:5173",
      "http://localhost:8081",
      "http://192.168.1.15:8081",
    ]);
  });

  // Variable absente (image de production) : les origines configurées, rien d'inventé.
  it("s'en tient aux origines configurées sans la variable", () => {
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", undefined);

    expect(authWith().options.trustedOrigins).toEqual(["http://localhost:5173"]);
  });
});

describe("createAuth — langue de l'e-mail de réinitialisation", () => {
  async function localeSentFor(user: Record<string, unknown>) {
    const sendResetPassword = vi.fn<SendResetPassword>(() => Promise.resolve());
    const reset = authWith({ sendResetPassword }).options.emailAndPassword?.sendResetPassword;
    await reset?.({ user: { email: "a@cmv.test", ...user } as never, url: "u", token: "t" });
    return sendResetPassword.mock.calls[0]?.[0];
  }

  it("transmet la langue du compte, avec l'adresse et le lien", async () => {
    await expect(localeSentFor({ locale: "en" })).resolves.toEqual({
      to: "a@cmv.test",
      locale: "en",
      url: "u",
    });
  });

  /**
   * `locale` n'est pas dans le type `User` de Better Auth : si le champ disparaissait des
   * `additionalFields`, ou changeait de forme, l'e-mail doit partir quand même — en français,
   * par le repli du catalogue — plutôt que planter sur une propriété inventée.
   */
  it.each([
    ["absente", {}],
    ["qui n'est pas une chaîne", { locale: 42 }],
  ])("rend null sur une langue %s", async (_, user) => {
    await expect(localeSentFor(user)).resolves.toMatchObject({ locale: null });
  });
});
