import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../infra/prisma/prisma.service";
import { createTenantPrisma } from "./tenancy.extension";
import { TenancyInterceptor } from "./tenancy.interceptor";

// Jeton d'injection du client Prisma scopé au tenant (à distinguer du PrismaService de base,
// non scopé, réservé à Better Auth et aux flux d'onboarding cross-tenant).
export const TENANT_PRISMA = Symbol("TENANT_PRISMA");

@Global()
@Module({
  providers: [
    {
      provide: TENANT_PRISMA,
      inject: [PrismaService, ClsService],
      useFactory: (prisma: PrismaService, cls: ClsService) => createTenantPrisma(prisma, cls),
    },
    // Peuple le CLS avec l'acteur courant pour chaque requête (après l'AuthGuard).
    { provide: APP_INTERCEPTOR, useClass: TenancyInterceptor },
  ],
  exports: [TENANT_PRISMA],
})
export class TenancyModule {}
