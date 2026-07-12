type CmvProgressBarProps = {
  // Progression en pourcentage (0–100).
  percent: number;
  label: string;
};

// Barre de progression (upload de document). `label` sert d'étiquette accessible.
export function CmvProgressBar({ percent, label }: CmvProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-cmv-pill bg-cmv-bg-1"
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-cmv-pill bg-cmv-accent transition-[width] duration-200"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
