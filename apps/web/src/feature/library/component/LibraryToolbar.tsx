import { LibraryScope } from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { tagFilterOptions, toggledTags } from "@/feature/library/util/tag-filter.util";
import { CmvSegmented, CmvTextField, CmvToggleChip } from "@/shared/component";

// i18n-values library.scope: LibraryScope

type LibraryFilterBarProps = {
  /** L'`id` du champ, aussi : deux barres sur une même page ne doivent pas le partager. */
  name: string;
  search: string;
  onSearch: (search: string) => void;
  searchPlaceholder: string;
  /** Les tags connus. Aucun : pas de filtre à un seul bouton « Tous », qui ne filtrerait rien. */
  tags: readonly string[];
  /** Les tags choisis, triés ; aucun = pas de filtre. */
  chosenTags: readonly string[];
  onChosenTags: (tags: readonly string[]) => void;
  /** Le filtre de provenance, au bout de la ligne ; rien pour qui n'a pas d'entreprise. */
  children?: ReactNode;
};

/**
 * La ligne de filtres de la bibliothèque : recherche à gauche, pastilles de tags, et la provenance
 * au bout. Partagée par les onglets (`LibraryToolbar`) et le sélecteur du builder de séance
 * (#653), qui s'y présentent de la même façon et ne diffèrent que par leur filtre de provenance.
 * Un tag choisi garde sa pastille même s'il sort des tags connus (`tagFilterOptions`) : c'est ici
 * que la règle vaut pour les trois listes.
 */
export function LibraryFilterBar({
  name,
  search,
  onSearch,
  searchPlaceholder,
  tags,
  chosenTags,
  onChosenTags,
  children,
}: Readonly<LibraryFilterBarProps>) {
  const { t } = useTranslation();
  const options = tagFilterOptions(tags, chosenTags);

  return (
    <div className="flex flex-wrap items-end justify-between gap-cmv-lg">
      <div className="w-full max-w-xs">
        <CmvTextField
          label={t("library.searchLabel")}
          name={name}
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>
      {options.length === 0 ? null : (
        // Plusieurs tags à la fois, qui élargissent (#654) : « Tous » vide le choix.
        <fieldset className="flex flex-wrap gap-cmv-xs">
          <legend className="sr-only">{t("library.filterTags")}</legend>
          <CmvToggleChip pressed={chosenTags.length === 0} onToggle={() => onChosenTags([])}>
            {t("library.filterAllTags")}
          </CmvToggleChip>
          {options.map((tag) => (
            <CmvToggleChip
              key={tag}
              pressed={chosenTags.includes(tag)}
              onToggle={() => onChosenTags(toggledTags(chosenTags, tag))}
            >
              {tag}
            </CmvToggleChip>
          ))}
        </fieldset>
      )}
      {children}
    </div>
  );
}

type LibraryToolbarProps = Omit<LibraryFilterBarProps, "name" | "children"> & {
  /** `null` = Coach sans entreprise : rien ne lui est partagé, le filtre n'a rien à filtrer. */
  scope: LibraryScope | null;
  onScope: (scope: LibraryScope) => void;
};

/**
 * La barre des deux onglets (maquette #597, frames 1 et 3), avec le filtre « Tous · Les miens ·
 * Partagés avec moi » pour qui a une entreprise.
 */
export function LibraryToolbar({ scope, onScope, ...bar }: Readonly<LibraryToolbarProps>) {
  const { t } = useTranslation();

  return (
    <LibraryFilterBar name="search" {...bar}>
      {scope == null ? null : (
        <CmvSegmented
          value={scope}
          onChange={onScope}
          options={Object.values(LibraryScope).map((value) => ({
            value,
            label: t(`library.scope.${value}`),
          }))}
        />
      )}
    </LibraryFilterBar>
  );
}
