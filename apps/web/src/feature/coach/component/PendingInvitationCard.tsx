import type { PendingInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { useAcceptInvitation, useDeclineInvitation } from "@/feature/coach/hook/useMyCoach";
import { CmvAvatar, CmvButton, CmvCard, CmvConfirmButton } from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

type Issuer = PendingInvitationDto["issuer"];

/**
 * Une invitation qui attend l'athlète (#146), posée au-dessus de « Mes coachs ».
 *
 * Elle s'affiche qu'il ait déjà des coachs ou non, et reste acceptable dans les deux cas depuis
 * #599 : un athlète est suivi par 0..N coachs. Refuser vide la liste d'attente de l'inviteur.
 *
 * L'émetteur est un Coach, ou une entreprise depuis #602 (maquette entreprise, frame 8) : la carte
 * nomme alors les Coachs qui le suivront, tous ceux de l'entreprise — accepter n'en choisit aucun.
 *
 * Elle est le SEUL chemin pour rejoindre un coach depuis #390 : il n'y a plus de code à saisir.
 */
export function PendingInvitationCard({
  invitation,
}: Readonly<{ invitation: PendingInvitationDto }>) {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const { issuer } = invitation;
  const fromCoach = issuer.kind === "coach";
  const busy = accept.isPending || decline.isPending;

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">
            {fromCoach
              ? t("coach.invitation.title", { name: issuer.name })
              : t("coach.invitation.fromOrganization.title", { name: issuer.name })}
          </h2>
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("coach.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
          </p>
        </div>

        {issuer.kind === "organization" ? <FutureCoaches names={issuer.coachNames} /> : null}

        <div className="flex flex-wrap items-center gap-cmv-sm">
          <CmvButton disabled={busy} onClick={() => accept.mutate(invitation.id)}>
            {acceptLabel(t, issuer, accept.isPending)}
          </CmvButton>

          {/* Armé comme une suppression : le refus est sans retour, l'inviteur devra réémettre. */}
          <CmvConfirmButton
            label={t("coach.invitation.decline")}
            confirmLabel={t("coach.invitation.declineConfirm")}
            cancelLabel={t("common.cancel")}
            disabled={busy}
            onConfirm={() => decline.mutate(invitation.id)}
          />
        </div>

        <p className="text-cmv-caption text-cmv-text-lo">
          {fromCoach
            ? t("coach.invitation.declineHint")
            : t("coach.invitation.fromOrganization.declineHint", { name: issuer.name })}
        </p>
      </div>
    </CmvCard>
  );
}

/** « Rejoindre M » pour un Coach ; « Accepter » pour une entreprise, qui n'est pas un coach. */
function acceptLabel(
  t: ReturnType<typeof useTranslation>["t"],
  issuer: Issuer,
  pending: boolean,
): string {
  if (pending) return t("coach.invitation.joining");
  return issuer.kind === "coach"
    ? t("coach.invitation.join", { name: issuer.name })
    : t("coach.invitation.fromOrganization.accept");
}

/**
 * Les Coachs qui suivront l'athlète s'il accepte. Liste VIDE = l'entreprise n'en a pas encore :
 * ils le suivront dès leur arrivée (#602) — un état à dire, pas une donnée manquante.
 */
function FutureCoaches({ names }: Readonly<{ names: string[] }>) {
  const { t } = useTranslation();

  if (names.length === 0) {
    return (
      <p className="text-cmv-body text-cmv-text-mid">
        {t("coach.invitation.fromOrganization.noCoach")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-cmv-xs">
      <p className="text-cmv-caption text-cmv-text-mid">
        {t("coach.invitation.fromOrganization.coaches")}
      </p>
      <ul className="flex flex-wrap gap-cmv-md">
        {/* Deux Coachs peuvent porter le même nom ; la liste, figée, ne se réordonne jamais. */}
        {names.map((name, index) => (
          <li key={`${index}:${name}`} className="flex items-center gap-cmv-sm">
            <CmvAvatar name={name} />
            <span className="text-cmv-text-hi">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
