import { FILTERED } from "@cmv/shared";
import type { ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "./sentry-scrub";

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
