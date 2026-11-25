/**
 * Les séances de l'athlète à plat, en deux segments : « à venir » et « passées » (#25, #376).
 *
 * Le découpage était écrit deux fois, sur l'écran Séances du web et sur l'onglet du mobile, sans
 * rien pour tenir les deux d'accord (`architecture-choice.md` §7). C'est une décision PRODUIT :
 * où passe la frontière, dans quel ordre se lit chaque segment. Un tri faux ne se voit pas à
 * l'écran — d'où une fonction pure, qu'un test attaque sur ce qu'elle décide.
 *
 * Aucune requête propre : les séances sont déjà dans les cycles servis à l'athlète.
 */

export const SESSION_SEGMENTS = ["upcoming", "past"] as const;
export type SessionsSegment = (typeof SESSION_SEGMENTS)[number];

/**
 * Ce dont le découpage dépend, et rien de plus : un `PlanDto` convient, un objet réduit aussi, et
 * les tests n'ont pas à fabriquer de cycles entiers.
 */
export type SessionsSource<S extends { scheduledDate: string }> = {
  title: string;
  /** La fin du suivi du cycle (#909), `null` tant qu'il court. */
  followEndedAt: string | null;
  weeks: readonly { sessions: readonly S[] }[];
};

/**
 * Une séance et le cycle d'où elle vient — son nom et la fin de son suivi voyagent avec elle, ils ne
 * se rejoignent pas au rendu. La seconde marque la séance d'un suivi terminé (#910) : elle se
 * relit, ne se débriefe plus.
 */
export type SessionEntry<S> = { session: S; planTitle: string; followEndedAt: string | null };

/**
 * `today` (date ISO du jour, `todayIsoDate()`) appartient aux séances à venir : celle du jour reste
 * à faire.
 *
 * Le tri s'inverse avec le segment, et ce n'est pas un détail : « à venir » se lit de la plus
 * proche à la plus lointaine (ce qui arrive d'abord est en tête), « passées » de la plus récente à
 * la plus ancienne (ce qu'on vient de faire est en tête). Un tri unique mettrait à chaque fois en
 * tête la ligne dont on se soucie le moins. Deux séances du même jour gardent, dans les deux
 * segments, l'ordre des cycles servis puis de leurs semaines.
 */
export function splitSessionsByDate<S extends { scheduledDate: string }>(
  plans: readonly SessionsSource<S>[],
  today: string,
): Record<SessionsSegment, SessionEntry<S>[]> {
  const entries = plans.flatMap((plan) =>
    plan.weeks.flatMap((week) =>
      week.sessions.map((session) => ({
        session,
        planTitle: plan.title,
        followEndedAt: plan.followEndedAt,
      })),
    ),
  );

  return {
    upcoming: entries
      .filter(({ session }) => session.scheduledDate >= today)
      .sort((a, b) => a.session.scheduledDate.localeCompare(b.session.scheduledDate)),
    past: entries
      .filter(({ session }) => session.scheduledDate < today)
      .sort((a, b) => b.session.scheduledDate.localeCompare(a.session.scheduledDate)),
  };
}
