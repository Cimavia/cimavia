import type request from "supertest";
import type { Agent } from "./actors";
import { ANY_VERSION } from "./version";

/** Le cycle d'un autre, tel qu'un intrus le vise : ses identifiants, et la clé de son justificatif. */
export type PlanTarget = {
  planId: string;
  weekId: string;
  sessionId: string;
  monday: string;
  /** Absente quand le cycle n'a pas de justificatif : le 404 tombe avant qu'on lise la clé. */
  storagePath?: string;
};

/**
 * Tente, au nom de `intruder`, TOUTES les écritures du Coach sur l'arbre d'un cycle — le cycle, ses
 * semaines, ses séances, sa facturation — et rend le statut de chacune, par route (#325).
 *
 * Chaque service relit la ligne par une garde scopée, et c'est elle qui répond 404 : ces tentatives
 * gardent contre le refactor qui la chargerait autrement — client de base, `include`, `OR` entre
 * deux capacités. Les corps sont VALIDES, sinon un 400 de validation masquerait le scope qu'on
 * éprouve ; les suppressions passent en dernier, pour que chaque écriture vise une ligne présente.
 */
export async function attemptPlanWrites(
  intruder: Agent,
  target: PlanTarget,
): Promise<Record<string, number>> {
  const { planId, weekId, sessionId, monday } = target;
  const pdf = { fileName: "detourne.pdf", mimeType: "application/pdf", size: 2_000 };
  const attempts: [string, () => request.Test][] = [
    [
      "PATCH /plans/:id",
      () =>
        intruder
          .patch(`/plans/${planId}`)
          .send({ title: "Détourné", expectedUpdatedAt: ANY_VERSION }),
    ],
    [
      "POST /plans/:id/weeks",
      () => intruder.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" }),
    ],
    ["POST /plans/:id/publish", () => intruder.post(`/plans/${planId}/publish`)],
    [
      "PATCH /plan-weeks/:id",
      () =>
        intruder
          .patch(`/plan-weeks/${weekId}`)
          .send({ note: "détournée", expectedUpdatedAt: ANY_VERSION }),
    ],
    [
      "POST /plan-weeks/:id/copy-from",
      () =>
        intruder
          .post(`/plan-weeks/${weekId}/copy-from`)
          .send({ sourcePlanWeekId: weekId, expectedUpdatedAt: ANY_VERSION }),
    ],
    [
      "POST /plan-weeks/:id/sessions",
      () =>
        intruder
          .post(`/plan-weeks/${weekId}/sessions`)
          .send({ title: "Intrusion", scheduledDate: monday }),
    ],
    [
      "PUT /plan-weeks/:id/days/:date/order",
      () =>
        intruder
          .put(`/plan-weeks/${weekId}/days/${monday}/order`)
          .send({ sessionIds: [sessionId], expectedUpdatedAt: ANY_VERSION }),
    ],
    [
      "PUT /scheduled-sessions/:id",
      () =>
        intruder.put(`/scheduled-sessions/${sessionId}`).send({
          title: "Détournée",
          scheduledDate: monday,
          exercises: [],
          expectedUpdatedAt: ANY_VERSION,
        }),
    ],
    [
      "PUT /plans/:id/billing",
      () => intruder.put(`/plans/${planId}/billing`).send({ amountCents: 1, dueDate: monday }),
    ],
    [
      "POST /plans/:id/billing/document/upload-url",
      () => intruder.post(`/plans/${planId}/billing/document/upload-url`).send(pdf),
    ],
    [
      "PUT /plans/:id/billing/document",
      () =>
        intruder
          .put(`/plans/${planId}/billing/document`)
          .send({ storagePath: target.storagePath ?? "intrusion.pdf", ...pdf }),
    ],
    [
      "DELETE /plans/:id/billing/document",
      () => intruder.delete(`/plans/${planId}/billing/document`),
    ],
    [
      "DELETE /scheduled-sessions/:id",
      () =>
        intruder
          .delete(`/scheduled-sessions/${sessionId}`)
          .query({ expectedUpdatedAt: ANY_VERSION }),
    ],
    [
      "DELETE /plan-weeks/:id",
      () => intruder.delete(`/plan-weeks/${weekId}`).query({ expectedUpdatedAt: ANY_VERSION }),
    ],
    ["DELETE /plans/:id", () => intruder.delete(`/plans/${planId}`)],
  ];

  const statuses: Record<string, number> = {};
  for (const [route, attempt] of attempts) {
    statuses[route] = (await attempt()).status;
  }
  return statuses;
}

/** Ce qu'`attemptPlanWrites` doit rendre : 404 sur chaque route — l'échec nomme celle qui a cédé. */
export function notFoundEverywhere(statuses: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.keys(statuses).map((route) => [route, 404]));
}

/**
 * Un corps d'API sans ce qui change d'une lecture à l'autre — la signature d'une URL de fichier, qui
 * porte l'heure —, pour comparer deux lectures de la même donnée sans dépendre de la seconde.
 */
export function withoutSignatures(body: unknown): unknown {
  return JSON.parse(
    JSON.stringify(body, (_key, value) =>
      typeof value === "string" && value.includes("X-Amz-Signature") ? value.split("?")[0] : value,
    ),
  );
}
