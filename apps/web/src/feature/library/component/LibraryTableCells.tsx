import type { ReactNode } from "react";
import { CMV_TABLE, CmvTagList } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

/**
 * Les pièces communes aux tableaux de la bibliothèque : celui des onglets (`LibraryTable`) et le
 * sélecteur du builder de séance (`LibraryPicker`, #653). Un seul endroit, pour que les deux se
 * lisent de la même façon — et que leur ressemblance ne se paie pas en duplication.
 */

/**
 * Une ligne qui s'ouvre par son titre : `relative` ancre la zone cliquable de `TitleCell`, qui la
 * couvre entière. Ce qui doit rester cliquable à part passe au-dessus (`relative z-10`).
 */
export const LIBRARY_ROW = cn(CMV_TABLE.row, "relative transition-colors hover:bg-cmv-surface");

/** `sticky` : l'en-tête reste visible quand le tableau défile dans son cadre. */
export function HeadCell({ label, sticky = false }: Readonly<{ label: string; sticky?: boolean }>) {
  return (
    <th className={cn(CMV_TABLE.headCell, sticky && CMV_TABLE.stickyHeadCell)}>
      <span className={CMV_TABLE.headLabel}>{label}</span>
    </th>
  );
}

type TitleCellProps = {
  title: string;
  onClick: () => void;
  /** Ce qui suit le titre, sous lui : le badge d'une copie figée, par exemple. */
  children?: ReactNode;
};

/** Le titre, dont la zone cliquable couvre toute la ligne (`LIBRARY_ROW`). */
export function TitleCell({ title, onClick, children }: Readonly<TitleCellProps>) {
  return (
    <td className={CMV_TABLE.cell}>
      <button
        type="button"
        onClick={onClick}
        className="text-left text-cmv-body text-cmv-text-hi after:absolute after:inset-0"
      >
        {title}
      </button>
      {children}
    </td>
  );
}

/** Ce qu'une cellule dit quand sa valeur manque : vide, elle se lirait comme un oubli (règle dure n°5). */
export function NoValue() {
  return <span className="text-cmv-text-lo">—</span>;
}

export function TagsCell({ tags }: Readonly<{ tags: readonly string[] }>) {
  return (
    <td className={CMV_TABLE.cell}>
      {tags.length === 0 ? <NoValue /> : <CmvTagList tags={tags} />}
    </td>
  );
}
