import type { EnvSchema } from "@cmv/shared";
import { type ExecutionContext, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import { MailService } from "../infra/mail/mail.service";
import { StorageService } from "../infra/storage/storage.service";
import { buildLogTargets } from "../observability/logger.config";
import { sentryOptions } from "../observability/sentry.config";
import { ReminderTickGuard } from "../reminder/guard/reminder-tick.guard";
import { CONFIG_GROUPS, configReport } from "./config-report";

const FULL: Record<string, string | number> = {
  SMTP_HOST: "localhost",
  SMTP_PORT: 1025,
  MAIL_FROM: "Cimavia <no-reply@cimavia.fr>",
  WEB_URL: "http://localhost:5173",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "cimavia",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  EXPO_ACCESS_TOKEN: "expo",
  REMINDER_TICK_SECRET: "x".repeat(32),
  SENTRY_DSN: "https://k@o0.ingest.sentry.io/1",
  AXIOM_TOKEN: "xaat",
  AXIOM_DATASET: "cimavia",
};

const without = (...keys: string[]) =>
  Object.fromEntries(Object.entries(FULL).filter(([key]) => !keys.includes(key)));

function reportOf(env: Record<string, unknown>) {
  return configReport((variable) => env[variable]);
}

function lineOf(env: Record<string, unknown>, group: string) {
  const line = reportOf(env).find((candidate) => candidate.group === group);
  if (line == null) throw new Error(`groupe ${group} absent du rapport`);
  return line;
}

describe("configReport", () => {
  it("rend une ligne par groupe, dans l'ordre déclaré", () => {
    expect(reportOf(FULL).map((line) => line.group)).toEqual([
      "mail",
      "storage",
      "push",
      "tick",
      "sentry",
      "axiom",
    ]);
  });

  it("dit chaque groupe complet quand tout est posé", () => {
    for (const line of reportOf(FULL)) {
      expect(line).toEqual({
        group: line.group,
        state: "complete",
        missing: [],
        message: `Configuration ${line.group} complète`,
      });
    }
  });

  it("dit chaque groupe absent quand rien n'est posé, et ce qui ne marchera pas", () => {
    const report = reportOf({});
    expect(report.every((line) => line.state === "off")).toBe(true);
    expect(lineOf({}, "mail")).toEqual({
      group: "mail",
      state: "off",
      missing: ["SMTP_HOST", "SMTP_PORT", "MAIL_FROM"],
      message: "Configuration mail absente : les e-mails ne partiront pas",
    });
  });

  // `ConfigService` rend la chaîne brute de `process.env` : un placeholder vide du `.env` n'est
  // pas une configuration.
  it("compte une chaîne vide comme absente", () => {
    expect(lineOf({ ...FULL, S3_BUCKET: "" }, "storage").missing).toEqual(["S3_BUCKET"]);
  });

  it("nomme les variables qui manquent à un groupe posé à moitié", () => {
    expect(lineOf(without("S3_REGION", "S3_SECRET_ACCESS_KEY"), "storage")).toEqual({
      group: "storage",
      state: "incomplete",
      missing: ["S3_REGION", "S3_SECRET_ACCESS_KEY"],
      message:
        "Configuration storage incomplète (manque S3_REGION, S3_SECRET_ACCESS_KEY) : l'envoi et la lecture des médias répondront 503",
    });
  });

  it("dit le mail dégradé sans WEB_URL : il part, sans ses liens", () => {
    expect(lineOf(without("WEB_URL"), "mail")).toEqual({
      group: "mail",
      state: "degraded",
      missing: ["WEB_URL"],
      message: "Configuration mail sans WEB_URL : les e-mails partiront sans aucun lien",
    });
  });

  // Sans SMTP, rien ne part : l'absence de liens n'a plus rien à dire.
  it("ne parle pas de WEB_URL quand le mail est éteint", () => {
    expect(lineOf({}, "mail").missing).not.toContain("WEB_URL");
  });

  it("allume Sentry et Axiom chacun de leur côté", () => {
    const env = without("AXIOM_DATASET");
    expect(lineOf(env, "sentry").state).toBe("complete");
    expect(lineOf(env, "axiom").state).toBe("incomplete");
  });
});

/**
 * Le rapport et le service disent la même chose. Si une variable devient requise d'un seul côté,
 * le démarrage annoncerait « complet » une capacité éteinte — ces tests cassent avant.
 */
describe("configReport — d'accord avec les services", () => {
  const configOf = (env: Record<string, unknown>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService<EnvSchema, true>;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

  // La garde du tick répond 503 sans secret, 401 sur un en-tête faux : seul le 503 dit « éteint ».
  const tickIsOn = (env: Record<string, unknown>) => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    try {
      new ReminderTickGuard(configOf(env)).canActivate(context);
      return true;
    } catch (error) {
      return !(error instanceof ServiceUnavailableException);
    }
  };

  // `buildLogTargets` et `sentryOptions` lisent `process.env`, avant que Nest n'existe.
  const asProcessEnv = (env: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
  const axiomIsOn = (env: Record<string, unknown>) => {
    for (const key of Object.keys(FULL)) vi.stubEnv(key, asProcessEnv(env)[key] ?? "");
    try {
      return buildLogTargets().some((target) => target.target === "@axiomhq/pino");
    } finally {
      vi.unstubAllEnvs();
    }
  };

  // Push n'y est pas : `NotificationService` passe le jeton à Expo sans règle à lui — c'est Expo
  // qui refuse sans.
  const services = {
    mail: (env: Record<string, unknown>) => new MailService(logger, configOf(env)).isConfigured,
    storage: (env: Record<string, unknown>) =>
      new StorageService(configOf(env), logger).isConfigured,
    tick: tickIsOn,
    sentry: (env: Record<string, unknown>) => sentryOptions(asProcessEnv(env)).enabled === true,
    axiom: axiomIsOn,
  };

  const isOn = (env: Record<string, unknown>, group: string) =>
    ["complete", "degraded"].includes(lineOf(env, group).state);

  for (const [group, isConfigured] of Object.entries(services)) {
    it(`${group} : configuré avec toutes les variables`, () => {
      expect(isConfigured(FULL)).toBe(true);
      expect(isOn(FULL, group)).toBe(true);
    });

    // Chaque variable retirée tour à tour, celles des AUTRES groupes comprises : une variable que
    // le service exigerait sans que le rapport la nomme (ou l'inverse) fait diverger les deux.
    it.each(Object.keys(FULL))(
      `${group} : sans %s, service et rapport rendent le même verdict`,
      (key) => {
        const env = without(key);
        expect(isConfigured(env)).toBe(isOn(env, group));
      },
    );
  }

  it("couvre chaque variable requise des groupes portés par un service", () => {
    const required = CONFIG_GROUPS.filter((group) => group.name in services).flatMap((group) => [
      ...group.required,
      ...(group.links?.variables ?? []),
    ]);
    expect(Object.keys(FULL)).toEqual(expect.arrayContaining(required));
  });
});
