import { ScheduledSessionStatus } from "../dto/plan.schema";
import type { TypesValuesOf } from "../type/generics.type";

// Décaler un cycle DIFFUSÉ (#231) : le reporter en entier, ou insérer une semaine qui fait glisser
// la suite. Une seule règle commande les deux gestes, et l'API comme le web la lisent ici — l'une
// pour refuser, l'autre pour fermer et expliquer avant le clic.

/** Ce que la règle lit d'une semaine : son rang, et le statut de ses séances. */
export type ShiftableWeek = {
  weekNumber: number;
  sessions: readonly { status: string }[];
};

/**
 * Le plus petit numéro de semaine à partir duquel RIEN n'a été touché par l'athlète : tout ce qui
 * commence là peut glisser. 1 = le cycle entier ; au-delà de la dernière semaine = rien.
 *
 * « Touché » = une séance faite (le débrief la passe à `DONE`) ou passée (`SKIPPED`). Elle ne bouge
 * plus, pour la raison qui fige déjà une séance faite (`ScheduledSessionService`) : décaler un
 * débrief du 12 au 19 ferait dire au planning qu'une séance a été faite avant d'avoir eu lieu. Une
 * séance PRÉVUE dans le passé, elle, glisse avec le reste — c'est tout l'objet du report d'un
 * athlète blessé : ce qu'il a manqué revient devant lui.
 *
 * Les semaines peuvent arriver dans n'importe quel ordre, et une même semaine plusieurs fois :
 * l'API ne transmet que les séances touchées, une entrée chacune.
 */
export function firstMovableWeek(weeks: readonly ShiftableWeek[]): number {
  let lastSettled = 0;
  for (const week of weeks) {
    if (week.weekNumber > lastSettled && week.sessions.some(isSettledSession)) {
      lastSettled = week.weekNumber;
    }
  }
  return lastSettled + 1;
}

function isSettledSession(session: { status: string }): boolean {
  return session.status !== ScheduledSessionStatus.PLANNED;
}

/** Pourquoi le début d'un cycle DIFFUSÉ ne se déplace pas comme demandé. */
export const PlanShiftRefusal = {
  /**
   * Vers une date plus tôt : l'athlète s'est organisé sur les dates diffusées, et un cycle avancé
   * les lui reprend — en cours, il ferait même tomber des séances dans le passé, « manquées » sans
   * l'avoir été. La règle ne distingue pas un cycle à venir d'un cycle commencé : seul le report
   * est ouvert (#231).
   */
  EARLIER: "EARLIER",
  /** Une séance est déjà faite ou passée : le cycle ne se reporte plus en entier. */
  SETTLED: "SETTLED",
} as const;
export type PlanShiftRefusal = TypesValuesOf<typeof PlanShiftRefusal>;

/**
 * Ce qui empêche de déplacer de `shiftDays` jours le début d'un cycle DIFFUSÉ, ou `null` s'il le
 * peut. Un décalage nul ne déplace rien, et passe. Le brouillon n'est pas concerné : rien n'y est
 * débriefé, et il se déplace dans les deux sens (#207).
 *
 * Le sens d'abord : un report vers l'arrière est refusé quel que soit l'état du cycle, et le dire
 * en premier évite d'expliquer une séance faite à qui demandait l'impossible pour une autre raison.
 */
export function publishedShiftRefusal(
  shiftDays: number,
  weeks: readonly ShiftableWeek[],
): PlanShiftRefusal | null {
  if (shiftDays < 0) return PlanShiftRefusal.EARLIER;
  if (shiftDays > 0 && firstMovableWeek(weeks) > 1) return PlanShiftRefusal.SETTLED;
  return null;
}
