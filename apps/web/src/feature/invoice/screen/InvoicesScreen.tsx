import {
  buildInvoiceAthleteRows,
  type InvoiceAthleteRow,
  type InvoiceDto,
  InvoiceState,
  InvoiceStatus,
  resolveInvoiceState,
  todayIsoDate,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CoachInvoiceSection } from "@/feature/invoice/component/CoachInvoiceSection";
import { InvoiceDetailPanel } from "@/feature/invoice/component/InvoiceDetailPanel";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { useInvoicePanel } from "@/feature/invoice/hook/useInvoicePanel";
import { useInvoices } from "@/feature/invoice/hook/useInvoices";
import { CmvAppShell, CmvCard, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useActingCapability } from "@/shared/hook/useCapabilities";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Suivi des factures ÉMISES (p6-2). L'émission n'est PAS ici : elle se fait à la diffusion d'un
 * cycle (la facturation se saisit dans le builder). Cet écran ne fait que suivre le statut.
 *
 * Les gestes vivent désormais dans `InvoiceDetailPanel` (#120), plus sur la carte : ils y étaient
 * empilés à droite de chaque ligne, et le tableau qui remplace ces cartes ne peut pas les porter.
 * L'écran garde les MUTATIONS — c'est lui qui possède le cache — et ne passe au panneau que la
 * facture ouverte et de quoi agir dessus.
 *
 * La MÊME ressource sert les deux rôles (#27) : `GET /invoices` est scopée par le tenant, le coach
 * y lit ce qu'il a émis et l'athlète ce qu'il doit. Ce qui diffère, c'est ce qu'on peut en faire —
 * d'où `canManage` plutôt qu'un second écran qui recopierait la lecture pour n'en changer que les
 * boutons.
 *
 * `useCapabilities` est lu ici pour la PRÉSENTATION, jamais pour garder : qui entre est décidé par
 * la route (`CmvRoleGate`), qui ne monte pas cet écran sans l'une des deux capacités.
 */
export function InvoicesScreen() {
  const { t } = useTranslation();
  // Le titre EXERCÉ, pas la capacité possédée : un compte qui cumule lit à un titre à la fois.
  const isCoach = useActingCapability() === "coach";
  const { data: invoices, isPending, isError, refetch } = useInvoices();
  // La facture ouverte et ses gestes : une seule affaire, et la même pour les deux vues.
  const panel = useInvoicePanel(invoices);

  // Erreur, vide et chargement sont trois états distincts : « Aucune facture » sur une panne
  // réseau serait un mensonge.
  const hasInvoices = invoices != null && invoices.length > 0;

  /**
   * Une ligne par athlète FACTURÉ. `null` tant que la liste n'a pas répondu — la section n'est
   * alors pas montée, et c'est l'erreur ou le chargement qui parle.
   */
  const rows = buildInvoiceAthleteRows(invoices, todayIsoDate());

  // Les deux vues s'excluent, et chacune n'existe qu'avec de quoi la remplir : décidé ici en
  // valeurs, plutôt qu'en conditions empilées dans le JSX.
  const coachRows = hasInvoices && isCoach ? rows : null;
  const athleteInvoices = hasInvoices && !isCoach ? invoices : null;
  // Le vide ne s'annonce ni pendant le chargement ni sur une panne : trois états, trois rendus.
  const showEmpty = !isPending && !isError && !hasInvoices;

  return (
    <CmvAppShell
      title={isCoach ? t("invoice.title") : t("invoice.athlete.title")}
      subtitle={isCoach ? coachSummary(t, rows) : t("invoice.athlete.subtitle")}
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {showEmpty ? <EmptyInvoices isCoach={isCoach} /> : null}

      {/* Monté seulement quand une facture est ouverte : les gestes n'ont alors plus à se garder
          d'une cible absente, et le panneau n'a pas de cas « rien à montrer » à porter. */}
      {panel.props == null ? null : <InvoiceDetailPanel {...panel.props} canManage={isCoach} />}

      {/* Le coach lit un tableau groupé par athlète (#120) ; l'athlète garde ses cartes le temps
          que sa vue à plat arrive. Les deux ouvrent le MÊME panneau. */}
      {coachRows == null ? null : (
        <CoachInvoiceSection rows={coachRows} onOpenInvoice={panel.open} />
      )}

      {athleteInvoices == null ? null : (
        <AthleteInvoiceList invoices={athleteInvoices} onOpen={panel.open} />
      )}
    </CmvAppShell>
  );
}

/**
 * Les cartes de l'athlète, en attendant sa vue à plat. Une pile simple : il n'a qu'un coach, donc
 * rien à grouper, et une seule facture à la fois l'intéresse — la sienne.
 */
function AthleteInvoiceList({
  invoices,
  onOpen,
}: Readonly<{ invoices: readonly InvoiceDto[]; onOpen: (invoiceId: string) => void }>) {
  return (
    <div className="flex flex-col gap-cmv-sm">
      {invoices.map((invoice) => (
        <InvoiceRow
          key={invoice.id}
          invoice={invoice}
          canManage={false}
          onOpen={() => onOpen(invoice.id)}
        />
      ))}
    </div>
  );
}

/**
 * Le vide ne dit pas la même chose des deux côtés : au coach qu'il n'a rien émis (et où le faire),
 * à l'athlète qu'on ne lui demande rien. Clés littérales et non assemblées — c'est ce qui les rend
 * visibles de TypeScript et de `check:i18n`.
 */
function EmptyInvoices({ isCoach }: Readonly<{ isCoach: boolean }>) {
  const { t } = useTranslation();
  return (
    <CmvEmptyState
      title={isCoach ? t("invoice.empty.title") : t("invoice.athlete.empty.title")}
      description={
        isCoach ? t("invoice.empty.description") : t("invoice.athlete.empty.description")
      }
    />
  );
}

/**
 * « 6 athlètes facturés · 2 en retard de paiement » — ce que le coach lit avant de regarder le
 * tableau.
 *
 * Compte les athlètes FACTURÉS, et le dit : le tableau ne liste que ceux qui ont reçu au moins une
 * facture, et annoncer l'écurie entière demanderait une seconde requête pour un nombre qui ne
 * décrit pas ce qu'on a sous les yeux.
 *
 * La seconde clause disparaît quand rien n'est en retard — « 0 en retard de paiement » est une
 * bonne nouvelle écrite comme un reproche.
 */
function coachSummary(t: TFunction, rows: readonly InvoiceAthleteRow<InvoiceDto>[] | null): string {
  // Liste pas encore lue : le sous-titre statique, plutôt qu'un décompte à zéro.
  if (rows == null || rows.length === 0) return t("invoice.subtitle");

  const overdue = rows.filter((row) => row.situation === "OVERDUE").length;
  const athletes = t("invoice.summary.athletes", { count: rows.length });
  return overdue === 0
    ? athletes
    : `${athletes} · ${t("invoice.summary.overdue", { count: overdue })}`;
}

type InvoiceRowProps = {
  invoice: InvoiceDto;
  /**
   * De qui la carte porte le nom. Ce qu'on peut FAIRE de la facture est passé au panneau, plus à
   * la carte : elle n'a plus qu'à savoir quel nom écrire.
   */
  canManage: boolean;
  onOpen: () => void;
};

function InvoiceRow({ invoice, canManage, onOpen }: Readonly<InvoiceRowProps>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : le montant est barré, plus personne ne
  // doit rien. Le panneau, lui, ne propose alors aucune action.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;
  // L'échéance dépassée se colore aussi (maquette pd-8) : c'est elle que le coach cherche des yeux.
  const isOverdue = resolveInvoiceState(invoice, todayIsoDate()) === InvoiceState.OVERDUE;

  return (
    <CmvCard onClick={onOpen}>
      <div className="flex items-start gap-cmv-md">
        <div className="flex flex-1 flex-col gap-cmv-xs">
          {/* La facture porte les deux noms : chacun lit celui de l'AUTRE partie. Le coach suit
              N athlètes, l'athlète n'a qu'un coach — d'où le préfixe « De » de son côté, qui dit
              d'où vient la facture plutôt que de répéter son propre nom sur chaque carte. */}
          <div className="flex items-center gap-cmv-sm">
            <h3 className="text-cmv-subtitle text-cmv-text-hi">
              {canManage ? invoice.athleteName : t("invoice.byCoach", { name: invoice.coachName })}
            </h3>
            <InvoiceStatusBadge invoice={invoice} />
          </div>

          <p
            className={cn(
              "font-cmv-display text-cmv-title",
              isCancelled ? "text-cmv-text-lo line-through" : "text-cmv-text-hi",
            )}
          >
            {formatMoney(invoice.amountCents, invoice.currency)}
          </p>

          <p className="text-cmv-caption text-cmv-text-mid">
            {/* Le cycle facturé — cœur du lien facture ↔ planification. */}
            {invoice.planTitle ?? "—"} ·{" "}
            {t("invoice.periodLabel", { period: formatPeriod(invoice.period) })}
          </p>

          <p
            className={cn("text-cmv-caption", isOverdue ? "text-cmv-error-on" : "text-cmv-text-lo")}
          >
            {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
            {/* paidAt null tant qu'impayée : rendu « — » (jamais un fallback silencieux). */}
            {isPaid && invoice.paidAt != null
              ? ` · ${t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })}`
              : ""}
          </p>

          {invoice.note == null ? null : <p className="text-cmv-text-mid">{invoice.note}</p>}
        </div>
      </div>
    </CmvCard>
  );
}
