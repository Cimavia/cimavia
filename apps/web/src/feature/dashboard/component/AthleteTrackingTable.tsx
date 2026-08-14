import { type AthleteRow, type AthleteRowPlan, INVOICE_STATE_BADGE } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CmvAvatar, CmvBadge, CmvButton, CmvProgressBar } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values dashboard.table.columns: COLUMNS

/**
 * Le tableau de suivi des athlètes (#113, maquette pd-4).
 *
 * Une ligne par athlète, cinq colonnes qui répondent chacune à une question que le coach se pose en
 * ouvrant son écran : *où en est son cycle*, *ai-je des débriefs à lire*, *des messages*, *sa
 * facturation est-elle à jour*. Les colonnes « Débriefs » et « Messages » **mènent** à ce qu'elles
 * annoncent — sans lien, un compteur n'est qu'un reproche.
 *
 * La colonne « Dernière activité » de la maquette n'existe pas ici : ces deux colonnes la
 * remplacent, en mieux (elles disent QUOI est en attente, et y conduisent). Elle aurait de toute
 * façon été partiellement fausse — une séance faite sans débrief n'apparaît dans aucune liste que
 * le coach charge.
 */

/**
 * Grille partagée par l'en-tête et les lignes. Chaque rangée étant sa PROPRE grille, la dernière
 * colonne doit être de largeur FIXE et non `auto` : sinon elle vaut 0 dans l'en-tête (cellule vide)
 * et la largeur du bouton dans les lignes, les colonnes `fr` se répartissent un espace différent
 * des deux côtés, et les intitulés se décalent de leur contenu. La maquette fixe la sienne à 40 px
 * pour la même raison.
 *
 * Le tableau défile horizontalement sous `md` plutôt que d'écraser ses colonnes.
 */
const GRID = "grid grid-cols-[2fr_2fr_1fr_1fr_1.2fr_6rem] items-center gap-cmv-xl";

const COLUMNS = ["athlete", "plan", "feedbacks", "messages", "invoice"] as const;

type AthleteTrackingTableProps = {
  rows: readonly AthleteRow[];
  /**
   * `false` quand la liste des cycles n'a pas pu être lue : on n'invite alors pas à en créer un.
   * Proposer « Créer un cycle » à un athlète qui en a peut-être déjà un serait le repli de trop.
   */
  canOfferPlan: boolean;
  onOpenSheet: (athleteId: string) => void;
};

export function AthleteTrackingTable({
  rows,
  canOfferPlan,
  onOpenSheet,
}: Readonly<AthleteTrackingTableProps>) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-cmv-lg border border-cmv-border bg-cmv-surface">
      <div className="min-w-[52rem]">
        {/* En-tête sur un fond distinct du corps (maquette pd-4) : c'est ce qui le détache comme
            une barre de titres et non comme une première ligne de données. */}
        <div className={`${GRID} border-cmv-border border-b bg-cmv-surface-hi px-cmv-lg py-cmv-sm`}>
          {COLUMNS.map((column) => (
            <span
              key={column}
              className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide"
            >
              {t(`dashboard.table.columns.${column}`)}
            </span>
          ))}
          <span />
        </div>

        {rows.map((row) => (
          <div
            key={row.athleteId}
            className={`${GRID} border-cmv-border border-b px-cmv-lg py-cmv-md last:border-b-0`}
          >
            <span className="flex min-w-0 items-center gap-cmv-sm">
              <CmvAvatar name={row.athleteName} />
              <span className="truncate text-cmv-body text-cmv-text-hi">{row.athleteName}</span>
            </span>

            <PlanCell plan={row.plan} canOfferPlan={canOfferPlan} />

            {/* Mène au dernier débrief NON LU quand il y en a un, sinon à la liste sans rien
                présélectionner — `undefined` retire simplement le paramètre de l'URL. */}
            <CountCell
              count={row.unreadFeedbacks}
              to="/feedbacks"
              search={{ feedback: row.lastUnreadFeedbackId ?? undefined }}
            />

            {/* Toujours cliquable, même à zéro : la colonne sert aussi à ÉCRIRE, pas seulement à
                répondre. */}
            <CountCell
              count={row.unreadMessages}
              to="/messages"
              search={{ athlete: row.athleteId }}
            />

            <InvoiceCell state={row.invoiceState} />

            {/* Collé au bord droit, comme le chevron de la maquette. */}
            <span className="justify-self-end">
              <CmvButton variant="ghost" onClick={() => onOpenSheet(row.athleteId)}>
                {t("dashboard.table.openSheet")}
              </CmvButton>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Le cycle courant, son titre et où il en est. `null` = aucun cycle **ou** liste des cycles
 * illisible — d'où `canOfferPlan`, qui décide si on ose proposer d'en créer un.
 */
function PlanCell({
  plan,
  canOfferPlan,
}: Readonly<{ plan: AthleteRowPlan | null; canOfferPlan: boolean }>) {
  const { t } = useTranslation();

  if (plan == null) {
    if (!canOfferPlan) return <span className="text-cmv-text-lo">—</span>;
    return (
      <Link to="/plans" className="text-cmv-accent-on text-cmv-caption hover:underline">
        {t("dashboard.table.createPlan")}
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-cmv-xs">
      <Link
        to="/plans"
        className="truncate text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi"
      >
        {plan.title}
      </Link>
      <PlanTiming plan={plan} />
    </div>
  );
}

/**
 * Où le cycle en est : sa progression s'il court, sa date de fin s'il est clos, sa date de départ
 * s'il attend.
 *
 * Ces deux dernières étaient confondues sous « N semaines » tant que seule `currentWeek` distinguait
 * les cas — or « ce cycle est fini » et « ce cycle commence lundi » sont deux situations contraires,
 * et une seule appelle un geste du coach. `phase` les sépare depuis #123, et c'est la même donnée
 * qui alimente le filtre « Cycle terminé » de la barre d'outils.
 */
function PlanTiming({ plan }: Readonly<{ plan: AthleteRowPlan }>) {
  const { t } = useTranslation();

  if (plan.phase === "ENDED" && plan.endDate != null) {
    return (
      <span className="text-cmv-caption text-cmv-text-lo">
        {t("dashboard.table.planEnded", { date: formatDate(plan.endDate) })}
      </span>
    );
  }

  if (plan.phase === "UPCOMING") {
    return (
      <span className="text-cmv-caption text-cmv-text-lo">
        {t("dashboard.table.planUpcoming", { date: formatDate(plan.startDate) })}
      </span>
    );
  }

  // Cycle non situable (dates illisibles) : ni progression ni échéance inventée.
  if (plan.currentWeek == null) return <span className="text-cmv-text-lo">—</span>;

  const progress = t("dashboard.table.weekProgress", {
    current: plan.currentWeek,
    total: plan.weekCount,
  });

  return (
    <div className="flex items-center gap-cmv-sm">
      <span className="w-36 shrink-0">
        <CmvProgressBar percent={(plan.currentWeek / plan.weekCount) * 100} label={progress} />
      </span>
      <span className="shrink-0 text-cmv-caption text-cmv-text-lo">{progress}</span>
    </div>
  );
}

// Union discriminée par `to` : chaque destination n'accepte QUE le paramètre qu'elle sait lire, et
// le typecheck refuse un `?athlete=` posé sur `/feedbacks`.
type CountCellProps =
  | { count: number | null; to: "/messages"; search: { athlete: string } }
  | { count: number | null; to: "/feedbacks"; search: { feedback: string | undefined } };

/**
 * Un compteur cliquable. `null` = source indisponible → « — » **sans lien** : proposer d'ouvrir ce
 * qu'on n'a pas pu lire serait mentir deux fois. Un `0` connu reste cliquable mais discret.
 */
function CountCell({ count, to, search }: Readonly<CountCellProps>) {
  if (count == null) return <span className="text-cmv-text-lo">—</span>;

  return (
    <Link
      to={to}
      search={search}
      className={
        count > 0
          ? "font-cmv-display text-cmv-accent-on text-cmv-subtitle hover:underline"
          : "text-cmv-text-lo hover:underline"
      }
    >
      {count}
    </Link>
  );
}

/**
 * L'état de la dernière facture émise, avec la table de badges partagée (`INVOICE_STATE_BADGE`) :
 * « en retard » y est déjà dérivé, on ne le recalcule pas ici.
 */
function InvoiceCell({ state }: Readonly<{ state: AthleteRow["invoiceState"] }>) {
  const { t } = useTranslation();
  if (state == null) return <span className="text-cmv-text-lo">—</span>;

  const { variant, labelKey } = INVOICE_STATE_BADGE[state];
  return (
    <Link to="/invoices">
      <CmvBadge variant={variant} dot>
        {t(labelKey)}
      </CmvBadge>
    </Link>
  );
}
