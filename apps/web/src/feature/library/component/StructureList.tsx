import {
  STRUCTURE_PRESET_NAME_KEY,
  STRUCTURE_PRESETS,
  type StructureDto,
  type StructurePresetKey,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCopyOutline, IoTrashOutline } from "react-icons/io5";
import { LibraryEmptyState } from "@/feature/library/component/LibraryEmptyState";
import { LibraryListState, NO_ORGANIZATIONS } from "@/feature/library/component/LibraryListState";
import {
  HeadCell,
  LIBRARY_ROW,
  TagsCell,
  TitleCell,
} from "@/feature/library/component/LibraryTableCells";
import { LibraryFilterBar } from "@/feature/library/component/LibraryToolbar";
import { useStructureFlow } from "@/feature/library/hook/useStructureFlow";
import { useDeleteStructure, useStructureLibrary } from "@/feature/library/hook/useStructures";
import { type PresetRow, structureRows } from "@/feature/library/util/structure-rows.util";
import { CMV_TABLE, CmvButton, CmvConfirmButton, CmvEmptyState } from "@/shared/component";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

/** D'où part une structure dupliquée : une structure prête, ou l'une de celles du Coach. */
export type StructureSource = { preset: StructurePresetKey } | { structureId: string };

type StructureListProps = {
  onCreate: () => void;
  onEdit: (structure: StructureDto) => void;
  onDuplicate: (source: StructureSource) => void;
};

/**
 * L'onglet Structures (#717, maquette `coach_bibliotheque_structures`, frames 1, 1 bis et 5) : les
 * structures prêtes, puis celles du Coach. Comme les séances, recherche et tags se filtrent côté
 * client : `/structures` renvoie tout, en une lecture.
 *
 * Une structure prête ne s'ouvre pas — elle ne se modifie pas : elle se duplique. Celles du Coach
 * s'ouvrent par leur nom, et se dupliquent ou se suppriment depuis leur ligne.
 */
export function StructureList({ onCreate, onEdit, onDuplicate }: Readonly<StructureListProps>) {
  const { t } = useTranslation();
  const library = useStructureLibrary();
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<readonly string[]>([]);
  const filtered = search.trim() !== "" || tags.length > 0;

  function clearFilters() {
    setSearch("");
    setTags([]);
  }

  return (
    <>
      <LibraryFilterBar
        name="search"
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t("library.structure.search")}
        tags={(library.data?.structures ?? []).flatMap((structure) => structure.tags)}
        chosenTags={tags}
        onChosenTags={setTags}
      />
      <LibraryListState list={library} organizations={NO_ORGANIZATIONS}>
        {(loaded) => {
          const rows = structureRows(loaded, { search: search.trim(), tags }, (key) =>
            t(STRUCTURE_PRESET_NAME_KEY[key]),
          );
          if (filtered && rows.presets.length === 0 && rows.mine.length === 0) {
            // Rien ne se crée depuis une recherche vaine : le nom n'est pas tout d'une structure.
            // Filtrée, la liste n'est jamais « vide » : l'état dit toujours le filtre.
            return (
              <LibraryEmptyState
                search={search.trim()}
                tags={tags}
                sharedOnly={false}
                noMatch={t("library.structure.noMatch", { search: search.trim() })}
              >
                {null}
              </LibraryEmptyState>
            );
          }
          return (
            <div className="flex flex-col gap-cmv-xl">
              {rows.presets.length === 0 ? null : (
                <PresetTable rows={rows.presets} onDuplicate={onDuplicate} />
              )}
              <section className="flex flex-col gap-cmv-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-cmv-md">
                  <h2 className={CMV_TABLE.headLabel}>{t("library.structure.mine.title")}</h2>
                  {/* Pas de « Créer » ici : l'en-tête de la page le porte déjà, et l'état vide aussi. */}
                  {filtered ? (
                    <span className="text-cmv-caption text-cmv-text-mid">
                      {t("library.structure.mine.results", { count: rows.mine.length })}
                      {" · "}
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-cmv-text-hi underline-offset-2 hover:underline"
                      >
                        {t("library.structure.mine.clearFilter")}
                      </button>
                    </span>
                  ) : null}
                </div>
                {loaded.structures.length === 0 ? (
                  <CmvEmptyState
                    title={t("library.structure.empty.title")}
                    description={t("library.structure.empty.description")}
                    action={
                      <CmvButton onClick={onCreate}>{t("library.structure.create")}</CmvButton>
                    }
                  />
                ) : (
                  <MineTable rows={rows.mine} onEdit={onEdit} onDuplicate={onDuplicate} />
                )}
                {tags.length > 0 ? (
                  <p className="text-cmv-caption text-cmv-text-lo">
                    {t("library.structure.presets.noTags")}
                  </p>
                ) : null}
              </section>
            </div>
          );
        }}
      </LibraryListState>
      <p className="text-cmv-caption text-cmv-text-lo">{t("library.structure.footer")}</p>
    </>
  );
}

function PresetTable({
  rows,
  onDuplicate,
}: Readonly<{ rows: PresetRow[]; onDuplicate: (source: StructureSource) => void }>) {
  const { t } = useTranslation();
  const flow = useStructureFlow();
  return (
    <section className="flex flex-col gap-cmv-sm">
      <div className="flex flex-wrap items-baseline gap-cmv-md">
        <h2 className={CMV_TABLE.headLabel}>{t("library.structure.presets.title")}</h2>
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("library.structure.presets.hint")}
        </span>
      </div>
      <div className={CMV_TABLE.frame}>
        <table className={CMV_TABLE.table}>
          <thead className={cn(CMV_TABLE.head, CMV_TABLE.headBorder)}>
            <tr>
              <HeadCell label={t("library.structure.table.name")} />
              <HeadCell label={t("library.structure.table.flow")} />
              <HeadCell label={t("library.structure.table.sessions")} />
              <th className={CMV_TABLE.headCell}>
                <span className="sr-only">{t("library.structure.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name = t(STRUCTURE_PRESET_NAME_KEY[row.key]);
              return (
                <tr key={row.key} className={CMV_TABLE.row}>
                  <td className={cn(CMV_TABLE.cell, "text-cmv-body text-cmv-text-hi")}>{name}</td>
                  <td className={cn(CMV_TABLE.cell, "text-cmv-caption text-cmv-text-mid")}>
                    {flow(STRUCTURE_PRESETS[row.key])}
                  </td>
                  <td className={cn(CMV_TABLE.cell, "text-cmv-text-mid tabular-nums")}>
                    {row.sessionCount}
                  </td>
                  <td className={cn(CMV_TABLE.cell, "text-right")}>
                    {/* Toujours visible, quand la maquette l'attend au survol : une tablette ne survole
                        pas, et ce bouton est le seul geste d'une structure prête (#717). */}
                    <CmvButton
                      variant="secondary"
                      title={t("library.structure.duplicateNamed", { name })}
                      onClick={() => onDuplicate({ preset: row.key })}
                    >
                      {t("library.structure.duplicate")}
                    </CmvButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-cmv-caption text-cmv-text-lo">{t("library.structure.presets.single")}</p>
    </section>
  );
}

type MineTableProps = {
  rows: StructureDto[];
  onEdit: (structure: StructureDto) => void;
  onDuplicate: (source: StructureSource) => void;
};

function MineTable({ rows, onEdit, onDuplicate }: Readonly<MineTableProps>) {
  const { t } = useTranslation();
  const flow = useStructureFlow();
  const remove = useDeleteStructure();
  const { onError } = useMutationToast();

  return (
    <div className={CMV_TABLE.frame}>
      <table className={CMV_TABLE.table}>
        <thead className={cn(CMV_TABLE.head, rows.length > 0 && CMV_TABLE.headBorder)}>
          <tr>
            <HeadCell label={t("library.structure.table.name")} />
            <HeadCell label={t("library.structure.table.flow")} />
            <HeadCell label={t("library.table.tags")} />
            <HeadCell label={t("library.structure.table.sessions")} />
            <HeadCell label={t("library.structure.table.updatedAt")} />
            <th className={CMV_TABLE.headCell}>
              <span className="sr-only">{t("library.structure.table.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((structure) => (
            <tr key={structure.id} className={LIBRARY_ROW}>
              <TitleCell title={structure.name} onClick={() => onEdit(structure)}>
                {structure.note == null || structure.note === "" ? null : (
                  <p className="max-w-xs truncate text-cmv-caption text-cmv-text-lo">
                    {structure.note}
                  </p>
                )}
              </TitleCell>
              <td className={cn(CMV_TABLE.cell, "text-cmv-caption text-cmv-text-mid")}>
                {flow(structure.settings)}
              </td>
              <TagsCell tags={structure.tags} />
              <td className={cn(CMV_TABLE.cell, "text-cmv-text-mid tabular-nums")}>
                {structure.sessionCount}
              </td>
              <td className={cn(CMV_TABLE.cell, "whitespace-nowrap text-cmv-text-mid")}>
                {formatInstantDate(structure.updatedAt)}
              </td>
              <td className={CMV_TABLE.cell}>
                {/* Au-dessus de la zone cliquable du nom, qui couvre la ligne. */}
                <div className="relative z-10 flex justify-end gap-cmv-xs">
                  <CmvButton
                    variant="ghost"
                    title={t("library.structure.duplicateNamed", { name: structure.name })}
                    onClick={() => onDuplicate({ structureId: structure.id })}
                  >
                    <IoCopyOutline aria-hidden />
                  </CmvButton>
                  <CmvConfirmButton
                    label={t("library.structure.deleteNamed", { name: structure.name })}
                    icon={<IoTrashOutline aria-hidden />}
                    confirmLabel={t("common.confirmDelete")}
                    cancelLabel={t("common.cancel")}
                    confirmHint={keptCopiesHint(structure, t)}
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(structure, { onError })}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ce que la suppression engage : rien pour les séances, qui gardent leur copie (frame 4). Le dire
 * n'a de sens que si des séances l'emploient.
 */
export function keptCopiesHint(
  structure: Pick<StructureDto, "sessionCount">,
  t: TFunction,
): string | undefined {
  if (structure.sessionCount === 0) return undefined;
  return t("library.structure.deleteKeepsCopies", { count: structure.sessionCount });
}
