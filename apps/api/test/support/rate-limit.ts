import { type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

/**
 * Le stockage des compteurs de débit (#782), remis à neuf avant chaque cas.
 *
 * La suite d'isolation partage ses acteurs entre domaines, et en une minute un même athlète y
 * demande bien plus de 40 URL d'upload : sans remise à zéro, un cas échouerait sur la borne d'un
 * voisin, selon l'ordre des fichiers. Chaque cas garde les VRAIES bornes — c'est ce qui permet au
 * domaine `rate-limit` de les éprouver.
 */
export class ResettableThrottlerStorage implements ThrottlerStorage {
  private inner = new ThrottlerStorageService();

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    return this.inner.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  reset(): void {
    this.inner.onApplicationShutdown();
    this.inner = new ThrottlerStorageService();
  }

  onApplicationShutdown(): void {
    this.inner.onApplicationShutdown();
  }
}
