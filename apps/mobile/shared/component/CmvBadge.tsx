import { View } from "react-native";
import { CmvText } from "./CmvText";

type CmvBadgeVariant = "neutral" | "accent" | "success" | "warning" | "error" | "info";

/**
 * Une pastille = fond `soft` + bordure `line` + texte `on`, jamais le `DEFAULT` d'une famille
 * (trop sombre pour du texte, cf. @cmv/tokens). `neutral` reste le cas sans signal : les neutres
 * granite n'ont pas de nuance `on`, le texte y est `text-mid`.
 *
 * Pendant mobile de `CmvBadge` (web) : mêmes variants, mêmes tokens, implémentation distincte
 * (architecture-choice §5 — seuls les tokens sont partagés). La puce n'hérite pas de
 * `currentColor` en NativeWind, d'où sa classe par variant.
 */
const VARIANT_CLASSES: Record<CmvBadgeVariant, { container: string; text: string; dot: string }> = {
  neutral: {
    container: "border-cmv-border bg-cmv-surface-hi",
    text: "text-cmv-text-mid",
    dot: "bg-cmv-text-mid",
  },
  accent: {
    container: "border-cmv-accent-line bg-cmv-accent-soft",
    text: "text-cmv-accent-on",
    dot: "bg-cmv-accent-on",
  },
  success: {
    container: "border-cmv-success-line bg-cmv-success-soft",
    text: "text-cmv-success-on",
    dot: "bg-cmv-success-on",
  },
  warning: {
    container: "border-cmv-warning-line bg-cmv-warning-soft",
    text: "text-cmv-warning-on",
    dot: "bg-cmv-warning-on",
  },
  error: {
    container: "border-cmv-error-line bg-cmv-error-soft",
    text: "text-cmv-error-on",
    dot: "bg-cmv-error-on",
  },
  info: {
    container: "border-cmv-info-line bg-cmv-info-soft",
    text: "text-cmv-info-on",
    dot: "bg-cmv-info-on",
  },
};

type CmvBadgeProps = {
  label: string;
  variant?: CmvBadgeVariant;
  /** Puce colorée en tête (maquette design system) : réservée aux ÉTATS, pas aux catégories. */
  dot?: boolean;
};

export function CmvBadge({ label, variant = "neutral", dot = false }: Readonly<CmvBadgeProps>) {
  const classes = VARIANT_CLASSES[variant];

  return (
    <View
      // `shrink-0` : une pastille ne se comprime JAMAIS. Posée en bout d'une ligne dont le titre
      // porte `flex-1`, elle se laissait rétrécir jusqu'à couper son libellé au premier espace —
      // « À venir » s'affichait « À ». C'est le titre qui doit céder de la place, pas l'état.
      // Révélé sur téléphone en #46 ; ni `tsc`, ni `expo export` ne voient ce genre de cas.
      className={`shrink-0 flex-row items-center gap-1.5 self-start rounded-md border px-3 py-1 ${classes.container}`}
    >
      {dot ? <View className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} /> : null}
      {/* Une pastille tient sur UNE ligne : un état qui passe à la ligne n'est plus une pastille. */}
      <CmvText className={`text-xs ${classes.text}`} numberOfLines={1}>
        {label}
      </CmvText>
    </View>
  );
}
