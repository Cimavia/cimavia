import {
  firstMovableWeek,
  PlanShiftRefusal,
  publishedShiftRefusal,
  ScheduledSessionStatus,
  type ShiftableWeek,
} from "@cmv/shared";
import { ConflictException } from "@nestjs/common";
import type { TenantPrisma, TenantTx } from "../tenancy/tenancy.extension";

// Les gardes du décalage d'un cycle (#231) : reporter son début, insérer une semaine devant la
// suite. La règle vit dans `@cmv/shared`, que le web lit aussi pour fermer le geste avant le clic ;
// ici, elle se juge sur ce que la base dit À L'INSTANT.
//
// Chaque garde se joue DEUX fois. Avant la transaction, pour refuser sans rien écrire. Puis dans
// la transaction, après le décalage : les séances qui glissent sont alors verrouillées par nos
// écritures, et un débrief qui les passe à `DONE` écrit la même ligne. Arrivé avant, il est vu ici,
// et le décalage s'annule d'un 409. Arrivé après, il attend notre commit, et se pose sur une séance
// déjà décalée — que la notification vient d'annoncer à l'athlète.

const REFUSAL_MESSAGE = {
  [PlanShiftRefusal.EARLIER]:
    "Un cycle diffusé ne s'avance pas : il se reporte seulement, vers une date plus tardive",
  [PlanShiftRefusal.SETTLED]:
    "Une séance de ce cycle est déjà faite ou passée : il ne se reporte plus en entier",
} as const satisfies Record<PlanShiftRefusal, string>;

const SETTLED_WEEK_MESSAGE =
  "Une séance est déjà faite ou passée à partir de cette semaine : la suite ne glisse plus";

/**
 * Les séances que l'athlète a touchées, une entrée chacune avec le rang de sa semaine : tout ce
 * que `firstMovableWeek` lit. Les séances prévues n'en font pas partie — elles ne retiennent rien.
 */
async function settledWeeks(db: TenantPrisma | TenantTx, planId: string): Promise<ShiftableWeek[]> {
  const settled = await db.scheduledSession.findMany({
    where: { planId, status: { not: ScheduledSessionStatus.PLANNED } },
    select: { status: true, planWeek: { select: { weekNumber: true } } },
  });
  return settled.map(({ status, planWeek }) => ({
    weekNumber: planWeek.weekNumber,
    sessions: [{ status }],
  }));
}

/** Le début d'un cycle DIFFUSÉ se déplace de `shiftDays` jours, ou 409 qui dit pourquoi. */
export async function assertStartMovable(
  db: TenantPrisma | TenantTx,
  planId: string,
  shiftDays: number,
): Promise<void> {
  // Le sens se juge sans la base : inutile de lire les séances pour refuser un report en arrière.
  const weeks = shiftDays < 0 ? [] : await settledWeeks(db, planId);
  const refusal = publishedShiftRefusal(shiftDays, weeks);
  if (refusal != null) throw new ConflictException(REFUSAL_MESSAGE[refusal]);
}

/** Les semaines à partir de `weekNumber` glissent, ou 409 : l'une d'elles porte une séance touchée. */
export async function assertWeeksMovable(
  db: TenantPrisma | TenantTx,
  planId: string,
  weekNumber: number,
): Promise<void> {
  if (weekNumber < firstMovableWeek(await settledWeeks(db, planId))) {
    throw new ConflictException(SETTLED_WEEK_MESSAGE);
  }
}
