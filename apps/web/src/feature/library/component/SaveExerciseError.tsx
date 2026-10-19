import { useTranslation } from "react-i18next";
import { AttachmentFailedError } from "@/feature/library/hook/useSaveExercise";
import { CmvFormError } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

type SaveExerciseErrorProps = {
  /** L'erreur de l'enregistrement, `null` tant qu'il n'a pas échoué. */
  error: unknown;
};

/**
 * L'échec d'un enregistrement d'exercice. Un document qui ne se joint pas se dit à part : il tombe
 * après l'écriture de l'exercice, et le Coach doit savoir lequel et que sa saisie est enregistrée
 * (#649). Puis pourquoi : un refus de l'API dit quoi corriger, et réessayer tel quel n'y changerait
 * rien ; une panne (réseau, storage, 5xx) n'a rien à dire, sinon qu'il suffit de réessayer.
 */
export function SaveExerciseError({ error }: Readonly<SaveExerciseErrorProps>) {
  const { t } = useTranslation();
  if (!(error instanceof AttachmentFailedError)) return <CmvFormError error={error} />;
  const reason = apiErrorMessage(error.cause);
  const message =
    reason == null
      ? t("library.builder.attachment.failed", { fileName: error.fileName })
      : t("library.builder.attachment.refused", { fileName: error.fileName, reason });
  return <CmvFormError error={error} message={message} />;
}
