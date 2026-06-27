import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import type { TransportTargetOptions } from "pino";
import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infra/prisma/prisma.module";

/**
 * Cibles de transport pino :
 * - console : JSON brut en prod (capté par l'hébergeur), pino-pretty en dev ;
 * - Axiom : activé dès que AXIOM_TOKEN + AXIOM_DATASET sont fournis (logs structurés distants).
 */
function buildLogTargets(): TransportTargetOptions[] {
  const isProd = process.env.NODE_ENV === "production";
  const targets: TransportTargetOptions[] = [
    isProd
      ? { target: "pino/file", options: { destination: 1 } }
      : { target: "pino-pretty", options: { colorize: true } },
  ];

  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: "@axiomhq/pino",
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      },
    });
  }

  return targets;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport: { targets: buildLogTargets() },
        autoLogging: true,
      },
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
