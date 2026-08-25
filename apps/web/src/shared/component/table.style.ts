/**
 * Le style de tableau des maquettes, partagé par la grille du constructeur et l'aperçu athlète.
 *
 * Un point unique parce que les deux doivent se ressembler : l'aperçu ment sur ce que verra
 * l'athlète dès qu'il s'en écarte, et c'est toute sa raison d'être.
 */
export const CMV_TABLE = {
  /** Le cadre : c'est lui qui fait du tableau un objet, et non des lignes posées sur la page. */
  frame: "overflow-hidden rounded-cmv-md border border-cmv-border",
  table: "w-full border-collapse text-left",
  /** L'en-tête se distingue par son FOND, pas par sa graisse : les libellés restent discrets. */
  head: "bg-cmv-bg-1",
  /**
   * Le filet sous l'en-tête, à ne poser QUE s'il y a des lignes : sur un tableau vide il se
   * colle à la bordure du cadre et produit un double trait.
   */
  headBorder: "border-cmv-border border-b",
  headCell: "px-cmv-sm py-cmv-sm text-left align-middle font-normal",
  /**
   * Les petites capitales vivent sur le LIBELLÉ, jamais sur la ligne : `uppercase` est hérité, et
   * posé plus haut il remonterait dans tout ce que la cellule contient — l'unité, et jusqu'au
   * menu de colonne qui s'y ancre.
   */
  headLabel: "text-cmv-caption uppercase tracking-wide text-cmv-text-lo",
  /** Un filet sous chaque ligne : sans lui, une grille à cinq lignes se lit comme un bloc. */
  row: "border-cmv-border border-b last:border-b-0",
  cell: "px-cmv-sm py-cmv-sm align-middle",
  /** L'index de ligne, dans sa pastille — le repère visuel des maquettes. */
  index:
    "inline-flex size-6 items-center justify-center rounded-cmv-sm bg-cmv-surface-hi text-cmv-caption text-cmv-text-mid",
} as const;
