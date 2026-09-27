import { describe, expect, it } from "vitest";
import { envSchema, SECRET_MIN_LENGTH } from "./env.schema";

const SECRET = "s".repeat(SECRET_MIN_LENGTH);

/** Le minimum pour démarrer en développement local. */
const DEV = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/cimavia",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://192.168.1.15:3000",
  SIGNUP_MODE: "open",
};

/** Le minimum pour démarrer sur un tier déployé : https et jeton Expo en plus. */
const DEPLOYED = {
  ...DEV,
  BETTER_AUTH_URL: "https://api-preview.cimavia.test",
  EXPO_ACCESS_TOKEN: "jeton-robot",
  SIGNUP_MODE: "invitation",
};

/** Les variables refusées, avec leur message : ce que `validateEnv` affiche au démarrage. */
function refusals(env: Record<string, unknown>) {
  const result = envSchema.safeParse(env);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

describe("envSchema — secrets (#357)", () => {
  it(`refuse un secret Better Auth de moins de ${SECRET_MIN_LENGTH} caractères, même en développement`, () => {
    expect(refusals({ ...DEV, BETTER_AUTH_SECRET: "x".repeat(SECRET_MIN_LENGTH - 1) })).toEqual([
      {
        path: "BETTER_AUTH_SECRET",
        message: expect.stringContaining("openssl rand -base64 32"),
      },
    ]);
  });

  it("refuse un secret de tick trop court quand il est posé", () => {
    expect(refusals({ ...DEV, REMINDER_TICK_SECRET: "court" })).toEqual([
      { path: "REMINDER_TICK_SECRET", message: expect.stringContaining(`${SECRET_MIN_LENGTH}`) },
    ]);
  });

  it("laisse le secret de tick absent : la route répond alors 503, elle ne s'ouvre pas", () => {
    expect(refusals({ ...DEPLOYED, REMINDER_TICK_SECRET: "" })).toEqual([]);
  });
});

describe("envSchema — tiers déployés (#357)", () => {
  it.each(["preview", "production"])("démarre en %s avec https et le jeton Expo", (tier) => {
    expect(refusals({ ...DEPLOYED, APP_ENV: tier, REMINDER_TICK_SECRET: SECRET })).toEqual([]);
  });

  it.each(["preview", "production"])("refuse en %s une URL d'auth en http", (tier) => {
    expect(refusals({ ...DEPLOYED, APP_ENV: tier, BETTER_AUTH_URL: "http://api.test" })).toEqual([
      { path: "BETTER_AUTH_URL", message: expect.stringContaining(`https exigé en ${tier}`) },
    ]);
  });

  it.each(["preview", "production"])("refuse en %s l'absence du jeton Expo", (tier) => {
    // Vide compte comme absent : c'est la valeur du `.env.example`, recopié tel quel.
    expect(refusals({ ...DEPLOYED, APP_ENV: tier, EXPO_ACCESS_TOKEN: "" })).toEqual([
      { path: "EXPO_ACCESS_TOKEN", message: expect.stringContaining(`obligatoire en ${tier}`) },
    ]);
  });

  it("signale ensemble les deux exigences du tier, pas une par démarrage", () => {
    const { EXPO_ACCESS_TOKEN: _absent, ...withoutExpo } = DEPLOYED;

    expect(
      refusals({ ...withoutExpo, APP_ENV: "preview", BETTER_AUTH_URL: "http://api.test" }).map(
        (refusal) => refusal.path,
      ),
    ).toEqual(["BETTER_AUTH_URL", "EXPO_ACCESS_TOKEN"]);
  });

  it("reste permissif en développement : http et pas de jeton Expo", () => {
    expect(refusals(DEV)).toEqual([]);
    expect(envSchema.parse(DEV).APP_ENV).toBe("development");
  });
});
