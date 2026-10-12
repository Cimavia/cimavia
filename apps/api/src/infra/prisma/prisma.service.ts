import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@prisma/client";

/**
 * Ce que Prisma journalise : rien en prod (`PrismaModule` fournit une liste vide). Le harnais e2e
 * remplace ce seul jeton par l'événement `query`, pour compter les requêtes de chaque appel (#629).
 * Il se déclare à la construction du client, d'où un jeton plutôt qu'un réglage après coup.
 */
export const PRISMA_LOG = Symbol("PRISMA_LOG");

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PRISMA_LOG) log: Prisma.LogDefinition[]) {
    // L'adapter possède le pool (créé depuis la connexion) et l'arrête lui-même sur $disconnect
    // → pas de gestion manuelle du Pool ici (évite un double `pool.end()` au shutdown).
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
