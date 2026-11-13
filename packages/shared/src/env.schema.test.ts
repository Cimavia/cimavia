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

/** Le minimum pour démarrer sur un tier déployé : https, jeton Expo et en-tête d'IP en plus. */
const DEPLOYED = {
  ...DEV,
  BETTER_AUTH_URL: "https://api-preview.cimavia.test",
  EXPO_ACCESS_TOKEN: "jeton-robot",
  CLIENT_IP_HEADER: "cf-connecting-ip",
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

  it.each(["preview", "production"])("refuse en %s l'absence de l'en-tête d'IP", (tier) => {
    expect(refusals({ ...DEPLOYED, APP_ENV: tier, CLIENT_IP_HEADER: "" })).toEqual([
      { path: "CLIENT_IP_HEADER", message: expect.stringContaining(`obligatoire en ${tier}`) },
    ]);
  });

  it("signale ensemble les exigences du tier, pas une par démarrage", () => {
    const { EXPO_ACCESS_TOKEN: _expo, CLIENT_IP_HEADER: _ip, ...withoutBoth } = DEPLOYED;

    expect(
      refusals({ ...withoutBoth, APP_ENV: "preview", BETTER_AUTH_URL: "http://api.test" }).map(
        (refusal) => refusal.path,
      ),
    ).toEqual(["BETTER_AUTH_URL", "EXPO_ACCESS_TOKEN", "CLIENT_IP_HEADER"]);
  });

  it("reste permissif en développement : http, ni jeton Expo ni en-tête d'IP", () => {
    expect(refusals(DEV)).toEqual([]);
    expect(envSchema.parse(DEV).APP_ENV).toBe("development");
  });
});

/**
 * L'en-tête de l'IP du client (#781) : Fastify range les en-têtes en minuscules, un nom écrit
 * autrement ne serait jamais trouvé sur la requête — et l'IP retomberait sans bruit.
 */
describe("envSchema — en-tête de l'IP du client (#781)", () => {
  it("accepte un nom d'en-tête en minuscules", () => {
    expect(envSchema.parse(DEPLOYED).CLIENT_IP_HEADER).toBe("cf-connecting-ip");
  });

  it.each([
    ["en capitales", "CF-Connecting-IP"],
    ["avec un deux-points", "cf-connecting-ip:"],
    ["en liste", "cf-connecting-ip,x-forwarded-for"],
    // Le défaut que la variable remplace : une liste que chaque proxy allonge.
    ["qui porte une liste d'adresses", "x-forwarded-for"],
    ["qui porte une liste d'adresses (RFC 7239)", "forwarded"],
  ])("refuse un nom %s", (_, header) => {
    expect(refusals({ ...DEV, CLIENT_IP_HEADER: header }).map(({ path }) => path)).toEqual([
      "CLIENT_IP_HEADER",
    ]);
  });
});

/**
 * L'endpoint interne du storage (#649) : celui que l'API appelle elle-même, quand l'URL publique
 * — celle qu'elle signe pour le téléphone — passe par un CDN qui réécrit ses requêtes.
 */
describe("envSchema — endpoint interne du storage (#649)", () => {
  it("le laisse absent : l'API appelle alors l'endpoint public, comme avant", () => {
    expect(envSchema.parse(DEV).S3_INTERNAL_ENDPOINT).toBeUndefined();
    expect(
      envSchema.parse({ ...DEV, S3_INTERNAL_ENDPOINT: "" }).S3_INTERNAL_ENDPOINT,
    ).toBeUndefined();
  });

  it("accepte une URL de service, et refuse ce qui n'en est pas une", () => {
    expect(
      envSchema.parse({ ...DEV, S3_INTERNAL_ENDPOINT: "http://silo:9000" }).S3_INTERNAL_ENDPOINT,
    ).toBe("http://silo:9000");
    expect(refusals({ ...DEV, S3_INTERNAL_ENDPOINT: "silo 9000" }).map(({ path }) => path)).toEqual(
      ["S3_INTERNAL_ENDPOINT"],
    );
  });
});
