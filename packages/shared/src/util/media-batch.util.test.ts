import { describe, expect, it, vi } from "vitest";
import { MediaType } from "../dto/feedback.schema";
import type { MediaBatch, MediaBatchStep, MediaRejection } from "./media-batch.util";
import {
  mediaRecapText,
  runSequentially,
  sendMediaBatch,
  splitByRemainingSlots,
} from "./media-batch.util";

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

describe("sendMediaBatch", () => {
  type Picked = { name: string; kind: MediaType | null };

  const image = (name: string): Picked => ({ name, kind: MediaType.IMAGE });
  const movie = (name: string): Picked => ({ name, kind: MediaType.VIDEO });

  function batch(items: readonly Picked[], over: Partial<MediaBatch<Picked>> = {}) {
    return {
      items,
      maxItems: Number.POSITIVE_INFINITY,
      remaining: slots(5, 3, 15),
      kindOf: (item: Picked) => item.kind,
      nameOf: (item: Picked) => item.name,
      send: async () => undefined,
      rejectedReason: ({ cause }: MediaRejection) => ({ key: cause, params: {} }),
      failureReason: (error: unknown) => ({ message: String(error) }),
      ...over,
    };
  }

  it("envoie ce qui tient, un par un, en nommant le rang de chacun", async () => {
    const steps: MediaBatchStep[] = [];

    const recap = await sendMediaBatch(
      batch([image("a"), movie("b")], {
        send: async (_item, step) => {
          steps.push(step);
        },
      }),
    );

    expect(steps).toEqual([
      { index: 1, total: 2, fileName: "a" },
      { index: 2, total: 2, fileName: "b" },
    ]);
    // Ce qui est parti n'a rien à dire : c'est déjà visible dans la galerie.
    expect(recap).toEqual([]);
  });

  /**
   * Les trois familles de refus se retrouvent dans UNE liste, ce qui est exactement ce que les
   * écrans recomposaient chacun de leur côté avant #156.
   */
  it("récapitule ensemble le type non géré, la place manquante et l'échec d'envoi", async () => {
    const recap = await sendMediaBatch(
      batch([{ name: "notes.pdf", kind: null }, image("a"), image("b"), image("c")], {
        remaining: slots(2, 3, 15),
        send: async (item) => {
          if (item.name === "b") throw new Error("panne");
        },
      }),
    );

    // `id` est le RANG dans la sélection d'origine, pas la position dans le récapitulatif : le PDF
    // était premier, « c » quatrième, « b » troisième. C'est ce qui rend deux lignes distinctes
    // même à noms identiques.
    expect(recap).toEqual([
      { id: "0", fileName: "notes.pdf", reason: { key: "unsupported", params: {} } },
      { id: "3", fileName: "c", reason: { key: "noSlot", params: {} } },
      { id: "2", fileName: "b", reason: { message: "Error: panne" } },
    ]);
  });

  it("n'examine pas au-delà du plafond du lot", async () => {
    const sent: string[] = [];

    const recap = await sendMediaBatch(
      batch([image("a"), image("b"), image("c")], {
        maxItems: 1,
        send: async (item) => {
          sent.push(item.name);
        },
      }),
    );

    expect(sent).toEqual(["a"]);
    expect(recap).toEqual([
      { id: "1", fileName: "b", reason: { key: "tooMany", params: {} } },
      { id: "2", fileName: "c", reason: { key: "tooMany", params: {} } },
    ]);
  });

  /**
   * Deux fichiers de même nom sont monnaie courante (« IMG_0001.jpg » sur deux appareils). Sans
   * identité propre, leurs deux lignes seraient indiscernables au rendu — c'est exactement ce que
   * le rang d'un `map()` ne sait pas garantir.
   */
  it("donne une identité distincte à deux fichiers homonymes", async () => {
    const recap = await sendMediaBatch(
      batch([image("IMG_0001.jpg"), image("IMG_0001.jpg")], {
        remaining: slots(0, 3, 15),
      }),
    );

    expect(recap.map((line) => line.id)).toEqual(["0", "1"]);
  });

  // Le lot n'est jamais annulé en bloc : quand tout est refusé, il n'y a simplement rien à envoyer.
  it("ne tente aucun envoi quand rien ne tient", async () => {
    const send = vi.fn();

    const recap = await sendMediaBatch(batch([image("a")], { remaining: slots(0, 3, 15), send }));

    expect(send).not.toHaveBeenCalled();
    expect(recap).toHaveLength(1);
  });
});

describe("mediaRecapText", () => {
  const translate = (key: string, params: Record<string, string | number>) =>
    `${key}:${JSON.stringify(params)}`;

  it("traduit une raison qui porte une clé, avec ses paramètres", () => {
    expect(mediaRecapText({ key: "media.tooBig", params: { max: 50 } }, translate)).toBe(
      'media.tooBig:{"max":50}',
    );
  });

  /**
   * Une panne technique arrive déjà rédigée — c'est le message de l'API. La traduire n'aurait rien
   * à traduire : le passer tel quel est la seule façon de ne pas le perdre.
   */
  it("rend tel quel un message qui n'a pas de clé", () => {
    expect(mediaRecapText({ message: "Le serveur a refusé ce fichier." }, translate)).toBe(
      "Le serveur a refusé ce fichier.",
    );
  });
});
