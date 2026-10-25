import { PROBLEM_CONTENT_TYPE, problemDetailsSchema } from "@cmv/shared";
import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
import { z } from "zod";

const PROBLEM_SCHEMA = "ProblemDetails";

/**
 * Déclare la réponse d'erreur commune (RFC 9457, #698) : le schéma `ProblemDetails`, dérivé de celui
 * de `@cmv/shared`, et une réponse `default` sur chaque opération. Une seule déclaration plutôt
 * qu'un décorateur par route — toute erreur, de toute route, a cette forme.
 */
export function withProblemResponses(document: OpenAPIObject): OpenAPIObject {
  const schemas = {
    ...document.components?.schemas,
    // Le JSON Schema de Zod est celui d'OpenAPI 3.0 pour ce schéma plat ; les types, eux, divergent.
    [PROBLEM_SCHEMA]: z.toJSONSchema(problemDetailsSchema, {
      target: "openapi-3.0",
    }) as SchemaObject,
  };
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, item]) => [
      path,
      Object.fromEntries(
        Object.entries(item).map(([method, operation]) => [
          method,
          isOperation(operation)
            ? {
                ...operation,
                responses: {
                  default: {
                    description: "Erreur (RFC 9457, application/problem+json)",
                    content: {
                      [PROBLEM_CONTENT_TYPE]: {
                        schema: { $ref: `#/components/schemas/${PROBLEM_SCHEMA}` },
                      },
                    },
                  },
                  ...operation.responses,
                },
              }
            : operation,
        ]),
      ),
    ]),
  );
  return { ...document, paths, components: { ...document.components, schemas } };
}

/** Une opération porte ses `responses` ; `parameters` ou `summary` au niveau du chemin, non. */
function isOperation(value: unknown): value is { responses: Record<string, unknown> } {
  return typeof value === "object" && value !== null && "responses" in value;
}
