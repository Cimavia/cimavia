import { expect } from "vitest";
import { type ZodType, z } from "zod";

/**
 * Le schéma refuse `input`, AU champ `path`, avec SON message (#635).
 *
 * Le texte n'est pas recopié : un test qui le citerait casserait à chaque reformulation. On
 * vérifie qu'il existe et qu'il n'est pas le repli de Zod — c'est ce que deviendrait un message
 * vidé ou oublié, l'anglais générique que Zod écrit à sa place.
 */
export function expectRefusal(
  schema: ZodType,
  input: unknown,
  path: readonly PropertyKey[] = [],
): void {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);

  // TOUS les refus du champ : un second contrôle qui aurait perdu son message ne se cache pas
  // derrière le premier.
  const issues = result.error?.issues.filter((issue) => sameKeys(issue.path, path)) ?? [];
  expect(issues, `aucun refus au champ [${path.map(String).join(", ")}]`).not.toHaveLength(0);

  for (const issue of issues) {
    // Le refus final a perdu la valeur fautive, dont certains messages de Zod dépendent : on la
    // lui rend avant de lui demander le repli qu'il aurait écrit.
    const fallback = z.config().localeError?.({ ...issue, input: valueAt(input, path) } as never);
    expect(issue.message).not.toBe("");
    expect(issue.message).not.toBe(typeof fallback === "string" ? fallback : fallback?.message);
  }
}

function sameKeys(left: readonly PropertyKey[], right: readonly PropertyKey[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Record<PropertyKey, unknown> | null | undefined)?.[key],
    input,
  );
}
