import { type InvitationDto, InvitationStatus, invitationEmailOf } from "@cmv/shared";
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
} from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values athlete.invitationStatus: InvitationStatus

type InvitationPanelProps = {
  onClose: () => void;
};

/**
 * Invitation d'un athlète (CDC §5.1) : le coach saisit une adresse, et l'invitation n'apparaît
 * qu'au compte qui la porte (#390). Il n'y a plus de code à transmettre : c'est l'adresse de la
 * session qui fait le verrou, et l'athlète accepte depuis la carte qui l'attend dans « Mon coach ».
 */
export function InvitationPanel({ onClose }: Readonly<InvitationPanelProps>) {
  const { t } = useTranslation();
  const { data: invitations } = useInvitations();
  const createInvitation = useCreateInvitation();

  const [email, setEmail] = useState("");
  // `null` tant que la saisie n'est pas une adresse : le bouton reste fermé, et l'API ne voit
  // jamais partir ce qu'elle refuserait d'un message de validation brut (#319).
  const target = invitationEmailOf(email);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (target == null) return;
    createInvitation.mutate({ email: target }, { onSuccess: () => setEmail("") });
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
          <CmvButton
            type="submit"
            onClick={onSubmit}
            disabled={target == null || createInvitation.isPending}
          >
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
                {/* L'adresse EST l'invitation : c'est elle seule qui dit à qui elle apparaîtra. */}
                <span className="text-cmv-body text-cmv-text-hi">{invitation.email}</span>
                <span className="text-cmv-caption text-cmv-text-lo">
                  {t("athlete.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
                </span>
              </div>
              <CmvBadge>{t(`athlete.invitationStatus.${invitation.status}`)}</CmvBadge>
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
 */
function DeclinedInvitationRow({ invitation }: Readonly<{ invitation: InvitationDto }>) {
  const { t } = useTranslation();
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();

  return (
    <div className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md">
      <div className="flex flex-1 flex-col gap-cmv-xs">
        {/* L'adresse EST l'information : c'est elle qui a dit non. */}
        <span className="text-cmv-body text-cmv-text-hi">{invitation.email}</span>
        <span className="text-cmv-caption text-cmv-text-lo">
          {t("athlete.invitation.sentOn", { date: formatDateTime(invitation.createdAt) })}
        </span>
      </div>
      <CmvBadge variant="error">{t(`athlete.invitationStatus.${invitation.status}`)}</CmvBadge>

      {/* Réémettre vise la MÊME adresse : le coach n'a rien à retaper. */}
      <CmvButton
        variant="ghost"
        disabled={createInvitation.isPending}
        onClick={() => createInvitation.mutate({ email: invitation.email })}
      >
        {t("athlete.invitation.resend")}
      </CmvButton>

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
