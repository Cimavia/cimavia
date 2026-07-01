import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Observable } from "rxjs";
import { TENANT_CLS_KEY, type TenantContext } from "./tenant-context.type";

/**
 * Peuple le CLS avec l'acteur courant (userId + role) résolu par l'AuthGuard Better Auth.
 * Les guards s'exécutant AVANT les interceptors, `request.user` est déjà posé sur les routes
 * protégées ; les routes publiques (health, /api/auth/*) n'ont pas de user → pas de tenant.
 * Le Prisma Client Extension lira ce contexte à l'exécution de chaque requête métier.
 */
@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: { id?: string; role?: string } }>();
    const user = request.user;

    if (user?.id != null && user.role != null) {
      const tenant: TenantContext = { userId: user.id, role: user.role as TenantContext["role"] };
      this.cls.set(TENANT_CLS_KEY, tenant);
    }

    return next.handle();
  }
}
