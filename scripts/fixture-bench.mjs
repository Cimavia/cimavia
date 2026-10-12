/**
 * Le verdict d'un banc de fixtures, commun aux contrôles qui vérifient que leurs règles mordent
 * encore (`check:lint-rules`, `check:migrations`) : chaque marque doit être signalée, et rien
 * d'autre ne doit l'être. Une marque comme un signalement s'écrit `fichier:ligne règle`.
 */

/**
 * Compare les marques aux signalements et en rend compte.
 *
 * @param {object} bench
 * @param {string} bench.name - ce que le banc vérifie, en tête du message de succès.
 * @param {Set<string>} bench.expected - les marques du banc.
 * @param {Set<string>} bench.reported - ce que l'outil a signalé.
 * @param {string} bench.culprit - ce qui ne fait plus ce qu'il dit, si le banc ne tient pas.
 * @returns {boolean} `true` si le banc tient.
 */
export function benchHolds({ name, expected, reported, culprit }) {
  const silent = [...expected].filter((mark) => !reported.has(mark));
  const unexpected = [...reported].filter((mark) => !expected.has(mark));

  for (const mark of silent) console.error(`✗ attendu, rien de signalé : ${mark}`);
  for (const mark of unexpected) console.error(`✗ signalé sans être attendu : ${mark}`);

  if (silent.length > 0 || unexpected.length > 0) {
    console.error(
      `\n${silent.length} marque(s) muette(s), ${unexpected.length} signalement(s) en trop — ${culprit}`,
    );
    return false;
  }
  console.log(`${name} : ${expected.size} signalements attendus, tous rendus, rien en trop.`);
  return true;
}
