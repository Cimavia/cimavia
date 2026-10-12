import type { Plugin } from "vite";

/**
 * Le budget du bundle web (#629), en octets BRUTS : le gzip dépend de la version de zlib qui le
 * calcule, la taille brute ne dépend que du code. Mesuré à 511 396 et 1 360 719 octets au départ,
 * plus 10 % arrondi au millier inférieur.
 *
 * - `initial` : le JS du premier affichage — l'entrée et tout ce qu'elle importe statiquement,
 *   que le navigateur charge avant de rendre quoi que ce soit ;
 * - `total` : tout le JS émis, chunks chargés à la demande compris (l'éditeur TipTap en est un).
 *
 * Un dépassement fait ÉCHOUER `vite build`, donc le job *Builds de production* et l'image. Relever
 * un budget se fait ici, dans la PR qui le justifie : c'est le chiffre qui se relit.
 */
export type Bundle = { initial: number; total: number };

export const BUNDLE_BUDGET: Readonly<Bundle> = { initial: 562_000, total: 1_496_000 };

/** Ce que le plugin retient d'un chunk émis. */
export type EmittedChunk = { fileName: string; bytes: number; isEntry: boolean; imports: string[] };

/** La taille du premier affichage et la taille totale, en octets. */
export function measureBundle(chunks: readonly EmittedChunk[]): Bundle {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const initial = new Set<string>();
  const visit = (fileName: string) => {
    if (initial.has(fileName)) return;
    initial.add(fileName);
    for (const imported of byName.get(fileName)?.imports ?? []) visit(imported);
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
 * Le plugin : mesure les chunks JS ÉCRITS par `vite build`, et échoue au-delà du budget. En
 * `writeBundle` et non en `generateBundle` : Vite réécrit encore les préchargements des imports
 * dynamiques dans son propre `generateBundle`, qui passe après celui d'un plugin ordinaire.
 */
export function bundleBudgetPlugin(): Plugin {
  return {
    name: "cmv-bundle-budget",
    apply: "build",
    writeBundle(_options, bundle) {
      const chunks: EmittedChunk[] = Object.values(bundle).flatMap((output) =>
        output.type === "chunk"
          ? [
              {
                fileName: output.fileName,
                bytes: Buffer.byteLength(output.code),
                isEntry: output.isEntry,
                imports: output.imports,
              },
            ]
          : [],
      );
      const overruns = budgetOverruns(measureBundle(chunks));
      if (overruns.length > 0) {
        this.error(`Budget dépassé (#629) — ${overruns.join(" ; ")}. Voir bundle-budget.ts.`);
      }
    },
  };
}
