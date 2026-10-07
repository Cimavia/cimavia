import { InvitationRole, InvitationStatus } from "@cmv/shared";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp, createHttpAdapter } from "../src/app.setup";
import { fr } from "../src/infra/mail/locale/fr";
import type { MailMessage } from "../src/infra/mail/mail.service";
import { MailService } from "../src/infra/mail/mail.service";
import { PrismaService } from "../src/infra/prisma/prisma.service";

/**
 * L'entreprise ajoute des Coachs à son équipe (#601).
 *
 * Une suite à part d'`isolation.e2e-spec.ts`, déjà longue de dix mille lignes : celle-ci ne dépend
 * d'aucun de ses blocs, et ses comptes portent le préfixe `org-` pour ne croiser personne. Le
 * harnais est le même — app montée une fois, transport d'e-mails doublé pour affirmer un NON-envoi.
 */

const PASSWORD = "password123";

type Agent = ReturnType<typeof request.agent>;

let app: NestFastifyApplication;
let baseURL: string;

const sentMails: MailMessage[] = [];
const mailServiceDouble = {
  isConfigured: true,
  send: (message: MailMessage) => {
    sentMails.push(message);
    return Promise.resolve(true);
  },
};

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Donnée de test absente : ${what}`);
  return value;
}

const COACH = { isCoach: true, isAthlete: false };
const ATHLETE = { isCoach: false, isAthlete: true };
const BOTH = { isCoach: true, isAthlete: true };
const COMPANY = { isCoach: false, isAthlete: false, isCompany: true };

/** `name = email`, comme dans la suite d'isolation : le nom d'un compte s'y lit comme son adresse. */
async function signUpWith(
  email: string,
  capabilities: { isCoach: boolean; isAthlete: boolean; isCompany?: boolean },
): Promise<Agent> {
  const agent = request.agent(baseURL);
  const res = await agent
    .post("/api/auth/sign-up/email")
    .send({ name: email, email, password: PASSWORD, ...capabilities });
  expect([200, 201]).toContain(res.status);
  return agent;
}

async function idOf(agent: Agent): Promise<string> {
  const session = await agent.get("/api/auth/get-session");
  return required(session.body?.user?.id, "id de session");
}

async function invite(company: Agent, email: string): Promise<string> {
  const res = await company.post("/organization/invitations").send({ email });
  expect(res.status).toBe(201);
  return res.body.id;
}

const typesOf = async (agent: Agent): Promise<string[]> =>
  (await agent.get("/me/notifications")).body.map((entry: { type: string }) => entry.type);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailServiceDouble)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // `user` en CASCADE emporte tout ce qui en dépend : la suite rejouée ne bute pas sur ses adresses.
  await app.get(PrismaService).$executeRawUnsafe(`TRUNCATE TABLE "user" CASCADE`);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  baseURL = `http://localhost:${port}`;
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  sentMails.length = 0;
});

describe("L'entreprise invite des Coachs (#601)", () => {
  let company: Agent;

  beforeAll(async () => {
    company = await signUpWith("org-f@cmv.test", COMPANY);
  });

  it("commence sans membre ni invitation", async () => {
    const coaches = await company.get("/organization/coaches");
    const invitations = await company.get("/organization/invitations");

    expect(coaches.status).toBe(200);
    expect(coaches.body).toEqual([]);
    expect(invitations.body).toEqual([]);
  });

  it("émet une invitation de Coach, qui rejoint sa liste", async () => {
    const res = await company
      .post("/organization/invitations")
      .send({ email: "Org-Julie@CMV.test" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: "org-julie@cmv.test",
      status: InvitationStatus.PENDING,
      role: InvitationRole.COACH,
    });
    const listed = (await company.get("/organization/invitations")).body;
    expect(listed.map((invitation: { id: string }) => invitation.id)).toContain(res.body.id);
  });

  it("refuse une invitation sans adresse (400)", async () => {
    expect((await company.post("/organization/invitations").send({})).status).toBe(400);
  });

  /**
   * #146 : la réponse ne dit pas s'il y a un compte à l'adresse, ni lequel. Seul le canal change,
   * et il est invisible à l'entreprise.
   */
  it("répond pareil, que l'adresse ait un compte Coach, athlète ou aucun", async () => {
    await signUpWith("org-same-coach@cmv.test", COACH);
    await signUpWith("org-same-athlete@cmv.test", ATHLETE);

    const shapes = [];
    for (const email of [
      "org-same-coach@cmv.test",
      "org-same-athlete@cmv.test",
      "org-same-none@cmv.test",
    ]) {
      const res = await company.post("/organization/invitations").send({ email });
      const { id: _id, email: _email, createdAt: _c, expiresAt: _e, ...rest } = res.body;
      shapes.push({ status: res.status, keys: Object.keys(res.body).sort(), rest });
    }

    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);
  });

  it("prévient un compte Coach dans l'application, sans lui écrire", async () => {
    const coach = await signUpWith("org-notified@cmv.test", COACH);

    await invite(company, "org-notified@cmv.test");

    const entry = required((await coach.get("/me/notifications")).body[0], "notification");
    expect(entry).toMatchObject({
      type: "ORGANIZATION_INVITATION_RECEIVED",
      entityType: "INVITATION",
      actorName: "org-f@cmv.test",
    });
    expect(sentMails).toEqual([]);
  });

  it("écrit à une adresse sans compte, avec la consigne de cocher « Je coache »", async () => {
    await invite(company, "org-nobody@cmv.test");

    const mail = required(sentMails[0], "e-mail d'invitation");
    expect(mail.to).toBe("org-nobody@cmv.test");
    expect(mail.subject).toContain("org-f@cmv.test");
    expect(mail.text).toContain(fr.organizationInvitation.addressLine);
  });

  /**
   * Un compte sans capacité Coach ne peut pas être invité par une entreprise : ni notification ni
   * e-mail, rien à voir, et 403 à l'acceptation. Un compte Entreprise compris.
   */
  it.each([
    ["athlète seul", "org-only-athlete@cmv.test", ATHLETE],
    ["Entreprise", "org-other-company@cmv.test", COMPANY],
  ])("ne laisse rien parvenir à un compte %s", async (_, email, capabilities) => {
    const invited = await signUpWith(email, capabilities);
    const id = await invite(company, email);

    expect(sentMails).toEqual([]);
    expect(await typesOf(invited)).toEqual([]);
    expect((await invited.get("/organization-invitations/for-me")).status).toBe(403);
    expect((await invited.post(`/organization-invitations/${id}/accept`)).status).toBe(403);
  });

  // Les routes d'athlète ne lisent que les invitations d'athlète : sinon accepter « en athlète »
  // une invitation de Coach créerait un lien sans Coach.
  it("n'apparaît pas aux routes d'athlète, même d'un compte qui cumule", async () => {
    const both = await signUpWith("org-both@cmv.test", BOTH);
    const id = await invite(company, "org-both@cmv.test");

    expect((await both.get("/invitations/for-me")).body).toEqual([]);
    expect((await both.post(`/invitations/${id}/accept`)).status).toBe(404);
    expect((await both.post(`/invitations/${id}/decline`)).status).toBe(404);
    expect((await both.get("/organization-invitations/for-me")).body).toHaveLength(1);
  });

  it("ferme son espace à un Coach et à un athlète (403)", async () => {
    const coach = await signUpWith("org-outsider-coach@cmv.test", COACH);
    const athlete = await signUpWith("org-outsider-athlete@cmv.test", ATHLETE);

    for (const agent of [coach, athlete]) {
      expect((await agent.get("/organization/coaches")).status).toBe(403);
      expect((await agent.get("/organization/invitations")).status).toBe(403);
      expect(
        (await agent.post("/organization/invitations").send({ email: "x@cmv.test" })).status,
      ).toBe(403);
    }
  });
});

describe("Le Coach répond à l'invitation d'une entreprise (#601)", () => {
  let company: Agent;

  beforeAll(async () => {
    company = await signUpWith("org-answer-f@cmv.test", COMPANY);
  });

  it("ne montre l'invitation qu'au Coach visé, avec le nom de l'entreprise", async () => {
    const target = await signUpWith("org-target@cmv.test", COACH);
    const other = await signUpWith("org-not-target@cmv.test", COACH);
    await invite(company, "org-target@cmv.test");

    const entry = required(
      (await target.get("/organization-invitations/for-me")).body[0],
      "invitation reçue",
    );
    expect(Object.keys(entry).sort()).toEqual(["createdAt", "expiresAt", "id", "organizationName"]);
    expect(entry.organizationName).toBe("org-answer-f@cmv.test");
    expect((await other.get("/organization-invitations/for-me")).body).toEqual([]);
  });

  it("fait du Coach un membre, une seule fois", async () => {
    const coach = await signUpWith("org-joiner@cmv.test", COACH);
    const coachId = await idOf(coach);
    const id = await invite(company, "org-joiner@cmv.test");

    expect((await coach.post(`/organization-invitations/${id}/accept`)).status).toBe(204);

    const members = (await company.get("/organization/coaches")).body;
    expect(members).toContainEqual({
      coachId,
      name: "org-joiner@cmv.test",
      email: "org-joiner@cmv.test",
      joinedAt: expect.any(String),
    });
    const invitation = (await company.get("/organization/invitations")).body.find(
      (row: { id: string }) => row.id === id,
    );
    expect(invitation.status).toBe(InvitationStatus.ACCEPTED);
    expect((await coach.get("/organization-invitations/for-me")).body).toEqual([]);
    expect((await coach.post(`/organization-invitations/${id}/accept`)).status).toBe(404);
  });

  // L'entreprise voit déjà l'adresse de ses membres : le lui dire n'apprend rien (#146 tient).
  it("refuse de réinviter un membre (409), et refuse une seconde adhésion (409)", async () => {
    const coach = await signUpWith("org-twice@cmv.test", COACH);
    const first = await invite(company, "org-twice@cmv.test");
    const second = await invite(company, "org-twice@cmv.test");
    await coach.post(`/organization-invitations/${first}/accept`);

    expect(
      (await company.post("/organization/invitations").send({ email: "ORG-Twice@cmv.test" }))
        .status,
    ).toBe(409);
    const late = await coach.post(`/organization-invitations/${second}/accept`);
    expect(late.status).toBe(409);
    expect(late.body.message).toBe("Tu es déjà membre de cette entreprise");
  });

  it("laisse le refus visible à l'entreprise, qui peut l'effacer", async () => {
    const coach = await signUpWith("org-refuser@cmv.test", COACH);
    const id = await invite(company, "org-refuser@cmv.test");

    expect((await coach.post(`/organization-invitations/${id}/decline`)).status).toBe(204);

    const row = (await company.get("/organization/invitations")).body.find(
      (invitation: { id: string }) => invitation.id === id,
    );
    expect(row.status).toBe(InvitationStatus.DECLINED);
    expect((await company.delete(`/organization/invitations/${id}`)).status).toBe(204);
    expect(
      (await company.get("/organization/invitations")).body.map((i: { id: string }) => i.id),
    ).not.toContain(id);
  });

  it("retire une invitation en attente, que le Coach lit « retirée » (410)", async () => {
    const coach = await signUpWith("org-revoked@cmv.test", COACH);
    const id = await invite(company, "org-revoked@cmv.test");

    expect((await company.post(`/organization/invitations/${id}/revoke`)).status).toBe(204);

    const late = await coach.post(`/organization-invitations/${id}/accept`);
    expect(late.status).toBe(410);
    expect(late.body.message).toBe("Invitation retirée par l'entreprise");
    expect((await company.post(`/organization/invitations/${id}/revoke`)).status).toBe(409);
  });

  it("refuse d'effacer une invitation en attente (409)", async () => {
    const id = await invite(company, "org-still-pending@cmv.test");

    expect((await company.delete(`/organization/invitations/${id}`)).status).toBe(409);
  });

  it("ne montre ni n'accepte une invitation expirée", async () => {
    const coach = await signUpWith("org-expired@cmv.test", COACH);
    const id = await invite(company, "org-expired@cmv.test");
    await app.get(PrismaService).invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await coach.get("/organization-invitations/for-me")).body).toEqual([]);
    expect((await coach.post(`/organization-invitations/${id}/accept`)).status).toBe(400);
  });

  it("refuse l'invitation adressée à un autre Coach (404)", async () => {
    await signUpWith("org-addressee@cmv.test", COACH);
    const intruder = await signUpWith("org-intruder@cmv.test", COACH);
    const id = await invite(company, "org-addressee@cmv.test");

    expect((await intruder.post(`/organization-invitations/${id}/accept`)).status).toBe(404);
    expect((await intruder.post(`/organization-invitations/${id}/decline`)).status).toBe(404);
  });
});

describe("Isolation entre entreprises et émetteurs (#601)", () => {
  let f: Agent;
  let g: Agent;
  let coach: Agent;
  let fInvitation: string;

  beforeAll(async () => {
    f = await signUpWith("org-iso-f@cmv.test", COMPANY);
    g = await signUpWith("org-iso-g@cmv.test", COMPANY);
    coach = await signUpWith("org-iso-coach@cmv.test", COACH);
    const joined = await invite(f, "org-iso-coach@cmv.test");
    await coach.post(`/organization-invitations/${joined}/accept`);
    fInvitation = await invite(f, "org-iso-pending@cmv.test");
    // Le Coach émet lui aussi : une invitation d'athlète, dans la même table.
    await coach.post("/invitations").send({ email: "org-iso-athlete@cmv.test" });
  });

  it("ne montre à une entreprise que ses membres et ses invitations", async () => {
    expect((await g.get("/organization/coaches")).body).toEqual([]);
    expect((await g.get("/organization/invitations")).body).toEqual([]);
    expect((await f.get("/organization/coaches")).body).toHaveLength(1);
    const emails = (await f.get("/organization/invitations")).body.map(
      (invitation: { email: string }) => invitation.email,
    );
    expect(emails).not.toContain("org-iso-athlete@cmv.test");
  });

  it("refuse à une entreprise les gestes sur l'invitation d'une autre (404)", async () => {
    expect((await g.post(`/organization/invitations/${fInvitation}/revoke`)).status).toBe(404);
    expect((await g.delete(`/organization/invitations/${fInvitation}`)).status).toBe(404);
  });

  // Les invitations d'entreprise ne se mêlent pas à celles que le Coach émet.
  it("ne montre au Coach, parmi ses invitations émises, que les siennes", async () => {
    const emails = (await coach.get("/invitations")).body.map(
      (invitation: { email: string }) => invitation.email,
    );

    expect(emails).toEqual(["org-iso-athlete@cmv.test"]);
    expect((await coach.post(`/invitations/${fInvitation}/revoke`)).status).toBe(404);
  });
});
