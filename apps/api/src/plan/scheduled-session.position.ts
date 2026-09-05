import type { TenantTx } from "../tenancy/tenancy.extension";

/** Ce qu'il faut d'une séance pour la ranger : son identité, son rang et le jour où elle est. */
export type PositionedSession = { id: string; position: number; scheduledDate: Date };

/**
 * Écrit une journée ENTIÈRE : ses séances, dans l'ordre donné, rangées sur `0..n-1` et posées à la
 * date voulue.
 *
 * `position` = rang dans la JOURNÉE, et `@@unique([planWeekId, scheduledDate, position])` le tient.
 * Cette contrainte mord PENDANT l'écriture, pas seulement à la fin : Prisma émet une instruction
 * par ligne, et un état intermédiaire qui la viole fait échouer toute la transaction. Échanger
 * deux séances par deux `UPDATE` successifs est donc impossible en l'état — la première écriture
 * atterrit sur la position que la seconde n'a pas encore libérée.
 *
 * D'où les DEUX passes : on gare d'abord tout le monde au-dessus du rang le plus haut occupé, où
 * plus aucune collision n'est possible, puis on écrit les rangs définitifs sur une journée vide de
 * toute position basse.
 *
 * `parking` se calcule sur les séances DÉJÀ à cette date, et non sur toutes celles qu'on écrit :
 * une séance venue d'un autre jour (#93) y arrive avec un rang qui n'a aucun sens ici — le sien
 * chez elle — et le prendre en compte ne ferait que garer plus haut que nécessaire. Ce qui compte
 * est de dépasser ce que la date d'arrivée occupe.
 *
 * Le décalage se DÉDUIT de ce maximum au lieu d'être une constante : une journée qui porte déjà
 * des trous (cas d'avant #148) peut occuper un rang supérieur à son propre effectif, et un
 * `+ effectif` fixe retomberait dessus.
 *
 * `scheduledDate` est réécrite sur TOUTE la liste, y compris les séances qui n'ont pas bougé de
 * jour : distinguer coûterait une branche pour économiser une écriture sans effet.
 */
export async function writeDay(
  tx: TenantTx,
  ordered: readonly PositionedSession[],
  date: Date,
): Promise<void> {
  if (ordered.length === 0) return;

  const staying = ordered.filter((session) => session.scheduledDate.getTime() === date.getTime());
  const parking =
    staying.length === 0 ? 0 : Math.max(...staying.map((session) => session.position)) + 1;

  for (const [index, session] of ordered.entries()) {
    await tx.scheduledSession.update({
      where: { id: session.id },
      data: { scheduledDate: date, position: parking + index },
    });
  }
  for (const [index, session] of ordered.entries()) {
    await tx.scheduledSession.update({ where: { id: session.id }, data: { position: index } });
  }
}

/**
 * Recolle les rangs d'une journée sur `0..n-1`, sans changer l'ordre.
 *
 * À appeler dès qu'une séance QUITTE une journée — supprimée, ou déplacée vers un autre jour.
 * Sans ça la journée garde un trou, et comme le rang suivant se calcule en COMPTANT les séances
 * du jour (`nextPosition`), la prochaine séance ajoutée atterrit sur un rang déjà pris : la
 * contrainte d'unicité la refuse, et le coach reçoit un 500 pour un geste banal.
 */
export async function compactDay(tx: TenantTx, planWeekId: string, date: Date): Promise<void> {
  const sessions = await tx.scheduledSession.findMany({
    where: { planWeekId, scheduledDate: date },
    select: { id: true, position: true, scheduledDate: true },
    orderBy: { position: "asc" },
  });

  // Déjà contigus : ne rien écrire évite deux `UPDATE` par séance sur chaque suppression.
  if (sessions.every((session, index) => session.position === index)) return;

  await writeDay(tx, sessions, date);
}
