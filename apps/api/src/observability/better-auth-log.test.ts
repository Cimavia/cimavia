import { APIError } from "better-auth/api";
import { pino } from "pino";
import { beforeEach, describe, expect, it } from "vitest";
import { betterAuthLogging, serializeAuthError } from "./better-auth-log";

/** Les lignes réellement écrites par un vrai logger pino, dont seul le flux est remplacé. */
let lines: Record<string, unknown>[];
let logging: ReturnType<typeof betterAuthLogging>;

beforeEach(() => {
  lines = [];
  const root = pino({ level: "debug" }, { write: (line: string) => lines.push(JSON.parse(line)) });
  logging = betterAuthLogging(root);
});

describe("betterAuthLogging — log", () => {
  it("garde une erreur et sa cause, en warn : la panne relevée part chez Sentry par ailleurs", () => {
    logging.log("error", "INTERNAL_SERVER_ERROR", new Error("connexion perdue"));

    expect(lines).toEqual([
      expect.objectContaining({
        level: 40,
        context: "BetterAuth",
        msg: "INTERNAL_SERVER_ERROR",
        err: expect.objectContaining({ type: "Error", message: "connexion perdue" }),
      }),
    ]);
  });

  it("écrit en warn une erreur sans exception : un robot ne remplit pas Sentry", () => {
    logging.log("error", "Invalid origin: https://robot.example");

    expect(lines).toEqual([
      expect.objectContaining({ level: 40, msg: "Invalid origin: https://robot.example" }),
    ]);
  });

  it("lit l'erreur passée à la place du message", () => {
    logging.log("error", new Error("session illisible"));

    expect(lines).toEqual([
      expect.objectContaining({
        msg: "Better Auth",
        err: expect.objectContaining({ message: "session illisible" }),
      }),
    ]);
  });

  it("blanchit le jeton d'une URL recopiée dans le message", () => {
    logging.log("warn", "Invalid callbackURL: https://app.test/verify?token=jeton-secret");

    expect(JSON.stringify(lines)).not.toContain("jeton-secret");
    expect(lines[0]?.msg).toBe("Invalid callbackURL: https://app.test/verify?token=[Filtered]");
  });

  it("jette les arguments qui ne sont pas une erreur", () => {
    logging.log("warn", "Invalid password", { email: "coach@cmv.test", token: "jeton-de-session" });

    expect(lines).toEqual([expect.objectContaining({ level: 40, msg: "Invalid password" })]);
    expect(JSON.stringify(lines)).not.toMatch(/coach@cmv\.test|jeton-de-session/);
  });
});

describe("betterAuthLogging — onError", () => {
  it("ignore un refus : la ligne de la requête le dit déjà", () => {
    logging.onError(new APIError("UNAUTHORIZED", { message: "Invalid email or password" }));

    expect(lines).toEqual([]);
  });

  it("écrit un APIError 500 en error, avec sa cause", () => {
    logging.onError(
      APIError.from(
        "INTERNAL_SERVER_ERROR",
        { code: "FAILED", message: "Failed to get session" },
        {
          cause: new Error("connexion perdue"),
        },
      ),
    );

    expect(lines).toEqual([
      expect.objectContaining({
        level: 50,
        msg: "Erreur d'une route Better Auth",
        err: expect.objectContaining({
          message: "Failed to get session",
          cause: expect.objectContaining({ message: "connexion perdue" }),
        }),
      }),
    ]);
  });

  it("écrit une exception imprévue en error", () => {
    logging.onError(new Error('relation "user" does not exist'));

    expect(lines).toEqual([
      expect.objectContaining({
        level: 50,
        context: "BetterAuth",
        err: expect.objectContaining({ message: 'relation "user" does not exist' }),
      }),
    ]);
  });
});

describe("serializeAuthError", () => {
  it("ne garde que le type, le code, le message et la pile blanchis", () => {
    const error = Object.assign(new TypeError("Invalid URL: https://x.test/?token=jeton-secret"), {
      code: "ERR_INVALID_URL",
      input: "https://x.test/?token=jeton-secret",
    });

    const serialized = serializeAuthError(error);

    expect(Object.keys(serialized).sort()).toEqual(["code", "message", "stack", "type"]);
    expect(serialized).toMatchObject({
      type: "TypeError",
      code: "ERR_INVALID_URL",
      message: "Invalid URL: https://x.test/?token=[Filtered]",
    });
    expect(JSON.stringify(serialized)).not.toContain("jeton-secret");
  });

  it("jette le corps et les en-têtes d'un APIError", () => {
    const error = new APIError("BAD_REQUEST", { message: "refus" }, { "set-cookie": "session" });

    expect(Object.keys(serializeAuthError(error)).sort()).toEqual(["message", "stack", "type"]);
  });

  it("arrête de suivre les causes au-delà de trois", () => {
    const deepest = new Error("4");
    const chain = new Error("0", {
      cause: new Error("1", {
        cause: new Error("2", { cause: new Error("3", { cause: deepest }) }),
      }),
    });

    expect(JSON.stringify(serializeAuthError(chain))).not.toContain('"message":"4"');
    expect(JSON.stringify(serializeAuthError(chain))).toContain('"message":"3"');
  });

  it("décrit ce qui n'est pas une erreur", () => {
    expect(serializeAuthError("panne ?token=jeton-secret")).toEqual({
      message: "panne ?token=[Filtered]",
    });
    expect(serializeAuthError({ email: "coach@cmv.test" })).toEqual({ type: "object" });
  });
});
