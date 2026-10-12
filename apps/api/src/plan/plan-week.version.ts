import type { Prisma } from "@prisma/client";
import type { TenantTx } from "../tenancy/tenancy.extension";

export const WEEK_NOT_FOUND = "Semaine introuvable";

/**
 * Fait avancer la version des semaines visées (#604). Les gestes sur une semaine — type, collage,
 * ordre d'une journée, retrait — citent la version de la semaine AFFICHÉE : toute écriture qui
 * change ce que la grille montre doit donc la faire avancer, même quand la ligne `PlanWeek`
 * elle-même ne bouge pas (une séance posée, retouchée, retirée, décalée avec le cycle).
 *
 * En TÊTE de transaction, avant toute séance : c'est l'ordre des gestes, qui écrivent la semaine
 * sous sa version puis ses séances. Dans l'ordre inverse, une retouche de séance et un glisser
 * concurrents se tiendraient chacun le verrou que l'autre attend, et Postgres en tuerait un d'un
 * 500. Le verrou sérialise aussi deux créations sur la même semaine : la seconde calcule son rang
 * après la première, et ne la heurte plus.
 *
 * Le débrief de l'athlète n'en fait pas partie : il ne touche à rien de ce que le Coach a composé.
 */
export async function touchWeeks(tx: TenantTx, where: Prisma.PlanWeekWhereInput): Promise<void> {
  await tx.planWeek.updateMany({ where, data: { updatedAt: new Date() } });
}
