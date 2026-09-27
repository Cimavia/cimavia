# Jamais construit : ce fichier ne sert qu'à épingler l'image de Trivy (#399) là où Dependabot la
# suit — écosystème `docker`, avec son `cooldown` de 7 jours. `action.yml` relit la ligne `FROM`.
#
# L'image officielle, pas `aquasecurity/trivy-action` ni `setup-trivy` : en mars 2026, leurs tags
# ont été réécrits pour voler les secrets des CI qui les lançaient (GHSA-69fq-xp46-6x23). Une image
# lancée par `docker run`, sans jeton ni socket Docker, n'a rien à voler — même compromise.
#
# ghcr.io plutôt que Docker Hub : même digest, sans la limite de tirages anonymes. Avant une montée
# de version : l'avis ci-dessus et les suivants d'Aqua, et la signature (`CONTRIBUTING.md`).
FROM ghcr.io/aquasecurity/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969

# Trivy n'a pas besoin de root : `action.yml` le lance sous l'uid du runner (`--user`). Cette ligne
# le dit à qui lirait ce fichier comme une vraie image — `trivy config` le premier (DS-0002).
USER 65534
