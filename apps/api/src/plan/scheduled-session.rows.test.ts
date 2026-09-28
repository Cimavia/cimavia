import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { planExerciseRows } from "./scheduled-session.rows";

const existing = [
  { id: "sse_a", position: 0 },
  { id: "sse_b", position: 1 },
  { id: "sse_c", position: 2 },
];

describe("planExerciseRows", () => {
  it("reprend chaque ligne citée à son nouveau rang, et retire celles qui ne le sont plus", () => {
    const rows = planExerciseRows(existing, [{ id: "sse_c" }, { id: "sse_a" }]);

    expect(rows.kept).toEqual([
      { id: "sse_c", position: 0, item: { id: "sse_c" } },
      { id: "sse_a", position: 1, item: { id: "sse_a" } },
    ]);
    expect(rows.added).toEqual([]);
    expect(rows.removedIds).toEqual(["sse_b"]);
  });

  it("une ligne sans id naît, au rang que le tableau lui donne", () => {
    const rows = planExerciseRows(existing, [{ id: "sse_a" }, { title: "Gainage" }]);

    expect(rows.added).toEqual([{ position: 1, item: { title: "Gainage" } }]);
  });

  /**
   * L'identifiant vient du client : le reprendre rattacherait une ligne d'une autre séance — ou
   * d'un autre coach. Inconnu ici, il ne désigne rien, et la ligne est nouvelle.
   */
  it("un id inconnu de la séance désigne une ligne NOUVELLE, jamais une reprise", () => {
    const rows = planExerciseRows(existing, [{ id: "sse_ailleurs" }]);

    expect(rows.kept).toEqual([]);
    expect(rows.added).toEqual([{ position: 0, item: { id: "sse_ailleurs" } }]);
    expect(rows.removedIds).toEqual(["sse_a", "sse_b", "sse_c"]);
  });

  it("refuse le même id cité deux fois : deux lignes ne peuvent pas en être une", () => {
    expect(() => planExerciseRows(existing, [{ id: "sse_a" }, { id: "sse_a" }])).toThrow(
      BadRequestException,
    );
  });

  /**
   * Les lignes nouvelles s'écrivent directement à leur rang final. Garer au-dessus du seul rang
   * occupé ne suffit pas quand la composition GRANDIT : une séance d'une ligne qui passe à trois
   * garerait sa ligne au rang 1, là où la deuxième ligne nouvelle doit atterrir.
   */
  it("gare au-delà de ce que la séance occupe ET de ce qu'elle occupera", () => {
    const grown = planExerciseRows([{ id: "sse_a", position: 0 }], [{}, { id: "sse_a" }, {}]);
    expect(grown.parking).toBe(3);

    // Une séance portant encore des trous (rangs non contigus) : son rang le plus haut l'emporte.
    const holed = planExerciseRows([{ id: "sse_a", position: 7 }], [{ id: "sse_a" }]);
    expect(holed.parking).toBe(8);
  });

  it("une séance vide qui reçoit sa première ligne n'a rien à garer", () => {
    const gainage: { id?: string; title: string } = { title: "Gainage" };
    expect(planExerciseRows([], [gainage])).toEqual({
      removedIds: [],
      kept: [],
      added: [{ position: 0, item: gainage }],
      parking: 1,
    });
  });
});
