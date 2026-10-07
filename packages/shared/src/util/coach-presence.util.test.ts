import { describe, expect, it } from "vitest";
import { coachPresence } from "./coach-presence.util";

describe("coachPresence", () => {
  it("attend tant que la liste n'est pas lue", () => {
    expect(coachPresence({ data: undefined, isError: false })).toBe("loading");
  });

  // Le cas de #364 : une API injoignable ne dit pas « aucun coach ».
  it("dit l'échec d'une lecture qui n'a jamais abouti", () => {
    expect(coachPresence({ data: undefined, isError: true })).toBe("error");
  });

  it("dit « aucun » seulement sur une liste lue et vide", () => {
    expect(coachPresence({ data: [], isError: false })).toBe("none");
  });

  it("dit « au moins un » dès qu'un coach est là", () => {
    expect(coachPresence({ data: [{}], isError: false })).toBe("some");
  });

  // Une relecture en échec ne retire pas ce qui est en cache.
  it("garde la liste lue malgré une relecture en échec", () => {
    expect(coachPresence({ data: [{}], isError: true })).toBe("some");
    expect(coachPresence({ data: [], isError: true })).toBe("none");
  });
});
