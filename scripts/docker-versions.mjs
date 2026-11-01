#!/usr/bin/env node
/**
 * Extrait de `package.json` les versions de pnpm et de turbo que les Dockerfiles installent (#479).
 *
 * POURQUOI ce script existe : les deux Dockerfiles recopiaient ces versions en dur. Dependabot monte
 * `turbo` dans `package.json` sans toucher aux Dockerfiles, et l'image faisait alors son `prune`
 * avec un autre turbo que la CI et le poste de dev, sans que rien ne le signale.
 *
 * POURQUOI un fichier par version, et pas `package.json` lui-même : `package.json` change à chaque
 * release (son champ `version`). Le copier dans l'étage qui installe pnpm invaliderait toutes les
 * couches suivantes, installation comprise. Les Dockerfiles copient donc la SORTIE de ce script,
 * dont BuildKit compare le contenu : tant que les deux versions ne bougent pas, le cache tient.
 *
 * Une version absente ou qui n'est pas exacte (`^2.11.9`, `latest`) fait échouer le build : une
 * image construite avec « une » version de turbo ne serait plus celle que la CI a vérifiée.
 *
 * Usage : node scripts/docker-versions.mjs <package.json> <dossier de sortie>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [manifestPath, outDir] = process.argv.slice(2);
if (!manifestPath || !outDir) {
  console.error("Usage : node scripts/docker-versions.mjs <package.json> <dossier de sortie>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const exact = String.raw`\d+\.\d+\.\d+`;

// `corepack use` ajoute l'empreinte du paquet (`+sha512.…`) : elle est gardée, corepack la vérifie.
const pnpm = new RegExp(String.raw`^pnpm@(${exact}(?:\+sha\d+\.[0-9a-f]+)?)$`).exec(
  manifest.packageManager ?? "",
)?.[1];
const turbo = manifest.devDependencies?.turbo;

const errors = [
  pnpm ? null : `packageManager doit valoir pnpm@X.Y.Z (lu : ${manifest.packageManager})`,
  new RegExp(`^${exact}$`).test(turbo ?? "")
    ? null
    : `devDependencies.turbo doit être une version exacte X.Y.Z (lu : ${turbo})`,
].filter(Boolean);
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "pnpm"), pnpm);
writeFileSync(join(outDir, "turbo"), turbo);
