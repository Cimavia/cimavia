import { Role } from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthConfig, createAuth, type SendResetPassword } from "./auth.config";

/**
 * La fabrique seule, sans base : Better Auth ne touche pas Prisma à la construction. Ce qui se
 * vérifie ici est ce que les e2e ne font pas varier — l'environnement, et la forme de l'utilisateur
 * que la bibliothèque passe au rappel de réinitialisation.
 */
function authWith(overrides: Partial<AuthConfig> = {}, prisma = {} as PrismaClient) {
  return createAuth(prisma, {
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

describe("createAuth — type de compte à l'inscription (#600)", () => {
  const before = (user: Record<string, unknown>) => {
    const hook = authWith().options.databaseHooks?.user?.create?.before;
    return hook?.({ email: "f@cmv.test", name: "F", ...user } as never);
  };

  it("accepte une entreprise seule, et la fait atterrir dans son espace", async () => {
    await expect(before({ isCompany: true })).resolves.toMatchObject({
      data: { isCompany: true, isCoach: false, isAthlete: false, role: Role.COMPANY },
    });
  });

  it("déduit le persona d'un compte qui coache et/ou s'entraîne", async () => {
    await expect(before({ isCoach: true, isAthlete: true })).resolves.toMatchObject({
      data: { isCompany: false, role: Role.COACH },
    });
    await expect(before({ isAthlete: true })).resolves.toMatchObject({
      data: { role: Role.ATHLETE },
    });
  });

  // Le CHECK le refuserait aussi, mais en 500 : ici, une erreur que le client sait lire.
  it.each([
    ["coach", { isCoach: true }],
    ["athlète", { isAthlete: true }],
  ])("refuse une entreprise qui serait aussi %s", async (_, capability) => {
    await expect(before({ isCompany: true, ...capability })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("refuse un compte sans aucun type", async () => {
    await expect(before({})).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("createAuth — l'entreprise du compte Entreprise (#600)", () => {
  function setup(upsert: () => Promise<unknown>) {
    const remove = vi.fn(() => Promise.resolve({}));
    const prisma = {
      organization: { upsert: vi.fn(upsert) },
      user: { delete: remove },
    } as unknown as PrismaClient;
    const after = authWith({}, prisma).options.databaseHooks?.user?.create?.after;
    const run = (user: Record<string, unknown>) => after?.({ id: "usr_f", ...user } as never);
    return { prisma, remove, run };
  }

  it("crée l'entreprise sous l'id du compte, de façon rejouable", async () => {
    const { prisma, run } = setup(() => Promise.resolve({}));

    await run({ isCompany: true });

    expect(prisma.organization.upsert).toHaveBeenCalledWith({
      where: { id: "usr_f" },
      create: { id: "usr_f" },
      update: {},
    });
  });

  it("n'en crée aucune pour un compte qui coache ou s'entraîne", async () => {
    const { prisma, run } = setup(() => Promise.resolve({}));

    await run({ isCoach: true });

    expect(prisma.organization.upsert).not.toHaveBeenCalled();
  });

  /**
   * Sans transaction autour de l'inscription, un échec ici laissait un compte Entreprise sans
   * entreprise, et une adresse que la personne ne pouvait plus réutiliser.
   */
  it("supprime le compte tout juste créé si l'entreprise échoue, et rend l'échec", async () => {
    const failure = new Error("base indisponible");
    const { remove, run } = setup(() => Promise.reject(failure));

    await expect(run({ isCompany: true })).rejects.toBe(failure);
    expect(remove).toHaveBeenCalledWith({ where: { id: "usr_f" } });
  });

  it("rend l'échec d'origine même si la suppression échoue aussi", async () => {
    const failure = new Error("base indisponible");
    const { remove, run } = setup(() => Promise.reject(failure));
    remove.mockRejectedValueOnce(new Error("toujours indisponible"));

    await expect(run({ isCompany: true })).rejects.toBe(failure);
  });
});

describe("createAuth — capacités verrouillées hors de PATCH /me/capabilities", () => {
  // Le hook lève sans être `async` : on l'appelle comme Better Auth, derrière un `await`.
  const update = async (user: Record<string, unknown>) =>
    authWith().options.databaseHooks?.user?.update?.before?.(user as never);

  // Un compte ne devient pas entreprise par `/update-user`, et une entreprise n'en sort pas.
  it.each(["isCompany", "isCoach", "isAthlete", "role"])("refuse %s", async (field) => {
    await expect(update({ [field]: true })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("laisse passer le reste du profil", async () => {
    await expect(update({ name: "F" })).resolves.toBeUndefined();
  });
});
