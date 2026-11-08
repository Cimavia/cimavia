import { InvitationRole } from "@cmv/shared";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fr } from "../../src/infra/mail/locale/fr";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, PASSWORD, required, signUpUnverified, signUpWith } from "../support/actors";
import { app, baseURL, sentMails } from "../support/app";
import { takeVerificationToken, verifyAndSignIn } from "../support/verification";

/**
 * L'adresse se prouve avant de servir (#270).
 *
 * Deux verrous du produit reposent sur l'adresse de la session : l'invitation nominative (#146,
 * #390) et la porte d'un environnement fermé (#263). Sans vérification, qui connaissait l'adresse
 * d'un invité pas encore inscrit pouvait créer le compte à sa place, voir l'invitation et
 * l'accepter. Ce qu'on vérifie : un compte non vérifié n'a PAS de session — donc rien de ce qui
 * lit l'adresse ne lui répond —, et le parcours vérifié reste celui d'avant.
 */

function signIn(agent: Agent, email: string, password = PASSWORD) {
  return agent.post("/api/auth/sign-in/email").send({ email, password });
}

describe("Vérification d'adresse : l'inscription n'ouvre pas de session (#270)", () => {
  beforeEach(() => {
    sentMails.length = 0;
  });

  it("inscrit sans session, et envoie le lien à l'adresse", async () => {
    const agent = request.agent(baseURL);

    const created = await signUpUnverified("verif-neuf@cmv.test", { agent });

    expect(created.status).toBe(200);
    expect(created.body.token).toBeNull();
    expect((await agent.get("/api/auth/get-session")).body).toBeNull();
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]).toMatchObject({
      to: "verif-neuf@cmv.test",
      subject: fr.verifyEmail.subject,
    });
  });

  // Le renvoi du lien : il n'exige que le mot de passe, et le refus dit pourquoi.
  it("refuse la connexion tant que l'adresse n'est pas vérifiée, et renvoie le lien", async () => {
    const agent = request.agent(baseURL);
    await signUpUnverified("verif-refus@cmv.test", { agent });
    takeVerificationToken(sentMails, "verif-refus@cmv.test");

    const refused = await signIn(agent, "verif-refus@cmv.test");

    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await agent.get("/api/auth/get-session")).body).toBeNull();
    // Un nouveau lien est parti, et il fonctionne.
    await verifyAndSignIn(agent, sentMails, "verif-refus@cmv.test", PASSWORD);
    expect((await agent.get("/api/auth/get-session")).body.user.emailVerified).toBe(true);
  });

  // Le mauvais mot de passe ne renvoie rien : sans quoi le renvoi serait ouvert à tous.
  it("ne renvoie aucun lien à qui n'a pas le mot de passe", async () => {
    const agent = request.agent(baseURL);
    await signUpUnverified("verif-intrus@cmv.test", { agent });
    sentMails.length = 0;

    const refused = await signIn(agent, "verif-intrus@cmv.test", "pas-le-bon-mot-de-passe");

    expect(refused.status).toBe(401);
    expect(sentMails).toEqual([]);
  });

  it("refuse un lien falsifié, et laisse l'adresse non vérifiée", async () => {
    const agent = request.agent(baseURL);
    await signUpUnverified("verif-faux@cmv.test", { agent });

    const forged = await agent.get("/api/auth/verify-email?token=pas.un.jeton");

    expect(forged.status).not.toBe(200);
    const user = await app
      .get(PrismaService)
      .user.findUnique({ where: { email: "verif-faux@cmv.test" } });
    expect(user?.emailVerified).toBe(false);
  });
});

/**
 * LE scénario de #270 : l'adresse d'un invité est connue d'un tiers, qui s'inscrit avec avant lui.
 * Sans session, il ne voit ni n'accepte rien — l'invitation d'un Coach comme celle d'une entreprise.
 */
describe("Vérification d'adresse : un compte non vérifié ne touche à aucune invitation (#270)", () => {
  const INVITED = "verif-invite@cmv.test";
  let squatter: Agent;
  let coachInvitation: string;
  let companyInvitation: string;

  beforeAll(async () => {
    const coach = await signUpWith("verif-coach@cmv.test", { isCoach: true, isAthlete: false });
    const company = await signUpWith("verif-entreprise@cmv.test", {
      isCoach: false,
      isAthlete: false,
      isCompany: true,
    });
    coachInvitation = (await coach.post("/invitations").send({ email: INVITED })).body.id;
    companyInvitation = (
      await company
        .post("/organization/invitations")
        .send({ email: INVITED, role: InvitationRole.ATHLETE })
    ).body.id;

    squatter = request.agent(baseURL);
    expect(
      (await signUpUnverified(INVITED, { agent: squatter, password: "mot-de-passe-du-tiers" }))
        .status,
    ).toBe(200);
    expect((await signIn(squatter, INVITED, "mot-de-passe-du-tiers")).status).toBe(403);
  });

  it.each([
    ["GET", "/invitations/for-me"],
    ["GET", "/organization-invitations/for-me"],
  ])("refuse %s %s (401)", async (_, path) => {
    expect((await squatter.get(path)).status).toBe(401);
  });

  it("refuse d'accepter ou de décliner l'une ou l'autre (401)", async () => {
    for (const path of [
      `/invitations/${coachInvitation}/accept`,
      `/invitations/${coachInvitation}/decline`,
      `/organization-invitations/${companyInvitation}/accept`,
      `/organization-invitations/${companyInvitation}/decline`,
    ]) {
      expect((await squatter.post(path)).status, path).toBe(401);
    }
  });

  // Le parcours vérifié reste celui d'avant : c'est le lien reçu par l'adresse qui ouvre la porte.
  it("laisse le propriétaire de l'adresse, une fois vérifié, lire et accepter", async () => {
    await verifyAndSignIn(squatter, sentMails, INVITED, "mot-de-passe-du-tiers");

    const mine = await squatter.get("/invitations/for-me");
    expect(mine.status).toBe(200);
    expect(mine.body.map((invitation: { id: string }) => invitation.id)).toContain(coachInvitation);
    expect((await squatter.post(`/invitations/${coachInvitation}/accept`)).status).toBe(201);
  });
});

/**
 * Une adresse déjà inscrite : la réponse est celle d'une inscription neuve — c'est ce qui empêche
 * de deviner qui a un compte —, et c'est le propriétaire qui l'apprend, par e-mail.
 */
describe("Vérification d'adresse : l'inscription sur une adresse déjà prise (#270)", () => {
  const OWNER = "verif-proprietaire@cmv.test";

  beforeAll(async () => {
    await signUpWith(OWNER, { isCoach: false, isAthlete: true });
  });

  beforeEach(() => {
    sentMails.length = 0;
  });

  it("répond comme à une adresse neuve, sans rien créer ni changer", async () => {
    const created = await signUpUnverified(OWNER, { password: "autre-mot-de-passe" });

    expect(created.status).toBe(200);
    expect(created.body.token).toBeNull();
    await expect(app.get(PrismaService).user.count({ where: { email: OWNER } })).resolves.toBe(1);
    // Le mot de passe du propriétaire tient, celui de la tentative n'ouvre rien.
    expect((await signIn(request.agent(baseURL), OWNER)).status).toBe(200);
    expect((await signIn(request.agent(baseURL), OWNER, "autre-mot-de-passe")).status).toBe(401);
  });

  // Une adresse à elle : l'avis est plafonné par adresse, le test précédent a pris celui d'OWNER.
  it("prévient le propriétaire une fois, et n'envoie aucun lien de vérification", async () => {
    const owner = "verif-proprietaire-avise@cmv.test";
    await signUpWith(owner, { isCoach: false, isAthlete: true });
    sentMails.length = 0;

    await signUpUnverified(owner, { password: "autre-mot-de-passe" });
    await signUpUnverified(owner, { password: "encore-un-autre" });

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]).toMatchObject({ to: owner, subject: fr.existingAccount.subject });
  });

  /**
   * Better Auth cherche l'adresse AVANT de créer le compte : un refus levé à la création ne
   * toucherait que les adresses neuves, et dirait par contraste lesquelles sont prises.
   */
  it("refuse un corps sans type de compte en 400, que l'adresse soit prise ou non", async () => {
    const none = { isCoach: false, isAthlete: false };

    expect(
      (await signUpUnverified("verif-sans-type@cmv.test", { capabilities: none })).status,
    ).toBe(400);
    expect((await signUpUnverified(OWNER, { capabilities: none })).status).toBe(400);
  });
});

/**
 * Un tiers a pris l'adresse, puis son propriétaire s'inscrit à son tour. Le lien de confirmation ne
 * porte que l'adresse : si le mot de passe du tiers survivait, le propriétaire qui ouvre un lien —
 * il en attend un — confirmerait le compte du tiers. Le mot de passe est donc effacé, et le
 * propriétaire choisit le sien.
 */
describe("Vérification d'adresse : une seconde inscription sur un compte jamais confirmé (#270)", () => {
  const SQUATTER_PASSWORD = "mot-de-passe-du-tiers";
  // Une origine de confiance de la suite (`CORS_ORIGINS`) : Better Auth refuse les autres en 403.
  const WEB_PAGE = "http://localhost:5173/verify-email";
  const OWNER_PASSWORD = "mot-de-passe-du-vrai";

  /** Le tiers, puis le propriétaire. Rend le lien parti à l'inscription du tiers. */
  async function contest(address: string): Promise<string> {
    sentMails.length = 0;
    expect((await signUpUnverified(address, { password: SQUATTER_PASSWORD })).status).toBe(200);
    const squatterToken = takeVerificationToken(sentMails, address);
    expect((await signUpUnverified(address, { password: OWNER_PASSWORD })).status).toBe(200);
    return squatterToken;
  }

  it("efface le mot de passe du tiers sans poser celui de la seconde inscription", async () => {
    await contest("verif-conteste@cmv.test");

    // Ni l'un ni l'autre : aucun mot de passe ne reste, et aucun lien ne part sur un échec.
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]).toMatchObject({
      to: "verif-conteste@cmv.test",
      subject: fr.pendingAccount.subject,
    });
    sentMails.length = 0;
    expect(
      (await signIn(request.agent(baseURL), "verif-conteste@cmv.test", SQUATTER_PASSWORD)).status,
    ).toBe(401);
    expect(
      (await signIn(request.agent(baseURL), "verif-conteste@cmv.test", OWNER_PASSWORD)).status,
    ).toBe(401);
    expect(sentMails).toEqual([]);
  });

  /**
   * Le lien parti avant l'effacement ne confirme rien : « adresse confirmée, connecte-toi » mènerait
   * à une 401 sans issue. La page de retour apprend qu'il faut choisir un mot de passe.
   */
  it("renvoie le lien d'avant l'effacement vers le choix d'un mot de passe", async () => {
    const address = "verif-lien-du-tiers@cmv.test";
    const squatterToken = await contest(address);

    const opened = await request(baseURL).get(
      `/api/auth/verify-email?token=${squatterToken}&callbackURL=${encodeURIComponent(WEB_PAGE)}`,
    );

    expect(opened.status).toBe(302);
    expect(opened.headers.location).toBe(`${WEB_PAGE}?error=PASSWORD_REQUIRED`);
    const user = await app.get(PrismaService).user.findUnique({ where: { email: address } });
    expect(user?.emailVerified).toBe(false);
    expect((await signIn(request.agent(baseURL), address, SQUATTER_PASSWORD)).status).toBe(401);
  });

  // Le geste que l'avis propose : « mot de passe oublié », qui confirme l'adresse au passage.
  it("laisse le propriétaire choisir son mot de passe, et se connecter sans autre lien", async () => {
    const address = "verif-reprise@cmv.test";
    await contest(address);
    sentMails.length = 0;

    await request(baseURL)
      .post("/api/auth/request-password-reset")
      .send({ email: address, redirectTo: "http://localhost:5173/reset-password" });
    const mail = required(sentMails[0], "e-mail de réinitialisation");
    const token = required(/reset-password\/([^?"\s]+)/.exec(mail.text)?.[1], "jeton du lien");
    const reset = await request(baseURL)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: OWNER_PASSWORD });
    expect(reset.status).toBe(200);

    expect((await signIn(request.agent(baseURL), address, OWNER_PASSWORD)).status).toBe(200);
    expect((await signIn(request.agent(baseURL), address, SQUATTER_PASSWORD)).status).toBe(401);
  });
});
