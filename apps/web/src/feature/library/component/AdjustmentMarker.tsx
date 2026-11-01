/**
 * Le marqueur d'une valeur ajustée pour l'athlète : un carré, et pas seulement une couleur, pour
 * rester lisible par un daltonien.
 */
export function AdjustmentMarker() {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-cmv-sm bg-cmv-info" />;
}
