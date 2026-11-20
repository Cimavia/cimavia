// Banc de `pnpm check:tokens`, jugé avec la config Tailwind du mobile (preset NativeWind
// compris). Une ligne qui porte `✗ <classe>` doit être signalée pour cette classe ; rien d'autre.

export const valid = "bg-cmv-accent text-cmv-text-hi rounded-cmv-pill px-cmv-md gap-cmv-xs";

export const invalid = [
  "text-cmv-accent-fg", // ✗ text-cmv-accent-fg — token absent de la palette
  "gap-cmv-2xs", // ✗ gap-cmv-2xs — l'échelle commence à xs
];
