import { apiEnvSchema } from "@cmv/shared";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./infra/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const parsed = apiEnvSchema.safeParse(config);
        if (!parsed.success) {
          throw new Error(
            `Invalid environment variables:\n${JSON.stringify(parsed.error.format(), null, 2)}`,
          );
        }
        return parsed.data;
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        ...(process.env.NODE_ENV !== "production" && {
          transport: { target: "pino-pretty", options: { colorize: true } },
        }),
        autoLogging: true,
      },
    }),
    PrismaModule,
  ],
})
export class AppModule {}
