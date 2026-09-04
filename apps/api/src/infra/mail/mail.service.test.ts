import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MailService } from "./mail.service";

// `vi.hoisted` parce que `vi.mock` est remonté au-dessus des imports : une const ordinaire
// référencée dans la fabrique serait lue avant son initialisation.
const { createTransport, sendMail } = vi.hoisted(() => {
  const send = vi.fn();
  return { sendMail: send, createTransport: vi.fn(() => ({ sendMail: send })) };
});
vi.mock("nodemailer", () => ({ createTransport }));

// ConfigService réduit à ce que lit MailService : un getteur sur les variables SMTP_*/MAIL_FROM.
function configWith(values: Record<string, string | number>): ConfigService<EnvSchema, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<EnvSchema, true>;
}

function loggerSpy(): PinoLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
}

const MAILPIT = {
  SMTP_HOST: "localhost",
  SMTP_PORT: 1025,
  MAIL_FROM: "Cimavia <no-reply@cimavia.fr>",
};

const MESSAGE = {
  to: "athlete@example.com",
  subject: "Réinitialisation",
  text: "lien",
  html: "<p>lien</p>",
};

beforeEach(() => {
  createTransport.mockClear();
  sendMail.mockReset();
});

/**
 * Fail-soft du mail, et c'est le contraire du storage : l'API doit démarrer sans SMTP, et un envoi
 * impossible ne doit JAMAIS lever — seulement se dire. Lever ferait échouer l'action métier de
 * l'appelant, et sur le mot de passe oublié, révélerait l'existence du compte.
 */
describe("MailService — SMTP non configuré", () => {
  it("se construit sans lever, sans ouvrir de transport, et se déclare non configuré", () => {
    const mail = new MailService(loggerSpy(), configWith({}));
    expect(mail.isConfigured).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("rend false et journalise au lieu d'envoyer", async () => {
    const logger = loggerSpy();
    const mail = new MailService(logger, configWith({}));
    await expect(mail.send(MESSAGE)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  // L'expéditeur fait partie du minimum : un serveur SMTP refuse un message sans enveloppe.
  it("considère une configuration sans expéditeur comme absente", () => {
    const { MAIL_FROM: _unused, ...partial } = MAILPIT;
    expect(new MailService(loggerSpy(), configWith(partial)).isConfigured).toBe(false);
  });
});

describe("MailService — transport ouvert", () => {
  // Le cas du dev local : Mailpit n'a pas de compte, et l'absence d'identifiants ne doit pas
  // valoir configuration incomplète — c'est la divergence assumée avec le contrat des S3_*.
  it("ouvre un transport sans authentification quand aucun identifiant n'est fourni", () => {
    const mail = new MailService(loggerSpy(), configWith(MAILPIT));
    expect(mail.isConfigured).toBe(true);
    expect(createTransport).toHaveBeenCalledWith({
      host: "localhost",
      port: 1025,
      secure: false,
    });
  });

  it("authentifie dès que les deux identifiants sont là", () => {
    new MailService(
      loggerSpy(),
      configWith({ ...MAILPIT, SMTP_USER: "api", SMTP_PASSWORD: "secret" }),
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: "api", pass: "secret" } }),
    );
  });

  // Un identifiant sans son mot de passe est une erreur de déploiement : on part sans auth (le
  // serveur refusera franchement) et on le dit, plutôt que de laisser chercher une panne réseau.
  it("signale un identifiant orphelin et n'authentifie pas à moitié", () => {
    const logger = loggerSpy();
    new MailService(logger, configWith({ ...MAILPIT, SMTP_USER: "api" }));
    expect(logger.warn).toHaveBeenCalled();
    expect(createTransport).toHaveBeenCalledWith(
      expect.not.objectContaining({ auth: expect.anything() }),
    );
  });

  // 465 est le seul port où le canal est chiffré avant le dialogue SMTP ; 587 et 1025 montent en
  // TLS par STARTTLS, et `secure: true` y casserait la poignée de main.
  it("n'active le chiffrement implicite que sur le port 465", () => {
    new MailService(loggerSpy(), configWith({ ...MAILPIT, SMTP_PORT: 465 }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });
});

describe("MailService — envoi", () => {
  it("poste le message avec l'expéditeur configuré et rend true", async () => {
    sendMail.mockResolvedValue({});
    const mail = new MailService(loggerSpy(), configWith(MAILPIT));

    await expect(mail.send(MESSAGE)).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith({ from: MAILPIT.MAIL_FROM, ...MESSAGE });
  });

  it("absorbe un échec SMTP : false, pas d'exception", async () => {
    sendMail.mockRejectedValue(new Error("ECONNREFUSED"));
    const logger = loggerSpy();
    const mail = new MailService(logger, configWith(MAILPIT));

    await expect(mail.send(MESSAGE)).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  // L'adresse est une donnée personnelle : seul son domaine part dans les logs (Pino → Axiom).
  it("ne journalise que le domaine du destinataire", async () => {
    sendMail.mockResolvedValue({});
    const logger = loggerSpy();
    await new MailService(logger, configWith(MAILPIT)).send(MESSAGE);

    const [payload] = vi.mocked(logger.info).mock.calls[0] ?? [];
    expect(payload).toMatchObject({ domain: "example.com" });
    expect(JSON.stringify(payload)).not.toContain("athlete@");
  });
});
