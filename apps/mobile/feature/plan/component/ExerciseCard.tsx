import type { CustomMetric, ScheduledSessionExerciseDto } from "@cmv/shared";
import { DocumentUsage } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { DosageBlock } from "@/feature/plan/component/DosageBlock";
import { CmvRichDocument, CmvText } from "@/shared/component";

type ExerciseCardProps = {
  exercise: ScheduledSessionExerciseDto;
  index: number;
  customMetrics: readonly CustomMetric[];
};

/**
 * Un exercice tel que l'athlète le lit.
 *
 * L'ordre suit la maquette : titre · dosage · lien de consigne · consigne · pièces jointes. La
 * consigne est REPLIÉE par défaut sur mobile — la place n'y est pas, et l'athlète au mur veut
 * d'abord son dosage.
 */
export function ExerciseCard({ exercise, index, customMetrics }: Readonly<ExerciseCardProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const attachments = exercise.documents.filter(
    (document) => document.usage === DocumentUsage.ATTACHMENT,
  );
  // « Jamais de lien vers du vide » : un exercice sans consigne n'affiche pas « Voir la consigne ».
  const hasInstructions = exercise.instructions != null && exercise.instructions.length > 0;

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3">
      <View className="flex-row gap-2">
        <CmvText className="text-cmv-text-lo">{index + 1}</CmvText>
        <CmvText className="flex-1 text-cmv-text-hi">{exercise.title}</CmvText>
        {exercise.tags.map((tag) => (
          <CmvText key={tag} className="text-cmv-accent text-xs">
            {tag}
          </CmvText>
        ))}
      </View>

      {/* Un exercice SANS aucun bloc est légitime — « étirements au ressenti ». On n'affiche alors
          ni grille ni phrase de dosage, seulement le titre et la consigne. */}
      {exercise.blocks.map((block) => (
        <DosageBlock key={block.id} block={block} customMetrics={customMetrics} />
      ))}

      {exercise.note == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{exercise.note}</CmvText>
      )}

      {hasInstructions ? (
        <Pressable onPress={() => setOpen((current) => !current)} hitSlop={8}>
          <CmvText className="text-cmv-accent text-sm">
            {t(open ? "plan.session.hideInstructions" : "plan.session.showInstructions")}
          </CmvText>
        </Pressable>
      ) : null}

      {open ? (
        <CmvRichDocument blocks={exercise.instructions} documents={exercise.documents} />
      ) : null}

      {attachments.map((document) => (
        <Pressable
          key={document.id}
          onPress={() => Linking.openURL(document.url)}
          className="rounded-lg border border-cmv-border bg-cmv-bg-1 px-3 py-2"
        >
          <CmvText className="text-cmv-text-mid text-sm" numberOfLines={1}>
            {document.fileName ?? t("plan.session.link")}
          </CmvText>
        </Pressable>
      ))}
    </View>
  );
}
