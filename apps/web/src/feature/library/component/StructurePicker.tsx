import {
  type CopiedStructure,
  presetSource,
  STRUCTURE_PRESET_NAME_KEY,
  STRUCTURE_PRESETS,
  type StructureLibraryDto,
  type StructureSettings,
  structureSource,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryListState, NO_ORGANIZATIONS } from "@/feature/library/component/LibraryListState";
import { LibraryFilterBar } from "@/feature/library/component/LibraryToolbar";
import { useStructureFlow } from "@/feature/library/hook/useStructureFlow";
import { useStructureLibrary } from "@/feature/library/hook/useStructures";
import { structureRows } from "@/feature/library/util/structure-rows.util";
import { CMV_TABLE, CmvEmptyState, CmvPanel } from "@/shared/component";

type StructurePickerProps = {
  open: boolean;
  /** « Ajouter un bloc », ou « Changer la structure du bloc A ». */
  title: string;
  description?: string | undefined;
  onPick: (source: CopiedStructure) => void;
  onClose: () => void;
};

/**
 * Le choix d'une structure (#719, maquette `coach_constructeur_seance_v2`, frame 2 ter) : les
 * structures prêtes, puis celles du Coach, filtrées comme l'onglet Structures. Une ligne se choisit
 * d'un clic : le bloc copie la structure, sans lien vivant.
 */
export function StructurePicker({
  open,
  title,
  description,
  onPick,
  onClose,
}: Readonly<StructurePickerProps>) {
  const { t } = useTranslation();
  const library = useStructureLibrary();
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<readonly string[]>([]);

  function pick(source: CopiedStructure) {
    onPick(source);
    onClose();
  }

  return (
    <CmvPanel open={open} title={title} description={description} onClose={onClose}>
      <div className="flex flex-col gap-cmv-lg">
        <LibraryFilterBar
          name="structure-search"
          search={search}
          onSearch={setSearch}
          searchPlaceholder={t("library.structure.search")}
          tags={(library.data?.structures ?? []).flatMap((structure) => structure.tags)}
          chosenTags={tags}
          onChosenTags={setTags}
        />
        <LibraryListState list={library} organizations={NO_ORGANIZATIONS}>
          {(loaded) => (
            <StructureChoices library={loaded} search={search.trim()} tags={tags} onPick={pick} />
          )}
        </LibraryListState>
      </div>
    </CmvPanel>
  );
}

type StructureChoicesProps = {
  library: StructureLibraryDto;
  search: string;
  tags: readonly string[];
  onPick: (source: CopiedStructure) => void;
};

function StructureChoices({ library, search, tags, onPick }: Readonly<StructureChoicesProps>) {
  const { t } = useTranslation();
  const presetName = (key: keyof typeof STRUCTURE_PRESETS) => t(STRUCTURE_PRESET_NAME_KEY[key]);
  const rows = structureRows(library, { search, tags }, presetName);
  if (rows.presets.length === 0 && rows.mine.length === 0) {
    return <CmvEmptyState title={t("library.session.blocks.noStructure")} />;
  }
  return (
    <div className="flex flex-col gap-cmv-lg">
      {rows.presets.length === 0 ? null : (
        <ChoiceGroup
          title={t("library.structure.presets.title")}
          choices={rows.presets.map((row) => ({
            id: row.key,
            name: presetName(row.key),
            settings: STRUCTURE_PRESETS[row.key],
            source: presetSource(row.key, presetName(row.key)),
          }))}
          onPick={onPick}
        />
      )}
      {rows.mine.length === 0 ? null : (
        <ChoiceGroup
          title={t("library.structure.mine.title")}
          choices={rows.mine.map((structure) => ({
            id: structure.id,
            name: structure.name,
            settings: structure.settings,
            source: structureSource(structure),
          }))}
          onPick={onPick}
        />
      )}
    </div>
  );
}

type Choice = { id: string; name: string; settings: StructureSettings; source: CopiedStructure };

function ChoiceGroup({
  title,
  choices,
  onPick,
}: Readonly<{ title: string; choices: Choice[]; onPick: (source: CopiedStructure) => void }>) {
  const flow = useStructureFlow();
  return (
    <section className="flex flex-col gap-cmv-xs">
      <h3 className={CMV_TABLE.headLabel}>{title}</h3>
      <ul className="flex flex-col gap-cmv-xs">
        {choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              onClick={() => onPick(choice.source)}
              className="flex w-full flex-col items-start rounded-cmv-md border border-cmv-border bg-cmv-bg-1 px-cmv-md py-cmv-sm text-left hover:border-cmv-accent focus:border-cmv-accent focus:outline-none"
            >
              <span className="text-cmv-body text-cmv-text-hi">{choice.name}</span>
              <span className="text-cmv-caption text-cmv-text-mid">{flow(choice.settings)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
