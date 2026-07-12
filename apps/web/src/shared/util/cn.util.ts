// Compose des classes Tailwind conditionnelles (modifiers). Volontairement minimal :
// pas de résolution de conflits (tailwind-merge) — on ne surcharge pas une classe déjà posée.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
