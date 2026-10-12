import { randomUUID } from "node:crypto";
import { mondayOfIsoWeek, PlanWeekType, required, shiftIsoDate, todayIsoDateIn } from "@cmv/shared";
import type { APIRequest, APIRequestContext, APIResponse, BrowserContext } from "@playwright/test";
import { API_URL } from "./env";

export const PASSWORD = "password123";

/** Un compte inscrit, et la session HTTP qui parle en son nom. */
export type Account = {
  name: string;
  email: string;
  api: APIRequestContext;
};

/**
 * Quatre semaines après le lundi : l'échéance des factures des parcours, toujours à venir. Le
 * lundi lui-même rendrait la facture « en retard » dès le mardi, et un parcours qui la lit
 * changerait de verdict selon le jour où il tourne.
 */
const DUE_IN_DAYS = 28;

/** Un cycle diffusé à un athlète, avec sa seule séance. */
export type PublishedPlan = {
  planId: string;
  title: string;
  sessionId: string;
  sessionTitle: string;
};

/**
 * Le lundi de la semaine, à Paris : le fuseau du navigateur des parcours (`playwright.config.ts`).
 * Calculé dans celui du runner, il désignerait la semaine d'avant le lundi entre minuit et 2 h.
 */
export function mondayOfThisWeek(): string {
  const today = required(todayIsoDateIn("Europe/Paris") ?? undefined, "date du jour à Paris");
  return required(mondayOfIsoWeek(today) ?? undefined, "lundi de la semaine");
}

/**
 * Ancrée sur le `monday` de l'appelant quand il en a déjà un : recalculé après des allers-retours
 * réseau, il pourrait tomber de l'autre côté de minuit et désigner une autre semaine.
 */
export function upcomingDueDate(monday = mondayOfThisWeek()): string {
  return required(shiftIsoDate(monday, DUE_IN_DAYS) ?? undefined, "échéance à venir");
}

/**
 * Une réponse en échec arrête le parcours ICI, avec la route et le corps : sans quoi un `body.id`
 * absent ferait échouer le test trois étapes plus loin, sur un écran vide qui n'explique rien.
 */
async function json<T>(response: APIResponse, what: string): Promise<T> {
  if (!response.ok()) {
    throw new Error(`Jeu de données — ${what} : ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/**
 * Le jeu de données d'un parcours, posé par l'API comme l'app le ferait : inscription, invitation,
 * cycle, facturation, diffusion, débrief. Jamais par Prisma : le passage par les routes garde les
 * données conformes aux règles qu'elles franchissent (tenancy, gating de la diffusion).
 *
 * Chaque appel inscrit des comptes NEUFS, suffixés d'un identifiant aléatoire : la base n'est vidée
 * qu'une fois par suite, et une relance du même test (retry) ne heurte pas ses propres adresses.
 */
export class Seed {
  private readonly apis: APIRequestContext[] = [];
  private readonly run = randomUUID().slice(0, 8);

  constructor(private readonly request: APIRequest) {}

  async account(label: string, capabilities: { isCoach: boolean; isAthlete: boolean }) {
    const api = await this.request.newContext({ baseURL: API_URL });
    this.apis.push(api);
    const name = `${label} ${this.run}`;
    const email = `${label.toLowerCase()}-${this.run}@cmv.test`;
    await json(
      await api.post("/api/auth/sign-up/email", {
        data: { name, email, password: PASSWORD, ...capabilities },
      }),
      `inscription de ${label}`,
    );
    return { name, email, api } satisfies Account;
  }

  coach(label = "Coach"): Promise<Account> {
    return this.account(label, { isCoach: true, isAthlete: false });
  }

  athlete(label = "Athlete"): Promise<Account> {
    return this.account(label, { isCoach: false, isAthlete: true });
  }

  /** Le coach invite l'adresse de l'athlète, qui accepte. Rend l'id de l'athlète. */
  async link(coach: Account, athlete: Account): Promise<string> {
    const invitation = await json<{ id: string }>(
      await coach.api.post("/invitations", { data: { email: athlete.email } }),
      "invitation",
    );
    const [relation] = await json<{ athleteId: string }[]>(
      await athlete.api.post(`/invitations/${invitation.id}/accept`),
      "acceptation de l'invitation",
    );
    return required(relation, "relation créée par l'acceptation").athleteId;
  }

  /** Un cycle d'une semaine et d'une séance, facturé puis diffusé à l'athlète. */
  async publishedPlan(coach: Account, athleteId: string): Promise<PublishedPlan> {
    const monday = mondayOfThisWeek();
    const title = `Cycle ${this.run}`;
    const sessionTitle = `Séance ${this.run}`;

    const plan = await json<{ id: string; weeks: { id: string }[] }>(
      await coach.api.post("/plans", {
        data: { athleteId, title, startDate: monday, weeks: [{ type: PlanWeekType.TRAINING }] },
      }),
      "création du cycle",
    );
    const week = required(plan.weeks[0], "semaine du cycle");
    const session = await json<{ id: string }>(
      await coach.api.post(`/plan-weeks/${week.id}/sessions`, {
        data: { title: sessionTitle, scheduledDate: monday },
      }),
      "création de la séance",
    );
    await json(
      await coach.api.put(`/plans/${plan.id}/billing`, {
        data: { amountCents: 5000, dueDate: upcomingDueDate(monday) },
      }),
      "facturation du cycle",
    );
    await json(await coach.api.post(`/plans/${plan.id}/publish`), "diffusion du cycle");

    return { planId: plan.id, title, sessionId: session.id, sessionTitle };
  }

  /** L'athlète débriefe la séance : c'est ce qui la fait remonter chez son coach. */
  async debrief(athlete: Account, sessionId: string, content: string): Promise<void> {
    await json(
      await athlete.api.put(`/me/scheduled-sessions/${sessionId}/feedback`, { data: { content } }),
      "débrief de la séance",
    );
  }

  /**
   * Connecte le navigateur au nom du compte : la session HTTP du jeu de données lui passe son
   * cookie. Seul le parcours de connexion passe par l'écran.
   */
  async authenticate(context: BrowserContext, account: Account): Promise<void> {
    await context.addCookies((await account.api.storageState()).cookies);
  }

  async dispose(): Promise<void> {
    await Promise.all(this.apis.map((api) => api.dispose()));
  }
}
