import { Role } from "@cmv/shared";
import { ClsService } from "nestjs-cls";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import type { TenantPrisma } from "../../src/tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../src/tenancy/tenancy.module";
import { TENANT_CLS_KEY, type TenantContext } from "../../src/tenancy/tenant-context.type";
import {
  type Agent,
  billAndPublish,
  inviteFor,
  link,
  openWith,
  PASSWORD,
  participantIdsOf,
  required,
  signUp,
  signUpWith,
} from "../support/actors";
import { app, baseURL } from "../support/app";
import { attachInvoiceDocument, mondayOfCurrentWeek } from "../support/fixtures";
import { attemptPlanWrites, notFoundEverywhere, withoutSignatures } from "../support/intrusion";

describe("Isolation multi-tenant (P1)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let athleteC: Agent;
  let coachAId: string;
  let a1Id: string;
  let b1Id: string;

  beforeAll(async () => {
    coachA = await signUp("coach-a@cmv.test", Role.COACH);
    coachB = await signUp("coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("athlete-a1@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("athlete-b1@cmv.test", Role.ATHLETE);
    athleteC = await signUp("athlete-c@cmv.test", Role.ATHLETE);

    // Liaison A1 → coach A par invitation.
    const invA = await inviteFor(coachA, athleteA1);
    expect(invA.status).toBe(201);
    const acceptA = await athleteA1.post(`/invitations/${invA.body.id}/accept`);
    expect(acceptA.status).toBe(201);
    a1Id = acceptA.body[0].athleteId;
    coachAId = acceptA.body[0].coachId;

    // Liaison B1 → coach B.
    const invB = await inviteFor(coachB, athleteB1);
    const acceptB = await athleteB1.post(`/invitations/${invB.body.id}/accept`);
    b1Id = acceptB.body[0].athleteId;
  });

  it("un coach ne voit que SES athlètes, avec leur nom (pas un id opaque)", async () => {
    const res = await coachA.get("/athletes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athleteId).toBe(a1Id);
    // `signUp` inscrit le compte avec l'e-mail comme nom.
    expect(res.body[0].athleteName).toBe("athlete-a1@cmv.test");
    expect(res.body[0].coachName).toBe("coach-a@cmv.test");
  });

  it("un athlète lié voit SON coach ; un athlète autonome n'en a aucun", async () => {
    const mine = await athleteA1.get("/me/coaches");
    expect(mine.status).toBe(200);
    expect(mine.body.map((relation: { coachId: string }) => relation.coachId)).toEqual([coachAId]);

    // Une liste vide, pas `null` : l'autonomie est un état prévu, pas une absence de réponse.
    const none = await athleteC.get("/me/coaches");
    expect(none.status).toBe(200);
    expect(none.body).toEqual([]);
  });

  // L'ancien contrat d'un athlète à un seul coach est retiré (#599) : la route n'existe plus.
  it("ne sert plus la route d'un coach unique", async () => {
    expect((await athleteA1.get("/me/coach")).status).toBe(404);
  });

  it("un coach ne peut PAS lire la fiche d'un athlète d'un autre coach", async () => {
    const res = await coachA.get(`/athletes/${b1Id}/sheet`);
    expect(res.status).toBe(404);
  });

  it("un coach ne peut PAS écrire la fiche d'un athlète d'un autre coach", async () => {
    const res = await coachA
      .put(`/athletes/${b1Id}/sheet`)
      .send({ content: "intrusion", expectedUpdatedAt: null });
    expect(res.status).toBe(404);
  });

  it("la fiche écrite par un coach reste invisible à l'autre coach", async () => {
    const write = await coachA
      .put(`/athletes/${a1Id}/sheet`)
      .send({ content: "objectif 8a", expectedUpdatedAt: null });
    expect(write.status).toBe(200);
    expect(write.body.content).toBe("objectif 8a");

    const readOwn = await coachA.get(`/athletes/${a1Id}/sheet`);
    expect(readOwn.body.content).toBe("objectif 8a");

    const readOther = await coachB.get(`/athletes/${a1Id}/sheet`);
    expect(readOther.status).toBe(404);
  });

  // Une fiche par athlète : la réécrire la remplace, elle n'en crée pas une seconde.
  it("réécrire la fiche la remplace, sans en créer une autre", async () => {
    const first = await coachA.get(`/athletes/${a1Id}/sheet`);
    const second = await coachA
      .put(`/athletes/${a1Id}/sheet`)
      .send({ content: "objectif 8b", expectedUpdatedAt: first.body.updatedAt });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ id: first.body.id, content: "objectif 8b" });
    expect((await coachA.get(`/athletes/${a1Id}/sheet`)).body.content).toBe("objectif 8b");
  });

  it("le rôle gouverne l'accès : athlète ≠ coach", async () => {
    // Un athlète ne peut pas émettre d'invitation (route coach).
    expect((await athleteA1.post("/invitations").send({ email: "x@cmv.test" })).status).toBe(403);
    // Un coach ne peut pas accepter d'invitation (route athlète).
    expect((await coachA.post("/invitations/x/accept")).status).toBe(403);
    // Un athlète autonome ne peut pas agir comme coach.
    expect((await athleteC.get("/athletes")).status).toBe(403);
  });

  // Un lien par COUPLE (#599) : un second coach est permis, un second lien au même ne l'est pas.
  it("un athlète déjà suivi ne rejoint pas une seconde fois le même coach", async () => {
    const inv = await inviteFor(coachA, athleteA1);
    const res = await athleteA1.post(`/invitations/${inv.body.id}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Tu es déjà suivi par ce coach");
  });

  it("une requête non authentifiée est refusée", async () => {
    const res = await request(baseURL).get("/athletes");
    expect(res.status).toBe(401);
  });

  // Le défaut de la couche CORS ne renvoie que GET,HEAD,POST : sans `methods` explicite, tout
  // PATCH/PUT/DELETE légitime est bloqué en preflight côté navigateur (invisible en supertest).
  it("CORS : le preflight autorise les méthodes d'écriture depuis le web", async () => {
    const res = await request(baseURL)
      .options("/sessions/whatever")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PUT");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const allowed = res.headers["access-control-allow-methods"] ?? "";
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      expect(allowed).toContain(method);
    }
  });
});

/**
 * L'extension tenant ATTAQUÉE DIRECTEMENT, sur la vraie base, hors de toute route. Les routes ne
 * montrent que ses cas nominaux : aucun service n'appelle `findUnique` ni `upsert` sur ce client,
 * et une route bien câblée n'arrive jamais sans acteur ni capacité. Ce sont pourtant ces refus
 * qui font de l'isolation une règle et pas une discipline — le jour où un service les atteint, il
 * doit casser, pas servir la donnée d'un autre coach.
 */
describe("Extension tenant : les refus et les lectures par clé unique", () => {
  let db: TenantPrisma;
  let cls: ClsService;
  let coachAId: string;
  let coachBId: string;
  let exerciseAId: string;
  let exerciseBId: string;

  /**
   * Exécute `fn` comme le ferait une requête après le TenancyInterceptor. Le `await` compte : une
   * `PrismaPromise` ne part qu'à son `.then`, donc HORS du contexte si on la rendait telle quelle
   * — et tous les cas ci-dessous échoueraient sur « acteur absent », le premier passant pour rien.
   */
  function as<T>(actor: TenantContext | undefined, fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      if (actor != null) cls.set(TENANT_CLS_KEY, actor);
      return await fn();
    });
  }

  const coach = (userId: string): TenantContext => ({
    userId,
    capabilities: { isCoach: true, isAthlete: false, isCompany: false },
    exercised: "coach",
  });

  beforeAll(async () => {
    db = app.get<TenantPrisma>(TENANT_PRISMA);
    cls = app.get(ClsService);

    const coachA = await signUp("ext-coach-a@cmv.test", Role.COACH);
    const coachB = await signUp("ext-coach-b@cmv.test", Role.COACH);
    const created = await coachA.post("/exercises").send({ title: "Suspension" });
    expect(created.status).toBe(201);
    exerciseAId = created.body.id;
    coachAId = created.body.coachId;
    const decoy = await coachB.post("/exercises").send({ title: "Campus" });
    coachBId = decoy.body.coachId;
    exerciseBId = decoy.body.id;
  });

  it("refuse une requête sans acteur courant", async () => {
    await expect(as(undefined, () => db.exercise.findMany())).rejects.toThrow(
      "[tenancy] acteur courant absent — Exercise.findMany exécuté hors contexte tenant",
    );
  });

  // Un modèle oublié dans le registre ne doit pas devenir lisible par tous.
  it("refuse un modèle qui n'est pas rattaché au tenant", async () => {
    await expect(as(coach(coachAId), () => db.user.findMany())).rejects.toThrow(
      "[tenancy] modèle non scopé : User — rattacher au tenant avant usage",
    );
  });

  it("refuse une capacité qui n'a aucun accès au modèle", async () => {
    const athlete: TenantContext = {
      userId: coachAId,
      capabilities: { isCoach: true, isAthlete: true, isCompany: false },
      exercised: "athlete",
    };

    // La bibliothèque est au coach seul : à titre d'athlète, même son propriétaire n'y lit rien.
    await expect(as(athlete, () => db.exercise.findMany())).rejects.toThrow(
      "[tenancy] capacité athlete non autorisée sur Exercise",
    );
  });

  /**
   * Sans capacité déclarée, seuls les modèles au scope IDENTIQUE pour les deux passent : un
   * décorateur oublié sur une route de cycles doit casser, pas choisir un côté au hasard.
   */
  it("sans capacité déclarée : Notification passe, Plan est refusé", async () => {
    const undeclared: TenantContext = { ...coach(coachAId), exercised: null };

    await expect(as(undeclared, () => db.notification.findMany())).resolves.toEqual([]);
    await expect(as(undeclared, () => db.plan.findMany())).rejects.toThrow(
      "[tenancy] capacité (aucune déclarée) non autorisée sur Plan",
    );
  });

  // Son `where` unique et son `create` créeraient un angle mort : l'opération est interdite.
  it("refuse upsert, même sur ses propres données", async () => {
    await expect(
      as(coach(coachAId), () =>
        db.exercise.upsert({
          where: { id: exerciseAId },
          create: { title: "X" } as never,
          update: { title: "Écrasé" },
        }),
      ),
    ).rejects.toThrow("[tenancy] opération non gérée : upsert sur Exercise");

    const untouched = await app
      .get(PrismaService)
      .exercise.findUnique({ where: { id: exerciseAId } });
    expect(untouched?.title).toBe("Suspension");
  });

  it("findUnique rend sa propre ligne, et null pour celle d'un autre coach", async () => {
    await expect(
      as(coach(coachAId), () => db.exercise.findUnique({ where: { id: exerciseAId } })),
    ).resolves.toMatchObject({ id: exerciseAId, title: "Suspension" });

    // L'id exact, connu : la clé unique ne court-circuite pas le filtre tenant.
    await expect(
      as(coach(coachBId), () => db.exercise.findUnique({ where: { id: exerciseAId } })),
    ).resolves.toBeNull();
  });

  /**
   * Prisma REGROUPE les `findUnique` d'un même tick, sans regarder leurs valeurs : ces deux
   * lectures partent en UNE requête (`WHERE (id, coachId A) OR (id, coachId B)`, constaté en #626),
   * et Prisma rend à chacun sa ligne en comparant tout le `where`. Le jour où il ne comparerait que
   * la clé unique, le coach B recevrait la ligne du coach A : c'est ce test qui le verrait.
   */
  it("deux findUnique simultanés de deux coachs sur le même id ne se répondent pas l'un l'autre", async () => {
    const read = (coachId: string) =>
      as(coach(coachId), () => db.exercise.findUnique({ where: { id: exerciseAId } }));

    const [own, foreign] = await Promise.all([read(coachAId), read(coachBId)]);

    expect(own).toMatchObject({ id: exerciseAId, coachId: coachAId });
    expect(foreign).toBeNull();
  });

  /**
   * `findFirstOrThrow`, `aggregate` et `createManyAndReturn` : l'extension les autorise sans
   * qu'aucun service ne les appelle encore (#626). Le mutation testing a montré qu'on pouvait les
   * retirer du `switch` sans qu'un test le voie ; le jour où un service les emprunte, elles doivent
   * déjà scoper.
   */
  it.each([
    ["findUniqueOrThrow", () => db.exercise.findUniqueOrThrow({ where: { id: exerciseAId } })],
    ["findFirstOrThrow", () => db.exercise.findFirstOrThrow({ where: { id: exerciseAId } })],
  ] as const)("%s lève sur la ligne d'un autre coach, comme sur une absente", async (_, read) => {
    await expect(as(coach(coachAId), read)).resolves.toMatchObject({ id: exerciseAId });
    await expect(as(coach(coachBId), read)).rejects.toMatchObject({ code: "P2025" });
  });

  it("aggregate ne compte que les lignes du coach courant", async () => {
    const countOf = (coachId: string) =>
      as(coach(coachId), () =>
        db.exercise.aggregate({ where: { id: exerciseAId }, _count: { _all: true } }),
      );

    await expect(countOf(coachAId)).resolves.toMatchObject({ _count: { _all: 1 } });
    await expect(countOf(coachBId)).resolves.toMatchObject({ _count: { _all: 0 } });
  });

  // Le tenant est injecté dans CHAQUE ligne, et l'emporte sur celui qu'un appelant glisserait.
  it("createManyAndReturn écrit chez le coach courant, même si la donnée en désigne un autre", async () => {
    const created = await as(coach(coachAId), () =>
      db.exercise.createManyAndReturn({
        data: [
          { title: "Traction", titleSearch: "traction" },
          { title: "Gainage", titleSearch: "gainage", coachId: coachBId },
        ] as never,
      }),
    );

    expect(created.map((row) => row.coachId)).toEqual([coachAId, coachAId]);
  });

  /**
   * Un enfant prend le propriétaire de son PARENT, lu avec le filtre d'écriture (#603, piège n°7).
   * Aucune route n'atteint le refus : chaque service vérifie le parent avant — d'où l'attaque
   * directe, qui tient la dernière ligne de défense.
   */
  const tagsNamed = (name: string) =>
    app.get(PrismaService).exerciseTag.findMany({ where: { name } });

  // Le parent créé dans la MÊME transaction n'est visible que d'elle : la lecture doit y entrer.
  it("lit le parent dans la transaction qui vient de le créer", async () => {
    const tag = await as(coach(coachAId), () =>
      db.$transaction(async (tx) => {
        const exercise = await tx.exercise.create({
          data: { title: "Dalle", titleSearch: "dalle" } as never,
        });
        return tx.exerciseTag.create({ data: { exerciseId: exercise.id, name: "tx" } as never });
      }),
    );

    expect(tag.coachId).toBe(coachAId);
  });

  it("écrit le propriétaire du parent, même si la donnée en désigne un autre", async () => {
    const tag = await as(coach(coachAId), () =>
      db.exerciseTag.create({
        data: { exerciseId: exerciseAId, name: "glissé", coachId: coachBId } as never,
      }),
    );

    expect(tag.coachId).toBe(coachAId);
  });

  it("refuse un enfant sous le parent d'un autre coach, et n'écrit rien", async () => {
    await expect(
      as(coach(coachBId), () =>
        db.exerciseTag.create({ data: { exerciseId: exerciseAId, name: "intrus" } as never }),
      ),
    ).rejects.toThrow("[tenancy] ExerciseTag : son Exercise est introuvable, ou fermé en écriture");

    expect(await tagsNamed("intrus")).toEqual([]);
  });

  // Un seul parent étranger suffit : rien n'est écrit, pas même sous le parent légitime.
  it("refuse en entier un createMany dont un parent est à un autre coach", async () => {
    await expect(
      as(coach(coachBId), () =>
        db.exerciseTag.createMany({
          data: [
            { exerciseId: exerciseBId, name: "mêlé" },
            { exerciseId: exerciseAId, name: "mêlé" },
          ] as never,
        }),
      ),
    ).rejects.toThrow("[tenancy] ExerciseTag : son Exercise est introuvable, ou fermé en écriture");

    expect(await tagsNamed("mêlé")).toEqual([]);
  });

  it("refuse un enfant qui désigne son parent par une relation", async () => {
    await expect(
      as(coach(coachAId), () =>
        db.exerciseTag.create({
          data: { name: "connecté", exercise: { connect: { id: exerciseAId } } } as never,
        }),
      ),
    ).rejects.toThrow(
      "[tenancy] ExerciseTag se crée avec son exerciseId : son propriétaire est celui de son Exercise",
    );
  });

  // Une lecture glissée dans un lot décalerait ses résultats : la forme est refusée.
  it("refuse un enfant créé dans une transaction en tableau", async () => {
    await expect(
      as(coach(coachAId), () =>
        db.$transaction([
          db.exerciseTag.create({ data: { exerciseId: exerciseAId, name: "lot" } as never }),
        ]),
      ),
    ).rejects.toThrow("[tenancy] ExerciseTag ne se crée pas dans une transaction en tableau");

    expect(await tagsNamed("lot")).toEqual([]);
  });

  // Sans planification, la facture reste privée à qui l'émet (#593) : l'acteur en est le propriétaire.
  it("crée une facture sans planification au nom du coach courant", async () => {
    const invoice = await as(coach(coachAId), () =>
      db.invoice.create({
        data: {
          athleteId: coachBId,
          planId: null,
          period: "2026-10",
          amountCents: 1000,
          dueDate: new Date("2026-10-31"),
        } as never,
      }),
    );

    expect(invoice.coachId).toBe(coachAId);
  });
});

/**
 * Parité multi-plateforme (#36) — les MURS que les clients ne doivent jamais toucher.
 *
 * Rien de nouveau côté API : cette épic n'a ajouté aucun endpoint. Ce qu'elle a changé, c'est que
 * les DEUX rôles atteignent désormais les deux plateformes — et donc que chaque client peut, par
 * un lien profond, une notification ou un onglet mal filtré, appeler une route qui n'est pas la
 * sienne. Ces cas étaient jusqu'ici impossibles par construction (un rôle = une plateforme), donc
 * non couverts.
 *
 * Ce bloc fige où sont les murs. Il ne teste pas l'UI — aucun e2e ne le peut — mais il garantit que
 * les gardes sur lesquelles l'UI s'appuie existent bien, et qu'elles répondent 403 plutôt que de
 * servir la donnée d'un autre rôle.
 */
describe("Parité multi-plateforme : les surfaces restent fermées à l'autre rôle (#36)", () => {
  let coach: Agent;
  let athlete: Agent;
  let athleteId: string;
  let coachId: string;

  beforeAll(async () => {
    coach = await signUp("coach-parity@cmv.test", Role.COACH);
    athlete = await signUp("athlete-parity@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    athleteId = accepted.body[0].athleteId;
    coachId = accepted.body[0].coachId;
  });

  /**
   * `GET /me/plans` est `@Roles([ATHLETE])`. C'est le mur sur lequel le mobile s'est cassé : trois
   * redirections envoyaient tout le monde sur `/planning`, et un coach y prenait un 403 dès la
   * connexion.
   */
  it("refuse au coach les surfaces /me de l'athlète", async () => {
    expect((await coach.get("/me/plans")).status).toBe(403);
    expect((await coach.get("/me/coaches")).status).toBe(403);
  });

  /**
   * Le débrief est ÉCRIT par l'athlète et LU par le coach, sur deux contrôleurs distincts. Un
   * client qui se trompe de surface prend un 403 — pas une liste vide, qui laisserait croire qu'il
   * n'y a rien à lire.
   */
  it("sépare l'écriture du débrief (athlète) de sa lecture (coach)", async () => {
    expect((await coach.get("/me/scheduled-sessions/ss_inexistante/feedback")).status).toBe(403);
    expect((await athlete.get("/feedbacks")).status).toBe(403);
  });

  // La bibliothèque et le builder restent web-only ET coach-only (décision explicite de #20) :
  // l'athlète n'a aucun scope dessus, il ne voit que les copies que la planification lui expose.
  it("garde la bibliothèque et les cycles fermés à l'athlète", async () => {
    expect((await athlete.get("/exercises")).status).toBe(403);
    expect((await athlete.get("/sessions")).status).toBe(403);
    expect((await athlete.get("/plans")).status).toBe(403);
    expect((await athlete.get("/athletes")).status).toBe(403);
  });

  /**
   * `Reminder` est la SEULE entité scopée `coachId` seul : un athlète qui l'atteint est refusé par
   * une **erreur** (fail closed), pas par un 403. C'est pourquoi le contrôleur porte `@Roles` — il
   * est la garde qui transforme ce refus en réponse propre. Sans lui, l'écran de facturation web
   * ouvert à l'athlète (#27) aurait fait un 500 par son bouton « Programmer un rappel ».
   */
  it("refuse les rappels à l'athlète par un 403, jamais par une erreur", async () => {
    const list = await athlete.get("/reminders");
    expect(list.status).toBe(403);
    expect((await athlete.get("/reminders/summary")).status).toBe(403);
    expect((await athlete.post("/reminders").send({})).status).toBe(403);
  });

  /**
   * La facture est LUE par les deux (une seule route, scopée par le tenant) mais son statut n'est
   * piloté que par le coach. C'est ce qui permet un seul écran par plateforme, branché sur un
   * booléen plutôt que dupliqué.
   */
  it("ouvre la lecture des factures aux deux rôles, le statut au coach seul", async () => {
    expect((await coach.get("/invoices")).status).toBe(200);
    expect((await athlete.get("/invoices")).status).toBe(200);
    expect(
      (await athlete.patch("/invoices/inv_inexistante/status").send({ status: "PAID" })).status,
    ).toBe(403);
  });

  /**
   * La messagerie est le seul domaine ouvert aux deux rôles de bout en bout. Chacun nomme l'autre
   * à son titre (#611) — le coach un athlète, l'athlète un coach — et retombe sur le même fil.
   */
  it("ouvre la messagerie aux deux rôles, chacun de son côté", async () => {
    const opened = await openWith(coach, athleteId, "athlete");
    expect(opened.status).toBe(201);
    expect(participantIdsOf(opened.body)).toEqual([athleteId]);

    const mine = await openWith(athlete, coachId, "coach");
    expect(mine.status).toBe(201);
    expect(mine.body.id).toBe(opened.body.id);
  });

  /**
   * Un athlète ne réunit que ses Coachs : il ne lit aucun autre athlète, et nommer un tiers — même
   * aux côtés de son coach — est refusé en bloc plutôt que d'ouvrir un fil avec quelqu'un qu'il ne
   * connaît pas. Le jour où le service honorerait ce participant, il ouvrirait une fuite entre
   * tenants.
   */
  it("refuse qu'un athlète réunisse un autre athlète, même avec son coach", async () => {
    const other = await signUp("athlete-parity-2@cmv.test", Role.ATHLETE);
    const otherInvitation = await inviteFor(coach, other);
    const otherAccepted = await other.post(`/invitations/${otherInvitation.body.id}/accept`);

    const hijack = await athlete.post("/conversations").send({
      participants: [
        { userId: coachId, capability: "coach" },
        { userId: otherAccepted.body[0].athleteId, capability: "athlete" },
      ],
    });
    expect(hijack.status).toBe(400);
  });
});

describe("Double capacité : le scope suit le titre auquel on lit (#10)", () => {
  let coachA: Agent;
  let dual: Agent;
  let coachB: Agent;
  let athleteB: Agent;
  let dualId: string;

  const monday = mondayOfCurrentWeek();

  async function issueInvoice(coach: Agent, athleteId: string): Promise<void> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle facturé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);
  }

  beforeAll(async () => {
    // `dual` coche les DEUX cases : depuis #12, c'est ce que le signup permet.
    coachA = await signUp("dual-coach-a@cmv.test", Role.COACH);
    dual = await signUpWith("dual-account@cmv.test", { isCoach: true, isAthlete: true });
    coachB = await signUp("dual-coach-b@cmv.test", Role.COACH);
    athleteB = await signUp("dual-athlete-b@cmv.test", Role.ATHLETE);

    dualId = await link(coachA, dual);

    // Une facture REÇUE par `dual` (émise par coachA), et une facture d'un tenant étranger.
    await issueInvoice(coachA, dualId);
    await issueInvoice(coachB, await link(coachB, athleteB));
  });

  /**
   * Un compte sans AUCUNE capacité ne pourrait rien faire, et le fail closed de `capabilitiesOf`
   * le laisserait devant une application vide sans lui dire pourquoi. Le refus est à la création,
   * pas à chaque écran.
   */
  it("refuse une inscription sans aucune capacité", async () => {
    const res = await request.agent(baseURL).post("/api/auth/sign-up/email").send({
      name: "vide@cmv.test",
      email: "vide@cmv.test",
      password: PASSWORD,
      isCoach: false,
      isAthlete: false,
    });
    expect(res.status).toBe(400);
  });

  /**
   * `role` est DÉDUIT et non reçu (#12) : coach l'emporte quand les deux cases sont cochées.
   * C'est le persona — l'univers d'atterrissage — pas un droit.
   */
  it("déduit le persona coach d'un compte qui coche les deux", async () => {
    const session = await dual.get("/api/auth/get-session");
    expect(session.body.user.role).toBe(Role.COACH);
    expect(session.body.user.isCoach).toBe(true);
    expect(session.body.user.isAthlete).toBe(true);
  });

  /**
   * Le cas que le rôle exclusif ne savait pas trancher : `GET /invoices` n'a pas de paramètre, et
   * pour ce compte les deux réponses existent. Répondre « les émises » par convention laisserait
   * croire qu'on voit tout — c'est le fallback que la règle nullable interdit.
   */
  it("exige de préciser à quel titre on lit (400)", async () => {
    const res = await dual.get("/invoices");
    expect(res.status).toBe(400);
  });

  it("rend les factures REÇUES en tant qu'athlète", async () => {
    const res = await dual.get("/invoices?as=athlete");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athleteId).toBe(dualId);
  });

  /**
   * La même route, le même compte, l'autre titre : la liste est VIDE parce que `dual` n'a rien
   * émis. C'est ce qui prouve que le scope a changé de colonne (`athleteId` → `coachId`), et pas
   * seulement que la garde a laissé passer.
   */
  it("rend les factures ÉMISES en tant que coach — vides ici", async () => {
    const res = await dual.get("/invoices?as=coach");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  // Sans ce refus, un compte demanderait le titre qu'il n'a pas : inoffensif tant qu'il n'a rien
  // de ce côté, jusqu'au jour où il en aurait.
  it("refuse un titre que le compte ne porte pas (403)", async () => {
    expect((await coachA.get("/invoices?as=athlete")).status).toBe(403);
  });

  it("refuse un titre qui n'existe pas (400)", async () => {
    expect((await dual.get("/invoices?as=admin")).status).toBe(400);
  });

  // Un compte mono-capacité n'a rien à préciser : sa capacité est la seule réponse possible. C'est
  // ce qui fait qu'aucun client n'a eu à changer.
  it("laisse un compte mono-capacité lire sans rien préciser", async () => {
    const res = await athleteB.get("/invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  /**
   * Le centre de notifications, lui, n'a PAS de titre : il montre ce qui est adressé au compte.
   * Lui en faire exiger un aurait obligé ce compte à choisir à quel titre il consulte ses
   * notifications, et à n'en voir que la moitié — d'où l'absence de 400 ici, contrairement aux
   * factures juste au-dessus. Le contraste entre ces deux tests EST la règle.
   */
  it("rend le centre de notifications sans rien préciser", async () => {
    expect((await dual.get("/me/notifications")).status).toBe(200);
    expect((await dual.get("/me/notifications/unread-count")).status).toBe(200);
  });

  // Règle dure n°1 : cumuler deux capacités n'ouvre AUCUNE porte vers un autre tenant.
  it("ne franchit la frontière de tenant dans aucun des deux titres", async () => {
    const foreign = await coachB.get("/invoices?as=coach");
    const foreignId = required(foreign.body[0], "facture du tenant B").id;

    expect((await dual.get(`/invoices/${foreignId}?as=athlete`)).status).toBe(404);
    expect((await dual.get(`/invoices/${foreignId}?as=coach`)).status).toBe(404);
  });
});

/**
 * Le signal qui décide de l'entrée de messagerie dans chaque espace (#198).
 *
 * Route SANS capacité exigée, et c'est ce qui est testé ici autant que les valeurs : un compte
 * mono-capacité doit pouvoir la lire sans prendre de 403, sinon la navigation ne pourrait pas s'en
 * servir avant de savoir à quel titre elle s'affiche.
 */
describe("Contreparties : a-t-on quelqu'un en face (#198)", () => {
  it("dit non des deux côtés à un coach sans athlète", async () => {
    const coach = await signUpWith("cp-lonely@cmv.test", { isCoach: true, isAthlete: false });
    const res = await coach.get("/me/counterparts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asCoach: false, asAthlete: false });
  });

  // Sans garde de capacité : un athlète autonome obtient une réponse là où `GET /athletes` et
  // `GET /me/coaches` lui donneraient un 403 et une liste vide.
  it("répond à un athlète autonome sans exiger de capacité", async () => {
    const athlete = await signUp("cp-autonomous@cmv.test", Role.ATHLETE);
    expect((await athlete.get("/athletes")).status).toBe(403);

    const res = await athlete.get("/me/counterparts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asCoach: false, asAthlete: false });
  });

  it("voit la contrepartie apparaître de chaque côté quand la relation est nouée", async () => {
    const coach = await signUpWith("cp-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("cp-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    expect((await coach.get("/me/counterparts")).body).toEqual({ asCoach: true, asAthlete: false });
    expect((await athlete.get("/me/counterparts")).body).toEqual({
      asCoach: false,
      asAthlete: true,
    });
  });

  /**
   * Le cœur de #198 : l'auto-coaching ne compte pour personne. L'entrée SYNTHÉTIQUE de
   * `GET /athletes` (#14) est bien là — c'est elle qui s'affichait dans la messagerie —, la
   * contrepartie ne l'est pas. Les deux assertions côte à côte disent exactement cet écart.
   */
  it("ne compte pas l'auto-coaching comme une contrepartie", async () => {
    const solo = await signUpWith("cp-solo@cmv.test", { isCoach: true, isAthlete: true });
    expect((await solo.get("/athletes")).body).toHaveLength(1);
    expect((await solo.get("/me/counterparts")).body).toEqual({
      asCoach: false,
      asAthlete: false,
    });
  });

  // Le compte qui cumule ET coache quelqu'un : contrepartie côté coach seulement — il n'a pas de
  // coach, donc rien côté athlète.
  it("range la contrepartie du bon côté pour un compte qui cumule", async () => {
    const dual = await signUpWith("cp-dual@cmv.test", { isCoach: true, isAthlete: true });
    const athlete = await signUp("cp-dual-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(dual, athlete);
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    expect((await dual.get("/me/counterparts")).body).toEqual({ asCoach: true, asAthlete: false });
  });
});

/**
 * Règle dure n°1 face au modèle de capacités (#18) : **cumuler deux capacités n'ouvre aucune
 * porte**. Les suites précédentes vérifient que chaque fonctionnalité marche en double casquette ;
 * celle-ci vérifie qu'elle ne marche pas TROP.
 *
 * La question qui la motive : un compte qui est à la fois coach de quelqu'un et athlète de
 * quelqu'un d'autre traverse deux tenants. Rien ne doit fuir de l'un vers l'autre, ni d'un tiers
 * vers lui.
 */
describe("Isolation multi-capacité (#18)", () => {
  let dual: Agent;
  let dualId: string;
  let hisCoach: Agent;
  let hisAthlete: Agent;
  let hisAthleteId: string;
  let stranger: Agent;
  let strangerAthlete: Agent;
  let strangerExerciseId: string;
  let strangerPlanId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    dual = await signUpWith("iso-dual@cmv.test", { isCoach: true, isAthlete: true });
    hisCoach = await signUpWith("iso-his-coach@cmv.test", { isCoach: true, isAthlete: false });
    hisAthlete = await signUp("iso-his-athlete@cmv.test", Role.ATHLETE);
    stranger = await signUpWith("iso-stranger@cmv.test", { isCoach: true, isAthlete: false });
    strangerAthlete = await signUp("iso-stranger-athlete@cmv.test", Role.ATHLETE);

    // `dual` est coaché par `hisCoach`, et coache `hisAthlete`.
    const toDual = await inviteFor(hisCoach, dual);
    dualId = (await dual.post(`/invitations/${toDual.body.id}/accept`)).body[0].athleteId;
    const toHisAthlete = await inviteFor(dual, hisAthlete);
    hisAthleteId = (await hisAthlete.post(`/invitations/${toHisAthlete.body.id}/accept`)).body[0]
      .athleteId;

    // Un tenant étranger, complet : sa bibliothèque, son athlète, son cycle diffusé.
    const toStrangerAthlete = await inviteFor(stranger, strangerAthlete);
    const strangerAthleteId = (
      await strangerAthlete.post(`/invitations/${toStrangerAthlete.body.id}/accept`)
    ).body[0].athleteId;
    strangerExerciseId = (await stranger.post("/exercises").send({ title: "Secret" })).body.id;
    const plan = await stranger.post("/plans").send({
      athleteId: strangerAthleteId,
      title: "Cycle étranger",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    strangerPlanId = plan.body.id;
    expect((await billAndPublish(stranger, strangerPlanId)).status).toBe(200);
  });

  /**
   * Le cas propre au modèle : `dual` a DEUX titres, donc deux colonnes de scope. Ni l'un ni
   * l'autre ne doit atteindre un tenant qui n'est pas le sien — un scope qui bascule ne doit pas
   * pouvoir servir de passe-partout.
   */
  it("n'atteint la bibliothèque d'un étranger sous aucun titre", async () => {
    expect((await dual.get(`/exercises/${strangerExerciseId}`)).status).toBe(404);
    expect((await dual.get("/exercises")).body).toHaveLength(0);
  });

  it("n'atteint le cycle d'un étranger ni en coach ni en athlète", async () => {
    expect((await dual.get(`/plans/${strangerPlanId}`)).status).toBe(404);
    // Côté athlète, il ne lit que les siens : celui de l'étranger n'est jamais servi.
    const mine = await dual.get("/me/plans");
    expect(mine.body.map((plan: { id: string }) => plan.id)).not.toContain(strangerPlanId);
  });

  // Sa liste d'athlètes est la SIENNE : celui d'un autre coach n'y figure pas, même si les deux
  // comptes sont coachs.
  it("ne voit que ses propres athlètes", async () => {
    const athletes = await dual.get("/athletes");
    const ids = athletes.body.map((relation: { athleteId: string }) => relation.athleteId);
    expect(ids).toContain(hisAthleteId);
    expect(ids).toContain(dualId); // lui-même (auto-coaching, #14)
    expect(ids).toHaveLength(2);
  });

  /**
   * Le croisement le plus tentant : `dual` est l'athlète de `hisCoach` ET le coach de
   * `hisAthlete`. Ces deux relations ne se composent PAS — `hisCoach` n'a aucun droit sur
   * `hisAthlete`, qui n'est pas son athlète.
   */
  it("ne transmet aucun droit en cascade le long de la chaîne", async () => {
    const athletes = await hisCoach.get("/athletes");
    const ids = athletes.body.map((relation: { athleteId: string }) => relation.athleteId);
    expect(ids).toContain(dualId);
    expect(ids).not.toContain(hisAthleteId);
  });

  /**
   * Un cycle qu'on s'écrit à soi-même reste dans son tenant. Il porte `coachId = athleteId`, donc
   * il apparaîtrait dans DEUX scopes s'ils étaient confondus — c'est précisément le cas où une
   * erreur de colonne ne se verrait pas chez un compte ordinaire.
   */
  it("garde ses cycles solo hors de portée des autres", async () => {
    const solo = await dual.post("/plans").send({
      athleteId: dualId,
      title: "Solo privé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(solo.status).toBe(201);

    expect((await stranger.get(`/plans/${solo.body.id}`)).status).toBe(404);
    // Son propre coach non plus : `dual` s'écrit ce cycle en tant que COACH, pas en tant qu'athlète
    // de `hisCoach`. La relation ne donne pas de droit sur ce que son athlète écrit de son côté.
    expect((await hisCoach.get(`/plans/${solo.body.id}`)).status).toBe(404);
  });

  // Retirer une capacité FERME l'accès, immédiatement et pour tout ce qu'elle ouvrait.
  it("referme l'accès dès qu'une capacité est retirée", async () => {
    const temp = await signUpWith("iso-temp@cmv.test", { isCoach: true, isAthlete: true });
    expect((await temp.get("/exercises")).status).toBe(200);

    expect(
      (await temp.patch("/me/capabilities").send({ isCoach: false, isAthlete: true })).status,
    ).toBe(200);
    expect((await temp.get("/exercises")).status).toBe(403);
    expect((await temp.get("/athletes")).status).toBe(403);
  });

  /**
   * Le piège propre au cumul, côté écriture (#325) : le cycle que `hisCoach` adresse à `dual` porte
   * l'id de `dual` en `athleteId`. Une route du Coach le scope par `coachId` ; un `OR` entre les
   * deux capacités le lui rendrait réécrivable — titre, semaines, séances, facturation, jusqu'à sa
   * suppression. Il n'en touche rien, et `hisCoach` le retrouve à l'identique.
   */
  it("ne réécrit pas le cycle que son propre coach lui adresse", async () => {
    const plan = await hisCoach.post("/plans").send({
      athleteId: dualId,
      title: "Cycle adressé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    const weekId = required(plan.body.weeks[0]?.id, "semaine du cycle adressé");
    const session = await hisCoach
      .post(`/plan-weeks/${weekId}/sessions`)
      .send({ title: "Séance adressée", scheduledDate: monday });
    const billing = await hisCoach
      .put(`/plans/${plan.body.id}/billing`)
      .send({ amountCents: 4000, dueDate: monday });
    expect([session.status, billing.status]).toEqual([201, 200]);
    const storagePath = await attachInvoiceDocument(hisCoach, plan.body.id);

    const read = async (path: string) => withoutSignatures((await hisCoach.get(path)).body);
    const paths = [
      `/plans/${plan.body.id}`,
      `/scheduled-sessions/${session.body.id}`,
      `/plans/${plan.body.id}/billing`,
    ];
    const before = await Promise.all(paths.map(read));

    const statuses = await attemptPlanWrites(dual, {
      planId: plan.body.id,
      weekId,
      sessionId: session.body.id,
      monday,
      storagePath,
    });

    expect(statuses).toEqual(notFoundEverywhere(statuses));
    expect(await Promise.all(paths.map(read))).toEqual(before);
    const document = (await hisCoach.get(`/plans/${plan.body.id}/billing`)).body.documentUrl;
    expect((await fetch(document)).status).toBe(200);
  });

  /**
   * Un second coach (#599), y compris pour un compte qui en est un lui-même — et le dernier test
   * du bloc, parce qu'il change ce que `dual` reçoit. Rejoindre `stranger` ne lui ouvre que ce que
   * `stranger` lui adresse : ni sa bibliothèque, ni le cycle de son autre athlète.
   */
  it("laisse un compte à double capacité rejoindre un second coach, sans rien voir de plus", async () => {
    const invitation = await inviteFor(stranger, dual);
    expect((await dual.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    expect((await dual.get("/me/coaches")).body).toHaveLength(2);
    expect((await dual.get(`/exercises/${strangerExerciseId}`)).status).toBe(404);
    expect((await dual.get("/me/plans")).body.map((plan: { id: string }) => plan.id)).not.toContain(
      strangerPlanId,
    );
  });
});
