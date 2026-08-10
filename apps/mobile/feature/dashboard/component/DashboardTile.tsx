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
 * Deux conséquences, et la seconde a été oubliée en première passe :
 *  - une tuile de CONTEXTE reste neutre — colorer « Athlètes suivis » ferait lire une alerte là où
 *    il n'y a qu'un nombre ;
 *  - une tuile d'ALERTE ne se colore que si elle a réellement quelque chose à signaler. Un « 0 » en
 *    ambre ou un « — » en rouge crient au loup : le premier alors qu'il n'y a rien à faire, le
 *    second alors qu'on ne sait pas encore.
 */
export function DashboardTile({ label, count, hint, tone }: Readonly<DashboardTileProps>) {
  const signal = tone != null && count != null && count > 0 ? tone : null;

  return (
    <View
      className={`flex-1 gap-1 rounded-lg border p-4 ${signal == null ? "border-cmv-border bg-cmv-surface" : TONE_CLASSES[signal]}`}
    >
      <CmvText className="text-cmv-text-mid text-xs">{label}</CmvText>
      <CmvText
        className={`font-cmv-display text-2xl ${signal == null ? "text-cmv-text-hi" : TONE_TEXT[signal]}`}
      >
        {count == null ? "—" : count}
      </CmvText>
      <CmvText className={`text-xs ${signal == null ? "text-cmv-text-lo" : TONE_TEXT[signal]}`}>
        {hint}
      </CmvText>
    </View>
  );
}
