import { LibraryScope } from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NO_TAG_FILTER } from "@/feature/library/constant";
import { CmvChoiceChips, CmvSegmented, CmvTextField } from "@/shared/component";

// i18n-values library.scope: LibraryScope

type LibraryFilterBarProps = {
  /** L'`id` du champ, aussi : deux barres sur une même page ne doivent pas le partager. */
  name: string;
  search: string;
  onSearch: (search: string) => void;
  searchPlaceholder: string;
  /** Les tags proposés. Aucun : pas de filtre à un seul bouton « Tous », qui ne filtrerait rien. */
  tags: readonly string[];
  tag: string;
  onTag: (tag: string) => void;
  /** Le filtre de provenance, au bout de la ligne ; rien pour qui n'a pas d'entreprise. */
  children?: ReactNode;
};

/**
 * La ligne de filtres de la bibliothèque : recherche à gauche, pastilles de tags, et la provenance
 * au bout. Partagée par les onglets (`LibraryToolbar`) et le sélecteur du builder de séance
 * (#653), qui s'y présentent de la même façon et ne diffèrent que par leur filtre de provenance.
 */
export function LibraryFilterBar({
  name,
  search,
  onSearch,
  searchPlaceholder,
  tags,
  tag,
  onTag,
  children,
}: Readonly<LibraryFilterBarProps>) {
  const { t } = useTranslation();

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
      {tags.length === 0 ? null : (
        <CmvChoiceChips
          value={tag}
          onChange={onTag}
          options={[
            { value: NO_TAG_FILTER, label: t("library.filterAllTags") },
            ...tags.map((tagName) => ({ value: tagName, label: tagName })),
          ]}
        />
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
