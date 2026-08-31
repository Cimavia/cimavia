import type { CapabilityName } from "@cmv/shared";
import { type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

export const REQUIRED_CAPABILITY_KEY = "cmv:required-capability";

/**
 * La capacité qu'une route **exerce** — et non le rôle de qui l'appelle.
 *
 * Ce décorateur porte DEUX besoins d'un coup, et c'est tout l'intérêt (#10) :
 *
 * 1. `CapabilitiesGuard` en fait une exigence — sans la capacité, 403.
 * 2. `TenancyInterceptor` en fait le **champ de scope** — une route coach filtre sur `coachId`,
 *    une route athlète sur `athleteId`.
 *
 * Avant #10, le scope se dérivait du rôle de l'acteur, ce qui n'a plus de réponse dès qu'un compte
 * porte les deux capacités : `GET /invoices` ne savait pas s'il fallait montrer les factures
 * émises ou reçues. La route le sait, elle. Une déclaration, deux lecteurs — c'est aussi ce qui
 * garantit qu'exigence et scope ne peuvent pas diverger.
 *
 * Une route SANS ce décorateur n'exige rien et n'exerce rien : c'est le cas voulu des ressources
 * dont le scope est identique pour les deux capacités (`Notification`, `PushToken` — un seul champ
 * destinataire), pas un oubli.
 */
export const RequireCapability = (capability: CapabilityName) =>
  SetMetadata(REQUIRED_CAPABILITY_KEY, capability);

/**
 * La capacité exigée par la route courante, `null` si elle n'en exige aucune. Méthode d'abord,
 * classe ensuite : un contrôleur peut poser la règle commune et une route la remplacer.
 *
 * Partagée entre la garde et l'interceptor à dessein : les deux doivent lire **exactement** la
 * même chose. Recopier ce `getAllAndOverride` des deux côtés laisserait un jour l'un des deux
 * oublier la classe, et le scope s'écarterait de l'exigence sans qu'aucun test ne le voie.
 */
export function requiredCapabilityOf(
  reflector: Reflector,
  context: ExecutionContext,
): CapabilityName | null {
  return (
    reflector.getAllAndOverride<CapabilityName>(REQUIRED_CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? null
  );
}
