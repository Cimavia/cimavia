import { InvitationStatus } from "@cmv/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateInvitation, useInvitations } from "@/feature/athlete/hook/useAthletes";
import {
  CmvBadge,
  CmvButton,
  CmvEmptyState,
  CmvPanel,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

type InvitationPanelProps = {
  onClose: () => void;
};

/**
 * Invitation d'un athlète (CDC §5.1) : le coach émet un code, l'athlète le saisit à l'inscription.
 * L'e-mail est facultatif — sans lui, le code est un lien générique acceptable par n'importe quel
 * athlète non encore lié.
 */
export function InvitationPanel({ onClose }: Readonly<InvitationPanelProps>) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: invitations } = useInvitations();
  const createInvitation = useCreateInvitation();

  const [email, setEmail] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Champ vide → invitation générique (le schéma attend `email` absent, pas une chaîne vide).
    const trimmed = email.trim();
    createInvitation.mutate(trimmed === "" ? {} : { email: trimmed }, {
      onSuccess: () => setEmail(""),
    });
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    toast.info(t("athlete.invitation.copied"));
  }

  const pending = (invitations ?? []).filter(
    (invitation) => invitation.status === InvitationStatus.PENDING,
  );

  return (
    <CmvPanel
      open
      title={t("athlete.invitation.title")}
      description={t("athlete.invitation.description")}
      onClose={onClose}
      footer={
        <CmvButton variant="ghost" onClick={onClose}>
          {t("common.close")}
        </CmvButton>
      }
    >
      <div className="flex flex-col gap-cmv-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
          <CmvTextField
            label={t("athlete.invitation.emailLabel")}
            name="invitationEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("athlete.invitation.emailPlaceholder")}
          />
          <p className="text-cmv-caption text-cmv-text-lo">{t("athlete.invitation.emailHint")}</p>
          <CmvButton type="submit" onClick={onSubmit} disabled={createInvitation.isPending}>
            {createInvitation.isPending
              ? t("athlete.invitation.submitting")
              : t("athlete.invitation.submit")}
          </CmvButton>
        </form>

        <section className="flex flex-col gap-cmv-sm">
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("athlete.invitation.pending")}
          </span>

          {pending.length === 0 ? (
            <CmvEmptyState title={t("athlete.invitation.emptyPending")} />
          ) : null}

          {pending.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md"
            >
              <div className="flex flex-1 flex-col gap-cmv-xs">
                <span className="font-cmv-mono text-cmv-body text-cmv-text-hi">
                  {invitation.code}
                </span>
                <span className="text-cmv-caption text-cmv-text-lo">
                  {/* Invitation générique : pas d'e-mail → « — », jamais une chaîne vide. */}
                  {invitation.email ?? "—"} ·{" "}
                  {t("athlete.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
                </span>
              </div>
              <CmvBadge>{t(`athlete.invitationStatus.${invitation.status}`)}</CmvBadge>
              <CmvButton variant="ghost" onClick={() => copyCode(invitation.code)}>
                {t("athlete.invitation.copy")}
              </CmvButton>
            </div>
          ))}
        </section>
      </div>
    </CmvPanel>
  );
}
