import type { MediaType } from "../dto/feedback.schema";

/**
 * Envoyer PLUSIEURS médias d'un même geste : ce qui rentre dans les places restantes, et comment
 * le lot part ensuite.
 *
 * Les deux fonctions vivent ici plutôt que dans les écrans parce qu'elles portent les deux règles
 * du lot — « on n'annule jamais tout » et « un fichier à la fois » — que les quatre surfaces
 * (débrief et messagerie, web et mobile) doivent appliquer à l'identique.
 */

// Un élément sélectionné, ramené à ce qui décide de son sort : la famille de média qu'il occupe.
// Chaque surface enveloppe sa propre source (un `File` web, un asset de picker mobile) autour.
export type SlottedMedia = { kind: MediaType };

export type SlotSplit<T> = {
  /** Dans l'ordre de sélection : ce qui tient dans les places restantes. */
  accepted: T[];
  /** Dans l'ordre de sélection : ce qui déborde, à récapituler à l'utilisateur. */
  rejected: T[];
};

/**
 * Répartit une sélection face aux places restantes, type par type, dans l'ordre de sélection.
 *
 * Premier arrivé, premier servi : l'ordre du picker est le seul que l'utilisateur ait choisi, et
 * réordonner (par taille, par type) rendrait imprévisible ce qui est laissé de côté.
 *
 * Ce qui déborde N'ANNULE PAS le lot — c'est la décision structurante de #156. Six photos pour
 * cinq places envoient cinq photos et signalent la sixième, plutôt que de tout refuser et de
 * renvoyer l'athlète dans sa galerie.
 *
 * `remaining` doit porter les TROIS familles : un `Partial` laisserait un type absent valoir zéro
 * en silence, alors qu'une place inconnue et une place occupée ne sont pas la même chose (règle
 * nullable). Une valeur négative — un quota déjà dépassé côté serveur — vaut zéro place, pas une
 * dette à rattraper.
 */
export function splitByRemainingSlots<T extends SlottedMedia>(
  items: readonly T[],
  remaining: Readonly<Record<MediaType, number>>,
): SlotSplit<T> {
  const left = new Map<MediaType, number>(
    Object.entries(remaining).map(([kind, count]) => [kind as MediaType, Math.max(0, count)]),
  );
  const split: SlotSplit<T> = { accepted: [], rejected: [] };

  for (const item of items) {
    const available = left.get(item.kind) ?? 0;
    if (available <= 0) {
      split.rejected.push(item);
      continue;
    }
    left.set(item.kind, available - 1);
    split.accepted.push(item);
  }

  return split;
}

// Le sort d'un élément une fois la file passée. `error` à `null` = envoyé ; sinon, la raison telle
// que l'appelant la traduira (refus métier porteur de clé i18n, ou panne technique).
export type BatchOutcome<T> = { item: T; error: unknown | null };

/**
 * Envoie les éléments UN PAR UN, et ne s'arrête jamais sur un échec.
 *
 * Séquentiel par nécessité, pas par prudence : le quota est vérifié par le serveur À CHAQUE
 * rattachement (`FeedbackMediaService.attach` compte puis rejette en 409). Cinq photos envoyées en
 * parallèle passeraient toutes le contrôle client, puis se feraient refuser au milieu du lot sans
 * qu'on sache lesquelles. La file rend l'ordre — et donc le récapitulatif — prévisible.
 *
 * Un échec est CAPTURÉ, jamais propagé : un fichier trop lourd en troisième position ne doit pas
 * emporter les deux qui le suivent. L'appelant lit les issues à la fin et récapitule par fichier.
 *
 * La progression n'est pas un paramètre : `run` reçoit l'index et peut publier l'état avant
 * d'attendre — c'est l'écran qui sait ce qu'il affiche.
 */
export async function runSequentially<T>(
  items: readonly T[],
  run: (item: T, index: number) => Promise<void>,
): Promise<BatchOutcome<T>[]> {
  const outcomes: BatchOutcome<T>[] = [];

  for (const [index, item] of items.entries()) {
    try {
      await run(item, index);
      outcomes.push({ item, error: null });
    } catch (error) {
      outcomes.push({ item, error });
    }
  }

  return outcomes;
}
