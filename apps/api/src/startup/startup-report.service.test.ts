import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import { StartupReportService } from "./startup-report.service";

function serviceWith(env: Record<string, unknown>) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<EnvSchema, true>;
  const service = new StartupReportService(config, logger as unknown as PinoLogger);
  return { service, logger };
}

describe("StartupReportService — configuration", () => {
  it("journalise en warn un groupe absent, avec ce qui manque", () => {
    const { service, logger } = serviceWith({});
    service.reportConfiguration();
    expect(logger.warn).toHaveBeenCalledWith(
      { group: "tick", state: "off", missing: ["REMINDER_TICK_SECRET"] },
      "Configuration tick absente : le déclencheur de rappels répondra 503",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("journalise en info un groupe complet", () => {
    const { service, logger } = serviceWith({ EXPO_ACCESS_TOKEN: "expo" });
    service.reportConfiguration();
    expect(logger.info).toHaveBeenCalledWith(
      { group: "push", state: "complete", missing: [] },
      "Configuration push complète",
    );
  });

  it("écrit une ligne par groupe au démarrage, jamais une erreur", () => {
    const { service, logger } = serviceWith({});
    service.onApplicationBootstrap();
    expect(logger.warn).toHaveBeenCalledTimes(6);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
