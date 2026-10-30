import {
  type ExerciseTracking,
  type ScheduledSessionExerciseDto,
  trackingSummary,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PreviewBlock } from "@/feature/library/component/PreviewBlock";
import { AthleteExerciseExtras } from "@/feature/plan/component/AthleteExerciseExtras";
import { TrackingList } from "@/feature/plan/component/TrackingList";
import { CmvBadge, CmvCard, CmvTagList } from "@/shared/component";

// i18n-values plan.tracking.count: TrackingUnit

type AthleteExerciseCardProps = {
  exercise: ScheduledSessionExerciseDto;
  position: number;
  tracking: ExerciseTracking | null;
  onToggleUnit: (blockId: string, index: number) => void;
  onRounds: (blockId: string, rounds: number) => void;
};

/**
 * Un exercice tel que l'athlète le lit sur grand écran.
 *
 * Ordre : titre · dosage · grille · lien de consigne · consigne · pièces jointes. Le **seuil de
 * colonnes est une spécificité mobile** — ici le tableau reste aligné quel que soit le nombre de
 * colonnes, où quatre se lisent sans peine. La consigne et les pièces jointes :
 * `AthleteExerciseExtras`.
 */
export function AthleteExerciseCard({
  exercise,
  position,
  tracking,
  onToggleUnit,
  onRounds,
}: Readonly<AthleteExerciseCardProps>) {
  const { t } = useTranslation();

  const summary = trackingSummary(exercise.blocks, tracking);

  return (
    <CmvCard>
      <div className="flex min-w-0 flex-col gap-cmv-sm">
        <div className="flex items-baseline gap-cmv-sm">
          <span className="font-cmv-mono text-cmv-caption text-cmv-text-lo">{position}</span>
          <h3 className="flex-1 text-cmv-subtitle text-cmv-text-hi">{exercise.title}</h3>
          {/* UNE case cochée ⇒ UNE pastille. L'état « non suivi » reste silencieux : jamais
              « 0 sur 4 », jamais de rouge, jamais de relance. */}
          {summary.done > 0 && summary.unit != null ? (
            <CmvBadge variant={summary.state === "DONE" ? "success" : "accent"}>
              {t(`plan.tracking.count.${summary.unit}`, {
                done: summary.done,
                total: summary.total,
              })}
            </CmvBadge>
          ) : null}
          <CmvTagList tags={exercise.tags} />
        </div>

        {/* Un exercice SANS aucun bloc est légitime — « étirements au ressenti » : ni grille ni
            phrase de dosage, seulement le titre et la consigne. */}
        {/* Ordre de la maquette : titre · dosage · grille · CASES · lien de consigne · consigne. */}
        {exercise.blocks.map((block) => (
          <div key={block.id} className="flex flex-col gap-cmv-sm">
            <PreviewBlock block={block} customMetrics={exercise.customMetrics} />
            <TrackingList
              block={block}
              customMetrics={exercise.customMetrics}
              state={tracking?.[block.id]}
              onToggle={(index) => onToggleUnit(block.id, index)}
              onRounds={(rounds) => onRounds(block.id, rounds)}
            />
          </div>
        ))}

        {exercise.note == null ? null : (
          <p className="text-cmv-body text-cmv-text-mid">{exercise.note}</p>
        )}

        <AthleteExerciseExtras exercise={exercise} />
      </div>
    </CmvCard>
  );
}
