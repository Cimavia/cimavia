import { type CoachOrganizationDto, type PlanDto, required } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import {
  type AccessElement,
  type AccessFraming,
  AccessPanel,
} from "@/feature/library/component/AccessPanel";
import { sharesLibrary, useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { useChangePlanAccess, usePlanOrganizations } from "@/feature/plan/hook/usePlanAccess";
import { CmvButton } from "@/shared/component";
import { useMutationToast } from "@/shared/hook/useMutationToast";

type PlanAccessButtonProps = {
  /** Un cycle À SOI : gérer ses accès reste au propriétaire. */
  plan: PlanDto;
  /** Le destinataire tel qu'il s'écrit, `null` tant qu'il reste à choisir (#144). */
  athleteName: string | null;
};

/**
 * « Accès » dans la barre du builder, et le panneau qu'il ouvre (#607, maquette #597, frames 9 et
 * 10). Absent pour un Coach sans entreprise : il n'a personne à qui ouvrir quoi que ce soit, comme
 * dans la bibliothèque (frame 14). Les entreprises se lisent à l'ouverture, réduites aux Coachs
 * de l'athlète ; le panneau naît une fois la réponse là, puisqu'il part des droits qu'il règle.
 */
export function PlanAccessButton({ plan, athleteName }: Readonly<PlanAccessButtonProps>) {
  const { t } = useTranslation();
  const { onError } = useMutationToast();
  const { data: myOrganizations } = useMyOrganizations();
  const { data: athletes } = useAthletes();
  const [open, setOpen] = useState(false);
  const eligible = usePlanOrganizations(plan.id, open);
  const mutation = useChangePlanAccess();

  // Illisibles, les entreprises ne s'inventent pas vides : le refus se dit, le panneau reste fermé.
  // Pas pendant une relecture : rouvrir après un échec relit, l'échec d'avant n'est plus la réponse.
  const { error, isFetching } = eligible;
  useEffect(() => {
    if (!open || error == null || isFetching) return;
    onError(error);
    setOpen(false);
  }, [open, error, isFetching, onError]);

  if (sharesLibrary(myOrganizations) !== true) return null;

  // Le lien du propriétaire avec l'athlète, s'il passe par une entreprise : elle reçoit le cycle
  // en Écriture par défaut (#607).
  const linkOrganization =
    athletes?.find((relation) => relation.athleteId === plan.athleteId)?.organizationName ?? null;

  return (
    <>
      <CmvButton variant="ghost" onClick={() => setOpen(true)} disabled={open}>
        {t("library.access.title")}
      </CmvButton>
      {!open || eligible.data == null ? null : (
        <AccessPanel
          elements={[asAccessElement(plan)]}
          organizations={eligible.data}
          copyPrefix="plan.access"
          mutation={mutation}
          onClose={() => setOpen(false)}
          onSaved={() => undefined}
          // Le panneau n'est ouvert qu'au propriétaire : jamais en lecture seule.
          onOpen={() => undefined}
          framing={planFraming(plan, athleteName, eligible.data, linkOrganization, t)}
        />
      )}
    </>
  );
}

/** Le cycle tel que le panneau le lit : son propriétaire est son coach. */
function asAccessElement(plan: PlanDto): AccessElement {
  return {
    id: plan.id,
    title: plan.title,
    owner: { id: plan.coachId, name: plan.coachName },
    myAccess: required(plan.myAccess, "droit du coach sur son cycle"),
    grants: plan.grants,
  };
}

/**
 * Ce que le panneau dit du cycle. Sans athlète, il se partage comme un exercice : à toutes les
 * entreprises du propriétaire, sans rien à rappeler. Avec, le droit ne vaut que pour ses Coachs.
 */
export function planFraming(
  plan: Pick<PlanDto, "coachId">,
  athleteName: string | null,
  eligible: readonly CoachOrganizationDto[],
  linkOrganization: string | null,
  t: TFunction,
): AccessFraming {
  const ownerOnly = t("plan.access.ownerOnly");
  if (athleteName == null) {
    return {
      caption: t("plan.access.mine"),
      sectionTitle: t("library.access.organizations"),
      scope: null,
      defaultNote: null,
      empty: t("plan.access.emptyUnassigned"),
      ownerOnly,
    };
  }
  const others = [
    ...new Set(
      eligible.flatMap((organization) =>
        organization.coaches
          .filter((coach) => coach.coachId !== plan.coachId)
          .map((coach) => coach.name),
      ),
    ),
  ];
  // Le défaut ne s'annonce que si l'entreprise du lien est proposée : sinon personne d'autre n'y
  // suit l'athlète, et rien ne s'est ouvert.
  const opensByDefault =
    linkOrganization != null &&
    eligible.some((organization) => organization.name === linkOrganization);
  return {
    caption:
      others.length === 0
        ? t("plan.access.followedAlone", { athlete: athleteName })
        : t("plan.access.followedWith", {
            athlete: athleteName,
            coaches: others.join(", "),
            organizations: eligible.map((organization) => organization.name).join(", "),
          }),
    sectionTitle: t("plan.access.coachesOf", { athlete: athleteName }),
    scope: t("plan.access.scope", { athlete: athleteName }),
    defaultNote: opensByDefault
      ? t("plan.access.defaultWrite", { organization: linkOrganization })
      : null,
    empty: t("plan.access.empty", { athlete: athleteName }),
    ownerOnly,
  };
}
