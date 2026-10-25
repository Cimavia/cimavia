import { MAX_CONVERSATION_PARTICIPANTS, MessageType, type TrainingCapability } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Agent,
  billAndPublish,
  idOf,
  openWith,
  participantIdsOf,
  required,
} from "../support/actors";
import { type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";

type Conversation = {
  id: string;
  kind: string;
  participants: { userId: string; capability: TrainingCapability; lastReadAt: string | null }[];
  lastReadAt: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
};

type Named = { userId: string; capability: TrainingCapability };

const coach = (userId: string): Named => ({ userId, capability: "coach" });
const athlete = (userId: string): Named => ({ userId, capability: "athlete" });

/**
 * Conversations à participants (#611), sur le terrain de la phase multi-coach : C, M et N sont
 * Coachs de F ; C et M suivent TI, C seul suit TE, B suit TI hors de F.
 */
describe("Conversations à participants : à deux ou à plusieurs (#611)", () => {
  let world: SharedPlanWorld;
  let teId: string;
  let groupId: string;

  const create = (agent: Agent, participants: Named[]) =>
    agent.post("/conversations").send({ participants });
  const listOf = async (agent: Agent) => (await agent.get("/conversations")).body as Conversation[];
  const seenBy = async (agent: Agent, id: string) =>
    required(
      (await listOf(agent)).find((conversation) => conversation.id === id),
      `fil ${id}`,
    );
  const send = (agent: Agent, id: string, content: string) =>
    agent.post(`/conversations/${id}/messages`).send({ type: MessageType.TEXT, content });

  beforeAll(async () => {
    world = await sharedPlanWorld("grp");
    teId = await idOf(world.te);
  });

  describe("Ceux qu'on peut réunir", () => {
    it("rend au Coach ses athlètes et ses collègues, avec ceux qu'ils suivent", async () => {
      const res = await world.c.get("/conversations/candidates");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        athletes: [
          { userId: teId, name: "grp-te@cmv.test" },
          { userId: world.ids.ti, name: "grp-ti@cmv.test" },
        ],
        coaches: [
          {
            userId: world.ids.m,
            name: "grp-m@cmv.test",
            organizationNames: ["grp-f@cmv.test"],
            followedAthleteIds: [world.ids.ti],
          },
          {
            userId: world.ids.n,
            name: "grp-n@cmv.test",
            organizationNames: ["grp-f@cmv.test"],
            followedAthleteIds: [],
          },
        ],
      });
    });

    // B suit TI, mais hors de F : ni ses liens ni son nom ne passent par C.
    it("ne rend au Coach aucun Coach hors de ses entreprises", async () => {
      const { coaches } = (await world.c.get("/conversations/candidates")).body as {
        coaches: { userId: string }[];
      };
      expect(coaches.map((candidate) => candidate.userId)).not.toContain(world.ids.b);
    });

    it("rend à l'athlète ses seuls Coachs, et aucun athlète", async () => {
      const res = await world.ti.get("/conversations/candidates");

      expect(res.body.athletes).toEqual([]);
      expect(res.body.coaches.map((candidate: { userId: string }) => candidate.userId)).toEqual([
        world.ids.b,
        world.ids.c,
        world.ids.m,
      ]);
      expect(res.body.coaches[0].followedAthleteIds).toBeNull();
    });

    // N n'a aucun athlète : ses collègues suffisent à lui ouvrir la messagerie.
    it("donne un interlocuteur au Coach qui n'a que des collègues", async () => {
      expect((await world.n.get("/me/counterparts")).body).toEqual({
        asCoach: true,
        asAthlete: false,
      });
    });
  });

  describe("Créer", () => {
    it("crée une conversation GROUP où chacun nomme les autres", async () => {
      const res = await create(world.c, [coach(world.ids.m), athlete(world.ids.ti)]);

      expect(res.status).toBe(201);
      expect(res.body.kind).toBe("GROUP");
      expect(participantIdsOf(res.body)).toEqual([world.ids.m, world.ids.ti]);
      groupId = res.body.id;

      const fromM = await seenBy(world.m, groupId);
      expect(participantIdsOf(fromM)).toEqual([world.ids.c, world.ids.ti]);
      const fromTi = await seenBy(world.ti, groupId);
      expect(participantIdsOf(fromTi)).toEqual([world.ids.c, world.ids.m]);
    });

    // Mêmes participants, même conversation — quel que soit celui qui la rouvre, et dans quel ordre.
    it("rend la même conversation à mêmes participants", async () => {
      const again = await create(world.m, [athlete(world.ids.ti), coach(world.ids.c)]);

      expect(again.status).toBe(201);
      expect(again.body.id).toBe(groupId);
    });

    it("ouvre un fil DIRECT entre deux Coachs d'une même entreprise", async () => {
      const res = await openWith(world.c, world.ids.m, "coach");

      expect(res.status).toBe(201);
      expect(res.body.kind).toBe("DIRECT");
      expect((await openWith(world.m, world.ids.c, "coach")).body.id).toBe(res.body.id);
    });

    // Prévenir plutôt qu'interdire (#598) : N ne suit pas TI, et peut pourtant être réuni avec lui.
    it("réunit un collègue avec un athlète qu'il ne suit pas", async () => {
      const res = await create(world.c, [coach(world.ids.n), athlete(world.ids.ti)]);

      expect(res.status).toBe(201);
      expect((await world.n.get(`/conversations/${res.body.id}/messages`)).status).toBe(200);
    });

    // B et C ne partagent aucune entreprise : c'est TI qui les réunit, à son titre d'athlète.
    it("laisse un athlète réunir deux de ses Coachs", async () => {
      const res = await create(world.ti, [coach(world.ids.b), coach(world.ids.c)]);

      expect(res.status).toBe(201);
      expect(res.body.kind).toBe("GROUP");
      expect(res.body.id).not.toBe(groupId);
      expect(participantIdsOf(await seenBy(world.b, res.body.id))).toEqual([
        world.ids.c,
        world.ids.ti,
      ]);
      // {C, M} : les participants du groupe de C — TI le rouvre au lieu d'en créer un second.
      expect((await create(world.ti, [coach(world.ids.c), coach(world.ids.m)])).body.id).toBe(
        groupId,
      );
    });

    it("refuse un Coach hors de ses entreprises, ou nommé à un autre titre (400)", async () => {
      expect((await create(world.c, [coach(world.ids.b)])).status).toBe(400);
      // M est un collègue de C, pas un athlète qu'il suit.
      expect((await create(world.c, [athlete(world.ids.m)])).status).toBe(400);
      // TI ne suit pas TE : un athlète n'en réunit aucun autre.
      expect((await create(world.ti, [coach(world.ids.c), athlete(teId)])).status).toBe(400);
    });

    it("refuse de se nommer soi-même (409), et un même participant deux fois (400)", async () => {
      expect((await create(world.c, [coach(world.ids.c)])).status).toBe(409);
      expect((await create(world.c, [coach(world.ids.m), athlete(world.ids.m)])).status).toBe(400);
    });

    // Le plafond se juge AVANT les participants : à 20 inconnus, c'est leur identité qui est
    // refusée ; à 21, leur nombre.
    it(`refuse plus de ${MAX_CONVERSATION_PARTICIPANTS} autres participants (400)`, async () => {
      const crowd = (size: number) =>
        Array.from({ length: size }, (_, index) => athlete(`inconnu-${index}`));

      const atCap = await create(world.c, crowd(MAX_CONVERSATION_PARTICIPANTS));
      expect(atCap.status).toBe(400);
      expect(atCap.body.detail).toBe("Participant inconnu");

      const overCap = await create(world.c, crowd(MAX_CONVERSATION_PARTICIPANTS + 1));
      expect(overCap.status).toBe(400);
      expect(overCap.body.errors).toEqual([expect.objectContaining({ pointer: "#/participants" })]);
    });
  });

  describe("Lire, chacun à son heure", () => {
    it("compte le message de C comme non lu chez M et chez TI", async () => {
      expect((await send(world.c, groupId, "On cale la semaine ?")).status).toBe(201);

      expect((await seenBy(world.m, groupId)).unreadCount).toBe(1);
      expect((await seenBy(world.ti, groupId)).unreadCount).toBe(1);
      expect((await seenBy(world.c, groupId)).unreadCount).toBe(0);
      expect((await seenBy(world.ti, groupId)).lastMessageSenderId).toBe(world.ids.c);
    });

    // La marque de M ne vaut que pour M : TI n'a toujours rien lu, et C le voit.
    it("pose la marque de lecture du seul lecteur", async () => {
      expect((await world.m.post(`/conversations/${groupId}/read`)).status).toBe(204);

      expect((await seenBy(world.m, groupId)).unreadCount).toBe(0);
      expect((await seenBy(world.ti, groupId)).unreadCount).toBe(1);

      const fromC = await seenBy(world.c, groupId);
      const marks = new Map(fromC.participants.map((p) => [p.userId, p.lastReadAt]));
      expect(marks.get(world.ids.m)).not.toBeNull();
      expect(marks.get(world.ids.ti)).toBeNull();
    });

    it("compte la réponse de TI chez les deux Coachs", async () => {
      expect((await send(world.ti, groupId, "Mardi me va")).status).toBe(201);

      expect((await seenBy(world.c, groupId)).unreadCount).toBe(1);
      expect((await seenBy(world.m, groupId)).unreadCount).toBe(1);
      expect((await seenBy(world.ti, groupId)).unreadCount).toBe(1);
    });

    /**
     * La pastille d'un espace compte TOUTES ses conversations, à plusieurs comprises (#612) : elle
     * se lit dans les notifications, posées pour chaque destinataire sauf l'auteur. Un groupe neuf,
     * où TE écrit pour la première fois : un message n'ouvre une série chez X que si X a lu le
     * précédent de son auteur (#611), et TI a déjà écrit sans être lu dans `groupId`. En écart
     * plutôt qu'en absolu — le terrain partagé a déjà ses propres notifications.
     */
    it("allume la pastille d'espace de chaque destinataire, pas celle de l'auteur", async () => {
      type Unread = { coach: number; athlete: number; count: number };
      const unread = async (agent: Agent) =>
        (await agent.get("/me/notifications/unread-count")).body as Unread;
      const snapshot = async () => ({
        c: await unread(world.c),
        m: await unread(world.m),
        te: await unread(world.te),
      });
      const opened = await create(world.c, [coach(world.ids.m), athlete(teId)]);
      expect(opened.status).toBe(201);
      const before = await snapshot();

      expect((await send(world.te, opened.body.id, "Je pars sur la grimpe")).status).toBe(201);

      const after = await snapshot();
      expect(after.c.coach - before.c.coach).toBe(1);
      expect(after.m.coach - before.m.coach).toBe(1);
      expect(after.te.count).toBe(before.te.count);
    });
  });

  describe("Isolation", () => {
    it("n'ouvre la conversation qu'à ses participants", async () => {
      for (const outsider of [world.b, world.te, world.n]) {
        expect((await listOf(outsider)).map((conversation) => conversation.id)).not.toContain(
          groupId,
        );
        expect((await outsider.get(`/conversations/${groupId}/messages`)).status).toBe(404);
        expect((await send(outsider, groupId, "intrusion")).status).toBe(404);
        expect((await outsider.post(`/conversations/${groupId}/read`)).status).toBe(404);
      }
    });

    // Le fil d'un compte Entreprise n'existe pas : la route est réservée aux deux capacités.
    it("ferme la messagerie au compte Entreprise", async () => {
      expect((await world.company.get("/conversations")).status).toBe(403);
      expect((await world.company.get("/conversations/candidates")).status).toBe(403);
    });

    /**
     * Un message rattaché à un débrief est une réponse à son athlète (#610) : deux Coachs qui en
     * parlent entre eux ne lui répondent pas, et leur échange ne doit pas s'afficher dans le débrief.
     */
    it("refuse de citer un débrief dans un fil sans son athlète", async () => {
      expect((await billAndPublish(world.c, world.planTi.id)).status).toBe(200);
      const feedback = await world.ti
        .put(`/me/scheduled-sessions/${world.planTi.sessionId}/feedback`)
        .send({ content: "Séance faite" });
      expect(feedback.status).toBe(200);
      const betweenCoaches = await openWith(world.c, world.ids.m, "coach");

      const cited = await world.c.post(`/conversations/${betweenCoaches.body.id}/messages`).send({
        type: MessageType.TEXT,
        content: "Tu as vu son genou ?",
        sessionFeedbackId: feedback.body.id,
      });

      expect(cited.status).toBe(400);
      expect(cited.body.detail).toBe("Débrief hors de ce fil");
    });
  });
});
