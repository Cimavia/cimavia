import type { EnvSchema } from "@cmv/shared";
import type { ExecutionContext } from "@nestjs/common";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { REMINDER_TICK_HEADER, ReminderTickGuard } from "./reminder-tick.guard";

const SECRET = "0123456789abcdef0123456789abcdef";

// Le strict nécessaire de ce que la garde lit : un en-tête HTTP. Écrit à la main plutôt que monté
// par Nest — la garde ne dépend d'aucun conteneur, la tester à travers un en fabriquerait un.
function contextWith(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guardWith(secret: string | undefined): ReminderTickGuard {
  const config = { get: () => secret } as unknown as ConfigService<EnvSchema, true>;
  return new ReminderTickGuard(config);
}

describe("ReminderTickGuard", () => {
  it("laisse passer le bon secret", () => {
    const guard = guardWith(SECRET);
    expect(guard.canActivate(contextWith({ [REMINDER_TICK_HEADER]: SECRET }))).toBe(true);
  });

  /**
   * LE test de cette garde, et la raison pour laquelle elle existe plutôt qu'un `if` dans le
   * contrôleur : une variable d'environnement absente ne doit **jamais** valoir « pas de contrôle ».
   * C'est le cas du premier déploiement, celui où la faute passerait le plus facilement inaperçue.
   *
   * 503 et non 401 : ce n'est pas l'appelant qui a tort, c'est l'API qui n'est pas configurée.
   * Répondre 401 enverrait chercher un mauvais secret là où il n'y en a aucun.
   */
  it("ferme la route quand le secret n'est pas configuré (503, jamais ouvert)", () => {
    for (const missing of [undefined, ""]) {
      const guard = guardWith(missing);
      expect(() => guard.canActivate(contextWith({ [REMINDER_TICK_HEADER]: SECRET }))).toThrow(
        ServiceUnavailableException,
      );
      // Et surtout : même sans en-tête, on ne passe pas.
      expect(() => guard.canActivate(contextWith({}))).toThrow(ServiceUnavailableException);
    }
  });

  // Aucune distinction entre « absent » et « faux » : dire « en-tête manquant » à qui n'a pas le
  // secret lui apprendrait le nom du champ à forger.
  it("refuse un en-tête absent, vide, faux ou d'un autre type (401)", () => {
    const guard = guardWith(SECRET);
    const refused = [
      {},
      { [REMINDER_TICK_HEADER]: "" },
      { [REMINDER_TICK_HEADER]: "mauvais-secret" },
      // Un en-tête répété arrive en TABLEAU chez Fastify : le `typeof === "string"` l'écarte au
      // lieu de le laisser filer vers une comparaison qui lèverait.
      { [REMINDER_TICK_HEADER]: [SECRET] },
      { authorization: `Bearer ${SECRET}` },
    ];

    for (const headers of refused) {
      expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
    }
  });

  /**
   * Un préfixe correct ne suffit pas. Le hachage préalable de `matchesSecret` ramène les deux
   * entrées à 32 octets — sans lui, `timingSafeEqual` lèverait sur des longueurs différentes, et le
   * contourner par un `length ===` divulguerait la longueur du secret par le temps de réponse.
   */
  it("refuse un secret de longueur différente sans lever", () => {
    const guard = guardWith(SECRET);
    expect(() =>
      guard.canActivate(contextWith({ [REMINDER_TICK_HEADER]: SECRET.slice(0, 8) })),
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contextWith({ [REMINDER_TICK_HEADER]: `${SECRET}x` }))).toThrow(
      UnauthorizedException,
    );
  });
});
