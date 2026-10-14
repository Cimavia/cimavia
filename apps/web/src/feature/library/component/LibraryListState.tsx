import type { CoachOrganizationDto } from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CmvErrorState } from "@/shared/component";

type Loaded<T> = { data: T | undefined; isError: boolean; refetch: () => unknown };

type LibraryListStateProps<T> = {
  list: Loaded<T>;
  organizations: Loaded<CoachOrganizationDto[]>;
  children: (list: T, organizations: CoachOrganizationDto[]) => ReactNode;
};

/**
 * Ce qu'un onglet de la bibliothèque montre avant sa liste. Les entreprises comptent autant que la
 * liste : sans elles, on ne sait pas s'il faut les colonnes du partage. Une PREMIÈRE lecture ratée
 * n'est pas « aucune entreprise » (règle dure n°5) — elle se dit en erreur, et seule elle se relit.
 *
 * Sur la DONNÉE, pas sur l'état de la requête : une relecture de fond qui échoue (retour sur
 * l'onglet, invalidation après un changement d'accès) garde la liste en cache, et l'effacer
 * démonterait le tableau — sa sélection et le panneau des accès avec. Elle se retente au
 * prochain retour sur l'onglet, comme celle des constructeurs.
 */
export function LibraryListState<T>({
  list,
  organizations,
  children,
}: Readonly<LibraryListStateProps<T>>) {
  const { t } = useTranslation();

  if (list.data != null && organizations.data != null) {
    return children(list.data, organizations.data);
  }
  if (list.isError || organizations.isError) {
    return (
      <CmvErrorState
        title={t("common.errorTitle")}
        description={t("common.errorDescription")}
        retryLabel={t("common.retry")}
        onRetry={() => {
          if (list.isError) list.refetch();
          if (organizations.isError) organizations.refetch();
        }}
      />
    );
  }
  return <p className="text-cmv-text-mid">{t("common.loading")}</p>;
}
