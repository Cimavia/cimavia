import { Role, shiftIsoDate } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  type Agent,
  billAndPublish,
  inviteFor,
  link,
  required,
  signUp,
  signUpWith,
} from "../support/actors";
import { app } from "../support/app";
import { mondayOfCurrentWeek } from "../support/fixtures";

describe("Cycle sans destinataire : affectation & verrous (#144)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteA2: Agent;
  let a1Id: string;
  let a2Id: string;
  let b1Id: string;
  let exerciseId: string;

  const monday = mondayOfCurrentWeek();

  /**
   * Un brouillon SANS destinataire, garni d'une séance dont l'exercice porte un TAG et un
   * document. Le tag compte : `scheduled_session_exercise_tag` est la sixième table de la chaîne
   * dénormalisée, celle qu'on oublie — sans sa colonne nullable, composer ici casserait en 500.
   */
  async function draftWithoutAthlete(title: string) {
    const plan = await coachA
      .post("/plans")
      .send({ title, startDate: monday, weeks: [{ type: "TRAINING" }] });
    expect(plan.status).toBe(201);
    const weekId = plan.body.weeks[0].id;
    const session = await coachA.post(`/plan-weeks/${weekId}/sessions`).send({
      title: "Séance libre",
      scheduledDate: monday,
      exercises: [{ sourceExerciseId: exerciseId, title: "Tractions", tags: ["dos"] }],
    });
    expect(session.status).toBe(201);
    return { planId: plan.body.id as string, sessionId: session.body.id as string };
  }

  // Un brouillon affecté à A1 et chiffré : l'état où un justificatif peut se joindre.
  async function billedDraftForA1(title: string): Promise<string> {
    const { planId } = await draftWithoutAthlete(title);
    await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });
    await coachA.put(`/plans/${planId}/billing`).send({ amountCents: 7000, dueDate: monday });
    return planId;
  }

  // URL signée puis PUT réel vers le storage : la clé rendue est segmentée sous le destinataire
  // du moment de la demande.
  async function uploadPdf(planId: string): Promise<string> {
    const signed = await coachA
      .post(`/plans/${planId}/billing/document/upload-url`)
      .send({ fileName: "facture-a1.pdf", mimeType: "application/pdf", size: 2_000 });
    expect(signed.status).toBe(201);
    const put = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(2_000, 1),
      headers: { "content-type": "application/pdf" },
    });
    expect(put.status).toBe(200);
    return signed.body.storagePath;
  }

  function attachPdf(planId: string, storagePath: string) {
    return coachA
      .put(`/plans/${planId}/billing/document`)
      .send({ storagePath, fileName: "facture-a1.pdf", mimeType: "application/pdf", size: 2_000 });
  }

  beforeAll(async () => {
    coachA = await signUp("unassigned-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("unassigned-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("unassigned-athlete-a1@cmv.test", Role.ATHLETE);
    athleteA2 = await signUp("unassigned-athlete-a2@cmv.test", Role.ATHLETE);
    const athleteB1 = await signUp("unassigned-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    a2Id = await link(coachA, athleteA2);
    b1Id = await link(coachB, athleteB1);

    // Un exercice BLOQUÉ et TAGUÉ : les blocs donnent au décompte d'exécution un `blk_1` à
    // cocher, le tag fait vivre la sixième table de la chaîne dénormalisée.
    const exercise = await coachA.post("/exercises").send({
      title: "Tractions",
      tags: ["dos"],
      blocks: [
        {
          id: "blk_1",
          label: "Travail",
          structure: { type: "SERIES", setCount: 3, restBetweenSetsSeconds: 120 },
          metrics: [
            {
              id: "col_reps",
              source: "CATALOG",
              key: "REPETITIONS",
              unit: "REPS",
              label: null,
              collapsed: false,
            },
          ],
          rows: [{ id: "r1", values: { col_reps: 5 } }],
        },
      ],
    });
    exerciseId = exercise.body.id;
  });

  it("compose un cycle entier sans destinataire, tags compris", async () => {
    const { planId, sessionId } = await draftWithoutAthlete("Bloc force max — pour qui ?");

    const plan = await coachA.get(`/plans/${planId}`);
    expect(plan.status).toBe(200);
    // Les trois champs disent la MÊME absence : il n'y a pas de cycle nommé sans destinataire.
    expect(plan.body.athleteId).toBeNull();
    expect(plan.body.athleteName).toBeNull();
    expect(plan.body.athleteEmail).toBeNull();

    const session = await coachA.get(`/scheduled-sessions/${sessionId}`);
    expect(session.body.exercises[0].tags).toEqual(["dos"]);
  });

  /**
   * Le cœur de l'invariant : l'invisibilité ne vient PAS d'une règle applicative mais du filtre
   * tenant lui-même — un `NULL` ne satisfait jamais `where: { athleteId }`. On l'éprouve sur DEUX
   * athlètes du même coach, parce qu'un filtre cassé les servirait tous les deux.
   */
  it("reste invisible de TOUS les athlètes du coach, pas seulement du premier", async () => {
    const { sessionId } = await draftWithoutAthlete("Invisible");

    for (const athlete of [athleteA1, athleteA2]) {
      const plans = await athlete.get("/me/plans");
      expect(plans.status).toBe(200);
      expect(plans.body).toEqual([]);
      expect((await athlete.get(`/me/scheduled-sessions/${sessionId}`)).status).toBe(404);
    }
  });

  it("refuse de diffuser un cycle sans destinataire, et n'écrit rien", async () => {
    const { planId } = await draftWithoutAthlete("Jamais diffusé");

    const res = await coachA.post(`/plans/${planId}/publish`);
    expect(res.status).toBe(400);

    // Ni statut, ni facture : le refus tombe AVANT la transaction.
    expect((await coachA.get(`/plans/${planId}`)).body.status).toBe("DRAFT");
    expect((await coachA.get("/invoices")).body).toHaveLength(0);
  });

  /**
   * L'ordre des verrous est une décision, pas un hasard : sans destinataire NI facturation, le
   * message doit nommer ce qui manque VRAIMENT. La facturation, elle, est carrément fermée tant
   * qu'il n'y a personne à facturer — `Invoice.athleteId` est NOT NULL, et un refus explicite
   * vaut mieux qu'une violation de contrainte remontée en 500.
   *
   * La LECTURE, elle, ne refuse rien (#211) : un cycle sans destinataire n'a pas de brouillon —
   * `assertPlanDetachable` interdit d'en détacher un qui soit chiffré — et `null` le dit sans
   * reprocher au client d'avoir demandé.
   */
  it("ferme la saisie de facturation sans fermer sa lecture", async () => {
    const { planId } = await draftWithoutAthlete("Pas de facture sans personne");

    const billing = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 5000, dueDate: monday });
    expect(billing.status).toBe(409);

    const read = await coachA.get(`/plans/${planId}/billing`);
    expect(read.status).toBe(200);
    expect(read.body).toBeNull();
  });

  it("refuse d'affecter le cycle à l'athlète d'un autre coach", async () => {
    const { planId } = await draftWithoutAthlete("Pas chez le voisin");

    expect((await coachA.patch(`/plans/${planId}`).send({ athleteId: b1Id })).status).toBe(400);
    expect((await coachA.get(`/plans/${planId}`)).body.athleteId).toBeNull();
  });

  /**
   * L'affectation a-t-elle atteint TOUTE la chaîne ? La lecture du cycle ne prouverait que la
   * table `plan`. Le décompte d'exécution, lui, s'écrit par un `updateMany` scopé à l'athlète sur
   * `scheduled_session_exercise` : s'il était resté sans destinataire, l'écriture toucherait zéro
   * ligne et le suivi ne reviendrait jamais — une panne parfaitement silencieuse.
   */
  it("affecte, propage jusqu'aux exercices, puis diffuse", async () => {
    const { planId, sessionId } = await draftWithoutAthlete("Bloc pour Léa");

    const assigned = await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.athleteId).toBe(a1Id);
    expect(assigned.body.athleteName).not.toBeNull();

    expect((await billAndPublish(coachA, planId)).status).toBe(200);

    const plans = await athleteA1.get("/me/plans");
    expect(plans.body.map((visible: { id: string }) => visible.id)).toContain(planId);
    const session = await athleteA1.get(`/me/scheduled-sessions/${sessionId}`);
    expect(session.status).toBe(200);

    const exerciseCopyId = session.body.exercises[0].id;
    const sent = await athleteA1.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      content: null,
      tracking: { [exerciseCopyId]: { blk_1: { checked: [0] } } },
    });
    expect(sent.status).toBe(200);

    const reread = await athleteA1.get(`/me/scheduled-sessions/${sessionId}`);
    expect(reread.body.exercises[0].tracking).toEqual({ blk_1: { checked: [0] } });
  });

  it("ne laisse plus changer le destinataire d'un cycle diffusé", async () => {
    const { planId } = await draftWithoutAthlete("Déjà parti");
    await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });
    expect((await billAndPublish(coachA, planId)).status).toBe(200);

    const res = await coachA.patch(`/plans/${planId}`).send({ athleteId: a2Id });
    expect(res.status).toBe(409);
    expect((await coachA.get(`/plans/${planId}`)).body.athleteId).toBe(a1Id);
  });

  /**
   * Le bug que la nullabilité crée si on n'y pense pas : `issueForPlan` ne réécrit que le statut
   * de la facture, jamais son destinataire. Sans propagation, cette séquence émettrait à A1 une
   * facture pour un cycle que A2 s'entraîne.
   */
  it("fait suivre la facture brouillon quand le cycle change de destinataire", async () => {
    const { planId } = await draftWithoutAthlete("Réaffecté après chiffrage");
    await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });
    await coachA.put(`/plans/${planId}/billing`).send({ amountCents: 7000, dueDate: monday });

    expect((await coachA.patch(`/plans/${planId}`).send({ athleteId: a2Id })).status).toBe(200);
    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(200);

    const issued = (await coachA.get("/invoices")).body.find(
      (invoice: { planId: string }) => invoice.planId === planId,
    );
    expect(issued.athleteId).toBe(a2Id);
  });

  /**
   * Les termes suivent, le justificatif non (#472) : le PDF est rédigé pour A1 — son nom, son
   * adresse, son montant — et partirait tel quel chez A2. Le refus ne touche à rien : ni au
   * destinataire, ni au PDF, ni à l'objet dans le storage.
   */
  it("refuse de réaffecter un brouillon dont la facture porte un justificatif", async () => {
    const planId = await billedDraftForA1("Justificatif rédigé pour A1");
    expect((await attachPdf(planId, await uploadPdf(planId))).status).toBe(200);

    const refused = await coachA.patch(`/plans/${planId}`).send({ athleteId: a2Id });
    expect(refused.status).toBe(409);

    expect((await coachA.get(`/plans/${planId}`)).body.athleteId).toBe(a1Id);
    const billing = await coachA.get(`/plans/${planId}/billing`);
    expect(billing.body.athleteId).toBe(a1Id);
    expect(billing.body.documentFileName).toBe("facture-a1.pdf");
    expect((await fetch(billing.body.documentUrl)).status).toBe(200);

    // Renvoyer le MÊME destinataire ne change rien : il n'y a rien à refuser.
    expect((await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id })).status).toBe(200);
  });

  it("réaffecte une fois le justificatif retiré, et la facture suit sans lui", async () => {
    const planId = await billedDraftForA1("Justificatif retiré");
    expect((await attachPdf(planId, await uploadPdf(planId))).status).toBe(200);
    expect((await coachA.delete(`/plans/${planId}/billing/document`)).status).toBe(200);

    expect((await coachA.patch(`/plans/${planId}`).send({ athleteId: a2Id })).status).toBe(200);
    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(200);

    const issued = (await coachA.get("/invoices")).body.find(
      (invoice: { planId: string }) => invoice.planId === planId,
    );
    expect(issued.athleteId).toBe(a2Id);
    expect(issued.documentFileName).toBeNull();
  });

  /**
   * Le chemin de traverse : la clé est SIGNÉE pour A1, le cycle part chez A2 avant le
   * rattachement — aucun PDF n'était joint, la réaffectation passe. Le rattachement, lui,
   * recalcule le préfixe sur le destinataire COURANT (#293) : la clé de A1 n'y entre plus.
   */
  it("ne rattache pas au nouveau destinataire une clé signée pour l'ancien", async () => {
    const planId = await billedDraftForA1("Clé signée avant la réaffectation");
    const keyForA1 = await uploadPdf(planId);

    expect((await coachA.patch(`/plans/${planId}`).send({ athleteId: a2Id })).status).toBe(200);
    expect((await attachPdf(planId, keyForA1)).status).toBe(403);

    expect((await coachA.get(`/plans/${planId}/billing`)).body.documentFileName).toBeNull();
  });

  /**
   * L'état qu'ont laissé les réaffectations d'avant la garde : cycle et facture chez A2, PDF
   * rédigé pour A1. L'API ne sait plus le produire — on le rejoue donc en ôtant le PDF le temps
   * de la réaffectation, en base, puis en le remettant. La diffusion refuse de l'émettre, et rien
   * ne part : ni statut, ni facture.
   */
  it("refuse de diffuser un justificatif hérité, préparé pour l'ancien destinataire", async () => {
    const prisma = app.get(PrismaService);
    const planId = await billedDraftForA1("Justificatif hérité");
    expect((await attachPdf(planId, await uploadPdf(planId))).status).toBe(200);

    const [draft] = await prisma.$queryRaw<{ documentPath: string }[]>`
      SELECT "documentPath" FROM invoice WHERE "planId" = ${planId}`;
    const keyForA1 = required(draft, "justificatif joint").documentPath;
    await prisma.$executeRaw`UPDATE invoice SET "documentPath" = NULL WHERE "planId" = ${planId}`;
    expect((await coachA.patch(`/plans/${planId}`).send({ athleteId: a2Id })).status).toBe(200);
    await prisma.$executeRaw`
      UPDATE invoice SET "documentPath" = ${keyForA1} WHERE "planId" = ${planId}`;

    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(409);
    expect((await coachA.get(`/plans/${planId}`)).body.status).toBe("DRAFT");
    const issued = (await coachA.get("/invoices")).body.map(
      (invoice: { planId: string }) => invoice.planId,
    );
    expect(issued).not.toContain(planId);

    // Le PDF retiré, le cycle part — à A2, sans le document de A1.
    expect((await coachA.delete(`/plans/${planId}/billing/document`)).status).toBe(200);
    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(200);
  });

  /**
   * Détacher est permis — c'est la brique que #5 attend — SAUF sur un cycle déjà chiffré :
   * `Invoice.athleteId` est NOT NULL, et un montant qu'on n'adresse à personne n'a pas de sens.
   * Le coach n'est bloqué sur rien : affecter quelqu'un d'autre reste ouvert.
   */
  it("détache un brouillon, mais pas un brouillon déjà chiffré", async () => {
    const { planId, sessionId } = await draftWithoutAthlete("Détachable");
    await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });

    const detached = await coachA.patch(`/plans/${planId}`).send({ athleteId: null });
    expect(detached.status).toBe(200);
    expect(detached.body.athleteId).toBeNull();
    // Redevenu invisible, comme s'il n'avait jamais été affecté — vérifié sur SA séance et non
    // sur `/me/plans`, qui sert les cycles visibles de l'athlète et parlerait donc d'un autre cycle.
    expect((await athleteA1.get(`/me/scheduled-sessions/${sessionId}`)).status).toBe(404);

    await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });
    await coachA.put(`/plans/${planId}/billing`).send({ amountCents: 4200, dueDate: monday });
    const refused = await coachA.patch(`/plans/${planId}`).send({ athleteId: null });
    expect(refused.status).toBe(409);
    expect((await coachA.get(`/plans/${planId}`)).body.athleteId).toBe(a1Id);
  });

  /**
   * Le pendant du verrou de destinataire, sur les trois champs qui définissent le cycle (#207).
   * Aucun client n'envoyait ces champs jusqu'ici — on ferme une porte que personne n'ouvrait,
   * avant d'ouvrir l'interface qui, elle, s'en servira.
   */
  it("ne laisse plus réécrire le titre ni le début d'un cycle diffusé", async () => {
    const { planId } = await draftWithoutAthlete("Figé par la diffusion");
    await coachA.patch(`/plans/${planId}`).send({ athleteId: a1Id });
    expect((await billAndPublish(coachA, planId)).status).toBe(200);

    expect((await coachA.patch(`/plans/${planId}`).send({ title: "Renommé" })).status).toBe(409);
    expect(
      (await coachA.patch(`/plans/${planId}`).send({ startDate: shiftIsoDate(monday, 7) })).status,
    ).toBe(409);
    expect((await coachA.patch(`/plans/${planId}`).send({ description: "Ajout" })).status).toBe(
      409,
    );

    const plan = await coachA.get(`/plans/${planId}`);
    expect(plan.body.title).toBe("Figé par la diffusion");
    expect(plan.body.startDate).toBe(monday);
    expect(plan.body.description).toBeNull();
  });

  /**
   * Le refus vise l'ÉTAT du cycle, pas le geste : sur un brouillon, la même requête passe et
   * emmène les séances avec elle. Sans cette moitié-là, la garde pourrait tout refuser sans que
   * rien ne le dise.
   */
  it("laisse réécrire l'en-tête d'un brouillon, et décale ses séances avec lui", async () => {
    const { planId, sessionId } = await draftWithoutAthlete("Encore modifiable");
    const nextMonday = shiftIsoDate(monday, 7);

    const patched = await coachA
      .patch(`/plans/${planId}`)
      .send({ title: "Bloc force max", description: "Montée en charge", startDate: nextMonday });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Bloc force max");
    expect(patched.body.startDate).toBe(nextMonday);

    // La séance suit sa semaine : c'est l'invariant que `shiftSessions` préserve.
    expect((await coachA.get(`/scheduled-sessions/${sessionId}`)).body.scheduledDate).toBe(
      nextMonday,
    );
  });
});

describe("Auto-coaching : écrire et diffuser un cycle pour soi (#14)", () => {
  let solo: Agent;
  let soloId: string;
  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    solo = await signUpWith("solo@cmv.test", { isCoach: true, isAthlete: true });
    const list = await solo.get("/athletes");
    soloId = required(list.body[0], "entrée self dans /athletes").athleteId;
  });

  /**
   * L'entrée SYNTHÉTIQUE : il n'existe aucune ligne `CoachAthlete` (le CHECK l'interdit depuis
   * #11), mais le compte doit pouvoir se désigner comme destinataire. C'est ce qui permet au
   * builder web de rester inchangé — il lit déjà cette route.
   */
  it("se voit lui-même en tête de sa liste d'athlètes", async () => {
    const res = await solo.get("/athletes");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: "self", isSelf: true, athleteId: soloId });
    expect(res.body[0].coachId).toBe(soloId);
  });

  // Un coach PUR n'est pas son propre athlète : lui ouvrir cette porte lui ferait écrire des
  // cycles qu'il ne pourrait jamais lire, la lecture passant par les routes athlète.
  it("ne se voit pas quand il n'a que la capacité coach", async () => {
    const coachOnly = await signUpWith("solo-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    expect((await coachOnly.get("/athletes")).body).toHaveLength(0);
  });

  it("refuse un cycle pour soi à un coach sans capacité athlète", async () => {
    const coachOnly = await signUpWith("solo-coach-2@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const session = await coachOnly.get("/api/auth/get-session");
    const res = await coachOnly.post("/plans").send({
      athleteId: session.body.user.id,
      title: "Pour moi",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(res.status).toBe(400);
  });

  /**
   * Le parcours complet, et le point de l'issue : la state machine `DRAFT → PUBLISHED` ne change
   * PAS. C'est elle qui donne au cycle ses `ScheduledSession` lisibles et débriefables.
   */
  it("écrit puis diffuse un cycle pour soi, SANS facture ni notification", async () => {
    const plan = await solo.post("/plans").send({
      athleteId: soloId,
      title: "Ma prépa",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);

    // Le gating de facturation est levé : diffuser ne demande AUCUN terme saisi.
    const published = await solo.post(`/plans/${plan.body.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("PUBLISHED");

    // Ni facture émise, ni notification : s'annoncer à soi-même ce qu'on vient de faire.
    expect((await solo.get("/invoices?as=coach")).body).toHaveLength(0);
    expect((await solo.get("/invoices?as=athlete")).body).toHaveLength(0);
    expect((await solo.get("/me/notifications")).body).toHaveLength(0);
  });

  // Le cycle diffusé se lit par les routes ATHLÈTE, comme n'importe quel autre : c'est tout
  // l'intérêt d'avoir gardé la state machine.
  it("relit son propre cycle par les routes athlète", async () => {
    const mine = await solo.get("/me/plans");
    expect(mine.status).toBe(200);
    expect(mine.body.map((plan: { title: string }) => plan.title)).toContain("Ma prépa");
  });

  /**
   * On ne se facture pas soi-même : un refus explicite à la SAISIE, plutôt qu'un brouillon saisi
   * pour rien. La lecture, elle, rend `null` (#211) — puisque ce refus garantit qu'aucun
   * brouillon n'a jamais pu être écrit, il n'y a rien à protéger d'une consultation.
   */
  it("refuse de facturer un cycle écrit pour soi (409), mais en tolère la lecture", async () => {
    const plan = await solo.post("/plans").send({
      athleteId: soloId,
      title: "Cycle non facturable",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const res = await solo
      .put(`/plans/${plan.body.id}/billing`)
      .send({ amountCents: 5000, dueDate: monday });
    expect(res.status).toBe(409);

    const read = await solo.get(`/plans/${plan.body.id}/billing`);
    expect(read.status).toBe(200);
    expect(read.body).toBeNull();
  });

  /**
   * Le parcours complet en solo : composer, diffuser, débriefer, RELIRE son débrief côté coach.
   * C'est le bout qui ferme la boucle — un débrief qu'on écrit et qu'on ne retrouve jamais rend
   * l'auto-coaching inutile.
   */
  it("retrouve côté coach le débrief qu'il a écrit côté athlète", async () => {
    const exercise = await solo.post("/exercises").send({ title: "Suspension" });
    expect(exercise.status).toBe(201);
    const template = await solo.post("/sessions").send({
      title: "Séance solo",
      exercises: [{ exerciseId: exercise.body.id }],
    });
    expect(template.status).toBe(201);

    const plan = await solo.post("/plans").send({
      athleteId: soloId,
      title: "Cycle à débriefer",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const weekId = required(plan.body.weeks[0], "semaine du cycle solo").id;
    const scheduled = await solo
      .post(`/plan-weeks/${weekId}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: monday });
    expect(scheduled.status).toBe(201);
    expect((await solo.post(`/plans/${plan.body.id}/publish`)).status).toBe(200);

    // Écrit en tant qu'ATHLÈTE…
    const written = await solo
      .put(`/me/scheduled-sessions/${scheduled.body.id}/feedback`)
      .send({ content: "Bonnes sensations" });
    expect(written.status).toBe(200);

    // … et relu en tant que COACH, sur la même session.
    const received = await solo.get("/feedbacks");
    expect(received.status).toBe(200);
    expect(received.body).toHaveLength(1);
    expect(received.body[0]).toMatchObject({
      athleteId: soloId,
      content: "Bonnes sensations",
      // Personne n'a répondu : l'avis automatique, signé de soi, ne compte pas (#316).
      repliedAt: null,
    });

    // Et aucun fil avec soi-même, d'un côté comme de l'autre (#316).
    expect((await solo.get("/conversations?as=coach")).body).toEqual([]);
    expect((await solo.get("/conversations?as=athlete")).body).toEqual([]);

    // Et AUCUNE notification au passage : ni la diffusion, ni le débrief ne s'annoncent à leur
    // propre auteur. C'est la règle posée dans `NotificationService`, qui vaut pour tout émetteur.
    expect((await solo.get("/me/notifications")).body).toHaveLength(0);
    expect((await solo.get("/me/notifications/unread-count")).body.count).toBe(0);
  });

  /**
   * Déjà fermée avant #14 (`resolvePair` exige une relation des deux côtés) — ce test fige le
   * comportement plutôt que de le supposer acquis.
   *
   * Deux refus, deux codes (#198). Se viser soi-même est un état IMPOSSIBLE, verrouillé par le
   * CHECK `coach_athlete_not_self` : 409, comme le refus d'auto-relation de #11. N'avoir aucun
   * coach est une relation absente, pas impossible : 400, inchangé.
   */
  /**
   * La ligne « (moi) » de `GET /athletes` ouvre une fiche comme les autres. Sans relation à
   * trouver, elle répondait 404 — invisible tant que le panneau web rendait l'échec comme une
   * fiche vierge (#301).
   */
  it("tient sa propre fiche, du premier enregistrement à la relecture", async () => {
    expect((await solo.get(`/athletes/${soloId}/sheet`)).body).toBeNull();

    const write = await solo
      .put(`/athletes/${soloId}/sheet`)
      .send({ content: "Objectif 8a", expectedUpdatedAt: null });
    expect(write.status).toBe(200);

    const read = await solo.get(`/athletes/${soloId}/sheet`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ athleteId: soloId, coachId: soloId, content: "Objectif 8a" });
  });

  // Même règle que les cycles : un coach pur n'est pas son propre athlète.
  it("refuse sa propre fiche à un coach sans capacité athlète", async () => {
    const coachOnly = await signUpWith("solo-coach-sheet@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const session = await coachOnly.get("/api/auth/get-session");
    const selfId = session.body.user.id;

    expect((await coachOnly.get(`/athletes/${selfId}/sheet`)).status).toBe(404);
    expect(
      (
        await coachOnly
          .put(`/athletes/${selfId}/sheet`)
          .send({ content: "pour moi", expectedUpdatedAt: null })
      ).status,
    ).toBe(404);
  });

  /**
   * Un compte qui se coache ET a un coach porte deux fiches : la sienne, et celle que son coach
   * tient sur lui. Une fiche UNIQUE par athlète les faisait se heurter — le second `PUT` tombait en
   * 500 sur la contrainte, dans un sens comme dans l'autre.
   */
  it("garde sa fiche perso distincte de celle que son coach tient sur lui", async () => {
    const coach = await signUp("solo-sheet-coach@cmv.test", Role.COACH);
    const dual = await signUpWith("solo-sheet-dual@cmv.test", { isCoach: true, isAthlete: true });
    const invitation = await inviteFor(coach, dual);
    const accepted = await dual.post(`/invitations/${invitation.body.id}/accept`);
    const dualId = accepted.body[0].athleteId;

    const own = await dual
      .put(`/athletes/${dualId}/sheet`)
      .send({ content: "mes notes", expectedUpdatedAt: null });
    expect(own.status).toBe(200);
    const coachs = await coach
      .put(`/athletes/${dualId}/sheet`)
      .send({ content: "vu du coach", expectedUpdatedAt: null });
    expect(coachs.status).toBe(200);

    expect((await dual.get(`/athletes/${dualId}/sheet`)).body.content).toBe("mes notes");
    expect((await coach.get(`/athletes/${dualId}/sheet`)).body.content).toBe("vu du coach");
  });

  it("n'ouvre pas de fil de messagerie avec soi-même", async () => {
    expect((await solo.post("/conversations?as=coach").send({ athleteId: soloId })).status).toBe(
      409,
    );
    // Le même refus des deux côtés : se viser soi-même est impossible, pas inconnu (#198, #599).
    expect((await solo.post("/conversations?as=athlete").send({ coachId: soloId })).status).toBe(
      409,
    );
  });
});
