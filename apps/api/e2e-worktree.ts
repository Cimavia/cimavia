import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Un port et une base e2e par worktree (#630). Deux worktrees qui lançaient leurs e2e ensemble
 * écoutaient sur le même port et vidaient la même base l'un sous l'autre : des 401, 404 ou 422 sur
 * des tests sans rapport, et la consigne d'attendre puis de relancer.
 *
 * Le dépôt principal — et la CI, qui n'en clone qu'un — garde les valeurs de ses fichiers (`3001`,
 * `cimavia_db_e2e`). Un worktree lié en dérive deux choses, sans rien à configurer :
 *
 * - **sa base**, du nom que git lui donne (`.git/worktrees/<nom>`) : unique et stable tant que le
 *   worktree existe, deux worktrees ne la partagent donc jamais. `migrate deploy` la crée au besoin ;
 * - **ses ports**, de son rang parmi les worktrees liés, triés par nom. Un rang peut glisser quand
 *   on en crée ou en supprime un pendant qu'une suite tourne : deux suites peuvent alors viser le
 *   même port, et la seconde échoue sur un port pris, en le disant — jamais sur la base d'une autre.
 */

/** Un worktree lié. Le dépôt principal n'en est pas un : il vaut `null`. */
export type Worktree = { name: string; rank: number };

/**
 * Au-delà, les ports d'un worktree déborderaient sur ceux d'une autre suite : les e2e de l'API en
 * prennent deux à partir de 3001, ceux du web commencent à 3101.
 */
export const MAX_RANK = 49;

/** Le suffixe d'une base que les e2e ont le droit de vider — la garde le vérifie avant tout. */
export const DISPOSABLE_SUFFIX = "_e2e";
/**
 * Ce qui sépare le nom de la suite de celui du worktree. Sans lui, l'API d'un worktree nommé `web`
 * viserait `cimavia_db_web_e2e` — la base des e2e web du dépôt principal.
 */
const WORKTREE_MARK = "_wt_";
/** La longueur maximale d'un identifiant Postgres, en octets — au-delà, il est tronqué en silence. */
const PG_MAX_IDENTIFIER = 63;
const HASH_LENGTH = 6;

/**
 * Le worktree décrit par les deux chemins absolus de `git rev-parse` : `null` quand ils sont égaux,
 * c'est-à-dire dans le dépôt principal. `siblings` liste les dossiers de `.git/worktrees/`, le
 * worktree courant compris.
 */
export function linkedWorktree(
  gitDir: string,
  commonDir: string,
  siblings: readonly string[],
): Worktree | null {
  if (gitDir === commonDir) return null;

  const name = basename(gitDir);
  // L'ordre des octets, pas `localeCompare` : deux shells aux locales différentes doivent classer
  // pareil, sans quoi deux worktrees se croiraient au même rang.
  const rank = [...siblings].sort((a, b) => Number(a > b) - Number(a < b)).indexOf(name) + 1;
  if (rank === 0) {
    throw new Error(`Worktree « ${name} » absent de .git/worktrees : git ne le connaît plus.`);
  }
  if (rank > MAX_RANK) {
    throw new Error(
      `Worktree « ${name} » au rang ${rank} : au-delà de ${MAX_RANK}, ses ports e2e déborderaient ` +
        "sur ceux d'une autre suite. Supprimer les worktrees inutiles (git worktree prune).",
    );
  }
  return { name, rank };
}

/**
 * Le worktree d'où tourne la suite. Sans git (une archive, un conteneur), rien ne peut se disputer
 * le port ni la base : les valeurs des fichiers s'appliquent.
 */
export function currentWorktree(cwd = process.cwd()): Worktree | null {
  let output: string;
  try {
    output = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return null;
  }
  const [gitDir, commonDir] = output.trim().split("\n");
  if (gitDir == null || commonDir == null || gitDir === commonDir) return null;
  return linkedWorktree(gitDir, commonDir, readdirSync(join(commonDir, "worktrees")));
}

/**
 * Le port d'une suite : `base` dans le dépôt principal, décalé du rang sinon. `width` est le
 * nombre de ports consécutifs que la suite prend à partir de sa base.
 */
export function worktreePort(base: number, worktree: Worktree | null, width = 1): number {
  return worktree == null ? base : base + worktree.rank * width;
}

/**
 * L'URL de la base du worktree : `cimavia_db_e2e` devient `cimavia_db_wt_<nom>_<empreinte>_e2e`.
 * L'empreinte du nom brut départage ce que le passage en identifiant confond (`tech-630` et
 * `tech_630`, deux worktrees distincts pour git). Une base qui ne
 * finit pas par `_e2e` revient INCHANGÉE : la réécrire lui donnerait le suffixe, et ferait taire la
 * garde qui refuse de vider une base qui ne s'annonce pas jetable.
 */
export function worktreeDatabaseUrl(url: string, worktree: Worktree | null): string {
  if (worktree == null) return url;

  const parsed = new URL(url);
  const database = parsed.pathname.slice(1);
  if (!database.endsWith(DISPOSABLE_SUFFIX)) return url;

  const prefix = `${database.slice(0, -DISPOSABLE_SUFFIX.length)}${WORKTREE_MARK}`;
  const room = PG_MAX_IDENTIFIER - prefix.length - DISPOSABLE_SUFFIX.length;
  parsed.pathname = `/${prefix}${identifierOf(worktree.name, room)}${DISPOSABLE_SUFFIX}`;
  return parsed.toString();
}

/**
 * Le nom du worktree en identifiant Postgres, sur `room` caractères au plus : sa forme lisible,
 * tronquée s'il le faut, puis l'empreinte du nom complet — c'est elle qui garantit l'unicité.
 */
function identifierOf(name: string, room: number): string {
  const hash = createHash("sha256").update(name).digest("hex").slice(0, HASH_LENGTH);
  const slug = name
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .filter(Boolean)
    .join("_");
  // Un seul `_` possible en bout de coupe : le slug n'en a jamais deux de suite.
  const cut = slug.slice(0, room - HASH_LENGTH - 1);
  const head = cut.endsWith("_") ? cut.slice(0, -1) : cut;
  return head === "" ? hash : `${head}_${hash}`;
}
