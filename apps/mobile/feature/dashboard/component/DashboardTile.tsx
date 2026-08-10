import { View } from "react-native";
import { CmvText } from "@/shared/component";

type DashboardTileProps = {
  label: string;
  /** `null` = donnée indisponible (chargement, panne) → « — », jamais un zéro qui rassurerait à tort. */
  count: number | null;
  hint: string;
  /** Signal d'ÉTAT, réservé aux tuiles qui annoncent du travail. Absent = tuile de contexte. */
  tone?: "warning" | "error";
};

const TONE_CLASSES: Record<"warning" | "error", string> = {
  warning: "border-cmv-warning-line bg-cmv-warning-soft",
  error: "border-cmv-error-line bg-cmv-error-soft",
};

const TONE_TEXT: Record<"warning" | "error", string> = {
  warning: "text-cmv-warning-on",
  error: "text-cmv-error-on",
};

/**
 * Une tuile du tableau de bord. Pendant mobile de `DashboardTile` (web) : mêmes tokens, mêmes
 * règles, implémentation distincte (architecture-choice §5).
 *
 * La couleur n'est pas décorative : les familles de `@cmv/tokens` sont des ÉTATS (arbitrage #37).
 * Une tuile de contexte reste donc neutre — colorer « Athlètes suivis » ferait lire une alerte là
 * où il n'y a qu'un nombre.
 */
export function DashboardTile({ label, count, hint, tone }: Readonly<DashboardTileProps>) {
  return (
    <View
      className={`flex-1 gap-1 rounded-lg border p-4 ${tone == null ? "border-cmv-border bg-cmv-surface" : TONE_CLASSES[tone]}`}
    >
      <CmvText className="text-cmv-text-mid text-xs">{label}</CmvText>
      <CmvText
        className={`font-cmv-display text-2xl ${tone == null ? "text-cmv-text-hi" : TONE_TEXT[tone]}`}
      >
        {count == null ? "—" : count}
      </CmvText>
      <CmvText className="text-cmv-text-lo text-xs">{hint}</CmvText>
    </View>
  );
}
