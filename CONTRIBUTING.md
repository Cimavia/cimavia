# Contribuer à cimavia

Workflow de développement et conventions opérationnelles. Pour les règles
d'architecture, voir `docs/architecture-choice.md`.

## Git flow (GitLab Flow)

Merge unidirectionnel `feature/* → main → staging → production` (jamais en sens inverse).

- `main` : branche de dev, **protégée** (ruleset « Main ») — PR obligatoire, les trois checks
  ci-dessous verts requis, commits signés, ni force-push ni suppression. Le push direct, autorisé
  jusqu'en #130, ne l'est plus : une porte qu'on peut contourner ne garde rien.
- `staging` / `production` : cibles de promotion **protégées** (ruleset « Production ») — mêmes
  exigences, plus l'historique linéaire.

CI (`.github/workflows/`) :

- `ci.yml`, job **`Lint + Typecheck + Test`** — Biome, `turbo typecheck test`, `check:i18n`.
- `ci.yml`, job **`E2E (isolation multi-tenant)`** — les 268 e2e de l'API, contre un Postgres et
  un MinIO jetables montés par les composes du dépôt. Ils portent la couverture réelle de la couche
  API (~89 %) : ses douze tests unitaires n'en couvrent que 3,5 %. Bloquant.
- `ci.yml`, job **`SonarCloud Analysis`** — qualité, sécurité et **couverture des quatre paquets**
  (`@cmv/shared`, API, web, mobile). Rapatrié depuis `sonar.yml` en #57 : Sonar veut tous les lcov
  dans UN scan, or celui des e2e naît dans le job ci-dessus — les mettre dans le même run rend
  l'ordre déterministe, là où un artefact ne traverse pas deux workflows sans course.

Les trois tournent sur push/PR vers `main`, `staging`, `production`.

> Ces libellés sont ceux des **jobs**, et c'est sous ce nom exact que les rulesets les exigent —
> pas sous le nom du workflow. Renommer un job décroche donc la porte qui le référence : le check
> requis n'arrive jamais et la PR reste bloquée sur « Waiting for status to be reported ». Toute
> renommage se répercute dans les deux rulesets (Settings → Rules).

## Commits

Convention **Conventional Commits**, sujet en minuscule (vérifié par commitlint).

### Commits signés (SSH)

`main` (et la promotion) exige des signatures vérifiées. Config locale, une fois :

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/<ta_clé>.pub
git config --global commit.gpgsign true

git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

Puis ajouter la clé publique sur GitHub en **Signing Key** (Settings → SSH and GPG keys).

## Secrets GitHub Actions (Settings → Secrets → Actions)

Ajoutés phase par phase :

- `SONAR_TOKEN` — SonarCloud (en place).
- `SENTRY_DSN`, `AXIOM_TOKEN`, `AXIOM_DATASET` — observabilité (déploiement).
- `DATABASE_URL` — déploiement (P1).
- `BETTER_AUTH_SECRET` — auth (P1).

## Observabilité (API)

- Logs structurés **pino → Axiom** : transport actif dès que `AXIOM_TOKEN` + `AXIOM_DATASET` sont définis. `AXIOM_URL` selon la région du dataset (EU par défaut).
- Erreurs **Sentry** (`SENTRY_DSN`) : init dans `apps/api/src/instrument.ts` (1er import) + `SentryExceptionFilter` global.
- Variables d'environnement : voir `apps/api/.env.example`.
