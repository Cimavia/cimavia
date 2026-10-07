import { InvitationRole, invitationEmailOf } from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInviteToOrganization } from "@/feature/company/hook/useOrganization";
import { CmvButton, CmvPanel, CmvTextField } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/** Ce que le panneau dit, selon ce qu'il propose : rejoindre l'équipe, ou être suivi par elle. */
const TEXTS = {
  [InvitationRole.COACH]: { title: "company.coaches.add", hint: "company.coaches.hint" },
  [InvitationRole.ATHLETE]: { title: "company.athletes.add", hint: "company.athletes.hint" },
} as const;

/**
 * « Ajouter un coach » (#601, maquette entreprise frame 2) et « Inviter un athlète » (#602, frame
 * 4) : l'entreprise saisit une adresse, et l'invitation n'apparaît qu'au compte qui la porte — même
 * verrou que l'invitation d'un Coach (#390). Le panneau se ferme à l'envoi : l'adresse rejoint
 * « Invitations en attente », sous les yeux de l'entreprise, ce qui vaut confirmation.
 */
export function InviteToOrganizationPanel({
  role,
  onClose,
}: Readonly<{ role: InvitationRole; onClose: () => void }>) {
  const { t } = useTranslation();
  // Le nom de l'entreprise EST celui du compte (#600) : la session le porte déjà.
  const { data: session } = authClient.useSession();
  const invite = useInviteToOrganization(role);
  const texts = TEXTS[role];

  const [email, setEmail] = useState("");
  // `null` tant que la saisie n'est pas une adresse : le bouton reste fermé (#319).
  const target = invitationEmailOf(email);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (target == null) return;
    invite.mutate({ email: target }, { onSuccess: onClose });
  }

  return (
    <CmvPanel
      open
      title={t(texts.title)}
      onClose={onClose}
      footer={
        <CmvButton variant="ghost" onClick={onClose}>
          {t("common.close")}
        </CmvButton>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
        <CmvTextField
          label={t("company.invitations.panel.emailLabel")}
          name="invitationEmail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("company.invitations.panel.emailPlaceholder")}
        />
        <p className="text-cmv-caption text-cmv-text-mid">
          {t(texts.hint, { name: session?.user.name ?? "—" })}
        </p>
        <CmvButton type="submit" onClick={onSubmit} disabled={target == null || invite.isPending}>
          {invite.isPending
            ? t("company.invitations.panel.submitting")
            : t("company.invitations.panel.submit")}
        </CmvButton>
      </form>
    </CmvPanel>
  );
}
