import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage } from "@nestjs/throttler";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { AppModule } from "../../src/app.module";
import { configureApp, createHttpAdapter } from "../../src/app.setup";
import type { MailMessage } from "../../src/infra/mail/mail.service";
import { MailService } from "../../src/infra/mail/mail.service";
import { PRISMA_LOG, PrismaService } from "../../src/infra/prisma/prisma.service";
import { NotificationService } from "../../src/notification/notification.service";
import { StartupReportService } from "../../src/startup/startup-report.service";
import { listenToQueries, QUERY_LOG } from "./query-count";
import { ResettableThrottlerStorage } from "./rate-limit";

// Toutes les tables du schéma (les `@@map` de Prisma), enfants avant parents.
const TABLES = [
  "notification_email_preference",
  "notification",
  "reminder",
  "invoice",
  "message",
  "conversation",
  "feedback_media",
  "session_feedback",
  "push_token",
  "scheduled_session_exercise_document",
  "scheduled_session_exercise_tag",
  "scheduled_session_exercise",
  "scheduled_session_block",
  "scheduled_session",
  "plan_week",
  "plan",
  "session_exercise",
  "session_block",
  "exercise_document",
  "exercise_tag",
  "sessions",
  "exercise",
  "custom_metric",
  "athlete_sheet",
  "coach_invitation",
  "coach_athlete",
  "session",
  "account",
  "verification",
  "organization_athlete",
  "organization_coach",
  "organization",
  "structure",
  "user",
];

/**
 * L'app de la suite, montée UNE fois par `setupE2eApp` et lue par chaque domaine. Des `let`
 * exportés, pas des getters : la liaison ESM est vivante, un module de domaine lit donc l'app
 * montée même s'il l'a importée avant le `beforeAll`.
 */
export let app: NestFastifyApplication;
export let baseURL: string;

/**
 * Les e-mails réellement partis — le seul moyen d'affirmer un NON-envoi.
 *
 * `.env.test` ne porte aucune variable `SMTP_*`, donc le vrai `MailService` se déclarerait non
 * configuré et rendrait `false` sans rien envoyer : la suite serait verte que l'opt-in fonctionne
 * ou pas. On remplace donc le service par un double qui ENREGISTRE, et l'on vérifie ce qui aurait
 * été livré.
 */
export const sentMails: MailMessage[] = [];
const mailServiceDouble = {
  isConfigured: true,
  send: (message: MailMessage) => {
    sentMails.push(message);
    return Promise.resolve(true);
  },
};

/**
 * Les e-mails partis, une fois livré tout ce que les notifications ont lancé après la réponse.
 *
 * Depuis #350, push et e-mail d'une notification ne sont plus attendus par la requête : lire
 * `sentMails` dès la réponse reçue, c'est lire avant l'envoi — et un « aucun e-mail » y passerait
 * au vert sans rien prouver. Les e-mails envoyés directement (invitation, réinitialisation) restent
 * attendus par leur requête, et se lisent sans ce détour.
 */
export async function deliveredMails(): Promise<MailMessage[]> {
  await settleDeliveries();
  return sentMails;
}

/** Attend la fin des push et e-mails que les notifications ont lancés après leur réponse (#350). */
export function settleDeliveries(): Promise<void> {
  return app.get(NotificationService).settled();
}

const throttlerStorage = new ResettableThrottlerStorage();

/** Monte l'app, vide la base et écoute sur le port e2e — à appeler une fois, depuis l'entrée. */
export function setupE2eApp(): void {
  // Chaque cas part de compteurs de débit vides : voir `ResettableThrottlerStorage`. Avant ET après
  // chaque cas : le `beforeAll` d'un domaine tourne avant le premier `beforeEach`, il hériterait
  // sinon des requêtes du dernier cas du domaine précédent.
  beforeEach(() => throttlerStorage.reset());
  afterEach(() => throttlerStorage.reset());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Un seul point de remplacement pour les deux usages (réinitialisation de mot de passe et
      // notifications) : c'est le transport qu'on double, pas les gabarits — eux restent les vrais.
      .overrideProvider(MailService)
      .useValue(mailServiceDouble)
      // Le vrai service, construit par Nest avec le journal des requêtes (#629).
      .overrideProvider(PRISMA_LOG)
      .useValue(QUERY_LOG)
      .overrideProvider(ThrottlerStorage)
      .useValue(throttlerStorage)
      .compile();
    listenToQueries(moduleRef.get(PrismaService));
    app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
      bodyParser: false,
    });
    // Même configuration HTTP que main.ts (pipe de validation Zod) — sinon les e2e tourneraient
    // sans validation d'entrée et ne testeraient pas le comportement réel de l'API.
    configureApp(app);
    await app.init();
    // Le contrôle des migrations du démarrage (#212) lit la base sans être attendu : ses requêtes
    // doivent avoir fini avant le premier appel que mesure `countQueries`.
    await app.get(StartupReportService).migrationCheck;
    await app.getHttpAdapter().getInstance().ready();

    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
    );

    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port);
    baseURL = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app?.close();
  });
}
