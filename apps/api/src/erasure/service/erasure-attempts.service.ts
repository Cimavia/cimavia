import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

export const ERASURE_MAX_FAILURES = 5;
export const ERASURE_FAILURE_WINDOW_MS = 15 * 60_000;

type Attempts = { count: number; resetAt: number };

/**
 * Plafonne les mots de passe faux sur la suppression d'un compte (#256), par compte : une session
 * dérobée ne doit pas servir à essayer des mots de passe sans fin.
 *
 * Better Auth limite ses propres routes, pas les nôtres. En mémoire : une seule instance tourne, et
 * un redémarrage qui remet le compteur à zéro ne coûte qu'une poignée d'essais.
 */
@Injectable()
export class ErasureAttemptsService {
  private readonly failures = new Map<string, Attempts>();

  /**
   * Compte l'essai AVANT la vérification du mot de passe, qui prend du temps : compté après, cent
   * requêtes simultanées passeraient toutes sous le plafond.
   */
  consume(userId: string, now = Date.now()): void {
    const current = this.failures.get(userId);
    if (current == null || current.resetAt <= now) {
      this.failures.set(userId, { count: 1, resetAt: now + ERASURE_FAILURE_WINDOW_MS });
      return;
    }
    if (current.count >= ERASURE_MAX_FAILURES) {
      throw new HttpException("Trop d'essais : réessaie plus tard", HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
  }

  clear(userId: string): void {
    this.failures.delete(userId);
  }
}
