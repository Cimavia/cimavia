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
   * L'en-tête d'un tableau qui défile dans son cadre, à ajouter à `headCell` : collé en haut,
   * au-dessus des lignes. Posé sur chaque cellule et non sur le `thead`, dont ni le collage ni
   * l'ombre ne tiennent partout. Il porte son fond et son filet — une ombre, car en
   * `border-collapse` une bordure resterait sur place pendant le défilement.
   */
  stickyHeadCell: "sticky top-0 z-10 bg-cmv-bg-1 shadow-[inset_0_-1px_0] shadow-cmv-border",
  /**
   * Les petites capitales vivent sur le LIBELLÉ, jamais sur la ligne : `uppercase` est hérité, et
   * posé plus haut il remonterait dans tout ce que la cellule contient — l'unité, et jusqu'au
   * menu de colonne qui s'y ancre.
   */
  headLabel: "text-cmv-caption uppercase tracking-wide text-cmv-text-lo",
  /** Un filet sous chaque ligne : sans lui, une grille à cinq lignes se lit comme un bloc. */
  row: "border-cmv-border border-b last:border-b-0",
  cell: "px-cmv-sm py-cmv-sm align-middle",
  /**
   * L'index de ligne, dans sa pastille — le repère visuel des maquettes. Une LARGEUR MINIMALE et
   * non une taille fixe : la lecture d'une Séries regroupe ses dernières séries (« 2–4 », #520),
   * qui débordaient d'un carré de 24 px. Un chiffre seul garde le carré.
   */
  index:
    "inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-cmv-sm bg-cmv-surface-hi px-cmv-xs text-cmv-caption text-cmv-text-mid",
} as const;
