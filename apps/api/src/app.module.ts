import type { EnvSchema } from "@cmv/shared";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { SentryModule } from "@sentry/nestjs/setup";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { ClsModule } from "nestjs-cls";
import { LoggerModule } from "nestjs-pino";
import { AccessModule } from "./access/access.module";
import { AccountModule } from "./account/account.module";
import { createAuth } from "./auth/auth.config";
import { CapabilityModule } from "./auth/capability.module";
import { SignupModule } from "./auth/signup.module";
import { SignupPolicy } from "./auth/signup.policy";
import { validateEnv } from "./config/env.validation";
import { browserOrigins, MOBILE_SCHEMES } from "./config/origins";
import { CustomMetricModule } from "./custom-metric/custom-metric.module";
import { ErasureModule } from "./erasure/erasure.module";
import { ExerciseModule } from "./exercise/exercise.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { HealthModule } from "./health/health.module";
import { EmailVerificationMailer } from "./infra/mail/email-verification.mailer";
import { MailModule } from "./infra/mail/mail.module";
import { PasswordResetMailer } from "./infra/mail/password-reset.mailer";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { PrismaService } from "./infra/prisma/prisma.service";
import { InvoiceModule } from "./invoice/invoice.module";
import { MessageModule } from "./message/message.module";
import { NotificationModule } from "./notification/notification.module";
import { loggerOptions } from "./observability/logger.config";
import { OrganizationModule } from "./organization/organization.module";
import { PlanModule } from "./plan/plan.module";
import { ProblemExceptionFilter } from "./problem/problem-exception.filter";
import { RateLimitModule } from "./rate-limit/rate-limit.module";
import { ReminderModule } from "./reminder/reminder.module";
import { SessionModule } from "./session/session.module";
import { StructureModule } from "./structure/structure.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { VersionModule } from "./version/version.module";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate: validateEnv,
    }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    LoggerModule.forRoot({ pinoHttp: loggerOptions() }),
    PrismaModule,
    BetterAuthModule.forRootAsync({
      // `imports` et non un MailModule global : `PrismaService` arrive ici parce que PrismaModule
      // est @Global, mais l'envoi de mails n'a aucune raison d'être visible de tout le monde.
      imports: [MailModule, SignupModule],
      inject: [
        PrismaService,
        ConfigService,
        PasswordResetMailer,
        EmailVerificationMailer,
        SignupPolicy,
      ],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService<EnvSchema, true>,
        passwordReset: PasswordResetMailer,
        emailVerification: EmailVerificationMailer,
        signup: SignupPolicy,
      ) => ({
        auth: createAuth(prisma, {
          secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
          baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
          trustedOrigins: [...browserOrigins(config), ...MOBILE_SCHEMES],
          clientIpHeader: config.get("CLIENT_IP_HEADER", { infer: true }),
          sendResetPassword: (params) => passwordReset.send(params),
          sendVerificationEmail: (params) => emailVerification.sendVerification(params),
          notifyExistingAccount: (params) => emailVerification.sendExistingAccount(params),
          mayCreateAccount: (email, account) => signup.mayCreateAccount(email, account),
        }),
      }),
    }),
    // APRÈS BetterAuthModule, et l'ordre compte : voir CapabilityModule.
    CapabilityModule,
    // APRÈS CapabilityModule : la clé du compteur est l'acteur que l'AuthGuard pose (#782).
    RateLimitModule,
    TenancyModule,
    NotificationModule,
    AccountModule,
    ErasureModule,
    OrganizationModule,
    AccessModule,
    ExerciseModule,
    CustomMetricModule,
    SessionModule,
    StructureModule,
    PlanModule,
    FeedbackModule,
    MessageModule,
    InvoiceModule,
    ReminderModule,
    HealthModule,
    VersionModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
})
export class AppModule {}
