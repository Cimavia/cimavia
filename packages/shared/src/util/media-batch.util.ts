import type { MediaType } from "../dto/feedback.schema";

/**
 * Envoyer PLUSIEURS médias d'un même geste, de la sélection au récapitulatif.
 *
 * Tout est ici plutôt que dans les écrans parce que les deux règles du lot — « on n'annule jamais
 * tout » et « un fichier à la fois » — doivent valoir à l'identique sur les quatre surfaces
 * (débrief et messagerie, web et mobile). Écrites quatre fois, elles auraient divergé au premier
 * correctif appliqué d'un seul côté.
 *
 * Ce que ce module ne sait PAS, et reçoit donc de l'appelant : comment lire le type d'un média
 * (un `File` web, un asset de picker mobile), comment l'envoyer, et quelles clés i18n nommer ses
 * refus. Les clés restent dans les catalogues des apps — les poser ici les ferait passer pour
 * mortes au `check:i18n`, qui lit les sources de chaque app.
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

/**
 * Le sort d'un élément une fois la file passée. `error` à `null` = envoyé ; sinon, la raison telle
 * que l'appelant la traduira (refus métier porteur de clé i18n, ou panne technique).
 *
 * Le type est `unknown` tout court : `unknown | null` se réduit à `unknown`, si bien que le
 * `| null` ne documentait rien — il donnait l'illusion d'un type plus précis qu'il ne l'était.
 * C'est le commentaire qui porte la convention, pas la signature.
 */
export type BatchOutcome<T> = { item: T; error: unknown };

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

/**
 * La raison pour laquelle un média n'a pas été joint, telle qu'elle sera dite à l'utilisateur.
 *
 * Une clé i18n est STOCKÉE, pas traduite : un changement de langue doit retraduire le
 * récapitulatif, pas le figer dans celle d'avant. Une panne technique, elle, arrive déjà sous
 * forme de message — c'est celui de l'API, et il n'a pas de clé.
 */
export type MediaRecapReason =
  | { key: string; params: Record<string, string | number> }
  | { message: string };

/**
 * Une ligne du récapitulatif. `fileName` est nullable : un picker n'en donne pas toujours un.
 *
 * `id` est le RANG du fichier dans la sélection d'origine — celui que l'utilisateur pourrait
 * compter dans sa galerie. Deux lignes ne peuvent donc pas le partager, même à noms de fichiers
 * identiques, et il reste attaché à sa ligne si le rendu vient un jour à trier ou filtrer la
 * liste. C'est ce qu'un rang de `map()` ne garantit pas.
 */
export type MediaRecapLine = { id: string; fileName: string | null; reason: MediaRecapReason };

/**
 * La phrase d'une raison, quelle que soit sa forme.
 *
 * La fonction de traduction est REÇUE plutôt qu'importée : `@cmv/shared` compile en CJS pour
 * NestJS et n'a pas i18next. Le `t` des deux apps s'y branche tel quel, et le discriminant
 * `"key" in reason` n'est écrit qu'une fois — écrit quatre fois, il aurait fallu penser aux quatre
 * le jour où la raison gagne une troisième forme.
 */
export function mediaRecapText(
  reason: MediaRecapReason,
  translate: (key: string, params: Record<string, string | number>) => string,
): string {
  return "key" in reason ? translate(reason.key, reason.params) : reason.message;
}

/**
 * Pourquoi un média a été écarté AVANT tout envoi. `kind` accompagne la cause pour que l'appelant
 * puisse nommer la place qui manque (« plus de place pour une photo ») plutôt que de rester vague.
 */
export type MediaRejection =
  | { cause: "unsupported"; kind: null }
  | { cause: "noSlot"; kind: MediaType }
  | { cause: "tooMany"; kind: MediaType | null };

/** Où en est le lot, pour que l'écran puisse dire « Envoi 2 / 5 » en nommant le média en cours. */
export type MediaBatchStep = { index: number; total: number; fileName: string | null };

export type MediaBatch<T> = {
  items: readonly T[];
  /** Au-delà, on n'examine même pas : les quotas du débrief, ou le plafond d'un lot de messages. */
  maxItems: number;
  remaining: Readonly<Record<MediaType, number>>;
  /** La famille du média, `null` quand cette surface ne sait pas le joindre du tout. */
  kindOf: (item: T) => MediaType | null;
  nameOf: (item: T) => string | null;
  send: (item: T, step: MediaBatchStep) => Promise<void>;
  rejectedReason: (rejection: MediaRejection) => MediaRecapReason;
  failureReason: (error: unknown) => MediaRecapReason;
};

/** Un élément de la sélection et son rang d'origine, qui le suit jusqu'au récapitulatif. */
type Ranked<T> = { item: T; rank: number };

/**
 * Le lot de bout en bout : trier, envoyer un par un, puis rendre ce qui n'est pas passé.
 *
 * Rien n'est annulé en bloc (#156). Six photos pour cinq places envoient cinq photos et nomment la
 * sixième ; un fichier trop lourd en troisième position n'emporte pas les deux qui le suivent.
 * L'appelant reçoit UNE liste à afficher, et n'a plus à recomposer les trois familles de refus.
 *
 * Ce qui est effectivement parti ne figure pas au récapitulatif : c'est déjà visible dans la
 * galerie ou dans le fil, et le répéter en ferait un compte rendu d'exécution plutôt qu'une liste
 * de choses à corriger.
 */
export async function sendMediaBatch<T>(batch: MediaBatch<T>): Promise<MediaRecapLine[]> {
  const limit = Math.max(0, batch.maxItems);
  // Le rang dans la SÉLECTION accompagne chaque élément jusqu'au récapitulatif : c'est lui qui
  // donne son identité à une ligne, et il ne dépend ni du tri ni de la cause du refus.
  const ranked = batch.items.map((item, index) => ({ item, rank: index }));
  const line = (entry: Ranked<T>, reason: MediaRecapReason): MediaRecapLine => ({
    id: String(entry.rank),
    fileName: batch.nameOf(entry.item),
    reason,
  });

  const slottable: (Ranked<T> & { kind: MediaType })[] = [];
  const unsupported: Ranked<T>[] = [];
  for (const entry of ranked.slice(0, limit)) {
    const kind = batch.kindOf(entry.item);
    if (kind == null) unsupported.push(entry);
    else slottable.push({ ...entry, kind });
  }

  const { accepted, rejected } = splitByRemainingSlots(slottable, batch.remaining);
  const total = accepted.length;
  const outcomes = await runSequentially(accepted, (entry, index) =>
    batch.send(entry.item, {
      index: index + 1,
      total,
      fileName: batch.nameOf(entry.item),
    }),
  );

  return [
    ...unsupported.map((entry) =>
      line(entry, batch.rejectedReason({ cause: "unsupported", kind: null })),
    ),
    ...rejected.map((entry) =>
      line(entry, batch.rejectedReason({ cause: "noSlot", kind: entry.kind })),
    ),
    ...ranked
      .slice(limit)
      .map((entry) =>
        line(entry, batch.rejectedReason({ cause: "tooMany", kind: batch.kindOf(entry.item) })),
      ),
    ...outcomes
      .filter((outcome) => outcome.error != null)
      .map((outcome) => line(outcome.item, batch.failureReason(outcome.error))),
  ];
}
