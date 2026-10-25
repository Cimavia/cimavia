import type { OpenAPIObject } from "@nestjs/swagger";
import { describe, expect, it } from "vitest";
import { withProblemResponses } from "./problem.swagger";

const document = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  paths: {
    "/plans": {
      parameters: [],
      get: { responses: { "200": { description: "ok" } } },
      post: { responses: { "201": { description: "créé" }, default: { description: "mien" } } },
    },
  },
  components: { schemas: { Autre: { type: "object" } } },
} as unknown as OpenAPIObject;

describe("withProblemResponses", () => {
  const result = withProblemResponses(document);
  const plans = result.paths["/plans"] as unknown as Record<string, { responses: object }>;

  it("déclare le schéma ProblemDetails sans perdre les autres", () => {
    expect(Object.keys(result.components?.schemas ?? {})).toEqual(["Autre", "ProblemDetails"]);
    expect(result.components?.schemas?.ProblemDetails).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["type", "title", "status"]),
    });
  });

  it("ajoute la réponse d'erreur commune à chaque opération", () => {
    expect(plans.get?.responses).toMatchObject({
      "200": { description: "ok" },
      default: {
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetails" },
          },
        },
      },
    });
  });

  it("garde une réponse par défaut déclarée à la main, et les clés de chemin qui ne sont pas des opérations", () => {
    expect(plans.post?.responses).toMatchObject({ default: { description: "mien" } });
    expect((plans as { parameters?: unknown }).parameters).toEqual([]);
  });
});
