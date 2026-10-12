import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@prisma/client";

/**
 * Ce que Prisma journalise. AUCUN module ne le fournit : Nest laisse donc le paramètre vide, et la
 * prod ne journalise aucune requête. Le jeton n'existe que parce que Nest en exige un pour tout
 * paramètre de constructeur. Le harnais e2e, lui, construit le service à la main avec l'événement
 * `query`, pour compter les requêtes de chaque appel (#629).
 */
export const PRISMA_LOG = Symbol("PRISMA_LOG");

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() @Inject(PRISMA_LOG) log: Prisma.LogDefinition[] = []) {
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
