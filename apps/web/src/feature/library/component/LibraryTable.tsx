import {
  ACCESS_MAX_TARGETS,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type ElementAccessDto,
  isOwner,
} from "@cmv/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AccessElement, AccessPanel } from "@/feature/library/component/AccessPanel";
import { accessText, ownerText } from "@/feature/library/util/access-text.util";
import { CMV_TABLE, CmvButton, CmvTagList } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

/** Une ligne de la bibliothèque : un exercice, ou une séance et les tags de ses exercices. */
export type LibraryTableRow = AccessElement & {
  tags: readonly string[];
  updatedAt: string;
};

type LibraryTableProps<T extends LibraryTableRow> = {
  rows: readonly T[];
  /**
   * Les entreprises du Coach. Vide, rien du partage ne s'affiche : ni propriétaire, ni accès, ni
   * cases à cocher (frame 14, tranché en #597).
   */
  organizations: readonly CoachOrganizationDto[];
  /** `library.access.exercise` ou `library.access.session`, passé en dur (cf. `AccessPanel`). */
  copyPrefix: string;
  mutation: UseMutationResult<ElementAccessDto[], Error, ChangeAccessInput>;
  onOpen: (row: T) => void;
  /** La colonne propre à l'onglet, avant la date : le nombre d'exercices d'une séance. */
  extra?: { label: string; cell: (row: T) => ReactNode };
};

/**
 * Le tableau des deux onglets de la bibliothèque (#606, maquette #597, frames 1 à 3 et 14).
 *
 * Une ligne s'ouvre par son titre, dont la zone cliquable couvre toute la ligne ; la case et la
 * cellule Accès passent par-dessus. Seuls les éléments du Coach se cochent : gérer les accès reste
 * au propriétaire. La sélection et le panneau vivent ici, pour que les deux onglets se comportent
 * de la même façon — l'appelant remonte le tableau (`key`) quand la liste change de portée.
 */
export function LibraryTable<T extends LibraryTableRow>({
  rows,
  organizations,
  copyPrefix,
  mutation,
  onOpen,
  extra,
}: Readonly<LibraryTableProps<T>>) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Les lignes du panneau, figées à l'ouverture : une relecture en fond qui en retirerait une ne
  // doit pas changer, sous les yeux du Coach, ce qu'il s'apprête à enregistrer.
  const [panel, setPanel] = useState<readonly T[] | null>(null);

  const sharing = organizations.length > 0;
  const mine = rows.filter(manageable);
  // La sélection ne survit qu'à travers ce qui est affiché : une ligne sortie de la liste (filtre,
  // suppression) ne doit pas partir dans un changement d'accès qu'on ne voit plus.
  const chosen = mine.filter((row) => selected.has(row.id));
  const allChosen = mine.length > 0 && chosen.length === mine.length;
  // Au-delà, l'API refuse le changement (`changeAccessSchema`) : le dire avant, pas après.
  const tooMany = chosen.length > ACCESS_MAX_TARGETS;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-cmv-md">
      {chosen.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-cmv-md rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm">
          <span className="flex-1 text-cmv-body text-cmv-text-hi">
            {t(`${copyPrefix}.selected`, { count: chosen.length })}
          </span>
          {tooMany ? (
            <span className="text-cmv-caption text-cmv-text-mid">
              {t("library.table.tooMany", { max: ACCESS_MAX_TARGETS })}
            </span>
          ) : null}
          <CmvButton variant="ghost" onClick={() => setSelected(new Set())}>
            {t("library.table.clearSelection")}
          </CmvButton>
          <CmvButton onClick={() => setPanel(chosen)} disabled={tooMany}>
            {t("library.table.editAccess", { count: chosen.length })}
          </CmvButton>
        </div>
      )}

      <div className={CMV_TABLE.frame}>
        <table className={CMV_TABLE.table}>
          <thead className={cn(CMV_TABLE.head, rows.length > 0 && CMV_TABLE.headBorder)}>
            <tr>
              {sharing ? (
                <th className={cn(CMV_TABLE.headCell, "w-10")}>
                  <input
                    type="checkbox"
                    aria-label={t("library.table.selectAll")}
                    checked={allChosen}
                    disabled={mine.length === 0}
                    ref={(input) => {
                      if (input != null) input.indeterminate = chosen.length > 0 && !allChosen;
                    }}
                    onChange={() =>
                      setSelected(new Set(allChosen ? [] : mine.map((row) => row.id)))
                    }
                  />
                </th>
              ) : null}
              <HeadCell label={t("library.table.title")} />
              <HeadCell label={t("library.table.tags")} />
              {sharing ? <HeadCell label={t("library.table.owner")} /> : null}
              {sharing ? <HeadCell label={t("library.table.access")} /> : null}
              {extra == null ? null : <HeadCell label={extra.label} />}
              <HeadCell label={t("library.table.updatedAt")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(CMV_TABLE.row, "relative transition-colors hover:bg-cmv-surface")}
              >
                {sharing ? (
                  <td className={CMV_TABLE.cell}>
                    {/* Au-dessus de la zone cliquable du titre, qui couvre la ligne. */}
                    <input
                      type="checkbox"
                      className="relative z-10"
                      aria-label={t("library.table.select", { title: row.title })}
                      checked={selected.has(row.id)}
                      disabled={!manageable(row)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                ) : null}
                <td className={CMV_TABLE.cell}>
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="text-left text-cmv-body text-cmv-text-hi after:absolute after:inset-0"
                  >
                    {row.title}
                  </button>
                </td>
                <td className={CMV_TABLE.cell}>
                  {row.tags.length === 0 ? (
                    <span className="text-cmv-text-lo">—</span>
                  ) : (
                    <CmvTagList tags={row.tags} />
                  )}
                </td>
                {sharing ? (
                  <td className={cn(CMV_TABLE.cell, "text-cmv-text-mid")}>{ownerText(row, t)}</td>
                ) : null}
                {sharing ? (
                  <td className={CMV_TABLE.cell}>
                    {isMissingGrants(row) ? (
                      // Des droits absents ne s'ouvrent pas : le panneau les prendrait pour
                      // « Aucun » et écrirait des retraits que personne n'a demandés.
                      <span className="text-cmv-text-lo">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPanel([row])}
                        className="relative z-10 text-left text-cmv-caption text-cmv-text-mid underline-offset-2 hover:text-cmv-text-hi hover:underline"
                      >
                        {accessText(row, t)}
                      </button>
                    )}
                  </td>
                ) : null}
                {extra == null ? null : (
                  <td className={cn(CMV_TABLE.cell, "text-cmv-text-mid tabular-nums")}>
                    {extra.cell(row)}
                  </td>
                )}
                <td className={cn(CMV_TABLE.cell, "whitespace-nowrap text-cmv-text-mid")}>
                  {formatInstantDate(row.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Monté à chaque ouverture : le panneau naît des droits qu'il règle, et repart de zéro. */}
      {panel == null ? null : (
        <AccessPanel
          elements={panel}
          organizations={organizations}
          copyPrefix={copyPrefix}
          mutation={mutation}
          onClose={() => setPanel(null)}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

/** Le propriétaire reçoit toujours ses droits (#605) : leur absence est une réponse incomplète. */
function isMissingGrants(row: LibraryTableRow) {
  return isOwner(row.myAccess) && row.grants == null;
}

/** Ce dont le Coach peut régler les accès : le sien, droits connus. */
function manageable(row: LibraryTableRow) {
  return isOwner(row.myAccess) && row.grants != null;
}

function HeadCell({ label }: Readonly<{ label: string }>) {
  return (
    <th className={CMV_TABLE.headCell}>
      <span className={CMV_TABLE.headLabel}>{label}</span>
    </th>
  );
}
