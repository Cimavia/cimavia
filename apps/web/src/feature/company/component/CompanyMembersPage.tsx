import { type InvitationDto, InvitationRole, InvitationStatus } from "@cmv/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { InviteToOrganizationPanel } from "@/feature/company/component/InviteToOrganizationPanel";
import { OrganizationInvitationSections } from "@/feature/company/component/OrganizationInvitationSections";
import { useOrganizationInvitations } from "@/feature/company/hook/useOrganization";
import { CmvAppShell, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/** Les textes propres à chaque page ; le reste — sections, gestes, panneau — est commun. */
const TEXTS = {
  [InvitationRole.COACH]: {
    title: "company.coaches.title",
    add: "company.coaches.add",
    firstTitle: "company.coaches.first.title",
    firstDescription: "company.coaches.first.description",
  },
  [InvitationRole.ATHLETE]: {
    title: "company.athletes.title",
    add: "company.athletes.add",
    firstTitle: "company.athletes.first.title",
    firstDescription: "company.athletes.hint",
  },
} as const;

type CompanyMembersPageProps<T> = {
  /** Qui la page liste : ses Coachs (#601) ou ses athlètes (#602). Ses invitations suivent. */
  role: InvitationRole;
  members: UseQueryResult<T[]>;
  /** Le décompte de l'en-tête, une fois membres et invitations lus ; `null` = rien à afficher. */
  subtitle: (members: T[], pending: InvitationDto[]) => string | null;
  /** Le tableau des membres — ce qui distingue vraiment les deux pages. */
  table: (members: T[]) => ReactNode;
};

/**
 * Une page de l'espace Entreprise : ses membres d'un rôle, les invitations en attente, celles
 * qu'on a refusées — et le panneau qui en ajoute. Les pages Coachs (#601) et Athlètes (#602) ne
 * diffèrent que par leur tableau et leurs textes.
 *
 * L'état vide « premier membre » ne s'affiche que s'il n'y a NI membre NI invitation : une
 * invitation en attente sans membre montre sa section sous un tableau vide, sinon l'entreprise
 * croirait que son envoi s'est perdu.
 *
 * Pas de retrait de membre : hors v1, comme le dit la maquette.
 */
export function CompanyMembersPage<T>({
  role,
  members,
  subtitle,
  table,
}: Readonly<CompanyMembersPageProps<T>>) {
  const { t } = useTranslation();
  const invitations = useOrganizationInvitations(role);
  const [panelOpen, setPanelOpen] = useState(false);
  const texts = TEXTS[role];

  const pending = byStatus(invitations.data, InvitationStatus.PENDING);
  const declined = byStatus(invitations.data, InvitationStatus.DECLINED);
  // Les acceptées n'ont rien à dire de plus que le membre lui-même, déjà dans le tableau.

  const loaded = members.data != null && pending != null && declined != null;
  const openPanel = () => setPanelOpen(true);
  // Le décompte n'a de sens que les deux listes lues : « 0 coach » sur une API injoignable serait
  // le fallback silencieux que la règle nullable interdit.
  const heading = loaded ? subtitle(members.data, pending) : null;

  return (
    <CmvAppShell
      title={t(texts.title)}
      {...(heading == null ? {} : { subtitle: heading })}
      actions={<CmvButton onClick={openPanel}>{t(texts.add)}</CmvButton>}
    >
      {members.isPending || invitations.isPending ? (
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      ) : null}

      {/* Une panne ne se lit pas « aucun membre » : l'entreprise en conclurait qu'ils sont partis.
          On ne rejoue que ce qui a échoué. */}
      {members.isError || invitations.isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            if (members.isError) members.refetch();
            if (invitations.isError) invitations.refetch();
          }}
        />
      ) : null}

      {loaded ? (
        <MembersContent
          role={role}
          table={table(members.data)}
          isEmpty={members.data.length === 0}
          pending={pending}
          declined={declined}
          onAdd={openPanel}
        />
      ) : null}

      {panelOpen ? (
        <InviteToOrganizationPanel role={role} onClose={() => setPanelOpen(false)} />
      ) : null}
    </CmvAppShell>
  );
}

type MembersContentProps = {
  role: InvitationRole;
  table: ReactNode;
  isEmpty: boolean;
  pending: InvitationDto[];
  declined: InvitationDto[];
  onAdd: () => void;
};

function MembersContent({
  role,
  table,
  isEmpty,
  pending,
  declined,
  onAdd,
}: Readonly<MembersContentProps>) {
  const { t } = useTranslation();
  // Le nom de l'entreprise EST celui du compte (#600) ; seul le texte des athlètes le cite.
  const { data: session } = authClient.useSession();
  const texts = TEXTS[role];

  if (isEmpty && pending.length === 0 && declined.length === 0) {
    return (
      <CmvEmptyState
        title={t(texts.firstTitle)}
        description={t(texts.firstDescription, { name: session?.user.name ?? "—" })}
        action={<CmvButton onClick={onAdd}>{t(texts.add)}</CmvButton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-cmv-xl">
      {table}
      <OrganizationInvitationSections pending={pending} declined={declined} />
    </div>
  );
}

/** `null` tant que la liste n'est pas lue — jamais un tableau vide qui dirait « rien ». */
function byStatus(invitations: InvitationDto[] | undefined, status: InvitationStatus) {
  return invitations?.filter((invitation) => invitation.status === status) ?? null;
}
