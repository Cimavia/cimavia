import { invitationEmailOf } from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInviteCoach } from "@/feature/company/hook/useOrganization";
import { CmvButton, CmvPanel, CmvTextField } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * « Ajouter un coach » (#601, maquette entreprise frame 2) : l'entreprise saisit une adresse, et
 * l'invitation n'apparaît qu'au compte qui la porte — même verrou que l'invitation d'un athlète
 * (#390). Le panneau se ferme à l'envoi : l'adresse rejoint « Invitations en attente », sous les
 * yeux de l'entreprise, ce qui vaut confirmation.
 */
export function AddCoachPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const { t } = useTranslation();
  // Le nom de l'entreprise EST celui du compte (#600) : la session le porte déjà.
  const { data: session } = authClient.useSession();
  const inviteCoach = useInviteCoach();

  const [email, setEmail] = useState("");
  // `null` tant que la saisie n'est pas une adresse : le bouton reste fermé (#319).
  const target = invitationEmailOf(email);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (target == null) return;
    inviteCoach.mutate({ email: target }, { onSuccess: onClose });
  }

  return (
    <CmvPanel
      open
      title={t("company.coaches.add")}
      onClose={onClose}
      footer={
        <CmvButton variant="ghost" onClick={onClose}>
          {t("common.close")}
        </CmvButton>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
        <CmvTextField
          label={t("company.coaches.panel.emailLabel")}
          name="coachEmail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("company.coaches.panel.emailPlaceholder")}
        />
        <p className="text-cmv-caption text-cmv-text-mid">
          {t("company.coaches.panel.hint", { name: session?.user.name ?? "—" })}
        </p>
        <CmvButton
          type="submit"
          onClick={onSubmit}
          disabled={target == null || inviteCoach.isPending}
        >
          {inviteCoach.isPending
            ? t("company.coaches.panel.submitting")
            : t("company.coaches.panel.submit")}
        </CmvButton>
      </form>
    </CmvPanel>
  );
}
