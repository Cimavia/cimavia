import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError } from "better-auth/api";
import { type Logger, pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authMiddleware,
  betterAuthLogging,
  type ContextLogger,
  runInAuthRequest,
  serializeAuthError,
} from "./better-auth-log";
import { captureHttpException } from "./sentry-capture";

vi.mock("./sentry-capture", async (original) => ({
  ...(await original<typeof import("./sentry-capture")>()),
  captureHttpException: vi.fn(),
}));

/** Les lignes réellement écrites par un vrai logger pino, dont seul le flux est remplacé. */
let lines: Record<string, unknown>[];
let root: Logger;
let logging: ReturnType<typeof betterAuthLogging>;

beforeEach(() => {
  vi.mocked(captureHttpException).mockClear();
  lines = [];
  root = pino({ level: "debug" }, { write: (line: string) => lines.push(JSON.parse(line)) });
  logging = betterAuthLogging(() => root);
});

const signIn = { method: "POST", url: "/api/auth/sign-in/email" };

describe("betterAuthLogging — log", () => {
  it("garde en error une erreur portant son exception : souvent, Better Auth l'avale", () => {
    logging.log("error", "Failed to delete session from database", new Error("connexion perdue"));

    expect(lines).toEqual([
      expect.objectContaining({
        level: 50,
        context: "BetterAuth",
        msg: "Failed to delete session from database",
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

  it("écrit en warn une erreur dont l'exception est un refus (APIError 4xx)", () => {
    logging.log("error", "Failed to verify", new APIError("BAD_REQUEST", { message: "refus" }));

    expect(lines).toEqual([expect.objectContaining({ level: 40, err: expect.any(Object) })]);
  });

  it("garde le niveau d'un avertissement qui porte une exception", () => {
    logging.log("warn", "Rate limit storage", new Error("lent"));

    expect(lines).toEqual([expect.objectContaining({ level: 40, err: expect.any(Object) })]);
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

  it("relit le logger à chaque ligne : celui de la requête, au niveau courant", () => {
    const loggers = [root.child({ req: { id: "r1" } }), root.child({ req: { id: "r2" } })];
    const perRequest = betterAuthLogging(() => loggers.shift() ?? root);

    perRequest.log("warn", "un");
    perRequest.log("warn", "deux");
    root.level = "error";
    perRequest.log("warn", "trois");

    expect(lines.map((line) => line.req)).toEqual([{ id: "r1" }, { id: "r2" }]);
  });
});

describe("betterAuthLogging — onError", () => {
  it("passe un refus à la politique des routes Nest, sans ligne : celle de la requête suffit", () => {
    const error = new APIError("FORBIDDEN", { message: "Email not verified" });

    runInAuthRequest(signIn, () => logging.onError(error));

    expect(captureHttpException).toHaveBeenCalledWith(error, 403, {
      method: "POST",
      routeOptions: { url: "/api/auth/sign-in/email" },
    });
    expect(lines).toEqual([]);
  });

  it("nomme la route par son chemin blanchi, sans sa requête", () => {
    const error = new APIError("BAD_REQUEST", { message: "Invalid token" });

    runInAuthRequest(
      { method: "GET", url: "/api/auth/reset-password/jeton?callbackURL=%2Fx" },
      () => logging.onError(error),
    );

    expect(captureHttpException).toHaveBeenCalledWith(error, 400, {
      method: "GET",
      routeOptions: { url: "/api/auth/reset-password/[Filtered]" },
    });
  });

  it("capture une panne et l'écrit en error pour Axiom, avec sa cause", () => {
    const error = APIError.from(
      "INTERNAL_SERVER_ERROR",
      { code: "FAILED", message: "Failed to get session" },
      { cause: new Error("connexion perdue") },
    );

    logging.onError(error);

    expect(captureHttpException).toHaveBeenCalledWith(error, 500, undefined);
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

  it("traite une exception imprévue en 500", () => {
    const error = new Error('relation "user" does not exist');

    logging.onError(error);

    expect(captureHttpException).toHaveBeenCalledWith(error, 500, undefined);
    expect(lines).toEqual([expect.objectContaining({ level: 50, context: "BetterAuth" })]);
  });

  it("ne double pas un 500 sans cause quand sa requête a déjà envoyé la panne", () => {
    runInAuthRequest(signIn, () => {
      logging.log("error", "Failed to list sessions", new Error("connexion perdue"));
      // Relevé SANS cause (`revoke-sessions`, `list-sessions`) : rien ne le relie à la ligne.
      logging.onError(new APIError("INTERNAL_SERVER_ERROR"));
    });

    expect(captureHttpException).not.toHaveBeenCalled();
    // Axiom garde la ligne du 500, Sentry n'a que la panne.
    expect(lines.map((line) => line.msg)).toEqual([
      "Failed to list sessions",
      "Erreur d'une route Better Auth",
    ]);
  });

  it("passe un 500 dont la cause est une autre panne, même après une ligne envoyée", () => {
    const error = APIError.from(
      "INTERNAL_SERVER_ERROR",
      { code: "FAILED", message: "Failed to create session" },
      { cause: new Error("autre panne") },
    );

    runInAuthRequest(signIn, () => {
      logging.log("error", "Failed to delete session from database", new Error("a"));
      logging.onError(error);
    });

    expect(captureHttpException).toHaveBeenCalledWith(error, 500, expect.any(Object));
  });

  it("ne compte pas un refus journalisé comme une panne envoyée", () => {
    runInAuthRequest(signIn, () => {
      logging.log("error", "Failed to verify", new APIError("BAD_REQUEST"));
      logging.onError(new APIError("INTERNAL_SERVER_ERROR"));
    });

    expect(captureHttpException).toHaveBeenCalledWith(
      expect.any(APIError),
      500,
      expect.any(Object),
    );
  });

  it.each([
    "INVALID_ORIGIN",
    "MISSING_OR_NULL_ORIGIN",
    "INVALID_CALLBACK_URL",
    "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
  ])("n'envoie pas le refus d'origine %s, qu'un script répète à volonté", (code) => {
    runInAuthRequest(signIn, () =>
      logging.onError(APIError.from("FORBIDDEN", { code, message: "refus" })),
    );

    expect(captureHttpException).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("ne confond pas deux requêtes : la panne de l'une ne fait pas taire l'autre", () => {
    runInAuthRequest(signIn, () => logging.log("error", "INTERNAL_SERVER_ERROR", new Error("a")));
    runInAuthRequest(signIn, () => logging.onError(new APIError("INTERNAL_SERVER_ERROR")));

    expect(captureHttpException).toHaveBeenCalledOnce();
  });

  it("capture encore un refus après une panne journalisée dans la même requête", () => {
    runInAuthRequest(signIn, () => {
      logging.log("error", "INTERNAL_SERVER_ERROR", new Error("a"));
      logging.onError(new APIError("FORBIDDEN"));
    });

    expect(captureHttpException).toHaveBeenCalledOnce();
  });
});

describe("authMiddleware", () => {
  it("écrit la ligne de la requête, et rattache ce qui suit à un contexte lié à la requête", async () => {
    const contexts: unknown[] = [];
    const pinoLogger: ContextLogger = {
      logger: root,
      runInContext: (fn, options) => {
        contexts.push(options?.bindings);
        return fn();
      },
    };
    const req = Object.assign(new EventTarget(), {
      id: "r1",
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: {},
      socket: {},
    }) as unknown as IncomingMessage;
    const res = { statusCode: 200, on: vi.fn(), setHeader: vi.fn(), getHeaders: () => ({}) };
    const next = vi.fn(() => logging.onError(new APIError("FORBIDDEN")));

    authMiddleware(pinoLogger)(req, res as unknown as ServerResponse, next);

    expect(next).toHaveBeenCalledOnce();
    expect(contexts).toEqual([{ req }]);
    // `onError` y lit la requête d'auth en cours.
    expect(captureHttpException).toHaveBeenCalledWith(expect.any(APIError), 403, {
      method: "POST",
      routeOptions: { url: "/api/auth/sign-in/email" },
    });
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
