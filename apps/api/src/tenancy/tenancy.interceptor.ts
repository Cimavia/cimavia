import { type CapabilitySource, capabilitiesOf } from "@cmv/shared";
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import type { Observable } from "rxjs";
import {
  AS_CAPABILITY_QUERY,
  requiredCapabilityOf,
  resolveExercisedCapability,
} from "../auth/decorator/require-capability.decorator";
import { TENANT_CLS_KEY, type TenantContext } from "./tenant-context.type";

type RequestUser = CapabilitySource & { id?: string };

/**
 * Peuple le CLS avec l'acteur courant, résolu par l'AuthGuard Better Auth. Les guards s'exécutant
 * AVANT les interceptors, `request.user` est déjà posé sur les routes protégées ; les routes
 * publiques (health, /api/auth/*) n'ont pas de user → pas de tenant.
 *
 * La capacité **exercée** vient du même `@RequireCapability` que lit `CapabilitiesGuard`, via le
 * helper partagé : exigence et scope proviennent donc littéralement de la même déclaration, et ne
 * peuvent pas diverger. C'est ce qui remplace la dérivation depuis le rôle de l'acteur, qui n'avait
 * plus de réponse dès qu'un compte porte les deux capacités (#10).
 */
@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser; query?: Record<string, unknown> }>();
    const user = request.user;

    if (user?.id != null) {
      const capabilities = capabilitiesOf(user);
      const required = requiredCapabilityOf(this.reflector, context);
      const tenant: TenantContext = {
        userId: user.id,
        capabilities,
        exercised:
          required == null
            ? null
            : resolveExercisedCapability(
                required,
                capabilities,
                request.query?.[AS_CAPABILITY_QUERY],
              ),
      };
      this.cls.set(TENANT_CLS_KEY, tenant);
    }

    return next.handle();
  }
}
