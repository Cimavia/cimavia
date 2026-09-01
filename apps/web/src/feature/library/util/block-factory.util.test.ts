import { BlockType, exerciseBlockSchema, MetricKey, MetricSource } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { createBlock } from "./block-factory.util";

describe("createBlock", () => {
  /**
   * Le vrai risque de cette fabrique n'est pas de se tromper de valeur, c'est de produire un bloc
   * que le schéma refusera — l'erreur n'apparaîtrait qu'à l'enregistrement, loin du clic qui l'a
   * créée. On valide donc chaque type contre `exerciseBlockSchema` lui-même.
   */
  it.each(Object.values(BlockType))("produit un bloc %s valide au regard du schéma", (type) => {
    expect(exerciseBlockSchema.safeParse(createBlock(type)).success).toBe(true);
  });

  it("part sans ligne : une grille attend, elle n'invente pas de consigne", () => {
    expect(createBlock(BlockType.SERIES).rows).toEqual([]);
  });

  it("part sans libellé : nommer un bloc unique obligerait à effacer ce nom", () => {
    expect(createBlock(BlockType.SERIES).label).toBeNull();
  });

  it("donne au circuit une colonne de libellé, ses lignes étant des étapes nommées", () => {
    const [column] = createBlock(BlockType.CIRCUIT).metrics;
    expect(column).toMatchObject({ source: MetricSource.CATALOG, key: MetricKey.LABEL });
  });

  it("laisse le repos des séries à null plutôt que d'inventer une durée", () => {
    expect(createBlock(BlockType.SERIES).structure).toMatchObject({ restBetweenSetsSeconds: null });
  });

  it("donne des identifiants distincts à deux blocs et à leurs colonnes", () => {
    const first = createBlock(BlockType.SERIES);
    const second = createBlock(BlockType.SERIES);
    expect(first.id).not.toBe(second.id);
    expect(first.metrics[0]?.id).not.toBe(second.metrics[0]?.id);
  });
});
