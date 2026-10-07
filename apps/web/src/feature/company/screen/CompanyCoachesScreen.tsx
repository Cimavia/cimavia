import { InvitationRole, type OrganizationCoachDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CompanyMembersPage } from "@/feature/company/component/CompanyMembersPage";
import { COMPANY_ROW, CompanyTable } from "@/feature/company/component/CompanyTable";
import { useOrganizationCoaches } from "@/feature/company/hook/useOrganization";
import { CmvAvatar } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

/** La grille que l'en-tête et les lignes partagent — sinon ils se décalent. */
const GRID = "grid grid-cols-[2fr_2fr_1fr] items-center gap-cmv-lg";

/**
 * La page Coachs de l'espace Entreprise (#601, maquette entreprise frames 1, 2 et 5) : les membres,
 * puis ce que `CompanyMembersPage` ajoute à toute page de membres.
 */
export function CompanyCoachesScreen() {
  const { t } = useTranslation();
  const coaches = useOrganizationCoaches();

  return (
    <CompanyMembersPage
      role={InvitationRole.COACH}
      members={coaches}
      subtitle={(members, pending) =>
        `${t("company.coaches.count", { count: members.length })} · ${t(
          "company.invitations.pendingCount",
          { count: pending.length },
        )}`
      }
      table={(members) => <CoachesTable coaches={members} />}
    />
  );
}

function CoachesTable({ coaches }: Readonly<{ coaches: OrganizationCoachDto[] }>) {
  const { t } = useTranslation();

  return (
    <CompanyTable
      grid={GRID}
      columns={["name", "email", "since"]}
      empty={t("company.coaches.empty")}
    >
      {coaches.map((coach) => (
        <div key={coach.coachId} className={cn(GRID, COMPANY_ROW)}>
          <span className="flex items-center gap-cmv-sm">
            <CmvAvatar name={coach.name} />
            <span className="text-cmv-text-hi">{coach.name}</span>
          </span>
          <span className="text-cmv-text-mid">{coach.email}</span>
          <span className="text-cmv-text-mid">{formatInstantDate(coach.joinedAt)}</span>
        </div>
      ))}
    </CompanyTable>
  );
}
