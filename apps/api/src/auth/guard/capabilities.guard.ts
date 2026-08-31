import { type CapabilitySource, capabilitiesOf, hasCapability } from "@cmv/shared";
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { requiredCapabilityOf } from "../decorator/require-capability.decorator";

/**
 * Exige la capacité déclarée par la route (#10), en remplacement du `@Roles` de
 * `@thallesp/nestjs-better-auth` — qui compare `session.user.role` à une liste, donc raisonne sur
 * un rôle exclusif que le modèle de capacités a retiré.
 *
 * Elle ne REMPLACE pas l'AuthGuard de la librairie, elle s'ajoute après : celui-ci est monté en
 * `APP_GUARD` global par `forRootAsync` et fait l'authentification dans le même `canActivate`. Le
 * désinstaller pour récupérer le check de rôle coûterait la session.
 *
 * D'où la dépendance à l'ordre des guards, et la façon dont elle est traitée : `request.user` est
 * posé par l'AuthGuard, donc une exigence de capacité sans utilisateur signifie que cette garde a
 * tourné AVANT lui. C'est un bug de câblage, pas un refus métier — on lève une erreur (500) plutôt
 * qu'un 403, pour que les e2e tombent en bloc au lieu que la garde ouvre en silence. Même principe
 * que `tenantFilterOrThrow` : un scope qu'on ne sait pas calculer casse bruyamment.
 */
@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = requiredCapabilityOf(this.reflector, context);
    // Aucune exigence : route publique, ou ressource au scope identique pour les deux capacités.
    if (required == null) return true;

    const request = context.switchToHttp().getRequest<{ user?: CapabilitySource | null }>();
    const user = request.user;
    if (user == null) {
      throw new Error(
        `[capabilities] utilisateur absent alors que la route exige « ${required} » — ` +
          "CapabilitiesGuard a-t-elle tourné avant l'AuthGuard ?",
      );
    }

    const capabilities = capabilitiesOf(user);
    // `"either"` n'exige pas une capacité précise, seulement d'en avoir une : c'est le scope qui
    // départage ensuite (resolveExercisedCapability, côté interceptor).
    const allowed =
      required === "either"
        ? capabilities.isCoach || capabilities.isAthlete
        : hasCapability(capabilities, required);
    if (!allowed) {
      throw new ForbiddenException();
    }
    return true;
  }
}
