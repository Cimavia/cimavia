import {
  INVOICE_SITUATION_STATE,
  INVOICE_STATE_BADGE,
  type InvoiceAthleteRow,
  type InvoiceDto,
  type InvoiceRowSubtitle,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { InvoiceHistoryTable } from "@/feature/invoice/component/InvoiceHistoryTable";
import { CMV_TABLE, CmvAvatar, CmvBadge } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney } from "@/shared/util/money.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values invoice.table.columns: ATHLETE_COLUMNS
// i18n-values invoice.situation: INVOICE_SITUATIONS
// i18n-values invoice.rowSubtitle: OVERDUE_SINCE, NEXT_DUE, LAST_PAID

/**
 * La facturation du coach, une ligne par athlète facturé (#120, maquette frame 1).
 *
 * Ce que la reprise change vraiment : on ne lit plus des factures, on lit des ATHLÈTES. Le coach
 * ne se demande pas « quelles factures sont en retard » mais « qui me doit quelque chose » — la
 * liste plate lui laissait recomposer de tête qu'un même athlète en avait trois.
 *
 * Chaque ligne se déplie sur son historique. UN SEUL à la fois : la question posée à cet écran est
 * « qui », et déplier tout le monde la reposerait à zéro.
 */

const ATHLETE_COLUMNS = ["athlete", "situation", "amountDue"] as const;

/** L'en-tête et les lignes partagent leur grille — sinon les intitulés se décalent du contenu. */
const GRID = "grid grid-cols-[2.5fr_1.5fr_1fr_auto] items-center gap-cmv-lg";

type InvoiceAthleteTableProps = {
  rows: readonly InvoiceAthleteRow<InvoiceDto>[];
  /** `null` = tout est replié. */
  expandedAthleteId: string | null;
  onToggle: (athleteId: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
};

export function InvoiceAthleteTable({
  rows,
  expandedAthleteId,
  onToggle,
  onOpenInvoice,
}: Readonly<InvoiceAthleteTableProps>) {
  const { t } = useTranslation();

  return (
    <div className={cn(CMV_TABLE.frame, "overflow-x-auto bg-cmv-surface")}>
      <div className="min-w-[44rem]">
        <div className={cn(GRID, CMV_TABLE.head, CMV_TABLE.headBorder, "px-cmv-lg py-cmv-sm")}>
          {ATHLETE_COLUMNS.map((column) => (
            <span key={column} className={CMV_TABLE.headLabel}>
              {t(`invoice.table.columns.${column}`)}
            </span>
          ))}
          {/* La colonne du chevron n'a pas d'intitulé : « déplier » se lit au symbole. */}
          <span />
        </div>

        {rows.map((row) => (
          <AthleteRow
            key={row.athleteId}
            row={row}
            expanded={row.athleteId === expandedAthleteId}
            onToggle={() => onToggle(row.athleteId)}
            onOpenInvoice={onOpenInvoice}
          />
        ))}
      </div>
    </div>
  );
}

type AthleteRowProps = {
  row: InvoiceAthleteRow<InvoiceDto>;
  expanded: boolean;
  onToggle: () => void;
  onOpenInvoice: (invoiceId: string) => void;
};

function AthleteRow({ row, expanded, onToggle, onOpenInvoice }: Readonly<AthleteRowProps>) {
  const { t } = useTranslation();
  // « (moi) » se déduit de la session : un compte auto-coaché apparaît dans sa propre facturation.
  const athleteLabel = useAthleteLabel();
  const isOverdue = row.situation === "OVERDUE";

  return (
    <div className={CMV_TABLE.row}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          GRID,
          "w-full px-cmv-lg py-cmv-md text-left transition-colors hover:bg-cmv-surface-hi",
        )}
      >
        <span className="flex items-center gap-cmv-sm">
          <CmvAvatar name={row.athleteName} />
          <span className="flex flex-col">
            <span className="text-cmv-text-hi">{athleteLabel(row.athleteId, row.athleteName)}</span>
            <Subtitle subtitle={row.subtitle} />
          </span>
        </span>

        <span>
          <CmvBadge variant={INVOICE_STATE_BADGE[INVOICE_SITUATION_STATE[row.situation]].variant}>
            {t(`invoice.situation.${row.situation}`, { n: row.count })}
          </CmvBadge>
        </span>

        {/* Rien de dû se rend « — », jamais « 0 € » : un zéro se lit comme un montant, et il n'y
            en a pas. La teinte suit la SITUATION et non le nombre de factures — même règle que les
            pastilles, décidée sur la maquette. */}
        <span
          className={cn("font-cmv-display", isOverdue ? "text-cmv-error-on" : "text-cmv-text-hi")}
        >
          {row.amountDueCents == null
            ? "—"
            : formatMoney(row.amountDueCents, row.invoices[0]?.currency ?? "EUR")}
        </span>

        <span aria-hidden className="text-cmv-text-lo">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div className="px-cmv-lg pb-cmv-md">
          <InvoiceHistoryTable invoices={row.invoices} onOpenInvoice={onOpenInvoice} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Le sous-titre d'une ligne. `@cmv/shared` rend un MOTIF et sa donnée ; c'est ici que le motif
 * devient une phrase — sans quoi elle serait du français figé dans un paquet partagé, qui ne
 * parlerait jamais anglais.
 *
 * `null` = rien de vrai à dire (aucun règlement, échéance illisible). On n'écrit alors rien plutôt
 * qu'une phrase creuse.
 */
function Subtitle({ subtitle }: Readonly<{ subtitle: InvoiceRowSubtitle | null }>) {
  const { t } = useTranslation();
  if (subtitle == null) return null;

  const line =
    subtitle.kind === "OVERDUE_SINCE"
      ? t("invoice.rowSubtitle.OVERDUE_SINCE", { n: subtitle.days })
      : t(`invoice.rowSubtitle.${subtitle.kind}`, { date: formatDate(subtitle.date) });

  return <span className="text-cmv-caption text-cmv-text-lo">{line}</span>;
}
