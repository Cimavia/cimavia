import { CmvCard } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

/**
 * Une tuile chiffrée du tableau de bord, en deux variants.
 *
 * - **`action`** (rangée « À traiter ») : ce qui appelle un geste aujourd'hui. Chiffre en grand,
 *   carte cliquable, indice coloré quand il y a effectivement quelque chose à faire.
 * - **`overview`** (rangée « Vue d'ensemble ») : l'état du portefeuille. Chiffre d'un cran plus
 *   petit, carte statique, indice toujours neutre.
 *
 * Ce cran d'écart EST la raison d'être des deux rangées : rendues à poids égal, sept tuiles
 * redeviendraient une grille indifférenciée où rien ne ressort.
 */

// Ce qu'affiche une tuile dont la donnée n'est pas là. Distinct d'un « 0 », qui est une réponse.
const UNKNOWN_VALUE = "—";

type DashboardTileVariant = "action" | "overview";
type DashboardTileTone = "neutral" | "warning" | "error";

const VALUE_CLASS: Record<DashboardTileVariant, string> = {
  action: "text-cmv-title",
  overview: "text-cmv-subtitle",
};

const TONE_CLASS: Record<DashboardTileTone, string> = {
  neutral: "text-cmv-text-lo",
  warning: "text-cmv-warning-on",
  error: "text-cmv-error-on",
};

type DashboardTileProps = {
  label: string;
  /**
   * `null` = donnée indisponible (chargement, panne) → « — ». Un `0` CONNU s'affiche « 0 » : les
   * deux ne disent pas la même chose, et les confondre annoncerait « rien à faire » sur une API
   * injoignable (règle nullable).
   */
  count: number | null;
  hint: string;
  variant?: DashboardTileVariant;
  tone?: DashboardTileTone;
  /** Omis = tuile statique (`CmvCard` rend alors un `div`, pas un bouton). */
  onClick?: () => void;
};

export function DashboardTile({
  label,
  count,
  hint,
  variant = "overview",
  tone = "neutral",
  onClick,
}: Readonly<DashboardTileProps>) {
  /**
   * La couleur marque l'EXCEPTION, pas la règle (arbitrage des couleurs d'état, #37) : elle
   * n'apparaît que si la tuile a réellement quelque chose à signaler. Un « 0 » en ambre ou un
   * « — » en rouge crieraient au loup — le premier alors qu'il n'y a rien, le second alors qu'on
   * ne sait pas.
   */
  const isSignalling = tone !== "neutral" && count != null && count > 0;

  return (
    // Prop OMISE plutôt que passée à `undefined` : sous `exactOptionalPropertyTypes`, les deux ne
    // sont pas la même chose, et c'est l'absence qui fait rendre un `div` statique à `CmvCard`
    // (spread typé sur une prop connue, pas un `...rest` fourre-tout — cf. archi §5).
    <CmvCard {...(onClick == null ? {} : { onClick })}>
      <div className="flex flex-col gap-cmv-xs">
        <span className="text-cmv-caption text-cmv-text-mid">{label}</span>
        <span className={cn("font-cmv-display text-cmv-text-hi", VALUE_CLASS[variant])}>
          {count == null ? UNKNOWN_VALUE : String(count)}
        </span>
        <span
          className={cn("text-cmv-caption", isSignalling ? TONE_CLASS[tone] : TONE_CLASS.neutral)}
        >
          {hint}
        </span>
      </div>
    </CmvCard>
  );
}
