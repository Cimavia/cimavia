import { ProblemType, Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, link, signUp } from "../support/actors";

/**
 * La fiche athlète refuse une écriture fondée sur une version périmée (#440) : deux onglets — ou le
 * web et le mobile — ouverts sur la même fiche s'écrasaient sans que personne ne le voie.
 */
describe("Fiche athlète — version lue (#440)", () => {
  let coach: Agent;
  let otherCoach: Agent;
  let athleteId: string;

  const path = () => `/athletes/${athleteId}/sheet`;
  const put = (agent: Agent, url: string, content: string, expectedUpdatedAt: string | null) =>
    agent.put(url).send({ content, expectedUpdatedAt });
  const current = async () => (await coach.get(path())).body;

  /** Un athlète neuf, sans fiche, suivi par `coach` — pour les cas qui partent de zéro. */
  const freshAthlete = async (email: string) =>
    `/athletes/${await link(coach, await signUp(email, Role.ATHLETE))}/sheet`;

  beforeAll(async () => {
    coach = await signUp("sheet-coach@cmv.test", Role.COACH);
    otherCoach = await signUp("sheet-other-coach@cmv.test", Role.COACH);
    athleteId = await link(coach, await signUp("sheet-athlete@cmv.test", Role.ATHLETE));

    const created = await put(coach, path(), "Objectif 8a", null);
    expect(created.status).toBe(200);
  });

  it("remplace la fiche quand la version lue est la dernière", async () => {
    const before = await current();
    const write = await put(coach, path(), "Objectif 8b", before.updatedAt);

    expect(write.status).toBe(200);
    expect(write.body).toMatchObject({ id: before.id, content: "Objectif 8b" });
    // La version avance : c'est elle que la saisie suivante devra citer.
    expect(write.body.updatedAt).not.toBe(before.updatedAt);
  });

  it("refuse une écriture fondée sur une version périmée, et la base garde la première", async () => {
    const read = await current();
    expect((await put(coach, path(), "Écrit dans l'onglet 1", read.updatedAt)).status).toBe(200);

    const stale = await put(coach, path(), "Écrit dans l'onglet 2", read.updatedAt);

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    expect((await current()).content).toBe("Écrit dans l'onglet 1");
  });

  // Le scénario de #301 : un client qui croit la fiche vierge écrasait des mois de notes.
  it("refuse une création quand la fiche existe déjà", async () => {
    const before = await current();
    const blank = await put(coach, path(), "Deux lignes", null);

    expect(blank.status).toBe(409);
    expect(blank.body.type).toBe(ProblemType.STALE_WRITE);
    expect(await current()).toEqual(before);
  });

  it("refuse une version lue sur une fiche qui n'existe pas", async () => {
    const url = await freshAthlete("sheet-athlete-ghost@cmv.test");
    const write = await put(coach, url, "x", "2026-09-30T08:00:00.000Z");

    expect(write.status).toBe(409);
    expect((await coach.get(url)).body).toBeNull();
  });

  // La comparaison et l'écriture tiennent en une requête : lancées ensemble, une seule passe.
  it("ne laisse passer qu'une écriture sur deux lancées ensemble", async () => {
    const read = await current();
    const [first, second] = await Promise.all([
      put(coach, path(), "Course A", read.updatedAt),
      put(coach, path(), "Course B", read.updatedAt),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = first.status === 200 ? "Course A" : "Course B";
    expect((await current()).content).toBe(winner);
  });

  it("ne laisse naître qu'une fiche sur deux créations lancées ensemble", async () => {
    const url = await freshAthlete("sheet-athlete-race@cmv.test");
    const [first, second] = await Promise.all([
      put(coach, url, "Création A", null),
      put(coach, url, "Création B", null),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  // Requise : un client qui ne dit pas ce qu'il a lu ne retombe pas dans l'écrasement.
  it("refuse une écriture qui ne dit pas quelle version elle a lue", async () => {
    const before = await current();
    const write = await coach.put(path()).send({ content: "Sans version" });

    expect(write.status).toBe(400);
    expect(await current()).toEqual(before);
  });

  // La garde de version vient APRÈS celle du tenant : un 409 dirait à B que la fiche existe.
  it("répond 404 à un autre coach, même muni de la bonne version", async () => {
    const before = await current();
    const intrusion = await put(otherCoach, path(), "intrusion", before.updatedAt);

    expect(intrusion.status).toBe(404);
    expect(await current()).toEqual(before);
  });
});
