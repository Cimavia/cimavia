import { describe, expect, it, vi } from "vitest";
import { MediaType } from "../dto/feedback.schema";
import { runSequentially, splitByRemainingSlots } from "./media-batch.util";

const photo = (name: string) => ({ kind: MediaType.IMAGE, name });
const video = (name: string) => ({ kind: MediaType.VIDEO, name });
const slots = (image: number, video: number, audio: number) => ({
  [MediaType.IMAGE]: image,
  [MediaType.VIDEO]: video,
  [MediaType.AUDIO]: audio,
});

describe("splitByRemainingSlots", () => {
  it("prend ce qui tient et signale ce qui déborde, type par type", () => {
    const split = splitByRemainingSlots(
      [photo("a"), video("b"), photo("c"), video("d"), photo("e")],
      slots(2, 1, 15),
    );

    expect(split.accepted.map((item) => item.name)).toEqual(["a", "b", "c"]);
    expect(split.rejected.map((item) => item.name)).toEqual(["d", "e"]);
  });

  /**
   * LA décision structurante de #156 : le débordement n'annule pas le lot. Six photos pour cinq
   * places envoient les cinq premières — refuser l'ensemble renverrait l'athlète dans sa galerie
   * pour refaire une sélection qu'il vient de faire.
   */
  it("n'annule jamais le lot entier quand il dépasse", () => {
    const split = splitByRemainingSlots([photo("a"), photo("b"), photo("c")], slots(1, 3, 15));

    expect(split.accepted).toHaveLength(1);
    expect(split.rejected).toHaveLength(2);
  });

  // L'ordre du picker est le seul que l'utilisateur ait choisi : trier par type ou par taille
  // rendrait imprévisible ce qui est laissé de côté.
  it("sert dans l'ordre de sélection, pas par type", () => {
    const split = splitByRemainingSlots([video("premiere"), video("seconde")], slots(5, 1, 15));

    expect(split.accepted.map((item) => item.name)).toEqual(["premiere"]);
    expect(split.rejected.map((item) => item.name)).toEqual(["seconde"]);
  });

  it("rejette tout quand il ne reste aucune place", () => {
    const split = splitByRemainingSlots([photo("a"), video("b")], slots(0, 0, 0));

    expect(split.accepted).toEqual([]);
    expect(split.rejected).toHaveLength(2);
  });

  /**
   * Un quota déjà dépassé côté serveur (deux appareils, deux ajouts concurrents) vaut zéro place —
   * jamais une dette à rattraper qui laisserait passer un fichier de plus au prochain lot.
   */
  it("traite une place négative comme une place occupée", () => {
    const split = splitByRemainingSlots([photo("a")], slots(-2, 3, 15));

    expect(split.accepted).toEqual([]);
    expect(split.rejected).toHaveLength(1);
  });

  it("rend deux listes vides sur une sélection vide", () => {
    expect(splitByRemainingSlots([], slots(5, 3, 15))).toEqual({ accepted: [], rejected: [] });
  });
});

describe("runSequentially", () => {
  /**
   * Séquentiel par NÉCESSITÉ : le serveur compte les médias déjà attachés à chaque rattachement et
   * refuse en 409. En parallèle, tout le lot passerait le contrôle client puis se ferait refuser au
   * milieu, sans qu'on sache quels fichiers sont passés.
   */
  it("attend chaque envoi avant de lancer le suivant", async () => {
    const started: string[] = [];
    const finished: string[] = [];

    await runSequentially(["a", "b", "c"], async (item) => {
      started.push(item);
      await Promise.resolve();
      finished.push(item);
    });

    expect(started).toEqual(["a", "b", "c"]);
    expect(finished).toEqual(["a", "b", "c"]);
  });

  // Un fichier trop lourd en troisième position ne doit pas emporter les deux qui le suivent.
  it("poursuit la file après un échec et rend son issue à chaque élément", async () => {
    const boom = new Error("trop lourd");
    const run = vi.fn(async (item: string) => {
      if (item === "b") throw boom;
    });

    const outcomes = await runSequentially(["a", "b", "c"], run);

    expect(run).toHaveBeenCalledTimes(3);
    expect(outcomes).toEqual([
      { item: "a", error: null },
      { item: "b", error: boom },
      { item: "c", error: null },
    ]);
  });

  // L'index permet à l'écran de publier « Envoi 2 / 5 » AVANT d'attendre — la progression est son
  // affaire, pas celle de la file.
  it("passe l'index de l'élément en cours", async () => {
    const seen: number[] = [];

    await runSequentially(["a", "b"], async (_item, index) => {
      seen.push(index);
    });

    expect(seen).toEqual([0, 1]);
  });

  it("rend une liste vide sans rien exécuter sur un lot vide", async () => {
    const run = vi.fn();

    expect(await runSequentially([], run)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
