import { View } from "react-native";
import { CmvButton, CmvText } from "@/shared/component";

type PlanningNoticeProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * L'encadré pointillé du planning, quand il n'y a pas de semaine à montrer. Les raisons diffèrent
 * — pas de coach, pas de cycle diffusé, hors cycle — et c'est justement pourquoi elles partagent
 * une seule forme : ce qui doit se distinguer, c'est le texte, pas la boîte.
 */
export function PlanningNotice({
  title,
  description,
  actionLabel,
  onAction,
}: Readonly<PlanningNoticeProps>) {
  return (
    <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
      <CmvText className="text-cmv-text-hi">{title}</CmvText>
      <CmvText className="text-cmv-text-mid text-sm">{description}</CmvText>
      {actionLabel == null || onAction == null ? null : (
        <CmvButton label={actionLabel} onPress={onAction} />
      )}
    </View>
  );
}
