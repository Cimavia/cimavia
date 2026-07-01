import "./instrument";

import { EnvSchema } from "@cmv/shared";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ZodBodyValidationPipe } from "./zod/zod-body-validation.pipe";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    // bodyParser: false → Better Auth lit le body brut des routes /api/auth/* ;
    // @thallesp/nestjs-better-auth ré-ajoute les parseurs par défaut pour les autres routes.
    { bufferLogs: true, bodyParser: false },
  );

  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  // Valide automatiquement toute entrée typée par un DTO createZodDto (schémas @cmv/shared).
  app.useGlobalPipes(new ZodBodyValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("cimavia API")
    .setDescription("API de suivi de la relation coach ↔ athlète")
    .setVersion("0.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const configService = app.get(ConfigService<EnvSchema>);
  const port = configService.get("PORT", { infer: true });

  await app.listen(port ?? 3000);

  const logger = new Logger("Bootstrap");
  logger.log(`API running on port ${port}`);
  logger.log(`Environment: ${configService.get("NODE_ENV", { infer: true })}`);
}

void bootstrap();
