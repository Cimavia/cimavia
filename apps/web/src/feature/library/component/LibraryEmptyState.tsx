import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { libraryEmpty } from "@/feature/library/util/library-empty.util";
import { CmvEmptyState } from "@/shared/component";

/**
 * La portée : les seuls partagés, avec ce qu'ils disent quand ils sont vides — ou une liste qui ne
 * se partage pas (les structures, #717), qui n'a rien à en dire.
 */
type Scope =
  | { sharedOnly: true; sharedEmpty: string }
  | { sharedOnly: false; sharedEmpty?: string };

type LibraryEmptyStateProps = Scope & {
  /** La recherche, rognée. */
  search: string;
  /** Les tags choisis ; aucun = pas de filtre. */
  tags: readonly string[];
  /** Ce que dit la recherche vaine. */
  noMatch: string;
  /** Ce qui crée l'élément cherché — absent quand la liste ne crée rien depuis une recherche. */
  create?: ReactNode;
  /** La bibliothèque vide, propre à chaque liste. */
  children: ReactNode;
};

/**
 * Une liste de la bibliothèque qui n'a rien à montrer — onglet ou sélecteur —, selon UNE règle
 * (`libraryEmpty`) : chaque liste n'apporte que ses mots.
 */
export function LibraryEmptyState(props: Readonly<LibraryEmptyStateProps>) {
  const { search, tags, noMatch, create, children } = props;
  const { t } = useTranslation();
  const empty = libraryEmpty({ search, tagged: tags.length > 0, sharedOnly: props.sharedOnly });
  if (empty.kind === "noMatch") {
    return <CmvEmptyState title={noMatch} action={empty.canCreate ? create : undefined} />;
  }
  if (empty.kind === "noFilterMatch") return <CmvEmptyState title={t("library.noFilterMatch")} />;
  if (empty.kind === "sharedEmpty" && props.sharedOnly) {
    return <CmvEmptyState title={props.sharedEmpty} />;
  }
  return children;
}
