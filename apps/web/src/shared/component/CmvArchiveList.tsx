import { type ReactNode, useId, useState } from "react";
import { IoChevronDown, IoChevronForward } from "react-icons/io5";
import { cn } from "@/shared/util/cn.util";
import { CmvAvatar } from "./CmvAvatar";
import { CMV_TABLE } from "./table.style";

export type CmvArchiveItem = {
  id: string;
  name: string;
  /** Ce que l'archive dit de la ligne, déjà traduit : « Suivi terminé le 20 nov. 2026 ». */
  detail: string;
  /** Ce qui se fait encore de la ligne : relire, jamais écrire. */
  actions: ReactNode;
};

type CmvArchiveListProps = {
  /** L'intitulé du repli, compte compris : « Suivis terminés (2) ». */
  title: string;
  items: readonly CmvArchiveItem[];
};

/**
 * Les suivis terminés (#909, #910), rangés sous ceux en cours : une archive à relire, repliée par
 * défaut. Elle ne disparaît pas — l'historique du couple reste à chacun (tranché en #213) — mais
 * ne prend pas la place du travail en cours, qu'on ouvre l'écran pour faire.
 *
 * Rien sans ligne : une archive vide n'a rien à annoncer.
 */
export function CmvArchiveList({ title, items }: Readonly<CmvArchiveListProps>) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-cmv-sm">
      <button
        type="button"
        aria-expanded={open}
        // Repliée, la liste n'est pas rendue : l'attribut désignerait un id absent du DOM.
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-cmv-xs self-start text-cmv-caption text-cmv-text-mid uppercase tracking-wide hover:text-cmv-text-hi"
      >
        {open ? <IoChevronDown aria-hidden /> : <IoChevronForward aria-hidden />}
        {title}
      </button>

      {open ? (
        <ul id={listId} className={cn(CMV_TABLE.frame, "bg-cmv-surface")}>
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                CMV_TABLE.row,
                "flex flex-wrap items-center gap-cmv-md px-cmv-lg py-cmv-md",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-cmv-sm">
                <CmvAvatar name={item.name} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-cmv-text-mid">{item.name}</span>
                  <span className="text-cmv-caption text-cmv-text-lo">{item.detail}</span>
                </span>
              </span>
              <span className="flex items-center gap-cmv-sm">{item.actions}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
