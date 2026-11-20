// Banc de `pnpm check:tokens`, jugé avec la config Tailwind du web. Une ligne qui porte
// `✗ <classe>` doit être signalée pour cette classe ; rien d'autre ne doit l'être.

// ── Ce qui doit passer ─────────────────────────────────────────────────────────────────────
export const valid = [
  "bg-cmv-accent text-cmv-text-hi border-cmv-border rounded-cmv-md p-cmv-lg gap-cmv-sm",
  // `text-` vaut pour les couleurs ET les tailles.
  "text-cmv-body text-cmv-accent-on font-cmv-heading",
  // Variantes, marge négative, opacité, important.
  "hover:bg-cmv-accent-hi md:gap-cmv-lg -mt-cmv-xl bg-cmv-accent/20 !text-cmv-caption",
  "[&::-webkit-progress-value]:bg-cmv-accent group-hover:text-cmv-text-mid",
  "accent-cmv-accent shadow-cmv-border from-cmv-surface to-cmv-bg-1 size-cmv-sm",
  // Générée, bien qu'elle cite une classe qui n'existe pas : elle vise un descendant.
  "[&_.text-cmv-text-low]:p-cmv-sm",
];

// ── Ce qui n'est pas une classe ────────────────────────────────────────────────────────────
// La prose : `cmv-chrono` (token nu), les classes `bg-cmv-*` (motif).
// Une variable CSS : var(--cmv-week-rows).
// Un sélecteur de test vise une classe : span.text-cmv-body, .bg-cmv-accent:not(.x).
// La ponctuation de la prose se retire : voir `text-cmv-text-lo`.

// ── Ce qui doit échouer ────────────────────────────────────────────────────────────────────
export const invalid = [
  "text-cmv-accent-fg", // ✗ text-cmv-accent-fg — token absent de la palette
  "text-cmv-h3", // ✗ text-cmv-h3 — taille absente
  "rounded-cmv-2xl", // ✗ rounded-cmv-2xl — existe en spacing, pas en rayons
  "p-cmv-pill", // ✗ p-cmv-pill — existe en rayons, pas en spacing
  "bogus-cmv-accent", // ✗ bogus-cmv-accent — préfixe inconnu
  "hover:text-cmv-text-low", // ✗ hover:text-cmv-text-low — la variante ne sauve pas le token
  "bg-cmv-text", // ✗ bg-cmv-text — la famille n'a pas de DEFAULT
  // Citée plus haut dans une variante arbitraire, qui est générée : elle seule ne l'est pas.
  "text-cmv-text-low", // ✗ text-cmv-text-low
];
// Un sélecteur de test vers une classe fausse : div.text-cmv-h4 ✗ text-cmv-h4
// Chaque classe d'un sélecteur composé : div.rounded-cmv-md.text-cmv-h5:hover ✗ text-cmv-h5
// Une classe assemblée sort tronquée : `text-cmv-${variant}` ✗ text-cmv-$
