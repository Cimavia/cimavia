import { DocumentUsage, type ScheduledSessionExerciseDto } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PreviewBlock } from "@/feature/library/component/PreviewBlock";
import { CmvButton, CmvCard, CmvRichDocument, CmvTagList } from "@/shared/component";

type AthleteExerciseCardProps = {
  exercise: ScheduledSessionExerciseDto;
  position: number;
};

/**
 * Un exercice tel que l'athlète le lit sur grand écran.
 *
 * Ordre : titre · dosage · grille · lien de consigne · consigne · pièces jointes. Le **seuil de
 * colonnes est une spécificité mobile** — ici le tableau reste aligné quel que soit le nombre de
 * colonnes, où quatre se lisent sans peine.
 *
 * La consigne est **dépliée par défaut** : le web est l'écran de lecture, l'athlète replie s'il
 * veut la vue d'ensemble. C'est l'inverse du mobile, où la place manque.
 */
export function AthleteExerciseCard({ exercise, position }: Readonly<AthleteExerciseCardProps>) {
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
    <CmvCard>
      <div className="flex min-w-0 flex-col gap-cmv-sm">
        <div className="flex items-baseline gap-cmv-sm">
          <span className="font-cmv-mono text-cmv-caption text-cmv-text-lo">{position}</span>
          <h3 className="flex-1 text-cmv-subtitle text-cmv-text-hi">{exercise.title}</h3>
          <CmvTagList tags={exercise.tags} />
        </div>

        {/* Un exercice SANS aucun bloc est légitime — « étirements au ressenti » : ni grille ni
            phrase de dosage, seulement le titre et la consigne. */}
        {exercise.blocks.map((block) => (
          <PreviewBlock key={block.id} block={block} customMetrics={exercise.customMetrics} />
        ))}

        {exercise.note == null ? null : (
          <p className="text-cmv-body text-cmv-text-mid">{exercise.note}</p>
        )}

        {/* « Jamais de lien vers du vide » : sans consigne, pas de bouton pour l'ouvrir. */}
        {hasInstructions ? (
          <div>
            <CmvButton variant="ghost" onClick={() => setOpen((current) => !current)}>
              {t(open ? "plan.athlete.hideInstructions" : "plan.athlete.showInstructions")}
            </CmvButton>
          </div>
        ) : null}

        {open ? (
          <CmvRichDocument blocks={exercise.instructions} resolveImage={resolveImage} />
        ) : null}

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
      </div>
    </CmvCard>
  );
}
