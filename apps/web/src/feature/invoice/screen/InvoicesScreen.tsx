import {
  buildInvoiceAthleteRows,
  type InvoiceAthleteRow,
  type InvoiceDto,
  sortAthleteInvoices,
  todayIsoDate,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CoachInvoiceSection } from "@/feature/invoice/component/CoachInvoiceSection";
import { InvoiceDetailPanel } from "@/feature/invoice/component/InvoiceDetailPanel";
import { InvoiceHistoryTable } from "@/feature/invoice/component/InvoiceHistoryTable";
import { useInvoicePanel } from "@/feature/invoice/hook/useInvoicePanel";
import { useInvoices } from "@/feature/invoice/hook/useInvoices";
import { CmvAppShell, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useActingCapability } from "@/shared/hook/useCapabilities";

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
  /**
   * L'athlète voit le MÊME tableau, à plat : il n'a qu'un coach, donc rien à grouper. Trié comme
   * l'historique du coach — ses retards en tête, le reste du plus récent au plus ancien.
   */
  const athleteInvoices =
    hasInvoices && !isCoach ? sortAthleteInvoices(invoices, todayIsoDate()) : null;
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
        <InvoiceHistoryTable invoices={athleteInvoices} onOpenInvoice={panel.open} />
      )}
    </CmvAppShell>
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
