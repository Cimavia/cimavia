import { describe, expect, it } from "vitest";
import { FILTERED, redactUrlSecrets } from "./url-secret.util";

describe("redactUrlSecrets", () => {
  it("garde le nom du jeton de réinitialisation et en retire la valeur", () => {
    expect(redactUrlSecrets("https://app.test/reset-password?token=abc123")).toBe(
      `https://app.test/reset-password?token=${FILTERED}`,
    );
  });

  it("ne touche qu'au paramètre secret, pas à ses voisins ni au fragment", () => {
    expect(redactUrlSecrets("/x?a=1&code=zz&b=2#top")).toBe(`/x?a=1&code=${FILTERED}&b=2#top`);
  });

  it("retire la signature d'une URL S3, quelle que soit sa casse", () => {
    const signed =
      "https://s3.test/k.jpg?X-Amz-Date=1&X-Amz-Signature=deadbeef&x-amz-signature=cafe";

    expect(redactUrlSecrets(signed)).toBe(
      `https://s3.test/k.jpg?X-Amz-Date=1&X-Amz-Signature=${FILTERED}&x-amz-signature=${FILTERED}`,
    );
  });

  it("ne prend pas un paramètre dont le nom FINIT par un nom secret", () => {
    expect(redactUrlSecrets("/x?postcode=75001&pushtoken=t")).toBe("/x?postcode=75001&pushtoken=t");
  });

  it("laisse intacte une URL sans secret", () => {
    expect(redactUrlSecrets("/planning?from=2026-09-21")).toBe("/planning?from=2026-09-21");
  });

  it("blanchit le jeton que le lien de l'e-mail porte dans son chemin, pas son callbackURL", () => {
    expect(
      redactUrlSecrets("/api/auth/reset-password/abc123?callbackURL=https%3A%2F%2Fapp.test"),
    ).toBe(`/api/auth/reset-password/${FILTERED}?callbackURL=https%3A%2F%2Fapp.test`);
  });

  it("blanchit le jeton d'appareil de la révocation, encodé ou non", () => {
    expect(redactUrlSecrets("/me/push-tokens/ExponentPushToken%5Bxyz%5D")).toBe(
      `/me/push-tokens/${FILTERED}`,
    );
    expect(redactUrlSecrets("/me/push-tokens/ExponentPushToken[xyz]")).toBe(
      `/me/push-tokens/${FILTERED}`,
    );
  });

  it("laisse la collection elle-même, qui ne porte aucun jeton", () => {
    expect(redactUrlSecrets("/me/push-tokens")).toBe("/me/push-tokens");
    expect(redactUrlSecrets("/me/push-tokens/")).toBe("/me/push-tokens/");
    expect(redactUrlSecrets("/api/auth/reset-password")).toBe("/api/auth/reset-password");
  });

  it("ne prend pas un segment dont le nom FINIT par un nom secret", () => {
    expect(redactUrlSecrets("/old-push-tokens/abc")).toBe("/old-push-tokens/abc");
  });
});
