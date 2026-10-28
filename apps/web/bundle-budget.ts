import type { Plugin } from "vite";

/**
 * Le budget du bundle web (#629), en octets BRUTS : le gzip dépend de la version de zlib qui le
 * calcule, la taille brute ne dépend que du code. Mesuré à 594 205 et 1 525 504 octets (#719 : le
 * constructeur de séance par blocs), plus 10 % arrondi au millier inférieur.
 *
 * - `initial` : le JS et le CSS du premier affichage — l'entrée, tout ce qu'elle importe
 *   statiquement et les feuilles de style de ces chunks, que le navigateur charge avant de rendre
 *   quoi que ce soit ;
 * - `total` : tout le JS et le CSS émis, chunks chargés à la demande compris (l'éditeur TipTap en
 *   est un).
 *
 * Le CSS compte parce qu'il bloque le rendu autant que le JS : une police embarquée en data URI ou
 * un safelist Tailwind trop large le gonflerait sans que rien d'autre bouge. Les polices et images
 * servies en fichiers à part restent hors budget.
 *
 * Un dépassement fait ÉCHOUER `vite build`, donc le job *Builds de production* et l'image. Relever
 * un budget se fait ici, dans la PR qui le justifie : c'est le chiffre qui se relit.
 */
export type Bundle = { initial: number; total: number };

export const BUNDLE_BUDGET: Readonly<Bundle> = { initial: 653_000, total: 1_678_000 };

/** Ce que le plugin retient d'un chunk émis : son poids, ses imports statiques, ses feuilles. */
export type EmittedChunk = {
  fileName: string;
  bytes: number;
  isEntry: boolean;
  imports: string[];
  css: string[];
};

/** Une feuille de style émise. */
export type EmittedStyle = { fileName: string; bytes: number };

/** La taille du premier affichage et la taille totale, en octets. */
export function measureBundle(
  chunks: readonly EmittedChunk[],
  styles: readonly EmittedStyle[] = [],
): Bundle {
  const byName = new Map<string, { bytes: number }>(
    [...chunks, ...styles].map((file) => [file.fileName, file]),
  );
  const chunkByName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const initial = new Set<string>();
  const visit = (fileName: string) => {
    if (initial.has(fileName)) return;
    initial.add(fileName);
    const chunk = chunkByName.get(fileName);
    for (const sheet of chunk?.css ?? []) initial.add(sheet);
    for (const imported of chunk?.imports ?? []) visit(imported);
  };
  for (const chunk of chunks) if (chunk.isEntry) visit(chunk.fileName);

  const sizeOf = (names: Iterable<string>) =>
    [...names].reduce((sum, name) => sum + (byName.get(name)?.bytes ?? 0), 0);
  return { initial: sizeOf(initial), total: sizeOf(byName.keys()) };
}

/** Un message par budget dépassé, vide quand tout tient. */
export function budgetOverruns(
  measured: Bundle,
  budget: Readonly<Bundle> = BUNDLE_BUDGET,
): string[] {
  return (Object.keys(budget) as (keyof Bundle)[])
    .filter((key) => measured[key] > budget[key])
    .map(
      (key) =>
        `bundle ${key} : ${measured[key]} octets pour un budget de ${budget[key]} (+${measured[key] - budget[key]})`,
    );
}

/**
 * Le plugin : mesure le JS et le CSS ÉCRITS par `vite build`, et échoue au-delà du budget. En
 * `writeBundle` et non en `generateBundle` : Vite réécrit encore les préchargements des imports
 * dynamiques dans son propre `generateBundle`, qui passe après celui d'un plugin ordinaire.
 */
export function bundleBudgetPlugin(): Plugin {
  return {
    name: "cmv-bundle-budget",
    apply: "build",
    writeBundle(_options, bundle) {
      const chunks: EmittedChunk[] = [];
      const styles: EmittedStyle[] = [];
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          chunks.push({
            fileName: output.fileName,
            bytes: Buffer.byteLength(output.code),
            isEntry: output.isEntry,
            imports: output.imports,
            css: [...(output.viteMetadata?.importedCss ?? [])],
          });
        } else if (output.fileName.endsWith(".css")) {
          styles.push({ fileName: output.fileName, bytes: Buffer.byteLength(output.source) });
        }
      }
      const overruns = budgetOverruns(measureBundle(chunks, styles));
      if (overruns.length > 0) {
        this.error(`Budget dépassé (#629) — ${overruns.join(" ; ")}. Voir bundle-budget.ts.`);
      }
    },
  };
}
