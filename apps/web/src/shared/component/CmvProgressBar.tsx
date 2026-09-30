type CmvProgressBarProps = {
  // Progression en pourcentage (0–100).
  percent: number;
  label: string;
};

/**
 * Barre de progression (upload de document). `label` sert d'étiquette accessible.
 *
 * Un `<progress>` natif et non un `div role="progressbar"` (#504, S6819) : le rôle, la valeur et
 * ses bornes viennent de l'élément, sans ARIA à tenir à la main. Contrepartie : il se dessine par
 * pseudo-éléments, propres à chaque moteur. `appearance-none` retire le rendu système, puis la piste
 * et le remplissage sont peints deux fois — `::-webkit-progress-*` (Chromium, Safari) et
 * `::-moz-progress-bar` (Firefox, où la piste est l'élément lui-même) — toujours sur les tokens.
 */
export function CmvProgressBar({ percent, label }: Readonly<CmvProgressBarProps>) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <progress
      className="block h-1.5 w-full appearance-none overflow-hidden rounded-cmv-pill border-0 bg-cmv-bg-1 [&::-moz-progress-bar]:rounded-cmv-pill [&::-moz-progress-bar]:bg-cmv-accent [&::-webkit-progress-bar]:bg-cmv-bg-1 [&::-webkit-progress-value]:rounded-cmv-pill [&::-webkit-progress-value]:bg-cmv-accent [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-200"
      aria-label={label}
      value={clamped}
      max={100}
    />
  );
}
