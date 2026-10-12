import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../src/infra/prisma/prisma.service";

/**
 * Le compte des requêtes SQL de la suite (#629) : le harnais remplace le journal de Prisma
 * (`PRISMA_LOG`) par l'événement `query`, et branche ce compte sur le service que Nest construit.
 * Le service reste le vrai — même construction, même adapter, mêmes hooks — seul le journal change.
 *
 * Les ordres de transaction ne comptent pas, points de sauvegarde compris : Prisma rapporte le
 * `COMMIT` mais jamais le `BEGIN` (constaté sur Prisma 7.8), et la façon dont un service regroupe
 * ses écritures n'est pas ce qu'on mesure.
 */
const TRANSACTION_CONTROL = /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * `$on` se type d'après les options STATIQUES du client : celles de `PrismaService` n'annoncent
 * aucun journal, l'événement y vaut donc `never` alors qu'il est bien émis à l'exécution.
 */
type QueryEvents = { $on(event: "query", listener: (event: Prisma.QueryEvent) => void): void };

/** Le journal à fournir sous `PRISMA_LOG` pour que `listenToQueries` reçoive quelque chose. */
export const QUERY_LOG: Prisma.LogDefinition[] = [{ emit: "event", level: "query" }];

let counter: { executed: number } | null = null;

/**
 * Branche le compte sur le client de l'app — une seule fois : un second client compterait chaque
 * requête deux fois.
 */
export function listenToQueries(prisma: PrismaService): void {
  if (counter) throw new Error("Le compte des requêtes écoute déjà un client (#629).");
  const listening = { executed: 0 };
  counter = listening;
  (prisma as unknown as QueryEvents).$on("query", (event) => {
    if (!TRANSACTION_CONTROL.test(event.query)) listening.executed += 1;
  });
}

/**
 * Les requêtes émises pendant `call`. La suite est séquentielle (un worker, une app) : ce qui part
 * entre le début et la fin de l'appel lui appartient, à condition qu'il ait fini son travail en
 * répondant — vrai des lectures mesurées ici, faux d'une route qui notifie après coup.
 */
export async function countQueries(call: () => PromiseLike<unknown>): Promise<number> {
  // Sans client branché, le compte vaudrait 0 sans rien dire.
  if (!counter) throw new Error("Aucun client n'est branché : le harnais appelle listenToQueries.");
  const listening = counter;
  const before = listening.executed;
  await call();
  return listening.executed - before;
}
