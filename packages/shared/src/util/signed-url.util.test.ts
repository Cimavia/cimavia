import { describe, expect, it } from "vitest";
import { isSignedUrlUsable, keepSignedUrl, SIGNED_URL_TTL_SECONDS } from "./signed-url.util";

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

describe("keepSignedUrl", () => {
  const incoming = { url: "https://s3/b?X-Amz-Date=neuve", receivedAtMs: NOW };
  const receivedSecondsAgo = (seconds: number) => ({
    url: "https://s3/b?X-Amz-Date=ancienne",
    receivedAtMs: secondsAgo(seconds),
  });

  it("prend l'URL qui arrive quand aucune n'est gardée", () => {
    expect(keepSignedUrl(null, incoming, NOW)).toBe(incoming);
  });

  // Le cas du bug : le fil sonde toutes les 10 s, chaque réponse porte une URL neuve.
  it("garde l'URL précédente tant qu'elle est ouvrable", () => {
    const previous = receivedSecondsAgo(10);
    expect(keepSignedUrl(previous, incoming, NOW)).toBe(previous);
  });

  /**
   * Les bornes sont celles d'`isSignedUrlUsable`, marge comprise : juste avant elle on garde,
   * dedans on remplace — l'URL mourrait avant que le lecteur ait fini de s'en servir.
   */
  it("remplace l'URL gardée dès qu'elle entre dans la marge de sécurité", () => {
    const before = receivedSecondsAgo(SIGNED_URL_TTL_SECONDS - 31);
    const within = receivedSecondsAgo(SIGNED_URL_TTL_SECONDS - 30);
    expect(keepSignedUrl(before, incoming, NOW)).toBe(before);
    expect(keepSignedUrl(within, incoming, NOW)).toBe(incoming);
  });

  // Le reçu gardé conserve SA date : c'est ce qui empêche une URL gardée de vivre indéfiniment.
  it("rend le reçu gardé avec sa propre date, pas celle de la réponse", () => {
    const previous = receivedSecondsAgo(200);
    expect(keepSignedUrl(previous, incoming, NOW).receivedAtMs).toBe(secondsAgo(200));
  });
});
