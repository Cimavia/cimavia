import { required } from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import { TENANT_SCOPES } from "./tenant-scope";

/** Les modèles qu'on relit sous le filtre d'un autre Coach que l'acteur. */
export type CoachReadModel = "ScheduledSession" | "SessionFeedback";

/**
 * Ceux de `coachIds` qui LISENT cette ligne — séance planifiée ou débrief —, sous le filtre que
 * l'extension leur appliquerait : le même, pas une règle réécrite ici.
 *
 * Pour qui agit au nom d'un AUTRE que soi : l'athlète qui écrit à M doit savoir si M lit la séance
 * qu'il cite (#607), et le débrief de TI se notifie à chaque Coach qui le lit (#610). Rien, dans le
 * scope de l'athlète, ne le dit — il lit tous ses cycles, pas seulement ceux qu'un Coach partage.
 *
 * Par le client de base, qui est passé : le client tenant filtrerait au nom de l'acteur. Sûr parce
 * qu'il ne rend que des ids pris dans `coachIds`, jamais une ligne. Une requête par Coach : ils se
 * comptent sur les doigts d'une main, et le filtre de chacun est différent.
 */
export async function coachesWhoRead(
  prisma: PrismaClient,
  model: CoachReadModel,
  id: string,
  coachIds: readonly string[],
): Promise<string[]> {
  const scope = required(TENANT_SCOPES[model]?.coach, `[tenancy] ${model} sans scope coach`);
  const reads = await Promise.all(
    coachIds.map(async (coachId) => {
      const where = { AND: [{ id }, scope.where(coachId, "read")] };
      const count =
        model === "ScheduledSession"
          ? await prisma.scheduledSession.count({ where })
          : await prisma.sessionFeedback.count({ where });
      return count > 0;
    }),
  );
  return coachIds.filter((_, index) => reads[index]);
}
