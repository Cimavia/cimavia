import { DocumentUsage, type ScheduledSessionExerciseDto } from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
  freshDocumentUrl,
  type OpenDocumentOutcome,
  openDocument,
} from "@/feature/plan/lib/open-document";
import { CmvRichDocument, CmvText } from "@/shared/component";

type ExerciseExtrasProps = {
  exercise: Pick<ScheduledSessionExerciseDto, "id" | "instructions" | "documents">;
  /** Le cycle dont la séance est issue : il localise les documents descendus sur l'appareil. */
  planId: string;
  /** La séance qui le porte : c'est elle qu'on recharge quand l'URL d'un document a expiré. */
  sessionId: string;
};

/**
 * La consigne d'un exercice et ses pièces jointes, sous son dosage. La consigne est REPLIÉE par
 * défaut sur mobile — la place n'y est pas, et l'athlète au mur veut d'abord son dosage.
 *
 * Partagée par la carte d'un exercice (ancien modèle) et celle d'un bloc (#722) : le contenu d'un
 * exercice se lit pareil, quelle que soit la structure qui le porte.
 */
export function ExerciseExtras({ exercise, planId, sessionId }: Readonly<ExerciseExtrasProps>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const network = useNetworkState();
  const isOnline = network.isInternetReachable !== false;

  // Une seule pièce jointe en échec à la fois : l'athlète en tape une, et le message porte sur
  // celle-là. En garder plusieurs laisserait traîner l'échec d'un document déjà rouvert depuis.
  const [failure, setFailure] = useState<{ id: string; outcome: OpenDocumentOutcome } | null>(null);

  const attachments = exercise.documents.filter(
    (document) => document.usage === DocumentUsage.ATTACHMENT,
  );
  // « Jamais de lien vers du vide » : un exercice sans consigne n'affiche pas « Voir la consigne ».
  const hasInstructions = exercise.instructions != null && exercise.instructions.length > 0;

  return (
    <>
      {hasInstructions ? (
        <Pressable onPress={() => setOpen((current) => !current)} hitSlop={8}>
          <CmvText className="text-cmv-accent text-sm">
            {t(open ? "plan.session.hideInstructions" : "plan.session.showInstructions")}
          </CmvText>
        </Pressable>
      ) : null}

      {open ? (
        <CmvRichDocument
          blocks={exercise.instructions}
          documents={exercise.documents}
          planId={planId}
        />
      ) : null}

      {attachments.map((document) => (
        <View key={document.id} className="gap-1">
          <Pressable
            onPress={() => {
              const freshUrl = () => freshDocumentUrl(queryClient, sessionId, document.id);
              void openDocument(planId, document, isOnline, freshUrl).then((outcome) =>
                setFailure(outcome === "opened" ? null : { id: document.id, outcome }),
              );
            }}
            className="rounded-lg border border-cmv-border bg-cmv-bg-1 px-3 py-2"
          >
            <CmvText className="text-cmv-text-mid text-sm" numberOfLines={1}>
              {document.fileName ?? t("plan.session.link")}
            </CmvText>
          </Pressable>

          {/* L'échec se dit SOUS la pièce jointe concernée : le mobile n'a pas de toasts, et un
              message global n'apprendrait pas laquelle des trois n'a pas voulu s'ouvrir. */}
          {failure?.id === document.id ? (
            <CmvText className="text-cmv-text-lo text-xs">
              {failure.outcome === "offline"
                ? t("plan.session.documentOffline")
                : t("plan.session.documentUnavailable")}
            </CmvText>
          ) : null}
        </View>
      ))}
    </>
  );
}
