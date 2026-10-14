import { LibraryScope } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { NO_TAG_FILTER } from "@/feature/library/constant";
import { CmvChoiceChips, CmvSegmented, CmvTextField } from "@/shared/component";

// i18n-values library.scope: LibraryScope

type LibraryToolbarProps = {
  search: string;
  onSearch: (search: string) => void;
  searchPlaceholder: string;
  /** Les tags proposés. Aucun : pas de filtre à un seul bouton « Tous », qui ne filtrerait rien. */
  tags: readonly string[];
  tag: string;
  onTag: (tag: string) => void;
  /** `null` = Coach sans entreprise : rien ne lui est partagé, le filtre n'a rien à filtrer. */
  scope: LibraryScope | null;
  onScope: (scope: LibraryScope) => void;
};

/**
 * La barre des deux onglets (maquette #597, frames 1 et 3) : recherche à gauche, pastilles de
 * tags, et le filtre « Tous · Les miens · Partagés avec moi » pour qui a une entreprise.
 */
export function LibraryToolbar({
  search,
  onSearch,
  searchPlaceholder,
  tags,
  tag,
  onTag,
  scope,
  onScope,
}: Readonly<LibraryToolbarProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-end justify-between gap-cmv-lg">
      <div className="w-full max-w-xs">
        <CmvTextField
          label={t("library.searchLabel")}
          name="search"
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
            ...tags.map((name) => ({ value: name, label: name })),
          ]}
        />
      )}
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
    </div>
  );
}
