import { describe, expect, it } from "vitest";
import { buildObjectKey } from "./object-key";
import { familyOf, ORPHAN_GRACE_MS, summarizeOrphans, triage } from "./orphan-sweep";

const NOW = new Date("2026-11-23T12:00:00Z");
const OLD = new Date(NOW.getTime() - ORPHAN_GRACE_MS);
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("familyOf", () => {
  // Les préfixes réels des quatre services, passés par la vraie construction de clé.
  it.each([
    ["exercise", "coach/c1/exercises/e1/"],
    ["feedback", "athlete/a1/feedback/s1/"],
    ["invoice", "athlete/a1/invoice/p1/"],
    ["conversation", "conversation/k1/"],
  ] as const)("reconnaît une clé %s construite par l'API", (family, prefix) => {
    expect(familyOf(buildObjectKey(prefix, "topo.pdf"))).toBe(family);
  });

  it.each([
    ["un préfixe inconnu", `backups/2026/${UUID}-dump.sql`],
    ["un suffixe sans uuid", "coach/c1/exercises/e1/topo.pdf"],
    ["un sous-dossier sous le préfixe", `conversation/k1/sous/${UUID}-a.m4a`],
    ["un segment manquant", `coach/c1/exercises/${UUID}-topo.pdf`],
    ["un nom non assaini", `athlete/a1/feedback/s1/${UUID}-ma voie.jpg`],
    ["la racine", `${UUID}-topo.pdf`],
  ])("ne reconnaît pas %s", (_, key) => {
    expect(familyOf(key)).toBeNull();
  });
});

describe("triage", () => {
  const exerciseKey = `coach/c1/exercises/e1/${UUID}-topo.pdf`;

  it("ne retient que les objets reconnus et assez anciens", () => {
    const result = triage(
      [
        { key: exerciseKey, lastModified: OLD, size: 10 },
        { key: "backups/dump.sql", lastModified: OLD, size: 99 },
        {
          key: `conversation/k1/${UUID}-a.m4a`,
          lastModified: new Date(OLD.getTime() + 1),
          size: 5,
        },
        { key: `athlete/a1/feedback/s1/${UUID}-v.mp4`, lastModified: null, size: 5 },
      ],
      NOW,
    );

    expect(result).toEqual({
      unknown: ["backups/dump.sql"],
      recent: 2,
      candidates: [{ key: exerciseKey, lastModified: OLD, size: 10, family: "exercise" }],
    });
  });

  // Une clé inconnue reste inconnue à tout âge : elle n'est jamais candidate.
  it("rapporte une clé inconnue, même ancienne, sans la proposer", () => {
    expect(triage([{ key: "x", lastModified: new Date(0), size: 1 }], NOW)).toEqual({
      unknown: ["x"],
      recent: 0,
      candidates: [],
    });
  });
});

describe("summarizeOrphans", () => {
  const orphan = (family: "exercise" | "conversation", size: number | null) => ({
    key: "k",
    lastModified: OLD,
    size,
    family,
  });

  it("compte et pèse chaque famille", () => {
    expect(
      summarizeOrphans([orphan("exercise", 10), orphan("exercise", 5), orphan("conversation", 1)]),
    ).toEqual({ exercise: { count: 2, bytes: 15 }, conversation: { count: 1, bytes: 1 } });
  });

  // Un total partiel se lirait comme exact : une seule taille tue rend le poids inconnu.
  it("rend un poids null dès qu'une taille manque, sans perdre le compte", () => {
    expect(
      summarizeOrphans([orphan("exercise", 10), orphan("exercise", null), orphan("exercise", 3)]),
    ).toEqual({ exercise: { count: 3, bytes: null } });
  });

  it("ne rend rien sans orphelin", () => {
    expect(summarizeOrphans([])).toEqual({});
  });
});
