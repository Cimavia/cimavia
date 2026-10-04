import type { FeedbackTracking, SessionFeedbackDto } from "@cmv/shared";
import { draftAfterLoad } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackForm } from "@/feature/feedback/component/FeedbackForm";
import { useUpsertFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

type FeedbackTextSectionProps = {
  sessionId: string;
  /** `null` tant qu'aucun débrief n'existe : le champ part alors vide. */
  feedback: SessionFeedbackDto | null;
  /** Absent quand la séance n'a pas pu être chargée : on n'envoie alors AUCUN décompte. */
  tracking?: FeedbackTracking;
  trackingDirty?: boolean;
  /** Reçoit le suivi PARTI — `undefined` si l'envoi n'en portait pas. */
  onSaved?: (sent: FeedbackTracking | undefined) => void;
};

// Le texte libre du débrief : saisie, enregistrement, et ce que l'enregistrement a donné.
export function FeedbackTextSection({
  sessionId,
  feedback,
  tracking,
  trackingDirty = false,
  onSaved,
}: Readonly<FeedbackTextSectionProps>) {
  const { t } = useTranslation();
  const upsert = useUpsertFeedback(sessionId, onSaved);
  const [content, setContent] = useState("");

  /**
   * Le formulaire part de ce qui est déjà enregistré (débrief repris en plusieurs fois). On
   * n'examine le champ QUE quand l'identité du débrief chargé change : réécrire à chaque render
   * effacerait la frappe en cours dès qu'une requête d'arrière-plan se termine. Et l'examen ne
   * réécrit pas une frappe : cette identité naît au premier média joint, texte en cours (#284).
   *
   * Ajusté PENDANT le render, pas dans un effet : c'est de l'état dérivé d'une donnée chargée, et
   * la version en `useEffect` mentait au linter (elle lisait `content` sans en dépendre) tout en
   * affichant un render de trop avec l'ancien texte.
   */
  const [synced, setSynced] = useState<SessionFeedbackDto | null>(null);
  if ((feedback?.id ?? null) !== (synced?.id ?? null)) {
    setSynced(feedback);
    setContent(draftAfterLoad(content, synced?.content ?? null, feedback?.content ?? null));
  }

  // Un premier débrief vide reste légitime (« séance faite, rien à signaler ») ; ré-enregistrer
  // un texte inchangé, non.
  const canSubmit = feedback == null || content !== (feedback.content ?? "") || trackingDirty;

  return (
    <>
      <FeedbackForm
        value={content}
        onChange={setContent}
        onSubmit={() =>
          upsert.mutate({
            content: content.length === 0 ? null : content,
            ...(tracking == null ? {} : { tracking }),
          })
        }
        isSaving={upsert.isPending}
        canSubmit={canSubmit}
      />

      {upsert.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(upsert.error) ?? t("feedback.saveError")}
        </CmvText>
      ) : null}

      {upsert.isSuccess && !canSubmit ? (
        <CmvText className="text-cmv-accent text-sm">{t("feedback.saved")}</CmvText>
      ) : null}
    </>
  );
}
