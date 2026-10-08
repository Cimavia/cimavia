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
 * L'entreprise ajoute des Coachs à son équipe (#601), et invite des athlètes que tous ses Coachs
 * suivent (#602).
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

async function invite(
  company: Agent,
  email: string,
  role: InvitationRole = InvitationRole.COACH,
): Promise<string> {
  const res = await company.post("/organization/invitations").send({ email, role });
  expect(res.status).toBe(201);
  return res.body.id;
}

const COACH_INVITATIONS = "/organization/invitations?role=COACH";
const ATHLETE_INVITATIONS = "/organization/invitations?role=ATHLETE";

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
    const invitations = await company.get(COACH_INVITATIONS);

    expect(coaches.status).toBe(200);
    expect(coaches.body).toEqual([]);
    expect(invitations.body).toEqual([]);
  });

  it("émet une invitation de Coach, qui rejoint sa liste", async () => {
    const res = await company
      .post("/organization/invitations")
      .send({ email: "Org-Julie@CMV.test", role: InvitationRole.COACH });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: "org-julie@cmv.test",
      status: InvitationStatus.PENDING,
      role: InvitationRole.COACH,
    });
    const listed = (await company.get(COACH_INVITATIONS)).body;
    expect(listed.map((invitation: { id: string }) => invitation.id)).toContain(res.body.id);
  });

  it("refuse une invitation sans adresse ou sans rôle (400)", async () => {
    const post = (body: object) => company.post("/organization/invitations").send(body);

    expect((await post({ role: InvitationRole.COACH })).status).toBe(400);
    expect((await post({ email: "org-no-role@cmv.test" })).status).toBe(400);
    expect((await post({ email: "org-bad-role@cmv.test", role: "OWNER" })).status).toBe(400);
  });

  // Chaque page lit ses invitations : une liste sans rôle mêlerait les deux.
  it("refuse de lister les invitations sans rôle (400)", async () => {
    expect((await company.get("/organization/invitations")).status).toBe(400);
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
      const res = await company
        .post("/organization/invitations")
        .send({ email, role: InvitationRole.COACH });
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
    expect(mail.text).toContain(fr.organizationInvitation.COACH.addressLine);
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
      expect((await agent.get("/organization/athletes")).status).toBe(403);
      expect((await agent.get(COACH_INVITATIONS)).status).toBe(403);
      expect(
        (
          await agent
            .post("/organization/invitations")
            .send({ email: "x@cmv.test", role: InvitationRole.COACH })
        ).status,
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
    const invitation = (await company.get(COACH_INVITATIONS)).body.find(
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
      (
        await company
          .post("/organization/invitations")
          .send({ email: "ORG-Twice@cmv.test", role: InvitationRole.COACH })
      ).status,
    ).toBe(409);
    const late = await coach.post(`/organization-invitations/${second}/accept`);
    expect(late.status).toBe(409);
    expect(late.body.message).toBe("Tu es déjà membre de cette entreprise");
  });

  it("laisse le refus visible à l'entreprise, qui peut l'effacer", async () => {
    const coach = await signUpWith("org-refuser@cmv.test", COACH);
    const id = await invite(company, "org-refuser@cmv.test");

    expect((await coach.post(`/organization-invitations/${id}/decline`)).status).toBe(204);

    const row = (await company.get(COACH_INVITATIONS)).body.find(
      (invitation: { id: string }) => invitation.id === id,
    );
    expect(row.status).toBe(InvitationStatus.DECLINED);
    expect((await company.delete(`/organization/invitations/${id}`)).status).toBe(204);
    expect(
      (await company.get(COACH_INVITATIONS)).body.map((i: { id: string }) => i.id),
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

describe("Isolation entre entreprises et émetteurs (#601, #602)", () => {
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
    // Et un athlète de F (#602), que G ne doit pas voir davantage.
    const athlete = await signUpWith("org-iso-member@cmv.test", ATHLETE);
    const membership = await invite(f, "org-iso-member@cmv.test", InvitationRole.ATHLETE);
    await athlete.post(`/invitations/${membership}/accept`);
    // Le Coach émet lui aussi : une invitation d'athlète, dans la même table.
    await coach.post("/invitations").send({ email: "org-iso-athlete@cmv.test" });
  });

  it("ne montre à une entreprise que ses membres et ses invitations", async () => {
    expect((await g.get("/organization/coaches")).body).toEqual([]);
    expect((await g.get("/organization/athletes")).body).toEqual([]);
    expect((await g.get(ATHLETE_INVITATIONS)).body).toEqual([]);
    expect((await g.get(COACH_INVITATIONS)).body).toEqual([]);
    expect((await f.get("/organization/coaches")).body).toHaveLength(1);
    expect((await f.get("/organization/athletes")).body).toHaveLength(1);
    const emails = (await f.get(COACH_INVITATIONS)).body.map(
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

/**
 * Un Coach membre de `company` : invité, puis accepté. Rend son id — les liens se vérifient par
 * lui.
 */
async function joinAsCoach(company: Agent, email: string, capabilities = COACH) {
  const coach = await signUpWith(email, capabilities);
  const id = await invite(company, email);
  expect((await coach.post(`/organization-invitations/${id}/accept`)).status).toBe(204);
  return { agent: coach, id: await idOf(coach) };
}

const coachIdsOf = (relations: { coachId: string }[]) =>
  relations.map((relation) => relation.coachId).sort();

describe("L'entreprise invite des athlètes, suivis par tous ses Coachs (#602)", () => {
  let company: Agent;
  let c: { agent: Agent; id: string };
  let m: { agent: Agent; id: string };

  beforeAll(async () => {
    company = await signUpWith("org-ath-f@cmv.test", COMPANY);
    c = await joinAsCoach(company, "org-ath-c@cmv.test");
    m = await joinAsCoach(company, "org-ath-m@cmv.test");
  });

  it("commence sans athlète, et range ses invitations par rôle", async () => {
    expect((await company.get("/organization/athletes")).body).toEqual([]);
    expect((await company.get(ATHLETE_INVITATIONS)).body).toEqual([]);
    expect((await company.get(COACH_INVITATIONS)).body).toHaveLength(2);
  });

  it("prévient un compte athlète, qui voit les Coachs qui le suivront", async () => {
    const athlete = await signUpWith("org-ath-notified@cmv.test", ATHLETE);

    const id = await invite(company, "org-ath-notified@cmv.test", InvitationRole.ATHLETE);

    expect(sentMails).toEqual([]);
    const entry = required((await athlete.get("/me/notifications")).body[0], "notification");
    expect(entry).toMatchObject({
      type: "INVITATION_RECEIVED",
      entityType: "INVITATION",
      actorName: "org-ath-f@cmv.test",
    });
    const card = required((await athlete.get("/invitations/for-me")).body[0], "invitation");
    expect(card).toMatchObject({
      id,
      issuer: {
        kind: "organization",
        name: "org-ath-f@cmv.test",
        coachNames: ["org-ath-c@cmv.test", "org-ath-m@cmv.test"],
      },
    });
    const listed = (await company.get(ATHLETE_INVITATIONS)).body;
    expect(listed.map((invitation: { id: string }) => invitation.id)).toEqual([id]);
    expect(listed[0].role).toBe(InvitationRole.ATHLETE);
  });

  it("écrit à une adresse sans compte, avec la consigne de cocher « Je m'entraîne »", async () => {
    await invite(company, "org-ath-nobody@cmv.test", InvitationRole.ATHLETE);

    const mail = required(sentMails[0], "e-mail d'invitation");
    expect(mail.to).toBe("org-ath-nobody@cmv.test");
    expect(mail.subject).toContain("org-ath-f@cmv.test");
    expect(mail.text).toContain(fr.organizationInvitation.ATHLETE.addressLine);
  });

  // Un Coach seul ne peut pas accepter en athlète : il ne reçoit rien, et ne voit rien.
  it("ne laisse rien parvenir à un compte Coach seul", async () => {
    const coach = await signUpWith("org-ath-only-coach@cmv.test", COACH);
    await invite(company, "org-ath-only-coach@cmv.test", InvitationRole.ATHLETE);

    expect(sentMails).toEqual([]);
    expect(await typesOf(coach)).toEqual([]);
    expect((await coach.get("/organization-invitations/for-me")).body).toEqual([]);
  });

  it("lie l'athlète à chaque Coach, et les prévient", async () => {
    const athlete = await signUpWith("org-ath-ti@cmv.test", ATHLETE);
    const athleteId = await idOf(athlete);
    const id = await invite(company, "org-ath-ti@cmv.test", InvitationRole.ATHLETE);

    const accepted = await athlete.post(`/invitations/${id}/accept`);

    expect(accepted.status).toBe(201);
    expect(coachIdsOf(accepted.body)).toEqual([c.id, m.id].sort());
    for (const relation of accepted.body) {
      expect(relation).toMatchObject({ athleteId, organizationName: "org-ath-f@cmv.test" });
    }
    expect(coachIdsOf((await athlete.get("/me/coaches")).body)).toEqual([c.id, m.id].sort());
    for (const coach of [c, m]) {
      const athletes = (await coach.agent.get("/athletes")).body;
      expect(athletes.map((relation: { athleteId: string }) => relation.athleteId)).toContain(
        athleteId,
      );
      expect(await typesOf(coach.agent)).toContain("INVITATION_ACCEPTED");
    }

    const members = (await company.get("/organization/athletes")).body;
    expect(members).toContainEqual({
      athleteId,
      name: "org-ath-ti@cmv.test",
      email: "org-ath-ti@cmv.test",
      joinedAt: expect.any(String),
      coaches: [
        { coachId: c.id, name: "org-ath-c@cmv.test" },
        { coachId: m.id, name: "org-ath-m@cmv.test" },
      ],
    });
    const row = (await company.get(ATHLETE_INVITATIONS)).body.find(
      (invitation: { id: string }) => invitation.id === id,
    );
    expect(row.status).toBe(InvitationStatus.ACCEPTED);
  });

  // Le lien direct précède l'entreprise : il reste tel quel, et son Coach n'apprend rien.
  it("garde un lien direct existant, sans provenance", async () => {
    const athlete = await signUpWith("org-ath-direct@cmv.test", ATHLETE);
    const direct = await c.agent.post("/invitations").send({ email: "org-ath-direct@cmv.test" });
    await athlete.post(`/invitations/${direct.body.id}/accept`);
    const acceptedBefore = (await typesOf(c.agent)).filter((t) => t === "INVITATION_ACCEPTED");
    const id = await invite(company, "org-ath-direct@cmv.test", InvitationRole.ATHLETE);

    const accepted = await athlete.post(`/invitations/${id}/accept`);

    expect(accepted.status).toBe(201);
    const provenance = Object.fromEntries(
      accepted.body.map((relation: { coachId: string; organizationName: string | null }) => [
        relation.coachId,
        relation.organizationName,
      ]),
    );
    expect(provenance).toEqual({ [c.id]: null, [m.id]: "org-ath-f@cmv.test" });
    const acceptedAfter = (await typesOf(c.agent)).filter((t) => t === "INVITATION_ACCEPTED");
    expect(acceptedAfter).toHaveLength(acceptedBefore.length);
  });

  it("refuse de réinviter un athlète déjà membre (409), et une seconde adhésion (409)", async () => {
    const athlete = await signUpWith("org-ath-twice@cmv.test", ATHLETE);
    const first = await invite(company, "org-ath-twice@cmv.test", InvitationRole.ATHLETE);
    const second = await invite(company, "org-ath-twice@cmv.test", InvitationRole.ATHLETE);
    await athlete.post(`/invitations/${first}/accept`);

    const again = await company
      .post("/organization/invitations")
      .send({ email: "ORG-Ath-Twice@cmv.test", role: InvitationRole.ATHLETE });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe("Cet athlète est déjà suivi par ton entreprise");
    const late = await athlete.post(`/invitations/${second}/accept`);
    expect(late.status).toBe(409);
    expect(late.body.message).toBe("Tu es déjà athlète de cette entreprise");
  });

  // Être Coach de l'entreprise n'empêche pas d'en être athlète : les autres Coachs le suivent.
  it("saute le lien d'un Coach de l'entreprise vers lui-même", async () => {
    const both = await joinAsCoach(company, "org-ath-both@cmv.test", BOTH);
    const id = await invite(company, "org-ath-both@cmv.test", InvitationRole.ATHLETE);

    const card = required((await both.agent.get("/invitations/for-me")).body[0], "invitation");
    expect(card.issuer.coachNames).toEqual(["org-ath-c@cmv.test", "org-ath-m@cmv.test"]);
    const accepted = await both.agent.post(`/invitations/${id}/accept`);

    expect(accepted.status).toBe(201);
    expect(coachIdsOf(accepted.body)).toEqual([c.id, m.id].sort());
    const member = (await company.get("/organization/athletes")).body.find(
      (row: { athleteId: string }) => row.athleteId === both.id,
    );
    expect(member.coaches.map((coach: { coachId: string }) => coach.coachId)).toEqual([c.id, m.id]);
  });

  it("laisse le refus visible à l'entreprise, sans prévenir personne", async () => {
    const athlete = await signUpWith("org-ath-refuser@cmv.test", ATHLETE);
    const id = await invite(company, "org-ath-refuser@cmv.test", InvitationRole.ATHLETE);

    expect((await athlete.post(`/invitations/${id}/decline`)).status).toBe(204);

    const row = (await company.get(ATHLETE_INVITATIONS)).body.find(
      (invitation: { id: string }) => invitation.id === id,
    );
    expect(row.status).toBe(InvitationStatus.DECLINED);
    for (const coach of [c, m]) {
      expect(await typesOf(coach.agent)).not.toContain("INVITATION_DECLINED");
    }
  });

  it("retire une invitation en attente, que l'athlète lit « retirée » (410)", async () => {
    const athlete = await signUpWith("org-ath-revoked@cmv.test", ATHLETE);
    const id = await invite(company, "org-ath-revoked@cmv.test", InvitationRole.ATHLETE);

    expect((await company.post(`/organization/invitations/${id}/revoke`)).status).toBe(204);

    const late = await athlete.post(`/invitations/${id}/accept`);
    expect(late.status).toBe(410);
    expect(late.body.message).toBe("Invitation retirée par l'entreprise");
  });

  // Les routes du Coach ne lisent que les invitations de Coach, et réciproquement.
  it("n'apparaît pas aux routes du Coach, même d'un compte qui cumule", async () => {
    const both = await signUpWith("org-ath-cumul@cmv.test", BOTH);
    const id = await invite(company, "org-ath-cumul@cmv.test", InvitationRole.ATHLETE);

    expect((await both.get("/organization-invitations/for-me")).body).toEqual([]);
    expect((await both.post(`/organization-invitations/${id}/accept`)).status).toBe(404);
    expect((await both.get("/invitations/for-me")).body).toHaveLength(1);
  });
});

describe("Une entreprise sans Coach, et la garde anti-boucle (#602)", () => {
  it("annonce une équipe vide, et l'acceptation ne crée aucun lien", async () => {
    const empty = await signUpWith("org-empty-f@cmv.test", COMPANY);
    const athlete = await signUpWith("org-empty-ath@cmv.test", ATHLETE);
    const id = await invite(empty, "org-empty-ath@cmv.test", InvitationRole.ATHLETE);

    const card = required((await athlete.get("/invitations/for-me")).body[0], "invitation");
    expect(card.issuer).toEqual({
      kind: "organization",
      name: "org-empty-f@cmv.test",
      coachNames: [],
    });
    const accepted = await athlete.post(`/invitations/${id}/accept`);

    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual([]);
    const members = (await empty.get("/organization/athletes")).body;
    expect(members).toHaveLength(1);
    expect(members[0].coaches).toEqual([]);
  });

  /**
   * X coache M en direct ; F, dont M est Coach, invite X : M → X refermerait la boucle. Toute
   * l'acceptation est refusée — X n'est pas suivi par une partie seulement de l'équipe.
   */
  it("refuse toute l'acceptation si un seul lien boucle (409)", async () => {
    const company = await signUpWith("org-loop-f@cmv.test", COMPANY);
    const other = await joinAsCoach(company, "org-loop-c@cmv.test");
    const looped = await joinAsCoach(company, "org-loop-m@cmv.test", BOTH);
    const x = await signUpWith("org-loop-x@cmv.test", BOTH);
    const direct = await x.post("/invitations").send({ email: "org-loop-m@cmv.test" });
    expect((await looped.agent.post(`/invitations/${direct.body.id}/accept`)).status).toBe(201);
    const id = await invite(company, "org-loop-x@cmv.test", InvitationRole.ATHLETE);

    const refused = await x.post(`/invitations/${id}/accept`);

    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe("Ce lien créerait une boucle avec tes propres athlètes");
    expect((await x.get("/me/coaches")).body).toEqual([]);
    expect((await other.agent.get("/athletes")).body).toEqual([]);
    expect((await company.get("/organization/athletes")).body).toEqual([]);
    const row = (await company.get(ATHLETE_INVITATIONS)).body.find(
      (invitation: { id: string }) => invitation.id === id,
    );
    expect(row.status).toBe(InvitationStatus.PENDING);
  });
});

/** Ses athlètes par lien — sans l'entrée d'auto-coaching qu'un compte qui cumule voit aussi. */
const athleteIdsOf = async (coach: Agent): Promise<string[]> =>
  (await coach.get("/athletes")).body
    .filter((relation: { isSelf: boolean }) => !relation.isSelf)
    .map((relation: { athleteId: string }) => relation.athleteId);

describe("Le Coach qui rejoint une entreprise suit chacun de ses athlètes (#602)", () => {
  let company: Agent;
  let ti: { agent: Agent; id: string };

  /** Un athlète de `company` : invité, puis accepté. */
  async function joinAsAthlete(email: string, capabilities = ATHLETE) {
    const athlete = await signUpWith(email, capabilities);
    const id = await invite(company, email, InvitationRole.ATHLETE);
    expect((await athlete.post(`/invitations/${id}/accept`)).status).toBe(201);
    return { agent: athlete, id: await idOf(athlete) };
  }

  beforeAll(async () => {
    company = await signUpWith("org-join-f@cmv.test", COMPANY);
    ti = await joinAsAthlete("org-join-ti@cmv.test");
  });

  it("lie le Coach à chaque athlète, qui l'apprend « via » l'entreprise", async () => {
    const n = await joinAsCoach(company, "org-join-n@cmv.test");

    expect(await athleteIdsOf(n.agent)).toEqual([ti.id]);
    const relation = required(
      (await ti.agent.get("/me/coaches")).body.find(
        (row: { coachId: string }) => row.coachId === n.id,
      ),
      "lien du nouveau Coach",
    );
    expect(relation.organizationName).toBe("org-join-f@cmv.test");
    const entry = required((await ti.agent.get("/me/notifications")).body[0], "notification");
    expect(entry).toMatchObject({
      type: "ORGANIZATION_COACH_JOINED",
      entityType: "INVITATION",
      actorName: "org-join-n@cmv.test",
      subjectLabel: "org-join-f@cmv.test",
    });
    const member = (await company.get("/organization/athletes")).body.find(
      (row: { athleteId: string }) => row.athleteId === ti.id,
    );
    expect(member.coaches).toEqual([{ coachId: n.id, name: "org-join-n@cmv.test" }]);
  });

  // Le lien direct précède l'entreprise : gardé sans provenance, et son athlète n'apprend rien.
  it("garde un lien direct existant, sans provenance ni notification", async () => {
    const direct = await joinAsAthlete("org-join-direct@cmv.test");
    const p = await signUpWith("org-join-p@cmv.test", COACH);
    const invitation = await p.post("/invitations").send({ email: "org-join-direct@cmv.test" });
    await direct.agent.post(`/invitations/${invitation.body.id}/accept`);
    const pId = await idOf(p);
    const id = await invite(company, "org-join-p@cmv.test");

    expect((await p.post(`/organization-invitations/${id}/accept`)).status).toBe(204);

    const relation = (await direct.agent.get("/me/coaches")).body.find(
      (row: { coachId: string }) => row.coachId === pId,
    );
    expect(relation.organizationName).toBeNull();
    expect(await typesOf(direct.agent)).not.toContain("ORGANIZATION_COACH_JOINED");
    expect((await athleteIdsOf(p)).sort()).toEqual([ti.id, direct.id].sort());
  });

  it("saute le lien d'un athlète de l'entreprise vers lui-même", async () => {
    const both = await joinAsAthlete("org-join-both@cmv.test", BOTH);
    const id = await invite(company, "org-join-both@cmv.test");

    expect((await both.agent.post(`/organization-invitations/${id}/accept`)).status).toBe(204);

    expect(await athleteIdsOf(both.agent)).not.toContain(both.id);
    expect(await athleteIdsOf(both.agent)).toContain(ti.id);
  });

  /**
   * Le verrou sur l'entreprise : sans lui, chacun lirait la liste de l'autre AVANT son arrivée, et
   * leur lien ne naîtrait jamais. Répété, pour que l'entrelacement ait sa chance.
   */
  it("ne perd aucun lien quand un athlète et un Coach arrivent ensemble", async () => {
    for (const round of [1, 2, 3]) {
      const athlete = await signUpWith(`org-race-ath-${round}@cmv.test`, ATHLETE);
      const coach = await signUpWith(`org-race-coach-${round}@cmv.test`, COACH);
      const toAthlete = await invite(
        company,
        `org-race-ath-${round}@cmv.test`,
        InvitationRole.ATHLETE,
      );
      const toCoach = await invite(company, `org-race-coach-${round}@cmv.test`);

      const [joined, member] = await Promise.all([
        athlete.post(`/invitations/${toAthlete}/accept`),
        coach.post(`/organization-invitations/${toCoach}/accept`),
      ]);

      expect([joined.status, member.status]).toEqual([201, 204]);
      expect(await athleteIdsOf(coach)).toContain(await idOf(athlete));
    }
  });

  /**
   * TE est athlète de F et coache Y, qui coache Z ; Z rejoint F : Z → TE refermerait la boucle.
   * Toute l'adhésion est refusée — Z ne devient pas membre d'une équipe dont il ne suivrait
   * qu'une partie des athlètes.
   */
  it("refuse toute l'adhésion si un seul lien boucle (409)", async () => {
    const te = await joinAsAthlete("org-join-te@cmv.test", BOTH);
    const y = await signUpWith("org-join-y@cmv.test", BOTH);
    const z = await signUpWith("org-join-z@cmv.test", BOTH);
    const toY = await te.agent.post("/invitations").send({ email: "org-join-y@cmv.test" });
    await y.post(`/invitations/${toY.body.id}/accept`);
    const toZ = await y.post("/invitations").send({ email: "org-join-z@cmv.test" });
    await z.post(`/invitations/${toZ.body.id}/accept`);
    const id = await invite(company, "org-join-z@cmv.test");

    const refused = await z.post(`/organization-invitations/${id}/accept`);

    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe(
      "Un athlète de cette entreprise te coache déjà, directement ou non",
    );
    expect(await athleteIdsOf(z)).toEqual([]);
    const zId = await idOf(z);
    const members = (await company.get("/organization/coaches")).body;
    expect(members.map((member: { coachId: string }) => member.coachId)).not.toContain(zId);
    const row = (await company.get(COACH_INVITATIONS)).body.find(
      (invitation: { id: string }) => invitation.id === id,
    );
    expect(row.status).toBe(InvitationStatus.PENDING);
  });
});

/**
 * Le scénario de la phase de test multi-coach (#593) : C et M sont les Coachs de F ; C suit aussi
 * TE et K en direct ; F invite TI. TI est suivi par C et M — M ne voit pour autant ni TE ni K, et
 * l'entreprise voit ses membres sans jamais lire un contenu d'entraînement.
 */
describe("Isolation : l'entreprise, ses Coachs et les athlètes directs (#602)", () => {
  let f: Agent;
  let c: { agent: Agent; id: string };
  let m: { agent: Agent; id: string };
  let teId: string;
  let kId: string;
  let tiId: string;

  async function directAthleteOf(coach: Agent, email: string): Promise<string> {
    const athlete = await signUpWith(email, ATHLETE);
    const invitation = await coach.post("/invitations").send({ email });
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);
    return idOf(athlete);
  }

  beforeAll(async () => {
    f = await signUpWith("org-sc-f@cmv.test", COMPANY);
    c = await joinAsCoach(f, "org-sc-c@cmv.test");
    teId = await directAthleteOf(c.agent, "org-sc-te@cmv.test");
    kId = await directAthleteOf(c.agent, "org-sc-k@cmv.test");
    m = await joinAsCoach(f, "org-sc-m@cmv.test");
    const ti = await signUpWith("org-sc-ti@cmv.test", ATHLETE);
    const id = await invite(f, "org-sc-ti@cmv.test", InvitationRole.ATHLETE);
    expect((await ti.post(`/invitations/${id}/accept`)).status).toBe(201);
    tiId = await idOf(ti);
  });

  it("montre TI à C et à M", async () => {
    expect((await athleteIdsOf(c.agent)).sort()).toEqual([teId, kId, tiId].sort());
    expect(await athleteIdsOf(m.agent)).toEqual([tiId]);
  });

  // Entrer dans l'entreprise n'ouvre que ses athlètes : les suivis directs de C restent les siens.
  it("ne montre à M ni TE ni K, ni leur fiche", async () => {
    for (const athleteId of [teId, kId]) {
      expect((await m.agent.get(`/athletes/${athleteId}/sheet`)).status).not.toBe(200);
    }
    expect((await m.agent.get(`/athletes/${tiId}/sheet`)).status).toBe(200);
  });

  it("montre à l'entreprise ses membres, et aucun contenu d'entraînement (403)", async () => {
    expect((await f.get("/organization/coaches")).body).toHaveLength(2);
    const athletes = (await f.get("/organization/athletes")).body;
    expect(athletes.map((row: { athleteId: string }) => row.athleteId)).toEqual([tiId]);

    for (const path of ["/athletes", `/athletes/${tiId}/sheet`, "/plans", "/me/coaches"]) {
      expect((await f.get(path)).status).toBe(403);
    }
  });
});
