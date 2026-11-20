import { useTranslation } from "react-i18next";
import { CmvButton, CmvCard } from "@/shared/component";

/**
 * Le rail d'envoi : ce qui va partir, puis le bouton pour le faire.
 *
 * La phrase est là pour qu'un débrief vide ne parte pas par accident — mais elle n'EMPÊCHE rien :
 * « séance faite, aucun commentaire, aucun décompte » est une réponse valable, et le bouton reste
 * actif pour la dire.
 */
export function FeedbackSubmitRail({
  hasContent,
  hasMedia,
  hasTracking,
  canSubmit,
  isPending,
  error,
  saved,
  onSubmit,
}: Readonly<{
  hasContent: boolean;
  hasMedia: boolean;
  hasTracking: boolean;
  canSubmit: boolean;
  isPending: boolean;
  error: string | null;
  saved: boolean;
  onSubmit: () => void;
}>) {
  const { t } = useTranslation();
  const empty = !hasContent && !hasMedia && !hasTracking;

  return (
    <aside className="flex min-w-0 flex-col gap-cmv-md xl:sticky xl:top-32 xl:self-start">
      <CmvCard>
        <div className="flex flex-col gap-cmv-md">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {t("feedback.submit.title")}
          </h2>
          <p className="text-cmv-body text-cmv-text-mid">
            {t(empty ? "feedback.submit.empty" : "feedback.submit.filled")}
          </p>

          <CmvButton disabled={isPending || !canSubmit} onClick={onSubmit}>
            {isPending ? t("feedback.saving") : t("feedback.submit.action")}
          </CmvButton>

          {error == null ? null : <span className="text-cmv-body text-cmv-error-on">{error}</span>}
          {saved ? (
            <span className="text-cmv-body text-cmv-accent">{t("feedback.saved")}</span>
          ) : null}
        </div>
      </CmvCard>
    </aside>
  );
}
