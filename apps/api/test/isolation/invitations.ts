import { Role } from "@cmv/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fr } from "../../src/infra/mail/locale/fr";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, inviteFor, required, signUp, signUpWith } from "../support/actors";
import { app, sentMails } from "../support/app";

/**
 * L'adresse d'une invitation nominative est tapée par le COACH, celle du compte par l'athlète
 * lui-même. Rien ne garantit la même casse, et la comparaison brute rendait alors l'invitation
 * définitivement inutilisable : refusée à l'acceptation, sans message qui dise pourquoi.
 */
describe("Invitation nominative : la casse de l'adresse ne décide de rien", () => {
  it("accepte une invitation dont l'adresse a été saisie en majuscules", async () => {
    const coach = await signUpWith("case-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("case-athlete@cmv.test", Role.ATHLETE);

    const invitation = await coach.post("/invitations").send({ email: "CASE-Athlete@CMV.test" });
    expect(invitation.status).toBe(201);
    // Normalisée à l'écriture : ce qui est stocké est comparable à l'adresse d'une session.
    expect(invitation.body.email).toBe("case-athlete@cmv.test");

    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    expect(accepted.status).toBe(201);
  });

  // La normalisation ne DÉSARME pas la restriction : elle la rend seulement praticable.
  it("refuse toujours un athlète dont l'adresse n'est pas celle de l'invitation", async () => {
    const coach = await signUpWith("case-coach-2@cmv.test", { isCoach: true, isAthlete: false });
    const other = await signUp("case-other@cmv.test", Role.ATHLETE);

    const invitation = await coach.post("/invitations").send({ email: "Quelquun@CMV.test" });
    const refused = await other.post(`/invitations/${invitation.body.id}/accept`);
    // 404 et non 400 (#390) : à qui n'est pas visé, l'invitation n'existe pas.
    expect(refused.status).toBe(404);
  });
});

/**
 * `GET /invitations/for-me` et `POST /invitations/:id/decline` (#146) — les deux gestes qui manquaient
 * à l'athlète. L'invitation nominative existait au modèle, mais rien ne la lui montrait : le coach
 * saisissait une adresse en croyant déclencher quelque chose.
 */
describe("Invitations qui m'attendent, et refus (#146)", () => {
  it("ne montre une invitation nominative qu'à l'adresse visée", async () => {
    const coach = await signUpWith("fm-coach@cmv.test", { isCoach: true, isAthlete: false });
    const target = await signUp("fm-target@cmv.test", Role.ATHLETE);
    const other = await signUp("fm-other@cmv.test", Role.ATHLETE);
    await coach.post("/invitations").send({ email: "fm-target@cmv.test" });

    const mine = await target.get("/invitations/for-me");
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect((await other.get("/invitations/for-me")).body).toEqual([]);
  });

  /**
   * Le DTO ne porte NI l'adresse (c'est la sienne) NI le `coachId` : la route dirait sinon qui
   * invite qui. Le nom de l'émetteur y est, lui — sans quoi la carte annoncerait une invitation
   * sans pouvoir le nommer.
   */
  it("ne dit à l'athlète que ce qu'il a besoin de savoir", async () => {
    const coach = await signUpWith("fm-shape-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("fm-shape@cmv.test", Role.ATHLETE);
    await coach.post("/invitations").send({ email: "fm-shape@cmv.test" });

    const entry = required((await athlete.get("/invitations/for-me")).body[0], "invitation reçue");
    expect(Object.keys(entry).sort()).toEqual(["createdAt", "expiresAt", "id", "issuer"]);
    expect(entry.issuer).toEqual({ kind: "coach", name: "fm-shape-coach@cmv.test" });
  });

  // Plus d'invitation générique (#390) : sans adresse, elle n'apparaîtrait à personne.
  it("refuse d'émettre une invitation sans adresse", async () => {
    const coach = await signUpWith("fm-generic-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });

    expect((await coach.post("/invitations").send({})).status).toBe(400);
    expect((await coach.get("/invitations")).body).toEqual([]);
  });

  /**
   * L'expiration n'est pas un statut mais une date : sans ce filtre, une invitation périmée serait
   * proposée à l'athlète, puis refusée à l'acceptation. Aucune route ne sait fabriquer une
   * invitation expirée — on recule l'échéance en base, seul moyen d'atteindre ce cas.
   */
  it("ne montre pas une invitation expirée", async () => {
    const coach = await signUpWith("fm-expired-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const athlete = await signUp("fm-expired@cmv.test", Role.ATHLETE);
    const invitation = await coach.post("/invitations").send({ email: "fm-expired@cmv.test" });

    await app.get(PrismaService).invitation.update({
      where: { id: invitation.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await athlete.get("/invitations/for-me")).body).toEqual([]);
  });

  it("retire de la liste ce que l'athlète a déjà accepté", async () => {
    const coach = await signUpWith("fm-taken-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("fm-taken@cmv.test", Role.ATHLETE);
    const invitation = await coach.post("/invitations").send({ email: "fm-taken@cmv.test" });
    await athlete.post(`/invitations/${invitation.body.id}/accept`);

    expect((await athlete.get("/invitations/for-me")).body).toEqual([]);
  });

  it("retire de la liste ce que l'athlète a refusé, et le dit au coach", async () => {
    const coach = await signUpWith("fm-decline-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const athlete = await signUp("fm-decline@cmv.test", Role.ATHLETE);
    const invitation = await coach.post("/invitations").send({ email: "fm-decline@cmv.test" });

    const declined = await athlete.post(`/invitations/${invitation.body.id}/decline`);
    expect(declined.status).toBe(204);

    expect((await athlete.get("/invitations/for-me")).body).toEqual([]);
    const seenByCoach = required(
      (await coach.get("/invitations")).body.find(
        (row: { id: string }) => row.id === invitation.body.id,
      ),
      "invitation côté coach",
    );
    // DECLINED, jamais REVOKED : le coach doit lire « on m'a dit non », pas « j'ai annulé ».
    expect(seenByCoach.status).toBe("DECLINED");
  });

  /**
   * L'`id` n'est pas un secret — il circule dans la carte et dans les notifications —, c'est
   * l'adresse de la session qui fait le verrou (#390). À qui n'est pas visé, l'invitation n'existe
   * pas : même 404 qu'un `id` inconnu, et AVANT tout ce qui dirait son sort. Une invitation
   * expirée ou déjà acceptée répondrait sinon autre chose, et l'apprendrait à un tiers.
   */
  it("traite l'id d'une invitation adressée à un autre comme inconnu, quel que soit son sort", async () => {
    const coach = await signUpWith("fm-strict-coach@cmv.test", { isCoach: true, isAthlete: false });
    const target = await signUp("fm-strict@cmv.test", Role.ATHLETE);
    const other = await signUp("fm-strict-other@cmv.test", Role.ATHLETE);
    const pending = await coach.post("/invitations").send({ email: "fm-strict@cmv.test" });
    const expired = await coach.post("/invitations").send({ email: "fm-strict@cmv.test" });
    await app.get(PrismaService).invitation.update({
      where: { id: expired.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const notFound = { status: 404, message: "Invitation introuvable" };

    for (const action of ["accept", "decline"]) {
      for (const id of [pending.body.id, expired.body.id, "inconnu"]) {
        const res = await other.post(`/invitations/${id}/${action}`);
        expect({ status: res.status, message: res.body.message }).toEqual(notFound);
      }
    }
    // Rien n'a bougé pour le destinataire, qui peut toujours rejoindre.
    expect((await target.post(`/invitations/${pending.body.id}/accept`)).status).toBe(201);
    const used = await other.post(`/invitations/${pending.body.id}/decline`);
    expect({ status: used.status, message: used.body.message }).toEqual(notFound);
  });

  /**
   * Un athlète DÉJÀ LIÉ voit l'invitation et peut la refuser. La masquer laisserait un coach
   * persuadé d'avoir invité quelqu'un qui ne verrait jamais rien ; interdire le refus laisserait
   * l'invitation en attente pour toujours.
   */
  it("laisse un athlète déjà lié voir l'invitation et la refuser", async () => {
    const first = await signUpWith("fm-linked-first@cmv.test", { isCoach: true, isAthlete: false });
    const second = await signUpWith("fm-linked-second@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const athlete = await signUp("fm-linked@cmv.test", Role.ATHLETE);

    const join = await inviteFor(first, athlete);
    await athlete.post(`/invitations/${join.body.id}/accept`);

    const secondInvitation = await second.post("/invitations").send({
      email: "fm-linked@cmv.test",
    });
    expect((await athlete.get("/invitations/for-me")).body).toHaveLength(1);
    expect((await athlete.post(`/invitations/${secondInvitation.body.id}/decline`)).status).toBe(
      204,
    );
    expect((await athlete.get("/invitations/for-me")).body).toEqual([]);
  });

  // Une invitation déjà consommée ne se rejoue pas : ni pour rejoindre une seconde fois, ni pour
  // la retourner en refus après coup — le coach lirait « refusée » une invitation acceptée.
  it("refuse une invitation inconnue ou déjà consommée, à l'acceptation comme au refus (404)", async () => {
    const coach = await signUpWith("fm-used-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("fm-used@cmv.test", Role.ATHLETE);
    const invitation = await coach.post("/invitations").send({ email: "fm-used@cmv.test" });
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    for (const action of ["accept", "decline"]) {
      const used = await athlete.post(`/invitations/${invitation.body.id}/${action}`);
      expect(used.status).toBe(404);
      expect(used.body.message).toBe("Invitation introuvable ou déjà utilisée");
      expect((await athlete.post(`/invitations/inconnu/${action}`)).status).toBe(404);
    }
  });

  /**
   * Même recul d'échéance en base que plus haut. L'expiration se vérifie aux DEUX gestes : la
   * liste la masque déjà, mais une carte ouverte avant l'échéance reste cliquable après.
   */
  it("refuse une invitation expirée, à l'acceptation comme au refus, sans la consommer", async () => {
    const coach = await signUpWith("fm-late-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("fm-late@cmv.test", Role.ATHLETE);
    const invitation = await coach.post("/invitations").send({ email: "fm-late@cmv.test" });
    await app.get(PrismaService).invitation.update({
      where: { id: invitation.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    for (const action of ["accept", "decline"]) {
      const late = await athlete.post(`/invitations/${invitation.body.id}/${action}`);
      expect(late.status).toBe(400);
      expect(late.body.message).toBe("Invitation expirée");
    }
    expect((await athlete.get("/me/coaches")).body).toEqual([]);
    const seenByCoach = (await coach.get("/invitations")).body.find(
      (row: { id: string }) => row.id === invitation.body.id,
    );
    expect(seenByCoach.status).toBe("PENDING");
  });

  // Les deux routes sont celles de l'athlète : un coach n'a pas d'invitation qui l'attende.
  it("ferme les deux routes à un coach", async () => {
    const coach = await signUpWith("fm-closed@cmv.test", { isCoach: true, isAthlete: false });
    expect((await coach.get("/invitations/for-me")).status).toBe(403);
    expect((await coach.post("/invitations/x/decline")).status).toBe(403);
  });
});

/**
 * Les trois temps d'une invitation, côté centre de notifications (#146). L'adresse saisie par le
 * coach ne servait qu'à restreindre l'acceptation ; elle prévient désormais, quand il y a
 * quelqu'un à prévenir.
 */
describe("Notifications d'invitation (#146)", () => {
  const typesOf = async (agent: Agent): Promise<string[]> =>
    (await agent.get("/me/notifications")).body.map((n: { type: string }) => n.type);

  it("prévient l'athlète qu'une invitation nominative l'attend", async () => {
    const coach = await signUpWith("ni-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("ni-athlete@cmv.test", Role.ATHLETE);
    await coach.post("/invitations").send({ email: "ni-athlete@cmv.test" });

    const entry = required(
      (await athlete.get("/me/notifications")).body[0],
      "notification d'invitation",
    );
    expect(entry).toMatchObject({
      type: "INVITATION_RECEIVED",
      entityType: "INVITATION",
      // `signUp` pose `name = email` : c'est donc l'adresse du coach qu'on lit en acteur.
      actorName: "ni-coach@cmv.test",
      subjectLabel: null,
      readAt: null,
    });
  });

  it("remonte au coach que son invitation a été acceptée, puis refusée par un autre", async () => {
    const coach = await signUpWith("ni-answer-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const joining = await signUp("ni-joining@cmv.test", Role.ATHLETE);
    const refusing = await signUp("ni-refusing@cmv.test", Role.ATHLETE);

    const toJoin = await coach.post("/invitations").send({ email: "ni-joining@cmv.test" });
    await joining.post(`/invitations/${toJoin.body.id}/accept`);

    const toRefuse = await coach.post("/invitations").send({ email: "ni-refusing@cmv.test" });
    await refusing.post(`/invitations/${toRefuse.body.id}/decline`);

    const inbox = (await coach.get("/me/notifications")).body;
    expect(inbox.find((n: { type: string }) => n.type === "INVITATION_ACCEPTED")).toMatchObject({
      actorName: "ni-joining@cmv.test",
      entityType: "INVITATION",
    });
    expect(inbox.find((n: { type: string }) => n.type === "INVITATION_DECLINED")).toMatchObject({
      actorName: "ni-refusing@cmv.test",
      entityType: "INVITATION",
    });
  });

  /**
   * Le cas le plus COURANT — inviter quelqu'un qui n'a pas encore de compte — et il ne doit ni
   * lever, ni écrire quoi que ce soit. L'invitation part avec son code, exactement comme si
   * l'adresse était connue : sans cette symétrie, la réponse dirait qui est inscrit chez nous.
   */
  it("n'écrit aucune notification pour une adresse sans compte, et n'échoue pas", async () => {
    const coach = await signUpWith("ni-unknown-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const res = await coach.post("/invitations").send({ email: "personne@cmv.test" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
  });

  /**
   * Une adresse rattachée à un compte COACH SEUL n'est pas notifiée : il ne peut pas accepter, et
   * la pastille s'allumerait sur un espace où il n'aurait rien à faire. Il n'est pas introuvable
   * pour autant — il est à joindre autrement.
   */
  it("ne notifie pas un compte qui ne porte pas la capacité athlète", async () => {
    const coach = await signUpWith("ni-cc-coach@cmv.test", { isCoach: true, isAthlete: false });
    const coachOnly = await signUpWith("ni-coach-only@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    await coach.post("/invitations").send({ email: "ni-coach-only@cmv.test" });

    expect(await typesOf(coachOnly)).toEqual([]);
  });
});

/**
 * L'e-mail d'invitation (#146) — le seul message du produit adressé à quelqu'un qui n'est pas
 * encore utilisateur. Sans lui, saisir l'adresse d'un futur athlète restait un geste sans effet :
 * le centre et le push ne peuvent rien pour un compte qui n'existe pas.
 */
describe("E-mail d'invitation vers une adresse sans compte (#146)", () => {
  let coach: Agent;

  beforeAll(async () => {
    coach = await signUpWith("mi-coach@cmv.test", { isCoach: true, isAthlete: false });
  });

  beforeEach(() => {
    sentMails.length = 0;
  });

  it("écrit à l'adresse invitée, avec la consigne et le nom de l'inviteur", async () => {
    const invitation = await coach.post("/invitations").send({ email: "mi-inconnu@cmv.test" });
    expect(invitation.status).toBe(201);

    const mail = required(sentMails[0], "e-mail d'invitation");
    expect(mail.to).toBe("mi-inconnu@cmv.test");
    // Plus de code à recopier (#390) : le message dit de s'inscrire avec CETTE adresse.
    expect(mail.text).toContain(fr.invitation.addressLine);
    // `signUp` pose `name = email` : c'est l'adresse du coach qu'on lit comme nom.
    expect(mail.subject).toContain("mi-coach@cmv.test");
  });

  /**
   * Le partage des canaux, vu de l'extérieur : un compte athlète est prévenu DANS l'application,
   * pas par e-mail. Le lui envoyer doublerait un message qu'il verra de toute façon, et
   * `INVITATION_RECEIVED` est justement hors de l'opt-in (#65) pour cette raison.
   */
  it("n'écrit pas à une adresse qui a déjà un compte athlète", async () => {
    await signUp("mi-inscrit@cmv.test", Role.ATHLETE);
    expect((await coach.post("/invitations").send({ email: "mi-inscrit@cmv.test" })).status).toBe(
      201,
    );

    expect(sentMails).toEqual([]);
  });

  /**
   * Un compte COACH SEUL ne peut pas accepter : il ne reçoit donc pas de notification, mais il
   * n'est pas laissé sans rien pour autant — c'est l'e-mail qui le joint, et l'invitation
   * l'attendra dans « Mon coach » une fois la casquette athlète activée.
   */
  it("écrit à un compte qui ne porte pas la capacité athlète", async () => {
    await signUpWith("mi-coach-seul@cmv.test", { isCoach: true, isAthlete: false });
    expect(
      (await coach.post("/invitations").send({ email: "mi-coach-seul@cmv.test" })).status,
    ).toBe(201);

    expect(required(sentMails[0], "e-mail d'invitation").to).toBe("mi-coach-seul@cmv.test");
  });

  /**
   * La casse de l'adresse ne change ni la destination ni le canal. Le message part à l'adresse
   * NORMALISÉE, celle-là même qui sera comparée à la session au moment d'accepter — sans quoi on
   * écrirait à une forme de l'adresse et on en attendrait une autre.
   */
  it("écrit à l'adresse normalisée, quelle que soit la casse saisie", async () => {
    expect((await coach.post("/invitations").send({ email: "MI-Casse@CMV.test" })).status).toBe(
      201,
    );
    expect(required(sentMails[0], "e-mail d'invitation").to).toBe("mi-casse@cmv.test");
  });
});

/**
 * `DELETE /invitations/:id` (#146) — le geste qui manquait au coach une fois qu'on lui a dit non.
 * Une invitation refusée quitte `PENDING` : elle disparaît de sa liste d'attente mais reste en
 * base, et rien ne lui permettait de solder la ligne.
 */
describe("Effacer une invitation refusée (#146)", () => {
  /** Une invitation nominative que `athlete` vient de refuser. */
  async function declinedInvitation(coach: Agent, athlete: Agent, email: string): Promise<string> {
    const invitation = await coach.post("/invitations").send({ email });
    expect((await athlete.post(`/invitations/${invitation.body.id}/decline`)).status).toBe(204);
    return invitation.body.id;
  }

  it("efface une invitation refusée, et elle quitte la liste du coach", async () => {
    const coach = await signUpWith("rm-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("rm-athlete@cmv.test", Role.ATHLETE);
    const id = await declinedInvitation(coach, athlete, "rm-athlete@cmv.test");

    expect((await coach.delete(`/invitations/${id}`)).status).toBe(204);
    expect((await coach.get("/invitations")).body).toEqual([]);
  });

  /**
   * Le cœur de la règle : retirer une invitation EN ATTENTE est une révocation — une autre
   * transition, qui a sa propre route (#524). La déguiser en suppression ferait disparaître une
   * invitation encore acceptable sans le dire à qui l'a reçue.
   */
  it("refuse d'effacer une invitation encore en attente", async () => {
    const coach = await signUpWith("rm-pending-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const pending = await coach.post("/invitations").send({ email: "rm-pending@cmv.test" });

    expect((await coach.delete(`/invitations/${pending.body.id}`)).status).toBe(409);
    expect((await coach.get("/invitations")).body).toHaveLength(1);
  });

  // Une invitation acceptée est la trace de la façon dont la relation s'est nouée : elle reste.
  it("refuse d'effacer une invitation acceptée", async () => {
    const coach = await signUpWith("rm-taken-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("rm-taken-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    await athlete.post(`/invitations/${invitation.body.id}/accept`);

    expect((await coach.delete(`/invitations/${invitation.body.id}`)).status).toBe(409);
  });

  /**
   * Isolation : l'invitation d'un autre coach rend **404**, pas 403. Confirmer l'existence de ce
   * qu'on n'a pas le droit de voir serait déjà en dire trop — c'est le scope tenant qui répond,
   * pas une garde applicative.
   */
  it("ne laisse pas un coach effacer l'invitation refusée d'un autre", async () => {
    const owner = await signUpWith("rm-owner@cmv.test", { isCoach: true, isAthlete: false });
    const intruder = await signUpWith("rm-intruder@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("rm-victim@cmv.test", Role.ATHLETE);
    const id = await declinedInvitation(owner, athlete, "rm-victim@cmv.test");

    expect((await intruder.delete(`/invitations/${id}`)).status).toBe(404);
    expect((await owner.get("/invitations")).body).toHaveLength(1);
    // La liste, sous le même scope (#325) : l'intrus n'y lit rien de ce qu'a émis l'autre coach.
    expect((await intruder.get("/invitations")).body).toEqual([]);
  });

  // La route est celle du coach : un athlète n'efface pas ce qu'il vient de refuser.
  it("ferme la route à un athlète", async () => {
    const athlete = await signUp("rm-closed@cmv.test", Role.ATHLETE);
    expect((await athlete.delete("/invitations/whatever")).status).toBe(403);
  });
});

/**
 * `POST /invitations/:id/revoke` (#524) — le coach qui s'est trompé d'adresse ne pouvait qu'attendre
 * sept jours, pendant lesquels l'invitation restait acceptable par qui détient cette adresse.
 */
describe("Retirer une invitation en attente (#524)", () => {
  it("retire l'invitation : elle quitte la liste du coach et celle de l'athlète", async () => {
    const coach = await signUpWith("rv-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("rv-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    expect((await athlete.get("/invitations/for-me")).body).toHaveLength(1);

    expect((await coach.post(`/invitations/${invitation.body.id}/revoke`)).status).toBe(204);

    // C'est le geste du coach : il n'a rien à y apprendre, la ligne n'a plus d'action à offrir.
    expect((await coach.get("/invitations")).body).toEqual([]);
    expect((await athlete.get("/invitations/for-me")).body).toEqual([]);
  });

  /**
   * Un statut plutôt qu'une ligne effacée, et c'est pour ceci : la carte ouverte avant la
   * révocation reste cliquable, et son destinataire lit « retirée », pas « introuvable ». À lui
   * seul — un tiers, lui, ne lit que 404 (#390).
   */
  it("dit au destinataire qu'elle a été retirée, à l'acceptation comme au refus, et à lui seul", async () => {
    const coach = await signUpWith("rv-gone-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("rv-gone@cmv.test", Role.ATHLETE);
    const other = await signUp("rv-gone-other@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    await coach.post(`/invitations/${invitation.body.id}/revoke`);

    for (const action of ["accept", "decline"]) {
      const late = await athlete.post(`/invitations/${invitation.body.id}/${action}`);
      expect({ status: late.status, message: late.body.message }).toEqual({
        status: 410,
        message: "Invitation retirée par le coach",
      });
      expect((await other.post(`/invitations/${invitation.body.id}/${action}`)).status).toBe(404);
    }
    expect((await athlete.get("/me/coaches")).body).toEqual([]);
  });

  // L'expiration est une date, pas un statut : une invitation périmée reste à retirer.
  it("retire une invitation expirée", async () => {
    const coach = await signUpWith("rv-late-coach@cmv.test", { isCoach: true, isAthlete: false });
    const invitation = await coach.post("/invitations").send({ email: "rv-late@cmv.test" });
    await app.get(PrismaService).invitation.update({
      where: { id: invitation.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await coach.post(`/invitations/${invitation.body.id}/revoke`)).status).toBe(204);
  });

  /**
   * Seule une invitation EN ATTENTE se retire : acceptée, elle est la trace d'une relation ;
   * refusée, elle s'efface ; déjà retirée, il n'y a plus rien à retirer.
   */
  it("refuse de retirer une invitation qui n'est plus en attente (409)", async () => {
    const coach = await signUpWith("rv-done-coach@cmv.test", { isCoach: true, isAthlete: false });
    const taker = await signUp("rv-done-taker@cmv.test", Role.ATHLETE);
    const decliner = await signUp("rv-done-decliner@cmv.test", Role.ATHLETE);
    const accepted = await inviteFor(coach, taker);
    await taker.post(`/invitations/${accepted.body.id}/accept`);
    const declined = await inviteFor(coach, decliner);
    await decliner.post(`/invitations/${declined.body.id}/decline`);
    const revoked = await coach.post("/invitations").send({ email: "rv-done-twice@cmv.test" });
    await coach.post(`/invitations/${revoked.body.id}/revoke`);

    for (const id of [accepted.body.id, declined.body.id, revoked.body.id]) {
      const res = await coach.post(`/invitations/${id}/revoke`);
      expect({ status: res.status, message: res.body.message }).toEqual({
        status: 409,
        message: "Seule une invitation en attente peut être retirée",
      });
    }
    const statuses = (await coach.get("/invitations")).body.map(
      (row: { status: string }) => row.status,
    );
    expect(statuses.sort()).toEqual(["ACCEPTED", "DECLINED"]);
  });

  /**
   * Isolation : l'invitation d'un autre coach rend **404**, et reste acceptable par son
   * destinataire. C'est le scope tenant qui répond, pas une garde applicative.
   */
  it("ne laisse pas un coach retirer l'invitation d'un autre", async () => {
    const owner = await signUpWith("rv-owner@cmv.test", { isCoach: true, isAthlete: false });
    const intruder = await signUpWith("rv-intruder@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("rv-victim@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(owner, athlete);

    expect((await intruder.post(`/invitations/${invitation.body.id}/revoke`)).status).toBe(404);
    expect((await intruder.post("/invitations/inconnu/revoke")).status).toBe(404);
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);
  });

  // La route est celle du coach : l'athlète, lui, refuse.
  it("ferme la route à un athlète", async () => {
    const athlete = await signUp("rv-closed@cmv.test", Role.ATHLETE);
    expect((await athlete.post("/invitations/whatever/revoke")).status).toBe(403);
  });
});
