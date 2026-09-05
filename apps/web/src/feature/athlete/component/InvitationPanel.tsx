import { type InvitationDto, InvitationStatus } from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateInvitation,
  useDeleteInvitation,
  useInvitations,
} from "@/feature/athlete/hook/useAthletes";
import {
  CmvBadge,
  CmvButton,
  CmvConfirmButton,
  CmvEmptyState,
  CmvPanel,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values athlete.invitationStatus: InvitationStatus

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

  function onSubmit(event: SyntheticEvent) {
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
  /**
   * Ce qu'on a refusé au coach (#146). Sans cette section, un refus n'était qu'une notification
   * qui passe : l'invitation quittait `PENDING`, disparaissait de la liste d'attente, et rien ne
   * lui restait à faire. Ici il voit QUI a dit non, peut réémettre, et solde la ligne.
   *
   * Les acceptées ne s'y ajoutent pas : elles n'ont rien à dire de plus que l'athlète lui-même,
   * déjà présent dans le tableau de suivi.
   */
  const declined = (invitations ?? []).filter(
    (invitation) => invitation.status === InvitationStatus.DECLINED,
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

        {declined.length === 0 ? null : (
          <section className="flex flex-col gap-cmv-sm">
            <span className="text-cmv-caption text-cmv-text-mid">
              {t("athlete.invitation.declined")}
            </span>

            {declined.map((invitation) => (
              <DeclinedInvitationRow key={invitation.id} invitation={invitation} />
            ))}
          </section>
        )}
      </div>
    </CmvPanel>
  );
}

/**
 * Une invitation refusée, et les deux gestes qui restent au coach : réémettre vers la même
 * adresse, ou solder la ligne.
 *
 * Composant à part et non une ligne de plus dans la boucle : c'est ce qui donne à `email` un
 * narrowing RÉEL — `invitation.email` est nullable au DTO, et le rétrécir dans une expression JSX
 * ne survit pas au passage dans un gestionnaire de clic. Un `as string` aurait compilé en mentant
 * au lecteur sur ce qu'on sait vraiment.
 */
function DeclinedInvitationRow({ invitation }: Readonly<{ invitation: InvitationDto }>) {
  const { t } = useTranslation();
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();

  const { email } = invitation;

  return (
    <div className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md">
      <div className="flex flex-1 flex-col gap-cmv-xs">
        {/* L'adresse EST l'information : le code, lui, est mort avec le refus. */}
        <span className="text-cmv-body text-cmv-text-hi">{email ?? "—"}</span>
        <span className="text-cmv-caption text-cmv-text-lo">
          {t("athlete.invitation.sentOn", { date: formatDateTime(invitation.createdAt) })}
        </span>
      </div>
      <CmvBadge variant="error">{t(`athlete.invitationStatus.${invitation.status}`)}</CmvBadge>

      {/* Réémettre suppose une adresse à viser. Une invitation refusée en a toujours une — le
          refus exige une correspondance stricte —, mais le DTO ne le dit pas : on traite le `null`
          plutôt que de l'écarter d'une assertion qui mentirait. */}
      {email == null ? null : (
        <CmvButton
          variant="ghost"
          disabled={createInvitation.isPending}
          onClick={() => createInvitation.mutate({ email })}
        >
          {t("athlete.invitation.resend")}
        </CmvButton>
      )}

      {/* Effacer est sans retour, mais sans conséquence pour personne d'autre : la ligne est déjà
          morte. L'armement protège du clic accidentel, rien de plus. */}
      <CmvConfirmButton
        label={t("athlete.invitation.delete")}
        confirmLabel={t("athlete.invitation.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={deleteInvitation.isPending}
        onConfirm={() => deleteInvitation.mutate(invitation.id)}
      />
    </div>
  );
}
