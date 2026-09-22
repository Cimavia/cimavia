import { InvitationStatus, Role } from "@cmv/shared";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "../src/app.setup";
import { MailService } from "../src/infra/mail/mail.service";
import { PrismaService } from "../src/infra/prisma/prisma.service";

/**
 * Inscription FERMÉE (#263) — le comportement du tier dev (NAS).
 *
 * Une suite à part, et pas quelques cas ajoutés à `isolation.e2e-spec.ts` : la politique est lue
 * AU DÉMARRAGE de l'app (variable d'environnement), les deux modes ne peuvent donc pas cohabiter
 * dans une seule instance. Celle-ci pose `SIGNUP_MODE=invitation` avant de monter la sienne.
 *
 * Ce qu'on vérifie n'est pas « le code refuse bien », c'est la LISTE EXACTE des façons d'entrer :
 * la liste d'adresses (les coachs, que personne n'invite) et l'invitation nominative (les
 * athlètes). Un lien générique n'en fait pas partie — il n'identifie personne.
 */

const PASSWORD = "password123";
const COACH_EMAIL = "coach-autorise@cmv.test";

type Agent = ReturnType<typeof request.agent>;

let app: NestFastifyApplication;
let baseURL: string;
let prisma: PrismaService;
let previousMode: string | undefined;
let previousAllowed: string | undefined;

const mailServiceDouble = { isConfigured: true, send: () => Promise.resolve(true) };

/** L'inscription telle que les deux clients l'envoient : capacités, jamais `role` (#12). */
function signUp(email: string, capabilities: { isCoach: boolean; isAthlete: boolean }) {
  return request(baseURL)
    .post("/api/auth/sign-up/email")
    .send({ name: email, email, password: PASSWORD, ...capabilities });
}

async function signUpAgent(email: string, role: string): Promise<Agent> {
  const agent = request.agent(baseURL);
  const res = await agent.post("/api/auth/sign-up/email").send({
    name: email,
    email,
    password: PASSWORD,
    isCoach: role === Role.COACH,
    isAthlete: role === Role.ATHLETE,
  });
  expect([200, 201]).toContain(res.status);
  return agent;
}

beforeAll(async () => {
  previousMode = process.env.SIGNUP_MODE;
  previousAllowed = process.env.SIGNUP_ALLOWED_EMAILS;
  process.env.SIGNUP_MODE = "invitation";
  // Casse et espaces volontaires : cette liste se tape à la main dans un `.env`.
  process.env.SIGNUP_ALLOWED_EMAILS = ` Coach-Autorise@CMV.test , autre-coach@cmv.test `;

  /**
   * Import DYNAMIQUE, et après les deux lignes ci-dessus — ce n'est pas un détail de style.
   * `ConfigModule.forRoot()` s'exécute à l'évaluation du décorateur de `AppModule`, donc à
   * l'IMPORT du fichier : c'est là qu'il valide l'environnement et fige la configuration, bien
   * avant `createTestingModule`. Un `import` en tête de fichier aurait donc figé le
   * `SIGNUP_MODE=open` du `vitest.config.e2e.ts`, et toute cette suite aurait passé en vert sur
   * une app ouverte — en ne testant rien.
   */
  const { AppModule } = await import("../src/app.module");

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailServiceDouble)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "coach_invitation", "coach_athlete" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "user" CASCADE`);

  // Un port à soi : `isolation.e2e-spec.ts` prend celui du `.env.test`, et les deux apps
  // pourraient se croiser sur la même boucle locale.
  const port = Number(process.env.PORT ?? 3001) + 1;
  await app.listen(port);
  baseURL = `http://localhost:${port}`;
});

afterAll(async () => {
  await app?.close();
  process.env.SIGNUP_MODE = previousMode;
  process.env.SIGNUP_ALLOWED_EMAILS = previousAllowed;
});

describe("Inscription fermée (#263)", () => {
  let coach: Agent;

  beforeAll(async () => {
    coach = await signUpAgent(COACH_EMAIL, Role.COACH);
  });

  /**
   * LE test de #263. L'URL de ce tier n'a rien de secret — elle est dans l'APK et dans chaque
   * e-mail : la connaître ne doit donner aucun droit.
   */
  it("refuse une adresse ni listée ni invitée (403)", async () => {
    const res = await signUp("inconnu@cmv.test", { isCoach: false, isAthlete: true });
    expect(res.status).toBe(403);
    // Et rien n'a été créé : le refus est AVANT la création, pas un nettoyage après coup.
    await expect(prisma.user.count({ where: { email: "inconnu@cmv.test" } })).resolves.toBe(0);
  });

  // La porte des coachs : personne ne les invite. Le compte ci-dessus a été créé par `beforeAll`,
  // avec une casse et des espaces différents de ceux du `.env` — et c'est exprès.
  it("laisse entrer une adresse listée malgré la casse et les espaces", async () => {
    await expect(prisma.user.count({ where: { email: COACH_EMAIL } })).resolves.toBe(1);
  });

  // La porte des athlètes, et la seule : c'est leur coach qui l'ouvre, par leur adresse.
  it("laisse entrer une adresse invitée nominativement, puis accepter l'invitation", async () => {
    const invitation = await coach.post("/invitations").send({ email: "lea@cmv.test" });
    expect(invitation.status).toBe(201);

    const athlete = request.agent(baseURL);
    const created = await athlete.post("/api/auth/sign-up/email").send({
      name: "Lea",
      // La casse de l'inscription n'est pas celle de l'invitation : deux personnes l'ont tapée.
      email: "Lea@cmv.test",
      password: PASSWORD,
      isCoach: false,
      isAthlete: true,
    });
    expect([200, 201]).toContain(created.status);

    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
  });

  /**
   * L'écart assumé de #263 : un lien générique (`email: null`) ne pré-autorise personne. Il
   * n'identifie pas son destinataire, donc il ne peut rien dire avant l'inscription — l'accepter
   * rouvrirait l'environnement à quiconque recopie un code. Sur ce tier, on invite par l'adresse.
   */
  it("refuse une inscription adossée à un lien générique (403)", async () => {
    const generic = await coach.post("/invitations").send({});
    expect(generic.status).toBe(201);
    expect(generic.body.email ?? null).toBeNull();

    const res = await signUp("porteur-du-lien@cmv.test", { isCoach: false, isAthlete: true });
    expect(res.status).toBe(403);
  });

  // Une invitation périmée n'ouvre plus rien : les trois critères de `listForMe` valent ici aussi.
  it("refuse une adresse dont l'invitation a expiré (403)", async () => {
    const invitation = await coach.post("/invitations").send({ email: "perimee@cmv.test" });
    expect(invitation.status).toBe(201);
    await prisma.invitation.update({
      where: { id: invitation.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await signUp("perimee@cmv.test", { isCoach: false, isAthlete: true });
    expect(res.status).toBe(403);
  });

  // Idem pour une invitation déjà refusée : elle n'est plus PENDING.
  it("refuse une adresse dont l'invitation a été déclinée (403)", async () => {
    const invitation = await coach.post("/invitations").send({ email: "declinee@cmv.test" });
    expect(invitation.status).toBe(201);
    await prisma.invitation.update({
      where: { id: invitation.body.id },
      data: { status: InvitationStatus.DECLINED },
    });

    const res = await signUp("declinee@cmv.test", { isCoach: false, isAthlete: true });
    expect(res.status).toBe(403);
  });
});
