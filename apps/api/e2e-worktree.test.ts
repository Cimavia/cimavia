import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  currentWorktree,
  linkedWorktree,
  MAX_RANK,
  type Worktree,
  worktreeDatabaseUrl,
  worktreePort,
} from "./e2e-worktree";

const COMMON = "/depot/.git";
const E2E_URL = "postgresql://cimavia_e2e:cimavia_dev_e2e@localhost:5434/cimavia_db_e2e";
const BIS: Worktree = { name: "cimavia-bis", rank: 1 };

const WEB_E2E_URL = E2E_URL.replace("cimavia_db_e2e", "cimavia_db_web_e2e");

const databaseOf = (url: string) => new URL(url).pathname.slice(1);
const worktreeDatabase = (name: string, url = E2E_URL) =>
  databaseOf(worktreeDatabaseUrl(url, { name, rank: 1 }));

describe("linkedWorktree", () => {
  it("vaut null dans le dépôt principal, où les deux dossiers git sont le même", () => {
    expect(linkedWorktree(COMMON, COMMON, ["cimavia-bis"])).toBeNull();
  });

  it("classe par octets, pas selon la locale du shell qui lance la suite", () => {
    const siblings = ["b", "B", "é", "e"];

    expect(linkedWorktree(`${COMMON}/worktrees/B`, COMMON, siblings)?.rank).toBe(1);
    expect(linkedWorktree(`${COMMON}/worktrees/é`, COMMON, siblings)?.rank).toBe(4);
  });

  it("classe le worktree par nom parmi ses voisins, le premier au rang 1", () => {
    const siblings = ["worktree-third", "cimavia-bis", "second-worktree"];

    expect(linkedWorktree(`${COMMON}/worktrees/cimavia-bis`, COMMON, siblings)).toEqual(BIS);
    expect(linkedWorktree(`${COMMON}/worktrees/worktree-third`, COMMON, siblings)).toEqual({
      name: "worktree-third",
      rank: 3,
    });
  });

  it("refuse un rang dont les ports déborderaient sur une autre suite", () => {
    const siblings = Array.from(
      { length: MAX_RANK + 1 },
      (_, i) => `w${String(i).padStart(2, "0")}`,
    );

    expect(linkedWorktree(`${COMMON}/worktrees/w${MAX_RANK - 1}`, COMMON, siblings)?.rank).toBe(
      MAX_RANK,
    );
    expect(() => linkedWorktree(`${COMMON}/worktrees/w${MAX_RANK}`, COMMON, siblings)).toThrow(
      /git worktree prune/,
    );
  });

  it("refuse un worktree que git ne liste plus", () => {
    expect(() => linkedWorktree(`${COMMON}/worktrees/disparu`, COMMON, ["cimavia-bis"])).toThrow(
      /disparu/,
    );
  });
});

describe("worktreePort", () => {
  it("garde le port de base dans le dépôt principal", () => {
    expect(worktreePort(3001, null, 2)).toBe(3001);
  });

  it("décale du rang, fois le nombre de ports que la suite prend", () => {
    expect(worktreePort(3001, { name: "x", rank: 3 }, 2)).toBe(3007);
    expect(worktreePort(3101, { name: "x", rank: 3 })).toBe(3104);
  });

  it("ne chevauche pas la suite suivante au dernier rang", () => {
    const last = { name: "x", rank: MAX_RANK };

    expect(worktreePort(3001, last, 2) + 1).toBeLessThan(3101);
  });
});

describe("worktreeDatabaseUrl", () => {
  it("garde la base dans le dépôt principal", () => {
    expect(worktreeDatabaseUrl(E2E_URL, null)).toBe(E2E_URL);
  });

  it("insère le nom du worktree avant le suffixe jetable, sans toucher au reste de l'url", () => {
    const url = new URL(worktreeDatabaseUrl(`${E2E_URL}?schema=public`, BIS));

    expect(url.pathname).toMatch(/^\/cimavia_db_wt_cimavia_bis_[0-9a-f]{6}_e2e$/);
    expect(url.host).toBe("localhost:5434");
    expect(url.username).toBe("cimavia_e2e");
    expect(url.search).toBe("?schema=public");
  });

  it("laisse inchangée une base qui ne s'annonce pas jetable, pour que la garde la refuse", () => {
    const dev = "postgresql://cimavia:secret@localhost:5432/cimavia_db";

    expect(worktreeDatabaseUrl(dev, BIS)).toBe(dev);
  });

  it("tient un nom trop long dans un identifiant postgres, sans confondre deux noms voisins", () => {
    const long = "a".repeat(80);
    const first = worktreeDatabase(`${long}-1`);

    expect(first.length).toBeLessThanOrEqual(63);
    expect(first).toMatch(/^cimavia_db_wt_a+_[0-9a-f]{6}_e2e$/);
    expect(first).not.toBe(worktreeDatabase(`${long}-2`));
  });

  it("sépare deux noms que le passage en identifiant confond", () => {
    expect(worktreeDatabase("tech-630")).not.toBe(worktreeDatabase("tech_630"));
    expect(worktreeDatabase("Feat.630")).not.toBe(worktreeDatabase("feat-630"));
  });

  it("ne tombe jamais sur la base d'une autre suite, quel que soit le nom du worktree", () => {
    const api = (name: string) => worktreeDatabase(name);
    const web = (name: string) => worktreeDatabase(name, WEB_E2E_URL);

    expect(api("web")).not.toBe("cimavia_db_web_e2e");
    expect(api("web-foo")).not.toBe(web("foo"));
    expect(web("x")).not.toBe(api("x"));
  });

  it("nomme par empreinte un worktree sans caractère utilisable", () => {
    expect(worktreeDatabase("---")).toMatch(/^cimavia_db_wt_[0-9a-f]{6}_e2e$/);
  });
});

/** Un vrai dépôt et un vrai worktree : c'est `git rev-parse` qu'on éprouve, pas sa simulation. */
describe("currentWorktree", () => {
  let root: string;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, stdio: "ignore" });

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cmv-worktree-")));
    git(root, "init", "--quiet", "depot");
    const repo = join(root, "depot");
    // `--orphan` : un worktree sans commit, donc sans la signature ni les hooks du poste.
    git(repo, "worktree", "add", "--quiet", "--orphan", "-b", "z", join(root, "zeta"));
    git(repo, "worktree", "add", "--quiet", "--orphan", "-b", "a", join(root, "alpha"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("vaut null dans le dépôt principal", () => {
    expect(currentWorktree(join(root, "depot"))).toBeNull();
  });

  it("classe un worktree lié par le nom que git lui donne", () => {
    expect(currentWorktree(join(root, "zeta"))).toEqual({ name: "zeta", rank: 2 });
    expect(currentWorktree(join(root, "alpha"))).toEqual({ name: "alpha", rank: 1 });
  });

  it("vaut null hors de tout dépôt git", () => {
    expect(currentWorktree(root)).toBeNull();
  });
});
