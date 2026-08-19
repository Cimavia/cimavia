import { describe, expect, it } from "vitest";
import { isSignedUrlUsable, SIGNED_URL_TTL_SECONDS } from "./signed-url.util";

const NOW = Date.UTC(2026, 7, 19, 12, 0, 0);
const secondsAgo = (seconds: number) => NOW - seconds * 1000;

describe("isSignedUrlUsable", () => {
  it("accepte une URL fraîchement reçue", () => {
    expect(isSignedUrlUsable(NOW, NOW)).toBe(true);
    expect(isSignedUrlUsable(secondsAgo(10), NOW)).toBe(true);
  });

  /**
   * La marge est le cœur de la fonction : à 280 s l'URL n'est PAS encore expirée au sens du TTL,
   * mais elle le sera avant que l'ouverture n'atteigne le storage. On re-signe.
   */
  it("refuse dans la marge de sécurité, avant l'échéance réelle", () => {
    expect(isSignedUrlUsable(secondsAgo(SIGNED_URL_TTL_SECONDS - 60), NOW)).toBe(true);
    expect(isSignedUrlUsable(secondsAgo(SIGNED_URL_TTL_SECONDS - 10), NOW)).toBe(false);
  });

  it("refuse une URL expirée", () => {
    expect(isSignedUrlUsable(secondsAgo(SIGNED_URL_TTL_SECONDS + 1), NOW)).toBe(false);
  });

  /**
   * Le cache mobile est persisté sept jours : au démarrage à froid, l'écran se rend avec des URLs
   * signées des jours plus tôt. C'est le cas qui a motivé la fonction.
   */
  it("refuse une URL sortie d'un cache persisté", () => {
    expect(isSignedUrlUsable(secondsAgo(7 * 24 * 3600), NOW)).toBe(false);
  });

  // `dataUpdatedAt` vaut 0 tant qu'une requête n'a jamais abouti : on re-signe, on ne devine pas.
  it("refuse une date d'arrivée absente", () => {
    expect(isSignedUrlUsable(0, NOW)).toBe(false);
  });
});
