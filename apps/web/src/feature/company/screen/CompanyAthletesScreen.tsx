import { InvitationRole, type OrganizationAthleteDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CompanyMembersPage } from "@/feature/company/component/CompanyMembersPage";
import { COMPANY_ROW, CompanyTable } from "@/feature/company/component/CompanyTable";
import {
  useOrganizationAthletes,
  useOrganizationCoaches,
} from "@/feature/company/hook/useOrganization";
import { CmvAvatar } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

/** La grille que l'en-tête et les lignes partagent — sinon ils se décalent. */
const GRID = "grid grid-cols-[2fr_2fr_1fr_2fr] items-center gap-cmv-lg";

/**
 * La page Athlètes de l'espace Entreprise (#602, maquette entreprise frames 3, 4 et 6) : ses
 * athlètes, chacun avec les Coachs qui le suivent, puis ce que `CompanyMembersPage` ajoute à toute
 * page de membres.
 *
 * La colonne Coachs n'est pas modifiable : chaque athlète de l'entreprise est suivi par tous ses
 * Coachs. Pas de retrait d'athlète en v1.
 */
export function CompanyAthletesScreen() {
  const { t } = useTranslation();
  const athletes = useOrganizationAthletes();
  // Pour l'en-tête seul (« suivi par 2 coachs ») : sans elle, il se tait plutôt que d'inventer.
  const coaches = useOrganizationCoaches();

  return (
    <CompanyMembersPage
      role={InvitationRole.ATHLETE}
      members={athletes}
      subtitle={(members) => {
        if (members.length === 0) return t("company.athletes.none");
        if (coaches.data == null) return null;
        return t("company.athletes.summary", {
          count: members.length,
          coaches: t("company.coaches.count", { count: coaches.data.length }),
        });
      }}
      table={AthletesTable}
    />
  );
}

function AthletesTable({ members: athletes }: Readonly<{ members: OrganizationAthleteDto[] }>) {
  const { t } = useTranslation();

  return (
    <CompanyTable
      grid={GRID}
      columns={["name", "email", "since", "coaches"]}
      empty={t("company.athletes.empty")}
    >
      {athletes.map((athlete) => (
        <div key={athlete.athleteId} className={cn(GRID, COMPANY_ROW)}>
          <span className="flex items-center gap-cmv-sm">
            <CmvAvatar name={athlete.name} />
            <span className="text-cmv-text-hi">{athlete.name}</span>
          </span>
          <span className="text-cmv-text-mid">{athlete.email}</span>
          <span className="text-cmv-text-mid">{formatInstantDate(athlete.joinedAt)}</span>
          <AthleteCoaches coaches={athlete.coaches} />
        </div>
      ))}
    </CompanyTable>
  );
}

/**
 * Les Coachs d'un athlète. Une liste vide n'est pas une donnée manquante : l'entreprise n'a pas
 * encore de Coach, et ils le suivront dès leur arrivée — c'est ce que la cellule dit.
 */
function AthleteCoaches({ coaches }: Readonly<{ coaches: OrganizationAthleteDto["coaches"] }>) {
  const { t } = useTranslation();

  if (coaches.length === 0) {
    return (
      <span className="text-cmv-caption text-cmv-text-lo">{t("company.athletes.noCoach")}</span>
    );
  }
  return (
    <ul className="flex flex-col gap-cmv-xs">
      {coaches.map((coach) => (
        <li key={coach.coachId} className="flex items-center gap-cmv-sm">
          <CmvAvatar name={coach.name} />
          <span className="text-cmv-text-mid">{coach.name}</span>
        </li>
      ))}
    </ul>
  );
}
