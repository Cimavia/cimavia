import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { PrismaModule } from "../infra/prisma/prisma.module";
import { NotificationModule } from "./notification.module";

/**
 * L'arrêt attend les push et e-mails en route AVANT que Prisma se déconnecte (#350) : l'e-mail lit
 * encore la préférence et l'adresse. Rien ne l'impose que l'ordre de Nest — les deux modules sont
 * globaux, ils se détruisent dans l'ordre INVERSE de leur import par `AppModule`. Un réordonnement
 * des imports inverserait l'arrêt sans casser aucun autre test.
 */
describe("AppModule — arrêt des notifications avant Prisma", () => {
  it("importe PrismaModule avant NotificationModule", () => {
    const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
    const prisma = imports.indexOf(PrismaModule);
    expect(prisma).toBeGreaterThanOrEqual(0);
    expect(prisma).toBeLessThan(imports.indexOf(NotificationModule));
  });
});
