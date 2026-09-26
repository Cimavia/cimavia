import type { ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";
import { FILTERED, redactUrlSecrets, scrubEvent } from "./sentry-scrub";

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
});

describe("scrubEvent", () => {
  it("blanchit l'URL et le Referer posés par httpContextIntegration", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: "https://app.test/reset-password?token=abc",
        headers: { Referer: "https://app.test/?token=old", "User-Agent": "UA" },
      },
    };

    expect(scrubEvent(event).request).toEqual({
      url: `https://app.test/reset-password?token=${FILTERED}`,
      headers: { Referer: `https://app.test/?token=${FILTERED}`, "User-Agent": "UA" },
    });
  });

  it("blanchit les URLs des fils d'Ariane de navigation, de requête et de console", () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/reset-password?token=abc", to: "/reset-password" },
        },
        {
          category: "xhr",
          data: { method: "PUT", url: "https://s3.test/k?X-Amz-Signature=s", status_code: 200 },
        },
        { category: "console", message: "échec sur /reset-password?token=abc" },
      ],
    };

    expect(scrubEvent(event).breadcrumbs).toEqual([
      {
        category: "navigation",
        data: { from: `/reset-password?token=${FILTERED}`, to: "/reset-password" },
      },
      {
        category: "xhr",
        data: {
          method: "PUT",
          url: `https://s3.test/k?X-Amz-Signature=${FILTERED}`,
          status_code: 200,
        },
      },
      { category: "console", message: `échec sur /reset-password?token=${FILTERED}` },
    ]);
  });

  it("n'invente aucun champ sur un événement qui n'en porte pas", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "boom",
      breadcrumbs: [{ category: "ui.click" }],
    };

    expect(scrubEvent(event)).toEqual(event);
  });

  it("ne modifie pas l'événement reçu", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { url: "/reset-password?token=abc", headers: { Referer: "/?token=x" } },
      breadcrumbs: [{ data: { url: "/?token=y" } }],
    };
    const before = structuredClone(event);

    scrubEvent(event);

    expect(event).toEqual(before);
  });
});
