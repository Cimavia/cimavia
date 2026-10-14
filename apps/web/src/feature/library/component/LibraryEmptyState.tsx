import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NO_TAG_FILTER } from "@/feature/library/constant";
import { libraryEmpty } from "@/feature/library/util/library-empty.util";
import { CmvEmptyState } from "@/shared/component";

type LibraryEmptyStateProps = {
  /** La recherche, rognée. */
  search: string;
  tag: string;
  sharedOnly: boolean;
  /** Ce que dit la recherche vaine. */
  noMatch: string;
  /** Ce qui crée l'élément cherché — absent quand la liste ne crée rien depuis une recherche. */
  create?: ReactNode;
  /** Ce que disent les seuls partagés, vides. */
  sharedEmpty: string;
  /** La bibliothèque vide, propre à chaque liste. */
  children: ReactNode;
};

/**
 * Une liste de la bibliothèque qui n'a rien à montrer — onglet ou sélecteur —, selon UNE règle
 * (`libraryEmpty`) : chaque liste n'apporte que ses mots.
 */
export function LibraryEmptyState({
  search,
  tag,
  sharedOnly,
  noMatch,
  create,
  sharedEmpty,
  children,
}: Readonly<LibraryEmptyStateProps>) {
  const { t } = useTranslation();
  const empty = libraryEmpty({ search, tagged: tag !== NO_TAG_FILTER, sharedOnly });
  if (empty.kind === "noMatch") {
    return <CmvEmptyState title={noMatch} action={empty.canCreate ? create : undefined} />;
  }
  if (empty.kind === "noFilterMatch") return <CmvEmptyState title={t("library.noFilterMatch")} />;
  if (empty.kind === "sharedEmpty") return <CmvEmptyState title={sharedEmpty} />;
  return children;
}
