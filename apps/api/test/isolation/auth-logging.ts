import { Role } from "@cmv/shared";
import { PinoLogger } from "nestjs-pino";
import { pino } from "pino";
import request from "supertest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { PASSWORD, required, signUp } from "../support/actors";
import { baseURL, sentMails } from "../support/app";

type LogLine = {
  msg?: string;
  level?: number;
  req?: { url?: string };
  res?: { statusCode?: number };
};

/**
 * Le flux du logger racine de nestjs-pino : celui du transport vers Axiom, que partagent tous ses
 * enfants — dont celui des routes d'auth. L'écouter, c'est lire ce qui part VRAIMENT, sans
 * remplacer aucun logger de l'app.
 */
function rootStream(): { write: (chunk: string) => boolean } {
  const root = PinoLogger.root as unknown as Record<symbol, { write: (chunk: string) => boolean }>;
  return required(root[pino.symbols.streamSym], "flux du logger racine");
}

/**
 * Les routes `/api/auth/*` journalisées comme les autres (#466). Better Auth leur répond avant le
 * middleware de nestjs-pino : avant, ni la connexion ni la réinitialisation ne laissaient de ligne.
 * Adresses préfixées `log-`.
 */
describe("Journaux des routes d'auth : une ligne par requête, sans secret (#466)", () => {
  const EMAIL = "log-coach@cmv.test";
  let write: MockInstance<(chunk: string) => boolean>;

  beforeAll(async () => {
    await signUp(EMAIL, Role.COACH);
  });

  beforeEach(() => {
    write = vi.spyOn(rootStream(), "write");
  });

  afterEach(() => {
    write.mockRestore();
  });

  const written = (): string => write.mock.calls.map(([chunk]) => String(chunk)).join("");

  /** La ligne s'écrit à la fermeture de la réponse, qui peut suivre sa réception par le client. */
  async function requestLines(url: string): Promise<LogLine[]> {
    const lines = () =>
      write.mock.calls
        .map(([chunk]) => JSON.parse(String(chunk)) as LogLine)
        .filter((line) => line.req?.url === url && line.res);
    await vi.waitFor(() => expect(lines()).not.toEqual([]));
    return lines();
  }

  const signIn = (password: string) =>
    request(baseURL).post("/api/auth/sign-in/email").send({ email: EMAIL, password });

  it("journalise une connexion, sans mot de passe, ni adresse, ni session", async () => {
    const res = await signIn(PASSWORD);
    expect(res.status).toBe(200);
    const session = required(
      /better-auth\.session_token=([^;]+)/.exec(String(res.headers["set-cookie"]))?.[1],
      "cookie de session",
    );

    const lines = await requestLines("/api/auth/sign-in/email");
    expect(lines).toEqual([
      expect.objectContaining({ msg: "request completed", level: 30, res: { statusCode: 200 } }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(EMAIL);
    expect(written()).not.toContain(PASSWORD);
    expect(written()).not.toContain(decodeURIComponent(session).split(".")[0]);
  });

  it("journalise un mot de passe faux en warn : une rafale de 401 se voit", async () => {
    expect((await signIn("mauvais-mot-de-passe")).status).toBe(401);

    const lines = await requestLines("/api/auth/sign-in/email");
    expect(lines).toEqual([expect.objectContaining({ level: 40, res: { statusCode: 401 } })]);
    expect(written()).not.toContain("mauvais-mot-de-passe");
  });

  it("blanchit le jeton du lien de réinitialisation", async () => {
    sentMails.length = 0;
    await request(baseURL)
      .post("/api/auth/request-password-reset")
      .send({ email: EMAIL, redirectTo: "http://localhost:5173/reset-password" });
    const mail = required(sentMails[0], "e-mail de réinitialisation");
    const token = required(/reset-password\/([^?"\s]+)/.exec(mail.text)?.[1], "jeton du lien");

    await request(baseURL).get(`/api/auth/reset-password/${token}?callbackURL=%2Freset-password`);

    const lines = await requestLines(
      "/api/auth/reset-password/[Filtered]?callbackURL=%2Freset-password",
    );
    expect(lines).toHaveLength(1);
    expect(written()).not.toContain(token);
  });
});
