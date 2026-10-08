import type { InvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import {
  COMPANY_ROW,
  CompanySection,
  CompanyTable,
} from "@/feature/company/component/CompanyTable";
import {
  useDeleteOrganizationInvitation,
  useRevokeOrganizationInvitation,
} from "@/feature/company/hook/useOrganization";
import { CmvConfirmButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

const PENDING_GRID = "grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-cmv-lg";
const DECLINED_GRID = "grid grid-cols-[2fr_1fr_auto] items-center gap-cmv-lg";

/**
 * Les invitations d'une page de l'espace Entreprise, sous ses membres : celles en attente, et
 * celles qu'on a refusées. Les mêmes pour les Coachs (#601) et les athlètes (#602) — seule la liste
 * change, la page la lit par rôle.
 *
 * La section des refus n'apparaît que s'il y en a : sans elle, un refus ne se voyait nulle part —
 * aucune notification n'est envoyée à l'entreprise.
 */
export function OrganizationInvitationSections({
  pending,
  declined,
}: Readonly<{ pending: InvitationDto[]; declined: InvitationDto[] }>) {
  const { t } = useTranslation();

  return (
    <>
      <CompanySection title={t("company.invitations.pending")} count={pending.length}>
        <CompanyTable
          grid={PENDING_GRID}
          columns={["email", "sentOn", "expiresOn"]}
          empty={t("company.invitations.emptyPending")}
          withAction
        >
          {pending.map((invitation) => (
            <PendingRow key={invitation.id} invitation={invitation} />
          ))}
        </CompanyTable>
      </CompanySection>

      {declined.length === 0 ? null : (
        <CompanySection title={t("company.invitations.declined")} count={declined.length}>
          <CompanyTable grid={DECLINED_GRID} columns={["email", "sentOn"]} withAction>
            {declined.map((invitation) => (
              <DeclinedRow key={invitation.id} invitation={invitation} />
            ))}
          </CompanyTable>
        </CompanySection>
      )}
    </>
  );
}

/**
 * Une invitation en attente, et son retrait — armé en deux temps : il est sans retour, il faudrait
 * réinviter. Une invitation expirée reste ici, révocable : l'expiration est une date, pas un statut.
 */
function PendingRow({ invitation }: Readonly<{ invitation: InvitationDto }>) {
  const { t } = useTranslation();
  const revoke = useRevokeOrganizationInvitation();

  return (
    <div className={cn(PENDING_GRID, COMPANY_ROW)}>
      <span className="text-cmv-text-hi">{invitation.email}</span>
      <span className="text-cmv-text-mid">{formatInstantDate(invitation.createdAt)}</span>
      <span className="text-cmv-text-mid">{formatInstantDate(invitation.expiresAt)}</span>
      <CmvConfirmButton
        label={t("company.invitations.revoke")}
        confirmLabel={t("company.invitations.revokeConfirm")}
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
  const remove = useDeleteOrganizationInvitation();

  return (
    <div className={cn(DECLINED_GRID, COMPANY_ROW)}>
      <span className="text-cmv-text-hi">{invitation.email}</span>
      <span className="text-cmv-text-mid">{formatInstantDate(invitation.createdAt)}</span>
      <CmvConfirmButton
        label={t("company.invitations.delete")}
        confirmLabel={t("company.invitations.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate(invitation.id)}
      />
    </div>
  );
}
