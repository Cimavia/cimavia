import { createHash, timingSafeEqual } from "node:crypto";
import type { EnvSchema } from "@cmv/shared";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * En-tête portant le secret partagé. Nommé plutôt qu'un `Authorization: Bearer` : ce n'est pas une
 * session, il n'y a pas d'acteur derrière — et le confondre avec une authentification inviterait à
 * l'y brancher un jour.
 */
export const REMINDER_TICK_HEADER = "x-cimavia-tick-secret";

/**
 * Compare en temps CONSTANT, après hachage. Le hachage n'est pas là pour protéger le secret mais
 * pour ramener les deux entrées à la même longueur : `timingSafeEqual` lève sur des tampons de
 * tailles différentes, et faire précéder l'appel d'un `length ===` divulguerait la longueur du
 * secret par le temps de réponse.
 */
function matchesSecret(provided: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/**
 * Garde du déclencheur de rappels (#47). La route est publique au sens de Better Auth
 * (`@AllowAnonymous`) parce qu'aucun utilisateur ne l'appelle : c'est un cron externe — GitHub
 * Actions ou Cloudflare Worker — décision d'hébergement tranchée le 2026-08-12.
 *
 * Deux refus, distincts à dessein :
 *
 * - **503 quand `REMINDER_TICK_SECRET` est absent.** L'API ne peut pas servir cette route, ce n'est
 *   pas l'appelant qui a tort. Répondre 401 dans ce cas enverrait chercher un mauvais secret là où
 *   il n'y en a aucun — et c'est exactement le scénario du premier déploiement. Le refus reste
 *   FERMÉ : pas de secret configuré ne veut jamais dire pas de contrôle.
 * - **401 quand l'en-tête manque ou ne correspond pas.** Aucune distinction entre les deux : dire
 *   « en-tête absent » à qui n'a pas le secret lui apprendrait le nom du champ à forger.
 */
@Injectable()
export class ReminderTickGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvSchema, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get("REMINDER_TICK_SECRET", { infer: true });
    if (expected == null || expected === "") {
      throw new ServiceUnavailableException("Déclencheur de rappels non configuré");
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const provided = request.headers[REMINDER_TICK_HEADER];

    if (typeof provided !== "string" || !matchesSecret(provided, expected)) {
      throw new UnauthorizedException("Déclenchement refusé");
    }
    return true;
  }
}
