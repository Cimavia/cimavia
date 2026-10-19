import { FILTERED } from "@cmv/shared";
import type { Event } from "@sentry/nestjs";
import { describe, expect, it } from "vitest";
import { REMINDER_TICK_HEADER } from "../reminder/guard/reminder-tick.guard";
import { REMINDER_TICK_HEADER_NAME, scrubEvent, scrubSpan } from "./sentry-scrub";

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

  it("blanchit le nom de transaction et les attributs de trace d'une erreur", () => {
    const event: Event = {
      transaction: "DELETE /me/push-tokens/abc",
      contexts: {
        trace: {
          span_id: "1",
          trace_id: "2",
          data: {
            "url.path": "/me/push-tokens/abc",
            "http.request.header.referer": ["https://app.test/reset-password?token=y"],
            "http.request.header.cookie": "s",
            "http.response.status_code": 204,
          },
        },
      },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.transaction).toBe(`DELETE /me/push-tokens/${FILTERED}`);
    expect(scrubbed.contexts?.trace?.data).toEqual({
      "url.path": `/me/push-tokens/${FILTERED}`,
      "http.request.header.referer": [`https://app.test/reset-password?token=${FILTERED}`],
      "http.response.status_code": 204,
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

describe("scrubSpan", () => {
  /** Un span serveur tel que `beforeSendSpan` le reçoit — les valeurs relevées sur le vrai SDK. */
  const span = (attributes: Parameters<typeof scrubSpan>[0]["attributes"]) => ({
    trace_id: "1",
    span_id: "2",
    name: "GET /api/auth/reset-password/abc",
    start_timestamp: 0,
    status: "ok" as const,
    is_segment: true,
    attributes,
  });

  it("retire les en-têtes secrets, dans les deux sens et quelle que soit leur casse", () => {
    const scrubbed = scrubSpan(
      span({
        "http.request.header.cookie": ["better-auth.session_token=s"],
        "http.request.header.Authorization": ["Bearer b"],
        "http.request.header.x-cimavia-tick-secret": ["t"],
        "http.response.header.set-cookie": ["better-auth.session_token=s"],
        "http.request.header.user-agent": ["UA"],
        "http.response.status_code": 200,
      }),
    );

    expect(scrubbed.attributes).toEqual({
      "http.request.header.user-agent": ["UA"],
      "http.response.status_code": 200,
    });
  });

  it("blanchit le nom et toute URL, qu'elle soit brute, en tableau ou dans un objet typé", () => {
    const scrubbed = scrubSpan(
      span({
        "url.full": "https://api.test/api/auth/reset-password/abc?x=1",
        "url.query": "code=c&x=1",
        "http.request.header.referer": ["https://app.test/reset-password?token=y"],
        "sentry.segment.name": { value: "GET /me/push-tokens/abc", type: "string" },
        "http.response.status_code": 200,
      }),
    );

    expect(scrubbed).toMatchObject({
      name: `GET /api/auth/reset-password/${FILTERED}`,
      attributes: {
        "url.full": `https://api.test/api/auth/reset-password/${FILTERED}?x=1`,
        "url.query": `code=${FILTERED}&x=1`,
        "http.request.header.referer": [`https://app.test/reset-password?token=${FILTERED}`],
        "sentry.segment.name": { value: `GET /me/push-tokens/${FILTERED}`, type: "string" },
        "http.response.status_code": 200,
      },
    });
  });

  it("retire aussi les en-têtes secrets sous leur forme v10, tirets changés et cookie éclaté", () => {
    const scrubbed = scrubSpan(
      span({
        "http.request.header.x_cimavia_tick_secret": "t",
        "http.request.header.cookie.better-auth.session_token": "s",
        "http.response.header.set_cookie": "s",
      }),
    );

    expect(scrubbed.attributes).toEqual({});
  });

  it("traite les attributs des liens vers d'autres spans comme les siens", () => {
    const scrubbed = scrubSpan({
      ...span({}),
      links: [
        { span_id: "3", trace_id: "1" },
        {
          span_id: "4",
          trace_id: "1",
          attributes: {
            "url.full": "https://api.test/me/push-tokens/abc",
            "http.request.header.authorization": "b",
          },
        },
      ],
    });

    expect(scrubbed.links).toEqual([
      { span_id: "3", trace_id: "1" },
      {
        span_id: "4",
        trace_id: "1",
        attributes: { "url.full": `https://api.test/me/push-tokens/${FILTERED}` },
      },
    ]);
  });

  it("ne prend pas pour secret un en-tête dont le nom COMMENCE comme un secret", () => {
    const attributes = { "http.request.header.authorization-hint": ["h"] };

    expect(scrubSpan(span(attributes)).attributes).toEqual(attributes);
  });
});
