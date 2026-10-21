import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { writeAtVersion } from "../util/stale-write.util";

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
 * Une semaine après l'autre, dans l'ordre de leur numéro, et non par un seul `updateMany` : celui-ci
 * verrouille les lignes dans l'ordre où Postgres les lit, qui n'est pas stable. Le décalage du
 * cycle, qui les touche toutes, croiserait alors l'ordre de `lockWeeksInOrder` (#689).
 *
 * Le débrief de l'athlète n'en fait pas partie : il ne touche à rien de ce que le Coach a composé.
 */
export async function touchWeeks(tx: TenantTx, where: Prisma.PlanWeekWhereInput): Promise<void> {
  const weeks = await tx.planWeek.findMany({
    where,
    select: { id: true },
    orderBy: { weekNumber: "asc" },
  });
  for (const week of weeks) {
    await tx.planWeek.update({ where: { id: week.id }, data: { updatedAt: new Date() } });
  }
}

/**
 * Une semaine à verrouiller : son identité, son numéro, qui fixe l'ordre des verrous, et — quand ce
 * que la requête a calculé dessus en dépend — la version à laquelle elle a été lue.
 */
export type WeekLock = { id: string; weekNumber: number; readAt?: Date };

/**
 * Verrouille plusieurs semaines d'un MÊME cycle, toujours dans l'ordre de leur numéro (#689).
 *
 * Déplacer une séance d'une semaine à l'autre en tient deux dans la transaction. Prises dans
 * l'ordre du geste, deux Coachs qui déplacent en sens inverse — S1 → S3 et S3 → S1 — tiendraient
 * chacun la semaine que l'autre attend, et Postgres tuerait l'un d'un 500. Dans l'ordre des
 * numéros, le second attend que le premier ait fini.
 *
 * Chacune avance — un Coach qui l'a ouverte avant reçoit un 409 plutôt qu'écraser —, et doit
 * encore exister : une séance posée sur une semaine retirée entre-temps violerait sa clé étrangère,
 * d'où un 404 plutôt qu'un 500.
 *
 * `readAt` sert la requête qui a calculé HORS transaction sur la semaine — la journée quittée, au
 * glisser : ce calcul ne vaut que si personne ne l'a changée depuis, donc 409 sinon. Sans `readAt`,
 * la requête relit ce qu'il lui faut une fois le verrou pris, et n'a pas à refuser pour un geste
 * voisin qui ne la contredit pas.
 */
export async function lockWeeksInOrder(tx: TenantTx, weeks: readonly WeekLock[]): Promise<void> {
  const unique = new Map(weeks.map((week) => [week.id, week]));
  const ordered = [...unique.values()].sort((left, right) => left.weekNumber - right.weekNumber);

  for (const week of ordered) {
    if (week.readAt != null) {
      await writeAtVersion(tx.planWeek, week.id, week.readAt, {}, WEEK_NOT_FOUND);
      continue;
    }
    const { count } = await tx.planWeek.updateMany({
      where: { id: week.id },
      data: { updatedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException(WEEK_NOT_FOUND);
  }
}
