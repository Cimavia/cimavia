import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../src/infra/prisma/prisma.service";

/**
 * Le compte des requêtes SQL de la suite (#629) : un `PrismaService` construit avec l'événement
 * `query`, que le harnais substitue au service de l'app. Le service reste le vrai — même adapter,
 * mêmes hooks — seul le journal change.
 *
 * Les ordres de transaction ne comptent pas, points de sauvegarde compris : Prisma rapporte le `COMMIT` mais jamais le `BEGIN`
 * (constaté sur Prisma 7.8), et la façon dont un service regroupe ses écritures n'est pas ce qu'on
 * mesure.
 */
const TRANSACTION_CONTROL = /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * `$on` se type d'après les options STATIQUES du client : celles de `PrismaService` n'annoncent
 * aucun journal, l'événement y vaut donc `never` alors qu'il est bien émis à l'exécution.
 */
type QueryEvents = { $on(event: "query", listener: (event: Prisma.QueryEvent) => void): void };

let executed = 0;

export function queryCountingPrisma(): PrismaService {
  const prisma = new PrismaService([{ emit: "event", level: "query" }]);
  (prisma as unknown as QueryEvents).$on("query", (event) => {
    if (!TRANSACTION_CONTROL.test(event.query)) executed += 1;
  });
  return prisma;
}

/**
 * Les requêtes émises pendant `call`. La suite est séquentielle (un worker, une app) : ce qui part
 * entre le début et la fin de l'appel lui appartient, à condition qu'il ait fini son travail en
 * répondant — vrai des lectures mesurées ici, faux d'une route qui notifie après coup.
 */
export async function countQueries(call: () => PromiseLike<unknown>): Promise<number> {
  const before = executed;
  await call();
  return executed - before;
}
