import type { EnvSchema } from "@cmv/shared";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { SentryModule } from "@sentry/nestjs/setup";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { ClsModule } from "nestjs-cls";
import { LoggerModule } from "nestjs-pino";
import type { TransportTargetOptions } from "pino";
import { AccountModule } from "./account/account.module";
import { createAuth } from "./auth/auth.config";
import { validateEnv } from "./config/env.validation";
import { browserOrigins, MOBILE_SCHEME } from "./config/origins";
import { ExerciseModule } from "./exercise/exercise.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { PrismaService } from "./infra/prisma/prisma.service";
import { SentryExceptionFilter } from "./observability/sentry-exception.filter";
import { PlanModule } from "./plan/plan.module";
import { SessionModule } from "./session/session.module";
import { TenancyModule } from "./tenancy/tenancy.module";

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
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate: validateEnv,
    }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport: { targets: buildLogTargets() },
        autoLogging: true,
      },
    }),
    PrismaModule,
    BetterAuthModule.forRootAsync({
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<EnvSchema, true>) => ({
        auth: createAuth(prisma, {
          secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
          baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
          trustedOrigins: [...browserOrigins(config), MOBILE_SCHEME],
        }),
      }),
    }),
    TenancyModule,
    AccountModule,
    ExerciseModule,
    SessionModule,
    PlanModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: SentryExceptionFilter }],
})
export class AppModule {}
