import "./instrument";

import { EnvSchema } from "@cmv/shared";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

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
  // Config partagée avec les tests e2e (validation d'entrée) — cf. app.setup.ts.
  configureApp(app);

  const configService = app.get(ConfigService<EnvSchema, true>);
  const port = configService.get("PORT", { infer: true });
  const version = configService.get("APP_VERSION", { infer: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("cimavia API")
    .setDescription("API de suivi de la relation coach ↔ athlète")
    // `dev` et non un numéro de repli : hors image, il n'y a PAS de version, et écrire « 0.0.0 »
    // (ce que faisait cette ligne) laissait croire le contraire. Le mot nomme l'absence.
    .setVersion(version ?? "dev")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  // CORS et validation sont posés par configureApp() (partagé avec les e2e) — cf. app.setup.ts.
  await app.listen(port ?? 3000, "0.0.0.0");

  const logger = new Logger("Bootstrap");
  logger.log(`API running on port ${port}`);
  // La version est journalisée AU DÉMARRAGE parce que c'est le seul endroit où elle se lit sans
  // authentification : `GET /version` est derrière l'AuthGuard, et la sonde de déploiement ne peut
  // donc plus dire quelle version elle vient de rendre saine.
  logger.log(
    `Env: ${configService.get("APP_ENV", { infer: true })} · NODE_ENV: ${configService.get("NODE_ENV", { infer: true })} · Version: ${version ?? "non injectée"}`,
  );
}

void bootstrap();
