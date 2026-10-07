import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CMV_TABLE } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values company.columns: name, email, since, coaches, sentOn, expiresOn

/** Une colonne des tableaux de l'espace Entreprise — l'intitulé vit sous `company.columns`. */
export type CompanyColumn = "name" | "email" | "since" | "coaches" | "sentOn" | "expiresOn";

/** Une ligne de tableau : la grille vient de l'appelant, partagée avec l'en-tête. */
export const COMPANY_ROW = cn(CMV_TABLE.row, "px-cmv-lg py-cmv-md");

type CompanyTableProps = {
  grid: string;
  columns: readonly CompanyColumn[];
  /** Ce que dit le tableau sans ligne — absent là où il n'est rendu qu'avec des lignes. */
  empty?: string;
  /** Une dernière colonne sans intitulé : le geste se lit sur son bouton. */
  withAction?: boolean;
  children: ReactNode[];
};

/**
 * Les tableaux des pages Coachs (#601) et Athlètes (#602) : même cadre, même en-tête, même ligne
 * vide. Chaque page n'apporte que sa grille et ses cellules.
 */
export function CompanyTable({
  grid,
  columns,
  empty = "",
  withAction = false,
  children,
}: Readonly<CompanyTableProps>) {
  const { t } = useTranslation();
  const hasRows = children.length > 0;

  return (
    <div className={cn(CMV_TABLE.frame, "overflow-x-auto bg-cmv-surface")}>
      <div className="min-w-[36rem]">
        <div
          className={cn(
            grid,
            CMV_TABLE.head,
            hasRows && CMV_TABLE.headBorder,
            "px-cmv-lg py-cmv-sm",
          )}
        >
          {columns.map((column) => (
            <span key={column} className={CMV_TABLE.headLabel}>
              {t(`company.columns.${column}`)}
            </span>
          ))}
          {withAction ? <span /> : null}
        </div>
        {hasRows ? (
          children
        ) : (
          <p className="px-cmv-lg py-cmv-md text-cmv-caption text-cmv-text-lo">{empty}</p>
        )}
      </div>
    </div>
  );
}

/** Une section titrée et comptée, sous le tableau des membres. */
export function CompanySection({
  title,
  count,
  children,
}: Readonly<{ title: string; count: number; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-cmv-sm">
      <h2 className="flex items-center gap-cmv-sm text-cmv-subtitle text-cmv-text-hi">
        {title}
        <span className="text-cmv-caption text-cmv-text-lo">{count}</span>
      </h2>
      {children}
    </section>
  );
}
