#!/usr/bin/env node
/**
 * Publie un update EAS sur le canal `preview`, puis ses sourcemaps chez Sentry (#287).
 *
 * POURQUOI un script plutôt qu'un `eas update` tapé à la main : trois oublis silencieux.
 *
 *   1. La SOURCE. `eas update` emballe l'arbre de travail tel quel, alors que le NAS ne tourne que
 *      la version PROMUE (#266). Un JS pris en tête de `main` peut appeler une route que l'API
 *      n'a pas encore. On ne publie donc que depuis un tag, arbre propre — le principe « même
 *      tag » de #186.
 *   2. L'ENVIRONNEMENT. Sans `--environment`, `app.config.ts` retombe sur `development`. Le SDK 55+
 *      l'exige en local, mais la vérification saute en CI.
 *   3. LES SOURCEMAPS. Le build les envoie seul (#183) ; un update, non. Sans elles, les traces
 *      Sentry du JS publié sont illisibles. Le jeton est vérifié AVANT de publier : après, l'update
 *      serait déjà chez le Coach.
 *
 * Ce que le script ne vérifie pas, et que la procédure du README exige : que l'écart entre le tag
 * du binaire installé et celui-ci ne porte aucun `feat` mobile (consigne Apple 2.5.2).
 */
import { execFileSync } from "node:child_process";

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

if (!process.env.SENTRY_AUTH_TOKEN) {
  fail("SENTRY_AUTH_TOKEN manque : sans lui, les traces de cet update seraient illisibles.");
}

let tag;
try {
  tag = git("describe", "--exact-match", "--tags", "HEAD");
} catch {
  fail("HEAD n'est pas sur un tag. Publier depuis la version promue : git checkout vX.Y.Z");
}

if (git("status", "--porcelain") !== "") {
  fail("L'arbre de travail est modifié : l'update ne serait pas celui du tag.");
}

console.log(`→ Publication de ${tag} sur le canal preview`);
execFileSync(
  "eas",
  [
    "update",
    "--channel",
    "preview",
    "--environment",
    "preview",
    "--message",
    tag,
    "--non-interactive",
  ],
  { stdio: "inherit" },
);
execFileSync("sentry-expo-upload-sourcemaps", ["dist"], { stdio: "inherit" });
