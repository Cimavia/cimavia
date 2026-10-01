import type { Page } from "@cmv/shared";
import { CmvButton } from "./CmvButton";

type CmvPagerProps = {
  /** La page rendue, telle que `pageOf` la découpe — bornée, donc toujours affichable. */
  page: Page<unknown>;
  /** « 6–10 sur 14 factures » : le nom de ce qu'on compte appartient à la table, pas au pied. */
  rangeLabel: string;
  onPage: (page: number) => void;
};

/**
 * Le pied d'une table paginée : la plage affichée, et un bouton par page.
 *
 * Commun aux historiques de factures et de cycles (#505), qui l'écrivaient chacun au mot près.
 * Seul le pied se partage : les colonnes, l'ordre et le clic d'une ligne restent à chaque table,
 * qui n'ont pas le même contrat (une facture ouvre un panneau, un cycle son constructeur).
 *
 * Une seule page : ni compteur ni boutons. Une pagination qui ne pagine rien est du bruit.
 */
export function CmvPager({ page, rangeLabel, onPage }: Readonly<CmvPagerProps>) {
  if (page.pageCount <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-cmv-sm border-cmv-border border-t px-cmv-md py-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-lo">{rangeLabel}</span>
      <div className="flex items-center gap-cmv-xs">
        {Array.from({ length: page.pageCount }, (_, index) => index + 1).map((number) => (
          <CmvButton
            key={number}
            variant={number === page.page ? "secondary" : "ghost"}
            onClick={() => onPage(number)}
          >
            {String(number)}
          </CmvButton>
        ))}
      </div>
    </div>
  );
}
