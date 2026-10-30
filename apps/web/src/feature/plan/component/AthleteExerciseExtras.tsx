import { DocumentUsage, type ScheduledSessionExerciseDto } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvRichDocument } from "@/shared/component";

/**
 * La consigne d'un exercice et ses pièces jointes, sur la séance de l'athlète — commun à la carte
 * d'exercice et aux exercices d'un bloc (#722).
 *
 * La consigne est **dépliée par défaut** : le web est l'écran de lecture, l'athlète replie s'il
 * veut la vue d'ensemble. C'est l'inverse du mobile, où la place manque.
 */
export function AthleteExerciseExtras({
  exercise,
}: Readonly<{ exercise: Pick<ScheduledSessionExerciseDto, "instructions" | "documents"> }>) {
  const { t } = useTranslation();
  const hasInstructions = exercise.instructions != null && exercise.instructions.length > 0;
  const [open, setOpen] = useState(true);

  const attachments = exercise.documents.filter(
    (document) => document.usage === DocumentUsage.ATTACHMENT,
  );
  // Les images de consigne se résolvent parmi les documents, jamais par une URL gravée : celle-ci
  // est signée et expire (règle dure n°7).
  const resolveImage = (mediaId: string) =>
    exercise.documents.find((document) => document.id === mediaId)?.url ?? null;

  return (
    <>
      {/* « Jamais de lien vers du vide » : sans consigne, pas de bouton pour l'ouvrir. */}
      {hasInstructions ? (
        <div>
          <CmvButton variant="ghost" onClick={() => setOpen((current) => !current)}>
            {t(open ? "plan.athlete.hideInstructions" : "plan.athlete.showInstructions")}
          </CmvButton>
        </div>
      ) : null}

      {open ? <CmvRichDocument blocks={exercise.instructions} resolveImage={resolveImage} /> : null}

      {attachments.length === 0 ? null : (
        <div className="flex flex-wrap gap-cmv-sm">
          {attachments.map((document) => (
            <CmvButton
              key={document.id}
              variant="secondary"
              // URL GET signée à TTL court, régénérée à chaque lecture : on l'ouvre, on ne la
              // conserve pas. `noopener` comme pour le justificatif de facture.
              onClick={() => window.open(document.url, "_blank", "noopener")}
            >
              {document.fileName ?? t("plan.athlete.document")}
            </CmvButton>
          ))}
        </div>
      )}
    </>
  );
}
