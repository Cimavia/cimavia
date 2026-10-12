#!/usr/bin/env node
/**
 * Recopie dans un worktree neuf les `.env` du dépôt principal (#630). Lancé par le `prepare` de la
 * racine, donc au premier `pnpm install` du worktree — le seul passage commun à `git worktree add`,
 * à herdr et à Claude Code, aucun des trois n'ayant de hook de création qui serve aux deux autres.
 *
 * POURQUOI : ces fichiers sont ignorés par git, et un worktree n'en reçoit aucun. Sans eux, l'API
 * ne démarre pas, les e2e refusent de se lancer, et Metro annonce une IP que le téléphone ne joint
 * pas (`apps/mobile/.env.local`). Aucun ne porte de chemin propre au checkout, et les e2e dérivent
 * eux-mêmes leur port et leur base du worktree (`apps/api/e2e-worktree.ts`) : une copie telle quelle
 * suffit.
 *
 * CE QU'IL COPIE : les fichiers `.env*` ignorés par git à la racine ou à la racine d'un paquet
 * (`apps/api/.env`, `apps/mobile/.env.local`…). Pas plus profond : le bac à sable de Stryker en
 * porte des copies (`apps/api/.stryker-tmp/…`). Les modèles `.env*.example` sont suivis par git, le
 * checkout les a déjà.
 *
 * CE QU'IL NE FAIT JAMAIS : écraser un fichier présent — un `.env` retouché dans le worktree est à
 * son auteur —, ni faire échouer l'installation. Dans le dépôt principal, hors git, ou en CI (qui
 * installe en `--ignore-scripts`), il ne fait rien.
 *
 * ABSENT, IL N'EST PAS UNE ERREUR : l'image de l'API lance ce `prepare` (`pnpm deploy` joue les
 * scripts du workspace) sur un arbre issu de `turbo prune`, qui ne copie pas `scripts/`. D'où son
 * appel par un `import()` qui tolère le seul module introuvable, dans `package.json` — comme
 * `husky` y tolère l'absence de `.git`.
 */
import { execFileSync } from "node:child_process";
import { constants, copyFileSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = /^(?:[^/]+\/[^/]+\/)?\.env[^/]*$/;

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Le dépôt principal, si l'on est dans un worktree lié ; `null` sinon — hors git compris. */
function mainCheckout() {
  let paths;
  try {
    paths = git(
      process.cwd(),
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir",
    );
  } catch {
    // Une archive sans `.git` (un build EAS, un conteneur) : aucun worktree à compléter.
    return null;
  }
  const [gitDir, commonDir] = paths.split("\n");
  if (gitDir === commonDir) return null;
  // Le premier bloc de `worktree list` est toujours le dépôt principal.
  return git(process.cwd(), "worktree", "list", "--porcelain")
    .split("\n")[0]
    .replace(/^worktree /, "");
}

/** Les `.env` ignorés du dépôt principal. `--directory` : `node_modules/` ne se déplie pas. */
function envFiles(main) {
  return git(main, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z")
    .split("\0")
    .filter((path) => ENV_FILE.test(path));
}

function copyMissing(main, files) {
  const copied = [];
  for (const path of files) {
    try {
      copyFileSync(join(main, path), path, constants.COPYFILE_EXCL);
      copied.push(path);
    } catch (error) {
      // Déjà là : le worktree a le sien. Un dossier absent (paquet supprimé sur cette branche) : rien
      // à configurer. Toute autre erreur remonte.
      if (error.code !== "EEXIST" && error.code !== "ENOENT") throw error;
    }
  }
  return copied;
}

try {
  const main = mainCheckout();
  if (main != null) {
    const copied = copyMissing(main, envFiles(main));
    if (copied.length > 0) {
      console.info(`worktree : recopiés de ${main} — ${copied.join(", ")}`);
    }
  }
} catch (error) {
  // Git en échec dans un worktree : l'installation ne doit pas tomber pour un confort.
  console.warn(`worktree : .env non recopiés (${error.message}). À faire à la main au besoin.`);
}
