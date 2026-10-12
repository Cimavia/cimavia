import { Role, STALE_WRITE, shiftIsoDate } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, link, required, signUp } from "../support/actors";
import { mondayOfCurrentWeek, uploadInstructionImage } from "../support/fixtures";
import { attemptPlanWrites, notFoundEverywhere, withoutSignatures } from "../support/intrusion";
import { versionOf } from "../support/version";

describe("Planifications : diffusion & isolation (P3)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let b1Id: string;
  let exerciseAId: string;
  let exerciseBId: string;
  let templateId: string;
  let planId: string;
  let week1Id: string;
  let week2Id: string;
  let scheduledId: string;

  const monday = mondayOfCurrentWeek();
  // La semaine 2 commence sept jours après le lundi de départ : une séance doit tomber dans la
  // plage de SA semaine, l'API le vérifie.
  const mondayOfWeek2 = new Date(`${monday}T00:00:00Z`);
  mondayOfWeek2.setUTCDate(mondayOfWeek2.getUTCDate() + 7);
  const mondayOfWeek2Iso = mondayOfWeek2.toISOString().slice(0, 10);

  const LIBRARY_INSTRUCTIONS = [{ type: "PARAGRAPH", content: [{ text: "Coudes serrés." }] }];
  const LIBRARY_BLOCKS = [
    {
      id: "blk_1",
      label: "Travail",
      structure: { type: "SERIES", setCount: 5, restBetweenSetsSeconds: 180 },
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
  ];

  beforeAll(async () => {
    coachA = await signUp("plan-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("plan-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("plan-athlete-a1@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("plan-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    b1Id = await link(coachB, athleteB1);

    // Bibliothèque du coach A : un exercice documenté, composé dans une séance modèle.
    const exercise = await coachA.post("/exercises").send({
      title: "Tractions lestées",
      description: "Prise large",
      instructions: LIBRARY_INSTRUCTIONS,
      blocks: LIBRARY_BLOCKS,
    });
    exerciseAId = exercise.body.id;
    await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/demo" });

    const template = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min.",
      exercises: [{ exerciseId: exerciseAId, note: "5×5" }],
    });
    templateId = template.body.id;

    const exerciseB = await coachB.post("/exercises").send({ title: "Chez B", tags: ["grimpe"] });
    exerciseBId = exerciseB.body.id;
  });

  it("crée un cycle avec ses semaines (type training/deload, nombre libre)", async () => {
    const res = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle bloc — automne",
      description: "Montée en charge puis décharge.",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD", note: "volume -40 %" }],
    });
    expect(res.status).toBe(201);
    planId = res.body.id;
    week1Id = res.body.weeks[0].id;
    week2Id = res.body.weeks[1].id;

    expect(res.body.status).toBe("DRAFT");
    expect(res.body.weekCount).toBe(2);
    // Les bornes de semaine sont CALCULÉES à partir du lundi de départ (rien n'est stocké).
    expect(res.body.weeks[0].startDate).toBe(monday);
    expect(res.body.weeks[1].weekNumber).toBe(2);
    expect(res.body.weeks[1].type).toBe("DELOAD");
  });

  it("refuse un cycle qui ne démarre pas un lundi, ou pour l'athlète d'un autre coach", async () => {
    const notMonday = await coachA
      .post("/plans")
      .send({ athleteId: a1Id, title: "x", startDate: "2026-07-14" }); // mardi
    expect(notMonday.status).toBe(400);

    const otherAthlete = await coachA
      .post("/plans")
      .send({ athleteId: b1Id, title: "Intrusion", startDate: monday });
    expect(otherAthlete.status).toBe(400);
  });

  it("instancie une séance : la composition et les documents sont COPIÉS du modèle", async () => {
    const res = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    expect(res.status).toBe(201);
    scheduledId = res.body.id;

    expect(res.body.title).toBe("Bloc force max");
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0]).toMatchObject({
      sourceExerciseId: exerciseAId,
      title: "Tractions lestées",
      note: "5×5",
      position: 0,
    });
    // Le document de l'exercice suit la copie : sans lui, l'athlète n'y aurait aucun accès.
    expect(res.body.exercises[0].documents).toHaveLength(1);
    expect(res.body.exercises[0].documents[0].url).toBe("https://youtu.be/demo");
    // Consigne et structure suivent aussi : sans elles l'athlète garderait le titre et perdrait
    // ce qu'il doit faire.
    expect(res.body.exercises[0].instructions).toEqual(LIBRARY_INSTRUCTIONS);
    expect(res.body.exercises[0].blocks).toEqual(LIBRARY_BLOCKS);
  });

  /**
   * Trois intentions sur `notes`, trois résultats : absent = reprendre celles du modèle, un texte =
   * les remplacer, `null` = n'en poser aucune. Confondre `null` et « absent » ferait réapparaître
   * les consignes du modèle que le coach venait d'effacer pour cette séance-là.
   */
  it("reprend les notes du modèle, sauf si la séance en fournit ou les efface", async () => {
    const pose = (notes?: string | null) =>
      coachA.post(`/plan-weeks/${week2Id}/sessions`).send({
        sourceSessionId: templateId,
        scheduledDate: mondayOfWeek2Iso,
        ...(notes === undefined ? {} : { notes }),
      });

    const inherited = await pose();
    const replaced = await pose("Repos 4 min aujourd'hui.");
    const cleared = await pose(null);
    // Semaine 2 : nettoyée aussitôt, la semaine 1 est le décor d'autres assertions.
    for (const res of [inherited, replaced, cleared]) {
      await coachA.delete(`/scheduled-sessions/${res.body.id}`);
    }

    expect([inherited.status, replaced.status, cleared.status]).toEqual([201, 201, 201]);
    expect(inherited.body.notes).toBe("Repos 3 min.");
    expect(replaced.body.notes).toBe("Repos 4 min aujourd'hui.");
    expect(cleared.body.notes).toBeNull();
  });

  // Le modèle est lu par le client TENANT : celui d'un autre coach n'existe pas pour A — refusé
  // comme un identifiant inventé, sans rien en copier ni dire qu'il existe ailleurs.
  it("refuse d'instancier la séance modèle d'un autre coach", async () => {
    const foreign = await coachB.post("/sessions").send({ title: "Modèle de B" });
    expect(foreign.status).toBe(201);

    const res = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: foreign.body.id, scheduledDate: mondayOfWeek2Iso });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Séance modèle inconnue");
    const week2 = (await coachA.get(`/plans/${planId}`)).body.weeks[1];
    expect(week2.sessions).toEqual([]);
  });

  it("la copie est FIGÉE : retravailler l'exercice source ne la touche pas", async () => {
    const patched = await coachA.patch(`/exercises/${exerciseAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${exerciseAId}`),
      instructions: [{ type: "PARAGRAPH", content: [{ text: "Réécrit après diffusion." }] }],
      blocks: [],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.blocks).toEqual([]);

    const read = await coachA.get(`/scheduled-sessions/${scheduledId}`);
    expect(read.body.exercises[0].instructions).toEqual(LIBRARY_INSTRUCTIONS);
    expect(read.body.exercises[0].blocks).toEqual(LIBRARY_BLOCKS);
  });

  it("diffuse le dosage de la SÉANCE, pas celui de la bibliothèque", async () => {
    // La régression que ce test verrouille : lire les blocs de l'exercice au moment de la
    // diffusion ferait disparaître, sans le moindre avertissement, tout ce que le coach a ajusté
    // au niveau séance.
    const template = await coachA.get(`/sessions/${templateId}`);
    const composed = template.body.exercises[0];
    const tuned = composed.blocks.map((block: { rows: { id: string; values: unknown }[] }) => ({
      ...block,
      rows: block.rows.map((row) => (row.id === "r1" ? { ...row, values: { col_reps: 3 } } : row)),
    }));

    // La note est renvoyée telle quelle : ce test ajuste le DOSAGE, et les suivants comptent sur
    // le modèle intact — une suite e2e partage ses fixtures.
    const saved = await coachA.put(`/sessions/${templateId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${templateId}`),
      title: "Bloc force max",
      notes: "Repos 3 min.",
      exercises: [
        {
          id: composed.id,
          exerciseId: exerciseAId,
          note: composed.note,
          blocks: tuned,
          adjustments: [{ path: "blk_1/rows/r1/col_reps", level: "SESSION" }],
        },
      ],
    });
    expect(saved.status).toBe(200);

    // Diffusée en semaine 2, dont aucun test ne compte les séances, puis retirée aussitôt : la
    // semaine 1 est le décor d'autres assertions.
    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const copy = diffused.body.exercises[0];
    expect(copy.blocks[0].rows[0].values.col_reps).toBe(3);
    // Le marqueur du niveau séance voyage avec la copie : l'athlète doit voir CE qui a été ajusté
    // pour lui, et le coach distinguer les deux niveaux sur la même grille.
    expect(copy.adjustments).toEqual([{ path: "blk_1/rows/r1/col_reps", level: "SESSION" }]);
    expect(copy.baseline).toEqual(copy.blocks);

    // Nettoyage par courtoisie : aucune assertion sur son statut, la semaine 2 n'est comptée
    // nulle part et un échec ici ne dirait rien d'utile.
    await coachA.delete(`/scheduled-sessions/${diffused.body.id}`);
  });

  it("une métrique MAISON citée par un bloc part avec la diffusion", async () => {
    // La régression que ce test verrouille : `customMetricSchema` est `.strict()`, et la ligne
    // Prisma porte `coachId`, `createdAt`, `updatedAt`. La parser telle quelle faisait échouer
    // TOUTE la diffusion en 500 dès qu'un exercice citait une métrique maison — et rien ne le
    // couvrait, la copie du snapshot n'ayant été testée qu'avec des métriques du catalogue.
    const metric = await coachA.post("/custom-metrics").send({
      label: "Cotation française",
      unit: null,
      valueType: "SCALE",
      scale: ["6a", "6b", "6c"],
    });
    expect(metric.status).toBe(201);

    const blocks = [
      {
        id: "blk_home",
        label: null,
        structure: { type: "SERIES", setCount: 2, restBetweenSetsSeconds: 60 },
        metrics: [
          {
            id: "col_grade",
            source: "CUSTOM",
            customMetricId: metric.body.id,
            label: null,
            collapsed: false,
          },
        ],
        rows: [{ id: "r1", values: { col_grade: "6b" } }],
      },
    ];
    const exercise = await coachA
      .post("/exercises")
      .send({ title: "Voie en 6b", tags: ["grimpe"], blocks });
    expect(exercise.status).toBe(201);

    const template = await coachA.post("/sessions").send({
      title: "Séance métrique maison",
      exercises: [{ exerciseId: exercise.body.id }],
    });
    expect(template.status).toBe(201);

    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    // La DÉFINITION voyage, pas seulement l'identifiant : `/custom-metrics` est scopé au coach,
    // et l'athlète n'y aura jamais accès.
    expect(diffused.body.exercises[0].customMetrics).toEqual([
      {
        id: metric.body.id,
        label: "Cotation française",
        unit: null,
        valueType: "SCALE",
        scale: ["6a", "6b", "6c"],
      },
    ]);

    await coachA.delete(`/scheduled-sessions/${diffused.body.id}`);
  });

  it("les images de consigne survivent à la diffusion", async () => {
    // Les documents sont recopiés en NOUVELLES lignes : sans remappage, la consigne de l'athlète
    // référencerait des identifiants de la bibliothèque, qui ne désignent rien chez lui — et
    // l'échec serait silencieux, un média introuvable ne s'affichant simplement pas.
    const imageId = await uploadInstructionImage(coachA, exerciseAId);

    const withImage = await coachA.patch(`/exercises/${exerciseAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${exerciseAId}`),
      instructions: [
        { type: "PARAGRAPH", content: [{ text: "Position basse." }] },
        { type: "IMAGE", mediaId: imageId },
      ],
    });
    expect(withImage.status).toBe(200);

    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const copy = diffused.body.exercises[0];
    const block = copy.instructions.find((item: { type: string }) => item.type === "IMAGE");
    const documentIds = copy.documents.map((document: { id: string }) => document.id);

    // L'identifiant a changé ET il désigne un document de la COPIE.
    expect(block.mediaId).not.toBe(imageId);
    expect(documentIds).toContain(block.mediaId);

    await coachA.delete(`/scheduled-sessions/${diffused.body.id}`);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${imageId}`);
  });

  it("les images de consigne survivent à l'enregistrement du coach, même sans bibliothèque (#296)", async () => {
    // Le panneau du coach renvoie la consigne de l'INSTANCE : ses images citent les documents de
    // la copie, pas ceux de la bibliothèque. Recréer ces documents à chaque enregistrement laissait
    // la consigne pointer dans le vide chez l'athlète — et l'échec était silencieux.
    const exercise = await coachA.post("/exercises").send({ title: "Planche" });
    const documentId = await uploadInstructionImage(coachA, exercise.body.id);

    // Piocché dans la bibliothèque : la consigne arrive avec l'id du document de BIBLIOTHÈQUE.
    const created = await coachA.post(`/plan-weeks/${week2Id}/sessions`).send({
      title: "Gainage",
      scheduledDate: mondayOfWeek2Iso,
      exercises: [
        {
          sourceExerciseId: exercise.body.id,
          title: "Planche",
          instructions: [{ type: "IMAGE", mediaId: documentId }],
        },
      ],
    });
    expect(created.status).toBe(201);
    const initial = created.body.exercises[0];
    const initialDocumentIds = initial.documents.map((d: { id: string }) => d.id);

    // Ce que le panneau renvoie : la ligne telle qu'il l'a lue, avec une note en plus.
    const resave = async () => {
      const read = await coachA.get(`/scheduled-sessions/${created.body.id}`);
      const line = required(read.body.exercises[0], "exercice de la séance");
      const saved = await coachA.put(`/scheduled-sessions/${created.body.id}`).send({
        title: "Gainage",
        notes: null,
        scheduledDate: mondayOfWeek2Iso,
        exercises: [
          {
            id: line.id,
            sourceExerciseId: line.sourceExerciseId,
            title: line.title,
            description: line.description,
            tags: line.tags,
            note: "Tenir 30 s",
            instructions: line.instructions,
            blocks: line.blocks,
            customMetrics: line.customMetrics,
            adjustments: line.adjustments,
          },
        ],
      });
      expect(saved.status).toBe(200);
      return required(saved.body.exercises[0], "exercice enregistré");
    };

    const assertIntact = (line: {
      id: string;
      instructions: { type: string; mediaId?: string }[];
      documents: { id: string; url: string }[];
    }) => {
      // La ligne et ses documents gardent leur identité : rien n'a été recréé.
      expect(line.id).toBe(initial.id);
      const documentIds = line.documents.map((d) => d.id);
      expect(documentIds).toEqual(initialDocumentIds);
      for (const block of line.instructions.filter((b) => b.type === "IMAGE")) {
        expect(documentIds).toContain(block.mediaId);
      }
    };

    assertIntact(await resave());

    // L'exercice quitte la bibliothèque : `sourceExerciseId` passe à null, et l'objet reste —
    // la copie le référence encore. Repasser par la bibliothèque perdait alors TOUS les documents.
    expect((await coachA.delete(`/exercises/${exercise.body.id}`)).status).toBe(204);
    const orphaned = await resave();
    expect(orphaned.sourceExerciseId).toBeNull();
    assertIntact(orphaned);

    // Et l'objet n'a pas bougé : l'athlète le lit toujours.
    const copy = required(orphaned.documents[0], "document de la copie");
    expect((await fetch(copy.url)).status).toBe(200);

    await coachA.delete(`/scheduled-sessions/${created.body.id}`);
  });

  /**
   * Les tags d'une ligne REPRISE (même `id`) suivent la règle replace-all du reste de la ligne :
   * la liste envoyée remplace, une ligne envoyée sans liste n'en a plus. Fusionner laisserait sur
   * la séance de l'athlète un tag que le coach a retiré du panneau.
   */
  it("refuse une consigne qui cite une image que la ligne ne porte pas (400, #315)", async () => {
    const source = await coachA.post("/exercises").send({ title: "Planche" });
    const other = await coachA.post("/exercises").send({ title: "Gainage latéral" });
    const sourceImage = await uploadInstructionImage(coachA, source.body.id);
    const otherImage = await uploadInstructionImage(coachA, other.body.id);

    const line = (sourceExerciseId: string | null, mediaId: string) => ({
      sourceExerciseId,
      title: "Planche",
      instructions: [{ type: "IMAGE", mediaId }],
    });
    const post = (exercise: ReturnType<typeof line>) =>
      coachA.post(`/plan-weeks/${week2Id}/sessions`).send({
        title: "Gainage",
        scheduledDate: mondayOfWeek2Iso,
        exercises: [exercise],
      });

    // Une ligne qui naît cite les images de SA source : ni celles d'un autre exercice, ni aucune
    // quand elle n'a pas de source.
    expect((await post(line(source.body.id, otherImage))).status).toBe(400);
    expect((await post(line(null, sourceImage))).status).toBe(400);

    // Une ligne reprise cite SES copies : l'identifiant de bibliothèque ne désigne plus rien chez
    // elle depuis sa création.
    const created = await post(line(source.body.id, sourceImage));
    expect(created.status).toBe(201);
    const kept = required(created.body.exercises[0], "ligne créée");
    const resave = (mediaId: string) =>
      coachA.put(`/scheduled-sessions/${created.body.id}`).send({
        title: "Gainage",
        notes: null,
        scheduledDate: mondayOfWeek2Iso,
        exercises: [{ ...line(kept.sourceExerciseId, mediaId), id: kept.id }],
      });
    expect((await resave(sourceImage)).status).toBe(400);
    expect((await resave(kept.instructions[0].mediaId)).status).toBe(200);

    await coachA.delete(`/scheduled-sessions/${created.body.id}`);
    await coachA.delete(`/exercises/${source.body.id}`);
    await coachA.delete(`/exercises/${other.body.id}`);
  });

  it("remplace les tags d'un exercice repris, et les retire quand la ligne n'en porte plus", async () => {
    const created = await coachA.post(`/plan-weeks/${week2Id}/sessions`).send({
      title: "Tags",
      scheduledDate: mondayOfWeek2Iso,
      exercises: [{ title: "Planche", tags: ["gainage"] }],
    });
    const lineId: string = created.body.exercises[0].id;
    const save = (line: Record<string, unknown>) =>
      coachA.put(`/scheduled-sessions/${created.body.id}`).send({
        title: "Tags",
        scheduledDate: mondayOfWeek2Iso,
        exercises: [{ id: lineId, title: "Planche", ...line }],
      });

    const retagged = await save({ tags: ["Abdos"] });
    const untagged = await save({});
    await coachA.delete(`/scheduled-sessions/${created.body.id}`);

    expect(retagged.status).toBe(200);
    expect(retagged.body.exercises[0]).toMatchObject({ id: lineId, tags: ["abdos"] });
    expect(untagged.status).toBe(200);
    expect(untagged.body.exercises[0]).toMatchObject({ id: lineId, tags: [] });
  });

  it("refuse une séance hors de la plage de sa semaine, ou référençant l'exercice d'un autre coach", async () => {
    const outOfWeek = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: "2027-01-04" });
    expect(outOfWeek.status).toBe(400);

    const foreignExercise = await coachA.post(`/plan-weeks/${week1Id}/sessions`).send({
      title: "Intrusion",
      scheduledDate: monday,
      exercises: [{ sourceExerciseId: exerciseBId, title: "Volé" }],
    });
    expect(foreignExercise.status).toBe(400);
  });

  it("éditer l'instance ne touche PAS le modèle de la bibliothèque", async () => {
    const edited = await coachA.put(`/scheduled-sessions/${scheduledId}`).send({
      title: "Bloc force max (ajusté)",
      notes: null,
      scheduledDate: monday,
      exercises: [
        {
          sourceExerciseId: exerciseAId,
          title: "Tractions lestées",
          note: "4×6 — épaule sensible",
        },
      ],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.exercises[0].note).toBe("4×6 — épaule sensible");

    const template = await coachA.get(`/sessions/${templateId}`);
    expect(template.body.title).toBe("Bloc force max");
    expect(template.body.exercises[0].note).toBe("5×5");
  });

  it("un brouillon est INVISIBLE de l'athlète (le scope tenant ne filtre pas le statut)", async () => {
    const plans = await athleteA1.get("/me/plans");
    expect(plans.status).toBe(200);
    expect(plans.body).toEqual([]);

    // Même en connaissant l'id exact de la séance.
    expect((await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("un coach ne voit ni ne diffuse la planification d'un autre coach", async () => {
    expect((await coachB.get(`/plans/${planId}`)).status).toBe(404);
    expect((await coachB.post(`/plans/${planId}/publish`)).status).toBe(404);
    expect((await coachB.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" })).status).toBe(
      404,
    );
    expect((await coachB.delete(`/plan-weeks/${week2Id}`)).status).toBe(404);
    expect((await coachB.get(`/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  // Les écritures, sous le même scope (#325) : le détail des tentatives est dans le harnais.
  it("un coach n'écrit nulle part dans le cycle d'un autre, et le cycle reste intact", async () => {
    const planOfA = async () => withoutSignatures((await coachA.get(`/plans/${planId}`)).body);
    const sessionOfA = async () =>
      withoutSignatures((await coachA.get(`/scheduled-sessions/${scheduledId}`)).body);
    const planBefore = await planOfA();
    const sessionBefore = await sessionOfA();
    expect([planBefore, sessionBefore]).toMatchObject([{ id: planId }, { id: scheduledId }]);

    const statuses = await attemptPlanWrites(coachB, {
      planId,
      weekId: week1Id,
      sessionId: scheduledId,
      monday,
    });

    expect(statuses).toEqual(notFoundEverywhere(statuses));
    expect(await planOfA()).toEqual(planBefore);
    expect(await sessionOfA()).toEqual(sessionBefore);
  });

  it("refuse de diffuser un cycle sans semaine (rien à consulter)", async () => {
    const empty = await coachA
      .post("/plans")
      .send({ athleteId: a1Id, title: "Cycle vide", startDate: monday });
    const res = await coachA.post(`/plans/${empty.body.id}/publish`);
    expect(res.status).toBe(400);
    await coachA.delete(`/plans/${empty.body.id}`);
  });

  it("diffuse le cycle : DRAFT → PUBLISHED, une seule fois", async () => {
    // Gating P6 : sans facturation saisie, la diffusion est refusée (rien n'est diffusé).
    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(400);

    const billing = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 6000, dueDate: monday });
    expect(billing.status).toBe(200);
    expect(billing.body.status).toBe("DRAFT");

    const res = await coachA.post(`/plans/${planId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(res.body.publishedAt).not.toBeNull();

    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(409);
  });

  it("l'athlète consulte SON cycle diffusé (semaines + séances) et le détail d'une séance", async () => {
    const plans = await athleteA1.get("/me/plans");
    expect(plans.status).toBe(200);
    expect(plans.body).toHaveLength(1);
    const plan = plans.body[0];
    expect(plan.id).toBe(planId);
    expect(plan.weeks).toHaveLength(2);
    expect(plan.weeks[0].sessions).toHaveLength(1);
    expect(plan.weeks[0].sessions[0]).toMatchObject({
      id: scheduledId,
      scheduledDate: monday,
      status: "PLANNED",
      exerciseCount: 1,
    });

    const session = await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises[0].title).toBe("Tractions lestées");
    expect(session.body.exercises[0].documents).toHaveLength(1);
  });

  it("l'athlète d'un autre coach ne voit rien de ce cycle", async () => {
    expect((await athleteB1.get("/me/plans")).body).toEqual([]);
    expect((await athleteB1.get(`/me/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("les routes de construction restent interdites à l'athlète", async () => {
    expect((await athleteA1.get("/plans")).status).toBe(403);
    expect((await athleteA1.get(`/scheduled-sessions/${scheduledId}`)).status).toBe(403);
    expect((await athleteA1.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" })).status).toBe(
      403,
    );
    // Symétrie : les routes /me/* sont réservées à l'athlète.
    expect((await coachA.get("/me/plans")).status).toBe(403);
  });

  // C'est l'arbitrage du modèle : l'instance est une copie autonome (sourceExerciseId en SetNull),
  // donc la bibliothèque reste librement modifiable — pas de 409 à vie sur un exercice planifié.
  it("supprimer un exercice de la bibliothèque ne casse PAS la planification diffusée", async () => {
    // Il faut d'abord le retirer du MODÈLE (SessionExercise reste en Restrict → 409).
    expect((await coachA.delete(`/exercises/${exerciseAId}`)).status).toBe(409);
    await coachA.put(`/sessions/${templateId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${templateId}`),
      title: "Bloc force max",
      notes: null,
      exercises: [],
    });

    expect((await coachA.delete(`/exercises/${exerciseAId}`)).status).toBe(204);

    // La séance de l'athlète est intacte : titre, note et document toujours là.
    const session = await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises[0].title).toBe("Tractions lestées");
    expect(session.body.exercises[0].sourceExerciseId).toBeNull(); // FK passée à null
    expect(session.body.exercises[0].documents).toHaveLength(1);
  });
});

/**
 * Ce qui dit au mobile que le déroulé gardé hors-ligne est périmé (#307). Retoucher une séance ne
 * touche PAS la ligne `Plan` : seul `updatedAt` de la séance le signale, et il doit valoir la même
 * chose dans le résumé du planning et dans le détail — c'est leur égalité que le mobile compare.
 */
describe("Retouche d'une séance diffusée : le résumé la signale (#307)", () => {
  it("la date de la séance bouge, celle du cycle non, et le détail suit le résumé", async () => {
    const coach = await signUp("resync-coach@cmv.test", Role.COACH);
    const athlete = await signUp("resync-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);

    const monday = mondayOfCurrentWeek();
    const plan = await coach.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle resync",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance", scheduledDate: monday });
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    const summaryOf = async () => {
      const plans = await athlete.get("/me/plans");
      return { plan: plans.body[0], session: plans.body[0].weeks[0].sessions[0] };
    };
    const before = await summaryOf();
    const detail = await athlete.get(`/me/scheduled-sessions/${session.body.id}`);
    expect(detail.body.updatedAt).toBe(before.session.updatedAt);

    // `updatedAt` est à la milliseconde : sans cette attente, la retouche peut tomber dessus.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const adjusted = await coach.put(`/scheduled-sessions/${session.body.id}`).send({
      title: "Séance (ajustée)",
      notes: null,
      scheduledDate: monday,
      exercises: [],
    });
    expect(adjusted.status).toBe(200);

    const after = await summaryOf();
    expect(after.session.updatedAt).not.toBe(before.session.updatedAt);
    expect(after.plan.updatedAt).toBe(before.plan.updatedAt);
    const refreshed = await athlete.get(`/me/scheduled-sessions/${session.body.id}`);
    expect(refreshed.body.updatedAt).toBe(after.session.updatedAt);
  });
});

/**
 * #172 : un cycle diffusé pouvait rester invisible de son destinataire. `GET /me/plan` n'en servait
 * qu'un (`selectCurrentPlan`), si bien qu'un second cycle diffusé — facturé, notifié — n'atteignait
 * jamais l'athlète, et que rien nulle part ne le signalait au coach.
 *
 * `GET /me/plans` les sert TOUS. Ce que ces tests tiennent, c'est l'accumulation : diffuser
 * n'écarte rien de ce qui est déjà diffusé.
 */
describe("Les cycles diffusés s'accumulent chez l'athlète (#172)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteMany: Agent;
  let athleteEnded: Agent;
  let athleteDraft: Agent;
  let athleteB1: Agent;
  let draftSessionId: string;

  const monday = mondayOfCurrentWeek();
  const weeksFrom = (mondays: number): string => {
    const date = shiftIsoDate(monday, mondays * 7);
    if (date == null) throw new Error("[test] date de départ de cycle introuvable");
    return date;
  };

  /**
   * Un cycle garni d'une séance, pour que la lecture athlète porte sur autre chose qu'un en-tête.
   * Le nombre de semaines décide de l'ÉPOQUE autant que la date de début : un cycle d'une semaine
   * démarré il y a deux semaines est terminé, pas en cours.
   */
  async function draft(
    coach: Agent,
    athleteId: string,
    title: string,
    startDate: string,
    weekCount = 1,
  ) {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate,
      weeks: Array.from({ length: weekCount }, () => ({ type: "TRAINING" })),
    });
    expect(plan.status).toBe(201);
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: `Séance — ${title}`, scheduledDate: startDate });
    expect(session.status).toBe(201);
    return { planId: plan.body.id as string, sessionId: session.body.id as string };
  }

  async function published(
    coach: Agent,
    athleteId: string,
    title: string,
    startDate: string,
    weekCount = 1,
  ) {
    const { planId } = await draft(coach, athleteId, title, startDate, weekCount);
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    return planId;
  }

  const titlesSeenBy = async (athlete: Agent): Promise<string[]> => {
    const res = await athlete.get("/me/plans");
    expect(res.status).toBe(200);
    return (res.body as { title: string }[]).map((plan) => plan.title);
  };

  beforeAll(async () => {
    coachA = await signUp("cumul-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("cumul-coach-b@cmv.test", Role.COACH);
    athleteMany = await signUp("cumul-many@cmv.test", Role.ATHLETE);
    athleteEnded = await signUp("cumul-ended@cmv.test", Role.ATHLETE);
    athleteDraft = await signUp("cumul-draft@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("cumul-b1@cmv.test", Role.ATHLETE);

    const manyId = await link(coachA, athleteMany);
    const endedId = await link(coachA, athleteEnded);
    const draftId = await link(coachA, athleteDraft);
    await link(coachB, athleteB1);

    // Deux cycles qui COURENT tous les deux, plus un qui arrive : le cas que #172 servait à moitié.
    await published(coachA, manyId, "En cours depuis 2 semaines", weeksFrom(-2), 4);
    await published(coachA, manyId, "En cours depuis lundi", weeksFrom(0));
    await published(coachA, manyId, "À venir dans 6 semaines", weeksFrom(6));

    // Deux cycles terminés, rien derrière.
    await published(coachA, endedId, "Terminé il y a longtemps", weeksFrom(-20));
    await published(coachA, endedId, "Terminé récemment", weeksFrom(-8));

    ({ sessionId: draftSessionId } = await draft(coachA, draftId, "Brouillon", weeksFrom(0)));
  });

  it("sert les DEUX cycles en cours, et pas seulement le dernier démarré", async () => {
    const titles = await titlesSeenBy(athleteMany);
    expect(titles).toContain("En cours depuis 2 semaines");
    expect(titles).toContain("En cours depuis lundi");
  });

  it("sert aussi le cycle à venir, en cours d'abord et par date de début croissante", async () => {
    expect(await titlesSeenBy(athleteMany)).toEqual([
      "En cours depuis 2 semaines",
      "En cours depuis lundi",
      "À venir dans 6 semaines",
    ]);
  });

  it("sert les semaines et les séances de chaque cycle, pas seulement leurs en-têtes", async () => {
    const res = await athleteMany.get("/me/plans");
    for (const plan of res.body as { weeks: { sessions: unknown[] }[] }[]) {
      // La séance est posée en semaine 1 de chaque cycle ; les semaines suivantes sont vides.
      expect(plan.weeks.length).toBeGreaterThanOrEqual(1);
      expect(plan.weeks[0]?.sessions).toHaveLength(1);
    }
  });

  /**
   * Le repli, et il compte : sans lui, un athlète entre deux cycles verrait un écran vide au lieu
   * du dernier cycle reçu. Un seul cycle, le plus récent — pas son historique entier.
   */
  it("retombe sur le dernier cycle terminé, seul, quand plus rien ne court", async () => {
    expect(await titlesSeenBy(athleteEnded)).toEqual(["Terminé récemment"]);
  });

  it("rend une liste VIDE — jamais null — pour un athlète sans cycle diffusé", async () => {
    const res = await athleteDraft.get("/me/plans");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("ne sert JAMAIS un brouillon, même en connaissant l'id exact de sa séance", async () => {
    expect(await titlesSeenBy(athleteDraft)).toEqual([]);
    expect((await athleteDraft.get(`/me/scheduled-sessions/${draftSessionId}`)).status).toBe(404);
  });

  it("ne fuit rien vers l'athlète d'un autre coach", async () => {
    expect(await titlesSeenBy(athleteB1)).toEqual([]);
  });

  it("reste fermée au coach, comme le reste de /me (@Roles ATHLETE)", async () => {
    expect((await coachA.get("/me/plans")).status).toBe(403);
    expect((await coachB.get("/me/plans")).status).toBe(403);
  });
});

/**
 * L'en-tête d'un cycle refuse une écriture fondée sur une version périmée (#604) : deux Coachs d'une
 * même entreprise retouchent le même cycle, et le second n'efface plus le premier en silence.
 */
describe("Cycle — version lue (#604)", () => {
  let coach: Agent;
  let other: Agent;
  let athleteId: string;
  let planId: string;

  const monday = mondayOfCurrentWeek();
  const path = () => `/plans/${planId}`;
  const current = async () => (await coach.get(path())).body;
  const rename = (title: string, expectedUpdatedAt: string, id = planId) =>
    coach.patch(`/plans/${id}`).send({ title, expectedUpdatedAt });

  /** Un brouillon garni d'une séance : de quoi le diffuser. */
  async function draft(title: string): Promise<string> {
    const plan = await coach
      .post("/plans")
      .send({ athleteId, title, startDate: monday, weeks: [{ type: "TRAINING" }] });
    expect(plan.status).toBe(201);
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance", scheduledDate: monday });
    expect(session.status).toBe(201);
    return plan.body.id;
  }

  beforeAll(async () => {
    coach = await signUp("plan-version-coach@cmv.test", Role.COACH);
    other = await signUp("plan-version-other@cmv.test", Role.COACH);
    athleteId = await link(coach, await signUp("plan-version-athlete@cmv.test", Role.ATHLETE));
    planId = await draft("Bloc");
  });

  it("écrit quand la version lue est la dernière, et la fait avancer", async () => {
    const before = await current();
    const write = await rename("Bloc (v2)", before.updatedAt);

    expect(write.status).toBe(200);
    expect(write.body.updatedAt).not.toBe(before.updatedAt);
  });

  it("refuse une écriture fondée sur une version périmée, et la base garde la première", async () => {
    const read = await current();
    expect((await rename("Écrit par le coach 1", read.updatedAt)).status).toBe(200);
    const kept = await current();

    const stale = await coach.patch(path()).send({
      title: "Écrit par le coach 2",
      startDate: shiftIsoDate(monday, 7),
      expectedUpdatedAt: read.updatedAt,
    });

    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe(STALE_WRITE);
    // Ni le titre, ni le décalage des séances qu'aurait emporté la date de début.
    expect(await current()).toEqual(kept);
  });

  it("ne laisse passer qu'une écriture sur deux lancées ensemble", async () => {
    const read = await current();
    const [first, second] = await Promise.all([
      rename("Course A", read.updatedAt),
      rename("Course B", read.updatedAt),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  it("ne fait pas avancer la version d'un enregistrement qui ne change rien", async () => {
    const before = await current();
    const write = await coach.patch(path()).send({ expectedUpdatedAt: before.updatedAt });

    expect(write.status).toBe(200);
    expect(await current()).toEqual(before);
  });

  it("refuse une écriture qui ne dit pas quelle version elle a lue", async () => {
    const before = await current();
    const write = await coach.patch(path()).send({ title: "Sans version" });

    expect(write.status).toBe(400);
    expect(await current()).toEqual(before);
  });

  /**
   * Le conflit passe AVANT le verrou de diffusion : la saisie n'a pas vu le cycle diffusé, et
   * « Recharger » le lui montrera — un refus « cycle diffusé » lui parlerait d'un état inconnu.
   */
  it("répond par un conflit de version sur un cycle diffusé depuis la lecture", async () => {
    const id = await draft("Diffusé entre-temps");
    const read = await versionOf(coach, `/plans/${id}`);
    expect((await billAndPublish(coach, id)).status).toBe(200);

    const stale = await rename("Trop tard", read, id);

    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe(STALE_WRITE);
  });

  // Un 409 apprendrait à l'autre coach que le cycle existe.
  it("répond 404 à un autre coach, même muni de la dernière version", async () => {
    const read = await current();
    const write = await other
      .patch(path())
      .send({ title: "Intrusion", expectedUpdatedAt: read.updatedAt });

    expect(write.status).toBe(404);
    expect(await current()).toEqual(read);
  });

  it("répond 404 sur un cycle supprimé, même muni de sa dernière version", async () => {
    const id = await draft("À supprimer");
    const read = await versionOf(coach, `/plans/${id}`);
    expect((await coach.delete(`/plans/${id}`)).status).toBe(204);

    expect((await rename("Trop tard", read, id)).status).toBe(404);
  });
});
