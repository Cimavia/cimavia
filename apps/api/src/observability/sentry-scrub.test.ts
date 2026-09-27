import { FILTERED } from "@cmv/shared";
import type { Event } from "@sentry/nestjs";
import { describe, expect, it } from "vitest";
import { REMINDER_TICK_HEADER } from "../reminder/guard/reminder-tick.guard";
import { REMINDER_TICK_HEADER_NAME, scrubEvent } from "./sentry-scrub";

describe("scrubEvent", () => {
  it("connaît l'en-tête du tick sous le nom que sa garde lit vraiment", () => {
    // Écrit en dur pour ne pas charger Nest avant Sentry : ce test est ce qui les tient égaux.
    expect(REMINDER_TICK_HEADER_NAME).toBe(REMINDER_TICK_HEADER);
  });

  it("retire les en-têtes secrets quelle que soit leur casse, et les cookies déjà découpés", () => {
    const event: Event = {
      request: {
        headers: {
          Cookie: "s=1",
          authorization: "Bearer b",
          "X-Cimavia-Tick-Secret": "t",
          "user-agent": "UA",
        },
        cookies: { "better-auth.session_token": "s" },
      },
    };

    expect(scrubEvent(event).request).toEqual({ headers: { "user-agent": "UA" } });
  });

  it("blanchit la chaîne de requête, qu'elle arrive en chaîne, en objet ou en paires", () => {
    const withQuery = (query_string: NonNullable<NonNullable<Event["request"]>["query_string"]>) =>
      scrubEvent({ request: { query_string } }).request?.query_string;

    expect(withQuery("a=1&token=t")).toBe(`a=1&token=${FILTERED}`);
    expect(withQuery({ a: "1", token: "t" })).toBe(`a=1&token=${FILTERED}`);
    expect(withQuery([["token", "t"]])).toBe(`token=${FILTERED}`);
  });

  it("retire des spans les en-têtes secrets, cookies éclatés compris, et blanchit les URLs", () => {
    const event: Event = {
      type: "transaction",
      transaction: "DELETE /me/push-tokens/abc",
      contexts: {
        trace: {
          span_id: "1",
          trace_id: "2",
          data: {
            "http.target": "/me/push-tokens/abc",
            "http.request.header.cookie.better_auth.session_token": "s",
            "http.request.header.x_cimavia_tick_secret": "t",
            "http.response.header.set_cookie": "s",
            "http.request.header.user_agent": "UA",
            "http.response.status_code": 204,
          },
        },
      },
      spans: [
        {
          span_id: "3",
          trace_id: "2",
          start_timestamp: 0,
          description: "GET /api/auth/reset-password/abc",
          data: { "url.full": "https://api.test/api/auth/reset-password/abc?x=1" },
        },
      ],
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.transaction).toBe(`DELETE /me/push-tokens/${FILTERED}`);
    expect(scrubbed.contexts?.trace?.data).toEqual({
      "http.target": `/me/push-tokens/${FILTERED}`,
      "http.request.header.user_agent": "UA",
      "http.response.status_code": 204,
    });
    expect(scrubbed.spans?.[0]).toMatchObject({
      description: `GET /api/auth/reset-password/${FILTERED}`,
      data: { "url.full": `https://api.test/api/auth/reset-password/${FILTERED}?x=1` },
    });
  });

  it("ne prend pas pour secret un en-tête dont le nom COMMENCE comme un secret", () => {
    const data = { "http.request.header.authorization_hint": "h" };

    expect(
      scrubEvent({ contexts: { trace: { span_id: "1", trace_id: "2", data } } }).contexts?.trace
        ?.data,
    ).toEqual(data);
  });

  it("blanchit les fils d'Ariane, message et données", () => {
    const event: Event = {
      breadcrumbs: [
        {
          category: "http",
          data: { url: "https://s3.test/k?X-Amz-Signature=s", status_code: 200 },
        },
        { category: "console", message: "échec sur /me/push-tokens/abc" },
      ],
    };

    expect(scrubEvent(event).breadcrumbs).toEqual([
      {
        category: "http",
        data: { url: `https://s3.test/k?X-Amz-Signature=${FILTERED}`, status_code: 200 },
      },
      { category: "console", message: `échec sur /me/push-tokens/${FILTERED}` },
    ]);
  });

  it("n'invente aucun champ sur un événement qui n'en porte pas", () => {
    const event: Event = {
      message: "boom",
      contexts: { trace: { span_id: "1", trace_id: "2" } },
      spans: [{ span_id: "3", trace_id: "2", start_timestamp: 0, data: {} }],
      breadcrumbs: [{ category: "ui" }],
    };

    expect(scrubEvent(event)).toEqual(event);
  });

  it("ne modifie pas l'événement reçu", () => {
    const event: Event = {
      request: { url: "/me/push-tokens/abc", headers: { cookie: "s" }, cookies: { s: "1" } },
      breadcrumbs: [{ data: { url: "/?token=y" } }],
    };
    const before = structuredClone(event);

    scrubEvent(event);

    expect(event).toEqual(before);
  });
});
