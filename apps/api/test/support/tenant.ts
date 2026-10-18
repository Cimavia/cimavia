import { ClsService } from "nestjs-cls";
import type { TenantPrisma } from "../../src/tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../src/tenancy/tenancy.module";
import { TENANT_CLS_KEY, type TenantContext } from "../../src/tenancy/tenant-context.type";
import { app } from "./app";

/**
 * Le client tenant sous un Coach posé à la main : ce que l'extension ouvre et ferme, sans passer
 * par un service qui vérifierait avant elle.
 */
export function asCoach<T>(userId: string, fn: (db: TenantPrisma) => Promise<T>): Promise<T> {
  const cls = app.get(ClsService);
  const actor: TenantContext = {
    userId,
    capabilities: { isCoach: true, isAthlete: false, isCompany: false },
    exercised: "coach",
  };
  return cls.run(async () => {
    cls.set(TENANT_CLS_KEY, actor);
    return await fn(app.get<TenantPrisma>(TENANT_PRISMA));
  });
}
