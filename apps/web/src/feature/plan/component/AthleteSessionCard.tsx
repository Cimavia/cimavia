import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.athlete.sessionStatus: ScheduledSessionStatus

type AthleteSessionCardProps = {
  session: ScheduledSessionSummaryDto;
};

/**
 * Une séance vue par l'athlète, dans la grille de la semaine comme dans la liste.
 *
 * Pas de durée (« 90 min ») malgré la maquette : `ScheduledSession` n'en porte pas — c'est l'écart
 * déjà consigné en P3-5 (#94). Le volume s'exprime par le nombre d'exercices, comme sur mobile.
 *
 * Trois statuts, pas quatre : la maquette montre aussi « Débrief à compléter », qui n'existe pas au
 * modèle — et sa propre frame le pose sur un jour À VENIR, ce qui n'aurait de sens dans aucune
 * définition. `DONE` est posé par le débrief, et c'est la seule chose qu'on sache.
 */
export function AthleteSessionCard({ session }: Readonly<AthleteSessionCardProps>) {
  const { t } = useTranslation();

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-sm transition-colors hover:border-cmv-border-hi"
    >
      <span className="font-cmv-display text-cmv-body text-cmv-text-hi">{session.title}</span>
      <span className="text-cmv-caption text-cmv-text-lo">
        {t("plan.athlete.exerciseCount", { count: session.exerciseCount })}
      </span>
      {/* `mt-auto` colle le statut au BAS de la carte, et n'agit que là où il y a de la hauteur en
          trop à distribuer — la grille de semaine, qui étire ses cartes (#206). Dans la liste
          verticale, la carte fait la taille de son texte : la marge vaut alors zéro. C'est ce qui
          aligne les « Fait » d'une même rangée sans donner deux rendus à un seul composant. */}
      <span className="mt-auto text-cmv-caption text-cmv-accent">
        {t(`plan.athlete.sessionStatus.${session.status}`)}
      </span>
    </Link>
  );
}
