import { describe, expect, it } from "vitest";
import { parseLoginSearch as parse } from "@/routes/login";

describe("parseLoginSearch", () => {
  it("garde la page d'où la garde a renvoyé, telle quelle", () => {
    // Brute ici : c'est `safeRedirect`, dans l'écran, qui décide si on la suit (#337).
    expect(parse({ redirect: "/feedbacks?feedback=f-1" })).toEqual({
      redirect: "/feedbacks?feedback=f-1",
    });
  });

  it("ignore une cible qui n'est pas une chaîne", () => {
    expect(parse({ redirect: 42 })).toEqual({});
    expect(parse({})).toEqual({});
  });
});
