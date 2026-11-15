import { describe, expect, it } from "vitest";
import { sentryDataCollection } from "./sentry-data-collection.util";

describe("sentryDataCollection", () => {
  it("ne collecte ni corps, ni cookie, ni donnée de requête à la base, ni variable locale", () => {
    expect(sentryDataCollection({ userInfo: true })).toMatchObject({
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });

  it("n'enregistre aucun contenu d'IA générative ni de requête MCP", () => {
    expect(sentryDataCollection({ userInfo: true })).toMatchObject({
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    });
  });

  it("ne fait varier que l'IP d'une couche à l'autre", () => {
    const { userInfo: api, ...rest } = sentryDataCollection({ userInfo: true });
    const { userInfo: web, ...webRest } = sentryDataCollection({ userInfo: false });

    expect([api, web]).toEqual([true, false]);
    expect(webRest).toEqual(rest);
  });
});
