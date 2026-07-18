// Durée en secondes → « m:ss » (note vocale, lecteur/enregistreur audio).
export function formatMmSs(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
