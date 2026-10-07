import { type InvitationDto, InvitationStatus, type OrganizationCoachDto } from "@cmv/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddCoachPanel } from "@/feature/company/component/AddCoachPanel";
import {
  useDeleteCoachInvitation,
  useOrganizationCoaches,
  useOrganizationInvitations,
  useRevokeCoachInvitation,
} from "@/feature/company/hook/useOrganization";
import {
  CMV_TABLE,
  CmvAppShell,
  CmvAvatar,
  CmvButton,
  CmvConfirmButton,
  CmvEmptyState,
  CmvErrorState,
} from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values company.coaches.columns: MEMBER_COLUMNS, PENDING_COLUMNS, DECLINED_COLUMNS

const MEMBER_COLUMNS = ["name", "email", "since"] as const;
const PENDING_COLUMNS = ["email", "sentOn", "expiresOn"] as const;
const DECLINED_COLUMNS = ["email", "sentOn"] as const;

/** Chaque tableau a sa grille, que l'en-tête et les lignes partagent — sinon ils se décalent. */
const MEMBER_GRID = "grid grid-cols-[2fr_2fr_1fr] items-center gap-cmv-lg";
const PENDING_GRID = "grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-cmv-lg";
const DECLINED_GRID = "grid grid-cols-[2fr_1fr_auto] items-center gap-cmv-lg";

/**
 * La page Coachs de l'espace Entreprise (#601, maquette entreprise frames 1, 2 et 5) : les membres,
 * les invitations en attente, celles qu'on a refusées — et le panneau qui en ajoute.
 *
 * L'état vide « Ajoute ton premier coach » ne s'affiche que s'il n'y a NI membre NI invitation :
 * une invitation en attente sans membre montre sa section sous un tableau vide, sinon l'entreprise
 * croirait que son envoi s'est perdu.
 *
 * Pas de retrait de membre : hors v1, comme le dit la maquette.
 */
export function CompanyCoachesScreen() {
  const { t } = useTranslation();
  const coaches = useOrganizationCoaches();
  const invitations = useOrganizationInvitations();
  const [panelOpen, setPanelOpen] = useState(false);

  const pending = byStatus(invitations.data, InvitationStatus.PENDING);
  const declined = byStatus(invitations.data, InvitationStatus.DECLINED);
  // Les acceptées n'ont rien à dire de plus que le membre lui-même, déjà dans le tableau.

  const loaded = coaches.data != null && pending != null && declined != null;
  const openPanel = () => setPanelOpen(true);
  // Le décompte n'a de sens que les deux listes lues : « 0 coach » sur une API injoignable serait
  // le fallback silencieux que la règle nullable interdit.
  const subtitle = loaded
    ? `${t("company.coaches.count", { count: coaches.data.length })} · ${t(
        "company.coaches.pendingCount",
        { count: pending.length },
      )}`
    : null;

  return (
    <CmvAppShell
      title={t("company.coaches.title")}
      {...(subtitle == null ? {} : { subtitle })}
      actions={<CmvButton onClick={openPanel}>{t("company.coaches.add")}</CmvButton>}
    >
      {coaches.isPending || invitations.isPending ? (
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      ) : null}

      {/* Une panne ne se lit pas « aucun coach » : l'entreprise en conclurait que ses membres sont
          partis. On ne rejoue que ce qui a échoué. */}
      {coaches.isError || invitations.isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            if (coaches.isError) coaches.refetch();
            if (invitations.isError) invitations.refetch();
          }}
        />
      ) : null}

      {loaded ? (
        <CoachesContent
          coaches={coaches.data}
          pending={pending}
          declined={declined}
          onAdd={openPanel}
        />
      ) : null}

      {panelOpen ? <AddCoachPanel onClose={() => setPanelOpen(false)} /> : null}
    </CmvAppShell>
  );
}

/** `null` tant que la liste n'est pas lue — jamais un tableau vide qui dirait « rien ». */
function byStatus(invitations: InvitationDto[] | undefined, status: InvitationStatus) {
  return invitations?.filter((invitation) => invitation.status === status) ?? null;
}

type CoachesContentProps = {
  coaches: OrganizationCoachDto[];
  pending: InvitationDto[];
  declined: InvitationDto[];
  onAdd: () => void;
};

function CoachesContent({ coaches, pending, declined, onAdd }: Readonly<CoachesContentProps>) {
  const { t } = useTranslation();

  if (coaches.length === 0 && pending.length === 0 && declined.length === 0) {
    return (
      <CmvEmptyState
        title={t("company.coaches.first.title")}
        description={t("company.coaches.first.description")}
        action={<CmvButton onClick={onAdd}>{t("company.coaches.add")}</CmvButton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-cmv-xl">
      <CompanyTable grid={MEMBER_GRID} columns={MEMBER_COLUMNS} empty={t("company.coaches.empty")}>
        {coaches.map((coach) => (
          <div key={coach.coachId} className={cn(MEMBER_GRID, ROW)}>
            <span className="flex items-center gap-cmv-sm">
              <CmvAvatar name={coach.name} />
              <span className="text-cmv-text-hi">{coach.name}</span>
            </span>
            <span className="text-cmv-text-mid">{coach.email}</span>
            <span className="text-cmv-text-mid">{formatInstantDate(coach.joinedAt)}</span>
          </div>
        ))}
      </CompanyTable>

      <Section title={t("company.coaches.pending")} count={pending.length}>
        <CompanyTable
          grid={PENDING_GRID}
          columns={PENDING_COLUMNS}
          empty={t("company.coaches.emptyPending")}
          withAction
        >
          {pending.map((invitation) => (
            <PendingRow key={invitation.id} invitation={invitation} />
          ))}
        </CompanyTable>
      </Section>

      {/* Ce qu'on a refusé à l'entreprise : sans cette section, un refus ne se voyait nulle part —
          aucune notification ne lui est envoyée (#601). */}
      {declined.length === 0 ? null : (
        <Section title={t("company.coaches.declined")} count={declined.length}>
          <CompanyTable grid={DECLINED_GRID} columns={DECLINED_COLUMNS} withAction>
            {declined.map((invitation) => (
              <DeclinedRow key={invitation.id} invitation={invitation} />
            ))}
          </CompanyTable>
        </Section>
      )}
    </div>
  );
}

function Section({
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

const ROW = cn(CMV_TABLE.row, "px-cmv-lg py-cmv-md");

type CompanyTableProps = {
  grid: string;
  columns: readonly string[];
  /** Ce que dit le tableau sans ligne — absent là où il n'est rendu qu'avec des lignes. */
  empty?: string;
  /** Une dernière colonne sans intitulé : le geste se lit sur son bouton. */
  withAction?: boolean;
  children: ReactNode[];
};

function CompanyTable({
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
              {t(`company.coaches.columns.${column}`)}
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

/**
 * Une invitation en attente, et son retrait — armé en deux temps : il est sans retour, il faudrait
 * réinviter. Une invitation expirée reste ici, révocable : l'expiration est une date, pas un statut.
 */
function PendingRow({ invitation }: Readonly<{ invitation: InvitationDto }>) {
  const { t } = useTranslation();
  const revoke = useRevokeCoachInvitation();

  return (
    <div className={cn(PENDING_GRID, ROW)}>
      <span className="text-cmv-text-hi">{invitation.email}</span>
      <span className="text-cmv-text-mid">{formatInstantDate(invitation.createdAt)}</span>
      <span className="text-cmv-text-mid">{formatInstantDate(invitation.expiresAt)}</span>
      <CmvConfirmButton
        label={t("company.coaches.revoke")}
        confirmLabel={t("company.coaches.revokeConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={revoke.isPending}
        onConfirm={() => revoke.mutate(invitation.id)}
      />
    </div>
  );
}

/**
 * Une invitation refusée, et le seul geste qui reste : solder la ligne. Réinviter passe par le
 * panneau, comme toute invitation — l'adresse est sous les yeux.
 */
function DeclinedRow({ invitation }: Readonly<{ invitation: InvitationDto }>) {
  const { t } = useTranslation();
  const remove = useDeleteCoachInvitation();

  return (
    <div className={cn(DECLINED_GRID, ROW)}>
      <span className="text-cmv-text-hi">{invitation.email}</span>
      <span className="text-cmv-text-mid">{formatInstantDate(invitation.createdAt)}</span>
      <CmvConfirmButton
        label={t("company.coaches.delete")}
        confirmLabel={t("company.coaches.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate(invitation.id)}
      />
    </div>
  );
}
