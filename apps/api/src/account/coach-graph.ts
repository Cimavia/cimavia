/**
 * Les coachs de chaque compte parcouru : `athleteId → coachIds`. Une clé présente avec une liste
 * vide est un compte sans coach — la clé seule dit qu'il a été atteint.
 */
export type CoachesByAccount = ReadonlyMap<string, readonly string[]>;

type Visit = { node: string; next: number };

/**
 * Le graphe des coachs contient-il déjà une boucle ? (#599)
 *
 * Depuis que l'unicité porte sur le couple, un compte a 0..N coachs : le graphe n'est plus une
 * forêt, et **repasser sur un compte déjà vu ne prouve plus rien**. A suivi par B et C, tous deux
 * suivis par D : en remontant depuis A, on atteint D deux fois sans la moindre boucle — un losange.
 * L'ensemble de visités de #11, qui levait dès la seconde rencontre, rendrait une 500 à une
 * invitation parfaitement valide.
 *
 * D'où deux états au lieu d'un : « en cours » (le compte est sur le chemin qu'on descend) et
 * « terminé ». Seul un retour sur un compte EN COURS ferme une boucle ; un compte terminé est un
 * second chemin vers une branche déjà explorée, sans cycle. Parcours itératif : une pile explicite
 * ne bute pas sur la profondeur de récursion, quelle que soit la longueur d'une chaîne corrompue.
 */
export function hasCoachCycle(coaches: CoachesByAccount): boolean {
  const state = new Map<string, "active" | "done">();

  for (const root of coaches.keys()) {
    if (state.has(root)) continue;
    state.set(root, "active");
    const stack: Visit[] = [{ node: root, next: 0 }];

    while (stack.length > 0) {
      const top = stack.at(-1) as Visit;
      const coach = coaches.get(top.node)?.[top.next];
      if (coach == null) {
        state.set(top.node, "done");
        stack.pop();
        continue;
      }
      top.next += 1;
      const seen = state.get(coach);
      if (seen === "active") return true;
      if (seen == null) {
        state.set(coach, "active");
        stack.push({ node: coach, next: 0 });
      }
    }
  }
  return false;
}
