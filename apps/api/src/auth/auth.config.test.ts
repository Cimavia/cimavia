import { EMAIL_VERIFICATION_TOKEN_TTL_SECONDS, Role } from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthConfig, createAuth, type SendAuthLink } from "./auth.config";

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
    sendVerificationEmail: () => Promise.resolve(),
    notifyExistingAccount: () => Promise.resolve(),
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
    const sendResetPassword = vi.fn<SendAuthLink>(() => Promise.resolve());
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

/**
 * La politique de #270, lue sur la configuration : chacune de ces valeurs a un défaut différent dans
 * Better Auth, et une mise à jour qui le changerait rouvrirait la porte sans qu'un écran le montre.
 */
describe("createAuth — vérification d'adresse (#270)", () => {
  it("refuse la session sans adresse vérifiée, et renvoie le lien à la connexion", () => {
    const { options } = authWith();
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailVerification).toMatchObject({
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    });
  });

  it("envoie le lien à l'adresse, dans la langue du compte", async () => {
    const sendVerificationEmail = vi.fn<SendAuthLink>(() => Promise.resolve());
    const send = authWith({ sendVerificationEmail }).options.emailVerification
      ?.sendVerificationEmail;
    await send?.({ user: { email: "a@cmv.test", locale: "en" } as never, url: "u", token: "t" });
    expect(sendVerificationEmail).toHaveBeenCalledExactlyOnceWith({
      to: "a@cmv.test",
      locale: "en",
      url: "u",
    });
  });

  describe("inscription sur une adresse déjà prise", () => {
    function setup() {
      const notifyExistingAccount = vi.fn<AuthConfig["notifyExistingAccount"]>(() =>
        Promise.resolve(),
      );
      const deleteMany = vi.fn(() => Promise.resolve({ count: 1 }));
      const prisma = { account: { deleteMany } } as unknown as PrismaClient;
      const notify = authWith({ notifyExistingAccount }, prisma).options.emailAndPassword
        ?.onExistingUserSignUp;
      return { notifyExistingAccount, deleteMany, notify };
    }

    it("prévient le propriétaire d'un compte confirmé, sans y toucher", async () => {
      const { notifyExistingAccount, deleteMany, notify } = setup();
      await notify?.({ user: { id: "u1", email: "a@cmv.test", emailVerified: true } as never });
      expect(deleteMany).not.toHaveBeenCalled();
      expect(notifyExistingAccount).toHaveBeenCalledExactlyOnceWith({
        to: "a@cmv.test",
        locale: null,
        verified: true,
      });
    });

    /**
     * Le lien de confirmation ne porte que l'adresse : gardé, le mot de passe de celui qui a créé le
     * compte redeviendrait bon dès que le vrai propriétaire l'ouvrirait.
     */
    it("efface le mot de passe d'un compte jamais confirmé, puis prévient", async () => {
      const { notifyExistingAccount, deleteMany, notify } = setup();
      await notify?.({ user: { id: "u1", email: "a@cmv.test", emailVerified: false } as never });
      expect(deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { userId: "u1", providerId: "credential" },
      });
      expect(notifyExistingAccount).toHaveBeenCalledWith(
        expect.objectContaining({ verified: false }),
      );
    });
  });

  describe("lien ouvert sur un compte sans mot de passe", () => {
    function hookWith(credential: { id: string } | null) {
      const findFirst = vi.fn(() => Promise.resolve(credential));
      const prisma = { account: { findFirst } } as unknown as PrismaClient;
      return authWith({}, prisma).options.emailVerification?.beforeEmailVerification;
    }
    const USER = { id: "u1", email: "a@cmv.test" } as never;

    it("laisse confirmer un compte qui a son mot de passe", async () => {
      await expect(hookWith({ id: "c1" })?.(USER, undefined)).resolves.toBeUndefined();
    });

    // Confirmer puis dire « connecte-toi » mènerait à une 401 sans issue.
    it("renvoie vers la page de retour, qui dira de choisir un mot de passe", async () => {
      const request = new Request(
        "http://localhost:3001/api/auth/verify-email?token=t&callbackURL=http%3A%2F%2Flocalhost%3A5173%2Fverify-email",
      );

      const refusal = await hookWith(null)?.(USER, request).catch((error: unknown) => error);

      expect(refusal).toMatchObject({ statusCode: 302 });
      expect((refusal as { headers: Headers }).headers.get("location")).toBe(
        "http://localhost:5173/verify-email?error=PASSWORD_REQUIRED",
      );
    });

    it("refuse en 403 nommé quand aucune page de retour n'est donnée", async () => {
      await expect(hookWith(null)?.(USER, undefined)).rejects.toMatchObject({
        statusCode: 403,
        body: { code: "PASSWORD_REQUIRED" },
      });
    });
  });

  describe("réinitialisation du mot de passe", () => {
    function setup() {
      const update = vi.fn(() => Promise.resolve({}));
      const prisma = { user: { update } } as unknown as PrismaClient;
      const onReset = authWith({}, prisma).options.emailAndPassword?.onPasswordReset;
      return { update, onReset };
    }

    // Le lien est arrivé dans la boîte : l'adresse est prouvée, comme par la confirmation.
    it("confirme l'adresse d'un compte qui ne l'était pas", async () => {
      const { update, onReset } = setup();
      await onReset?.({ user: { id: "u1", emailVerified: false } as never });
      expect(update).toHaveBeenCalledExactlyOnceWith({
        where: { id: "u1" },
        data: { emailVerified: true },
      });
    });

    it("n'écrit rien pour une adresse déjà confirmée", async () => {
      const { update, onReset } = setup();
      await onReset?.({ user: { id: "u1", emailVerified: true } as never });
      expect(update).not.toHaveBeenCalled();
    });
  });
});

describe("createAuth — type de compte à l'inscription (#600)", () => {
  // `async` comme pour `update` : le hook lève, et c'est le `await` de Better Auth qui en fait un
  // rejet — le wrapper rejoue exactement ça.
  const before = async (user: Record<string, unknown>) => {
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

  /**
   * La porte de #263 tient aussi à la création, pour tout chemin qui ne passerait pas par
   * `/sign-up/email` : sans elle, un plugin qui crée des comptes contournerait l'invitation.
   */
  it("refuse la création sur un environnement fermé, avec le type demandé", async () => {
    const mayCreateAccount = vi.fn<AuthConfig["mayCreateAccount"]>(() => Promise.resolve(false));
    const hook = authWith({ mayCreateAccount }).options.databaseHooks?.user?.create?.before;

    await expect(
      hook?.({ email: "f@cmv.test", name: "F", isCompany: true } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mayCreateAccount).toHaveBeenCalledExactlyOnceWith("f@cmv.test", { isCompany: true });
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
