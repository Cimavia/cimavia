// Modèle partagé des structures de bloc : durées, phrases, réglages, déroulé, listes.
export const toSec = str => {
  let t = 0, last = null;
  for (const [, n, u] of String(str || '').matchAll(/(\d+)\s*(h|min|s)?/g)) {
    const unit = u || (last === 'h' ? 'min' : 's');
    t += +n * (unit === 'h' ? 3600 : unit === 'min' ? 60 : 1);
    last = unit;
  }
  return t;
};
export const fmt = t => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h) return m ? `${h} h ${m}` : `${h} h`;
  if (m) return s ? `${m} min ${s}` : `${m} min`;
  return `${s} s`;
};
export const every = e => ({ '1 s': 'chaque seconde', '1 min': 'chaque minute', '1 h': 'chaque heure' })[fmt(toSec(e))] || `toutes les ${fmt(toSec(e))}`;
export const MIN_S = 1, MAX_S = 3 * 3600, MIN_N = 1, MAX_N = 99;
export const TAGS = ['renfo', 'grimpe', 'technique', 'mobilité', 'cardio', 'course'];
const listFr = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
export const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const orderError = (nEx, go) => `Au moins ${nEx} ${go === 'cycle' ? 'intervalles' : 'bips'} pour ${nEx} exercices.`;
const D = { every: '1 min', work: '20 s', rest: '10 s', n: 4, cap: '12 min', restEx: '30 s', restRound: '2 min', limit: '15 min' };

// nEx : nombre d'exercices du bloc. Absent (structure seule) : on dit « tours ».
// Retourne null si « un seul par… » a moins de bips ou d'intervalles que d'exercices.
export function phrase(c, nEx, names) {
  const unit = n => nEx === 1 ? pl(n, 'série', 'séries') : pl(n, 'tour', 'tours');
  const unitWord = nEx === 1 ? 'séries' : 'tours';
  if (c.order === 'one' && nEx > 1 && c.times === 'n') {
    if (c.n < nEx) return null;
    const q = Math.floor(c.n / nEx), r = c.n % nEx, rest = nEx - r;
    const what = c.go === 'bip' ? `${pl(c.n, 'bip', 'bips')}, ${every(c.every)}` : `${pl(c.n, 'intervalle', 'intervalles')}, ${c.work} d'effort et ${c.rest} de repos`;
    const who = names && names.length ? `${listFr(names)} en alternance` : 'un exercice à chaque fois';
    const first = r === 1 ? 'pour le premier' : `pour les ${r} premiers`;
    const others = rest > 1 ? 'pour les autres' : r === 1 ? "pour l'autre" : 'pour le dernier';
    const cnt = r === 0 ? `${q} fois chacun` : `${q + 1} fois ${first}, ${q} ${others}`;
    return `${what} : ${who}, ${cnt}`;
  }
  const pace = c.go === 'bip' ? `, un bip ${every(c.every)}` : c.go === 'cycle' ? ` : ${c.work} d'effort, ${c.rest} de repos` : (c.limit ? ' le plus vite possible' : ' à son rythme');
  let s;
  if (c.times === 'once') s = (nEx === 1 ? 'Une fois' : 'Chaque exercice une fois') + (c.go === 'athlete' ? ',' : '') + pace;
  else if (c.times === 'max') s = `Le plus de tours possible en ${c.cap}`;
  else s = unit(c.n) + pace;
  const rests = c.go === 'athlete';
  if (rests && c.restEx && nEx !== 1) s += `, ${c.restEx} entre exercices`;
  if (rests && c.restRound && c.times === 'n') s += `, ${c.restRound} de repos entre ${unitWord}`;
  if (c.limit) s += `, ${c.limit} au plus`;
  return s;
}

export function dur(c) {
  if (c.times !== 'n') return null;
  if (c.go === 'cycle') { const u = toSec(c.work) + toSec(c.rest); return { s: c.n * u, t: fmt(c.n * u), why: `${c.n} × ${fmt(u)}` }; }
  if (c.go === 'bip') { const u = toSec(c.every); return { s: c.n * u, t: fmt(c.n * u), why: `${c.n} × ${fmt(u)}` }; }
  return null;
}

const HELP_DUR = 'ex. 45 s, 1 min 30, 10 min';
export const fld = (ui, key, pre, val, post) => {
  const st = (ui || {})[key] || {};
  if (st.edit) return { pre, post, ev: val + '|', help: key === 'n' ? 'de 1 à 99' : HELP_DUR };
  if (st.err) return { pre, post, bv: val, err: st.err };
  return { pre, post, v: val };
};
const opt = (t, sub, on, reason, vals) => ({ t, sub, on: !!on && !reason, off: !on && !reason, dis: !!reason, reason: reason || '', hasVals: !!(on && vals && vals.length), vals: vals || [] });

// Unité du champ « nombre » : bip(s) ou intervalle(s) avec « un seul par… », sinon tour(s).
const nUnit = c => {
  const n = c.n || D.n, one = c.order === 'one' && c.nEx > 1;
  if (one && c.go === 'bip') return n === 1 ? 'bip' : 'bips';
  if (one && c.go === 'cycle') return n === 1 ? 'intervalle' : 'intervalles';
  return n === 1 ? 'tour' : 'tours';
};
export function rowsOf(c) {
  const ui = { ...(c.ui || {}) };
  if (c.order === 'one' && c.nEx > 1 && c.times === 'n' && c.n < c.nEx) ui.n = { err: orderError(c.nEx, c.go) };
  const noMax = c.go === 'cycle' ? 'Avec effort et repos imposés, indique un nombre de tours.' : c.go === 'bip' ? 'Avec un bip, indique un nombre de tours.' : null;
  const noOnce = noMax;
  return [
    { num: '1', t: 'Quand passe-t-on à la suite ?', opts: [
      opt("Quand l'athlète a fini", 'Pas de chrono : il enchaîne à son rythme.', c.go === 'athlete'),
      opt('À chaque bip', 'Un bip à intervalle régulier. Le temps restant sert de repos.', c.go === 'bip', null, [fld(ui, 'every', 'toutes les', c.every || D.every, '')]),
      opt('Effort puis repos imposés', "Un temps d'effort, un temps de repos, en boucle.", c.go === 'cycle', null, [fld(ui, 'work', 'effort', c.work || D.work, ''), fld(ui, 'rest', 'repos', c.rest || D.rest, '')])
    ] },
    { num: '2', t: 'Combien de fois ?', opts: [
      opt('Un nombre de tours', 'Un nombre fixé de tours, puis le bloc est fini.', c.times === 'n', null, [fld(ui, 'n', '', String(c.n || D.n), nUnit(c))]),
      opt('Autant que possible', 'Le plus de tours possible dans le temps donné.', c.times === 'max', noMax, [fld(ui, 'cap', 'en', c.cap || D.cap, '')]),
      opt('Une seule fois', 'Chaque exercice une fois, du premier au dernier.', c.times === 'once', noOnce)
    ] }
  ];
}

const tog = (ui, key, t, sub, val, reason) => ({ t, sub, v: '', on: !!val && !reason, off: !val && !reason, dis: !!reason, reason: reason || '', hasVals: !!val && !reason, vals: val ? [fld(ui, key, '', val, '')] : [] });
export function togglesOf(c) {
  const d = dur(c), cyc = c.go === 'cycle', ui = c.ui;
  return [
    tog(ui, 'restEx', 'Repos entre exercices', 'Une pause entre deux exercices.', c.restEx, cyc ? 'Déjà compris dans le repos imposé.' : c.go === 'bip' ? 'Le temps avant le bip sert déjà de repos.' : null),
    tog(ui, 'restRound', 'Repos entre tours', 'Une pause entre deux tours.', c.restRound, cyc ? 'Déjà compris dans le repos imposé.' : c.go === 'bip' ? 'Le temps avant le bip sert déjà de repos.' : c.times === 'once' ? 'Un seul passage : choisis un nombre de tours.' : c.times === 'max' ? "Le chrono tourne : l'athlète se repose sur son temps." : null),
    tog(ui, 'limit', 'Limite de temps', 'Un chrono monte et arrête le bloc.', c.limit, c.times === 'max' ? `Inutile : le bloc dure déjà ${c.cap}.` : d ? `Inutile : la durée se calcule seule (${d.why} = ${d.t}).` : null)
  ];
}

// 4e partie du panneau d'un bloc : au moins deux exercices et un bip ou effort et repos imposés.
export function orderOf(c) {
  if (!(c.nEx > 1) || (c.go !== 'bip' && c.go !== 'cycle')) return [];
  const w = c.go === 'bip' ? 'bip' : 'intervalle', one = c.order === 'one';
  return [{ num: '4', t: 'Ordre des exercices', opts: [
    opt(`Tous à chaque ${w}`, `Tous les exercices s'enchaînent dans le même ${w}.`, !one),
    opt(`Un seul par ${w}`, `Un exercice par ${w}, en alternance.`, one)
  ] }];
}

export function segsOf(c) {
  const a = [], n = c.times === 'n' ? Math.min(c.n, 24) : c.times === 'max' ? 6 : 1;
  for (let i = 1; i <= n; i++) {
    a.push({ w: true, r: false, n: c.times === 'max' ? '' : String(i) });
    if (c.go === 'cycle' || (c.restRound && i < n)) a.push({ w: false, r: true, n: '' });
  }
  return a;
}

// o.compact : réglages seuls (panneau d'un bloc). Sinon nom, tags, note, consigne.
export function form(c, o = {}) {
  c = { ...c, nEx: c.nEx ?? o.nEx };
  const d = dur(c), ph = phrase(c, o.nEx);
  const legend = c.go === 'cycle' ? [{ w: true, t: `effort ${c.work}` }, { r: true, t: `repos ${c.rest}` }]
    : c.go === 'bip' ? [{ w: true, t: `un bip ${every(c.every)}` }]
    : [{ w: true, t: c.times === 'max' ? `des tours pendant ${c.cap}` : 'un tour, à son rythme' }, ...(c.restRound ? [{ r: true, t: `repos ${c.restRound}` }] : [])];
  const tags = o.tags || [];
  return {
    notCompact: !o.compact, hasMeta: !o.compact,
    name: o.name || '', nameEmpty: !!o.nameEmpty, nameErr: !!o.nameErr, nameVal: o.nameVal || '', nameMsg: o.nameMsg || '',
    tags, hasTags: tags.length > 0, tagSugg: TAGS.filter(t => !tags.includes(t)),
    note: o.note || '', noNote: !o.note, consigne: o.consigne || '', noConsigne: !o.consigne,
    rows: rowsOf(c), toggles: togglesOf(c), orderRows: o.compact ? orderOf(c) : [],
    phrase: ph ? ph + '.' : '—', hasPhrase: !!ph, noPhrase: !ph,
    hasDur: !!d, dur: d ? d.t : '', durWhy: d ? `déduite : ${d.why}` : '',
    segs: segsOf(c), hasAxis: !!d, axis: d ? ['0', fmt(Math.round(d.s / 2)), fmt(d.s)] : [], legend, foot: o.foot || ''
  };
}

export const S = {
  SER: { go: 'athlete', times: 'n', n: 4, restRound: '2 min' },
  EMOM: { go: 'bip', every: '1 min', times: 'n', n: 10 },
  AMRAP: { go: 'athlete', times: 'max', cap: '12 min' },
  TAB: { go: 'cycle', work: '20 s', rest: '10 s', times: 'n', n: 8 },
  FT: { go: 'athlete', times: 'n', n: 3, limit: '15 min' },
  LIB: { go: 'athlete', times: 'once' },
  G44: { go: 'athlete', times: 'n', n: 4, restRound: '4 min' },
  T3010: { go: 'cycle', work: '30 s', rest: '10 s', times: 'n', n: 8 },
  DEP4: { go: 'bip', every: '4 min', times: 'n', n: 6 }
};

// Séance-type d'exemple « Force & conditionnement ». Chaque bloc porte sa structure (c) et ses valeurs réglables (vals).
const rep = (n, r) => Array.from({ length: n }, () => [...r]);
const RC = ['Répétitions', 'Charge'], DE = ["Durée d'effort"];
export const FORCE_COND = { name: 'Force & conditionnement', blocks: [
  { label: 'Échauffement', type: 'Libre', c: { go: 'athlete', times: 'once' }, vals: {}, exs: [{ id: 'mob', code: '', name: 'Routine de mobilité', tags: [], cols: [], rows: [] }] },
  { letter: 'A', type: 'Séries', c: { go: 'athlete', times: 'n', n: 4, restRound: '2 min 30' }, vals: { n: '4', restRound: '2 min 30' }, exs: [
    { id: 'sq', code: 'A1', name: 'Squat arrière', tags: ['renfo', 'force'], cols: RC, rows: rep(4, ['6', '60 kg']) },
    { id: 'th', code: 'A2', name: 'Tirage horizontal', tags: ['renfo'], cols: RC, rows: rep(4, ['', '']) }] },
  { letter: 'B', type: 'Séries', c: { go: 'athlete', times: 'n', n: 3, restRound: '3 min' }, vals: { n: '3', restRound: '3 min' }, exs: [
    { id: 'bu', code: 'B1', name: 'Burpees', tags: ['cardio'], cols: ['Répétitions'], rows: rep(3, ['']) },
    { id: 'kb', code: 'B2', name: 'KB swing', tags: ['renfo'], cols: RC, rows: rep(3, ['', '']) },
    { id: 'ga', code: 'B3', name: 'Gainage', tags: [], cols: DE, rows: rep(3, ['']) },
    { id: 'co', code: 'B4', name: 'Corde à sauter', tags: [], cols: DE, rows: rep(3, ['']) }] },
  { letter: 'C', type: 'AMRAP', c: { go: 'athlete', times: 'max', cap: '12 min' }, vals: { cap: '12 min' }, exs: [
    { id: 'tr', code: 'C1', name: 'Tractions lestées', tags: ['renfo', 'force'], cols: RC, rows: [['5', '']] },
    { id: 'di', code: 'C2', name: 'Dips lestés', tags: ['renfo', 'force'], cols: RC, rows: [['', '']] },
    { id: 'ro', code: 'C3', name: 'Rowing unilatéral', tags: ['renfo'], cols: RC, rows: [['', '']] }] }
] };

const withTags = p => ({ ...p, hasTags: p.tags.length > 0, noTags: p.tags.length === 0, hasNote: !!p.note });
// Les structures prêtes n'ont ni tags, ni note, ni consigne.
export const presets = () => [
  { name: 'Séries', c: S.SER, used: '14' },
  { name: 'EMOM', c: S.EMOM, used: '3' },
  { name: 'AMRAP', c: S.AMRAP, used: '4' },
  { name: 'Tabata', c: S.TAB, used: '2' },
  { name: 'For time', c: S.FT, used: '1' },
  { name: 'Libre', c: S.LIB, used: '9' }
].map(p => withTags({ ...p, ready: true, tags: [], note: '', consigne: '', phrase: phrase(p.c) }));
export const mine = () => [
  { name: '4×4 grimpe', c: S.G44, used: '5', date: '12 oct.', tags: ['grimpe'], note: "Pour les blocs de bloc max, garder 4 min même si l'athlète se sent prêt.", consigne: '' },
  { name: 'Tabata 30/10', c: S.T3010, used: '2', date: '8 oct.', tags: ['cardio'], note: 'Version longue, pour les athlètes déjà rodés au Tabata.', consigne: '' },
  { name: 'Départs 4 min', c: S.DEP4, used: '3', date: '19 oct.', tags: ['cardio', 'course'], note: 'Piste ou tapis. Ajuster la distance au niveau.', consigne: "Pars au bip, même si tu n'as pas fini de récupérer." }
].map(p => withTags({ ...p, ready: false, phrase: phrase(p.c) }));
// ——— Séance planifiée : composition (panneau) et valeurs (Dosage) ———
// Une valeur : '60 kg', '6', '2 min 30', '' (vide, affichée « — »). Une cellule multi-séries : tableau de valeurs.
export const numOf = v => { const m = String(v || '').match(/^([+-]?\d+(?:,\d+)?)\s*(.*)$/); return m ? { n: +m[1].replace(',', '.'), u: m[2] } : null; };
const fr = n => String(Math.round(n * 100) / 100).replace('.', ',');
export const show = v => Array.isArray(v) ? cellText(v) : (v === '' || v == null ? '—' : String(v));
// Cellule à plusieurs séries. Toutes égales : la valeur une fois (la modifier change toutes les séries).
// Sinon les valeurs dans l'ordre, l'unité une seule fois à la fin : « 60 / 60 / 62,5 kg ».
export function cellText(a) {
  if (!a.length || a.every(x => x === '' || x == null)) return '—';
  if (a.every(x => x === a[0])) return show(a[0]);
  const p = a.map(numOf);
  if (p.every(Boolean) && p.every(x => x.u === p[0].u)) return p.map(x => fr(x.n)).join(' / ') + (p[0].u ? ' ' + p[0].u : '');
  return a.map(x => show(x)).join(' / ');
}
export const isMixed = v => Array.isArray(v) && v.some(x => x !== v[0]);
// Fenêtre « un champ par série » : le coach ne tape jamais le « / ».
export const seriesFields = a => a.map((x, i) => { const p = numOf(x); return { label: `Série ${i + 1}`, v: p ? fr(p.n) : '', u: p ? p.u : '', empty: !p }; });
export const setAllSeries = (a, v) => a.map(() => v);
// Une cellule diffère de la séance-type (série par série ; une ligne en plus se compare à la dernière).
export function cellDiffers(v, ref) {
  const a = Array.isArray(v) ? v : [v], r = Array.isArray(ref) ? ref : [ref];
  return a.some((x, i) => !same(x, r[i] ?? r[r.length - 1]));
}
// Unité d'une valeur ou d'un pas : 'durée', 'kg', ''… Répétitions et tours n'ont pas d'unité.
const DUR = /^[+-]?\s*\d+\s*(h|min|s)\b/;
const NO_UNIT = ['', 'rép', 'rép.', 'reps', 'tour', 'tours', 'fois'];
export const unitOf = v => {
  if (DUR.test(String(v || '').trim())) return 'durée';
  const p = numOf(v); if (!p) return null;
  return NO_UNIT.includes(p.u.trim()) ? '' : p.u.trim();
};
const unitName = u => u === 'durée' ? 'une durée (s ou min)' : u === '' ? 'sans unité' : 'en ' + u;
// Le pas doit avoir l'unité de la valeur. Retourne le message de la fenêtre « Progression… », ou ''.
export function stepError(v, step) {
  const x = [].concat(v).find(y => numOf(y));
  if (x == null) return '';
  const uv = unitOf(x), us = unitOf(step);
  if (us == null) return 'Indique un pas, ex. +2,5 kg';
  return uv === us ? '' : `Le pas doit être ${unitName(uv)}`;
}
// Pas : '+2,5 kg', '+15 s', '+1'. Ajoute le pas à une valeur (ou à chaque série). Une valeur vide reste vide.
// Une durée se calcule en secondes : « 2 min 30 » + « +15 s » = « 2 min 45 ». Unité différente : valeur inchangée.
export function addStep(v, step) {
  if (Array.isArray(v)) return v.map(x => addStep(x, step));
  if (!numOf(v) || stepError(v, step)) return v;
  if (unitOf(v) === 'durée') {
    const sg = String(step).trim().startsWith('-') ? -1 : 1;
    return fmt(Math.max(0, toSec(v) + sg * toSec(step)));
  }
  const a = numOf(v), s = numOf(step);
  return fr(a.n + s.n) + (a.u ? ' ' + a.u : '');
}
// Une colonne est sautée si la séance n'est pas posée (absent), si c'est une décharge (deload),
// ou si la cellule est grisée pour cette ligne (off : exercice remplacé, retiré ou absent cette semaine).
const skip = c => !!(c.deload || c.absent || c.off);
// Le pas n'est pas enregistré : il ne sert qu'au moment de remplir (fenêtre « Progression… »).
// Chaque semaine active reçoit la précédente + le pas. Les cellules sautées gardent leur valeur.
export function fill(cols, vals, step) {
  let prev = null;
  return vals.map((v, i) => {
    const c = cols[i] || {};
    if (skip(c)) return v;
    if (prev === null) { prev = v; return v; }
    prev = addStep(prev, step);
    return prev;
  });
}
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
// Aperçu de la fenêtre « Progression… ». ref : valeur de la séance-type pour la ligne.
// Compte les valeurs ajustées que « Appliquer » écraserait. Un pas d'une autre unité grise « Appliquer ».
export function fillPreview(cols, vals, step, ref) {
  const i0 = cols.findIndex(c => !skip(c));
  const err = i0 < 0 ? '' : stepError(vals[i0], step);
  const out = err ? vals : fill(cols, vals, step);
  const over = err ? [] : cols.map((c, i) => i > i0 && !skip(c) && ref != null && cellDiffers(vals[i], ref) && !same(out[i], vals[i]) ? c.t : null).filter(Boolean);
  return {
    vals: out, step, err, hasErr: !!err, canApply: !err, cantApply: !!err,
    start: i0 < 0 ? '' : `à partir de ${cols[i0].t} · ${show(vals[i0])}`,
    cells: cols.map((c, i) => ({ v: skip(c) && !c.deload ? '' : show(out[i]), deload: !!c.deload && !c.absent && !c.off, absent: !!c.absent || !!c.off, plain: !skip(c) })),
    nOver: over.length, hasOver: over.length > 0,
    overLabel: over.length ? `Remplace ${pl(over.length, 'valeur ajustée', 'valeurs ajustées')} (${listFr(over)})` : ''
  };
}
// Réglages d'un bloc : sa structure, avec les valeurs portées par la séance (tours, repos, temps).
export const cfgOf = b => { const c = { ...b.c }; Object.keys(b.vals || {}).forEach(k => { c[k] = k === 'n' ? +b.vals[k] : b.vals[k]; }); return c; };
// Composition d'une séance planifiée. Un exercice ajouté porte added: true, un remplaçant porte replaces: id remplacé.
// Un exercice de la séance-type absent sans remplaçant est retiré.
// Retourne { composition, values } :
// - composition (comptée par le panneau) : { bi, id, kind: 'ajouté' | 'remplacé' | 'retiré', was }
// - values (comptées par Dosage) : valeurs du bloc et cellules qui diffèrent de la séance-type reçue.
//   Seuls les exercices présents des deux côtés se comparent. Une ligne ajoutée par un tour de plus
//   recopie la dernière : seules ses cellules modifiées comptent.
export function adjusted(type, plan) {
  const composition = [], values = [];
  plan.blocks.forEach((b, bi) => {
    const tb = type.blocks[bi] || { vals: {}, exs: [] };
    Object.keys(b.vals || {}).forEach(k => { if (!same(b.vals[k], (tb.vals || {})[k])) values.push({ bi, key: k, was: (tb.vals || {})[k] ?? '' }); });
    b.exs.forEach((e, ei) => {
      const te = tb.exs.find(x => x.id === e.id);
      if (!te) {
        const rep = e.replaces && tb.exs.find(x => x.id === e.replaces);
        composition.push({ bi, id: e.id, kind: rep ? 'remplacé' : 'ajouté', was: rep ? rep.name : '' });
        return;
      }
      e.rows.forEach((r, ri) => {
        const tr = te.rows[ri] || te.rows[te.rows.length - 1] || [];
        r.forEach((c, ci) => { if (!same(c, tr[ci])) values.push({ bi, ei, id: e.id, ri, ci, was: tr[ci] ?? '' }); });
      });
    });
    tb.exs.forEach(te => {
      if (!b.exs.some(e => e.id === te.id || e.replaces === te.id)) composition.push({ bi, id: te.id, kind: 'retiré', was: te.name });
    });
  });
  return { composition, values };
}
// Panneau : compteur des changements de composition.
export const compLabel = (n, who) => n ? `${pl(n, 'changement', 'changements')} pour ${who}` : 'Composition de la séance-type';
export const changeLabel = (kind, who) => `${kind} pour ${who}`;
// Dosage : compte d'une colonne.
export const adjCount = n => n ? `${n} ${n === 1 ? 'ajusté' : 'ajustés'}` : 'aucun ajusté';
export const adjLabel = (n, who) => n ? `${n} ${n === 1 ? 'ajusté' : 'ajustés'} pour ${who}` : 'Aucune valeur ajustée';
// La bulle cite la séance-type, jamais la bibliothèque.
export const tipOf = was => `séance-type : ${show(was)}`;
export const compTip = was => `séance-type : ${was}`;
export const countLabel = (nb, ne) => `${pl(nb, 'bloc', 'blocs')} · ${pl(ne, 'exercice', 'exercices')}`;
// Colonnes de Dosage : une par semaine, ou une par séance si posée deux fois la même semaine.
// Une semaine où la séance n'est pas posée garde sa colonne, entière grisée (absent).
export function doseCols(weeks, placements) {
  return weeks.map(w => {
    const ps = placements.filter(p => p.week === w.n);
    if (!ps.length) return [{ k: `S${w.n}`, t: `S${w.n}`, week: w.n, deload: !!w.deload, absent: true }];
    return ps.map(p => ({ k: `S${w.n}${p.day}`, t: ps.length > 1 ? `S${w.n} ${p.day}` : `S${w.n}`, week: w.n, day: p.day, deload: !!w.deload, absent: false }));
  }).flat();
}
// Lignes d'exercice de Dosage pour un bloc : ceux de la séance-type dans l'ordre,
// puis ceux qui n'existent que certaines semaines (ajoutés ou remplaçants), rangés en fin de bloc.
export function doseLines(type, seances, bi) {
  const tb = type.blocks[bi], out = tb.exs.map(e => ({ ...e, extra: false }));
  seances.filter(Boolean).forEach(s => s.blocks[bi].exs.forEach(e => { if (!out.some(x => x.id === e.id)) out.push({ ...e, extra: true }); }));
  return out;
}
// État d'une ligne d'exercice dans une séance : { ex } si présent, sinon { off: 'remplacé' | 'retiré' | 'pas cette semaine' }
// (« pas cette semaine » : exercice ajouté, ou remplaçant, hors de ses semaines). La cellule est hachurée avec ce mot.
export function lineIn(type, seance, bi, id) {
  const b = seance.blocks[bi], e = b.exs.find(x => x.id === id);
  if (e) return { ex: e, off: null };
  if (b.exs.some(x => x.replaces === id)) return { off: 'remplacé' };
  return { off: type.blocks[bi].exs.some(x => x.id === id) ? 'retiré' : 'pas cette semaine' };
}
// ——— Changement de composition, pour quelles semaines ———
// ch : { bi, kind: 'ajouté' | 'remplacé' | 'retiré', id : exercice visé (remplacé, retiré), ex : nouvel exercice (ajouté, remplacé) }.
// Appliqué à une séance comme si le coach l'y avait fait. Un ajout va en fin de bloc ; un remplaçant prend la place et le code.
// Sans objet dans cette séance (exercice déjà absent, déjà ajouté) : séance inchangée.
const clone = x => JSON.parse(JSON.stringify(x));
export function applyChange(seance, ch) {
  const s = clone(seance), b = s.blocks[ch.bi], i = b.exs.findIndex(e => e.id === ch.id);
  if (ch.kind === 'ajouté') { if (!b.exs.some(e => e.id === ch.ex.id)) b.exs.push({ ...clone(ch.ex), added: true }); }
  else if (i >= 0 && ch.kind === 'remplacé') b.exs[i] = { ...clone(ch.ex), code: b.exs[i].code, replaces: ch.id };
  else if (i >= 0 && ch.kind === 'retiré') b.exs.splice(i, 1);
  return s;
}
// sOf : séances planifiées par colonne ({ S2lun: séance… }). keys : colonnes cochées dans « Pour quelles semaines ? ».
// Chaque séance cochée reçoit le changement et reste une copie à part. Rien d'autre n'est enregistré.
export const applyToWeeks = (sOf, keys, ch) => Object.fromEntries(Object.entries(sOf).map(([k, s]) => [k, keys.includes(k) ? applyChange(s, ch) : s]));
// Libellé des semaines : « en S2 », « en S2 et S5 », « toutes les semaines » quand tout est coché, '' quand rien n'est coché.
export const weeksLabel = (sel, all) => !sel.length ? '' : all.length > 1 && sel.length === all.length ? 'toutes les semaines' : 'en ' + listFr(sel);
// Retire un changement d'une séance : la composition de la séance-type revient pour cet exercice.
// Ajouté : l'exercice part. Remplacé : l'exercice de la séance-type reprend sa place. Retiré : il revient à son rang.
export function revertChange(type, seance, ch) {
  const s = clone(seance), b = s.blocks[ch.bi], tb = type.blocks[ch.bi];
  if (ch.kind === 'ajouté') { b.exs = b.exs.filter(e => e.id !== ch.ex.id); return s; }
  const te = tb.exs.find(e => e.id === ch.id);
  if (!te || b.exs.some(e => e.id === ch.id)) return s;
  const i = b.exs.findIndex(e => e.replaces === ch.id);
  if (i >= 0) { b.exs[i] = clone(te); return s; }
  // Rang dans la séance-type : un remplaçant compte au rang de l'exercice qu'il remplace ; un ajouté n'a pas de rang (-1).
  // L'exercice revient avant le premier de rang plus grand, sinon avant le premier ajouté : les ajouts restent en fin de bloc.
  const rank = e => tb.exs.findIndex(x => x.id === (e.replaces || e.id));
  const ti = tb.exs.indexOf(te);
  let at = b.exs.findIndex(e => rank(e) > ti);
  if (at < 0) at = b.exs.findIndex(e => rank(e) < 0);
  b.exs.splice(at < 0 ? b.exs.length : at, 0, clone(te));
  return s;
}
// « Valider » de « Pour quelles semaines ? » rouverte : had, semaines qui avaient le changement ; keys, semaines cochées.
// Une semaine décochée retrouve la composition de la séance-type. keys vide : le changement est annulé partout.
export const applyChoice = (type, sOf, had, keys, ch) => Object.fromEntries(Object.entries(sOf).map(([k, s]) =>
  [k, keys.includes(k) ? (had.includes(k) ? s : applyChange(s, ch)) : had.includes(k) ? revertChange(type, s, ch) : s]));
// Semaines où un changement est en place. id : exercice ajouté ou remplaçant, ou exercice retiré.
export function changeWeeks(type, sOf, cols, bi, id, kind) {
  const live = cols.filter(c => !c.absent);
  const on = live.filter(c => { const st = lineIn(type, sOf[c.k], bi, id); return kind === 'retiré' ? st.off === 'retiré' : !!st.ex; });
  return { keys: on.map(c => c.k), labels: on.map(c => c.t), text: weeksLabel(on.map(c => c.t), live.map(c => c.t)) };
}
// Cases de « Pour quelles semaines ? » : les séances où la séance-type est posée, comme les colonnes de Dosage.
// here : colonne du panneau, cochée d'avance. had : semaines qui ont déjà ce changement (fenêtre rouverte
// depuis l'étiquette d'une carte) ; absent ou vide pour un nouveau changement.
// Aucune case cochée : nouveau changement, « Valider » grisé ; changement existant, le bouton devient
// « Annuler ce changement » et applyChoice rend la composition de la séance-type à toutes les semaines de had.
// info : { kind, who, name : nouvel exercice (ajouté, remplaçant), was : exercice de la séance-type (remplacé, retiré) }.
// foot, ligne du bas : changeLabel + semaines cochées ; puis, rouverte, après « · », les semaines de had décochées :
// « Corde à sauter revient en S5 » (remplacé, retiré) ou « Gainage latéral n'est plus en S5 » (ajouté).
// Tout décoché : la seconde partie seule, avec un point final. Nouveau changement sans case cochée : ''.
export function weekChoices(weeks, cols, checked, here, had = [], info = {}) {
  const live = cols.filter(c => !c.absent);
  const items = live.map(c => {
    const w = weeks.find(x => x.n === c.week) || {}, on = checked.includes(c.k);
    return { k: c.k, label: `${c.t} · ${w.date}` + (c.deload ? ' · décharge' : ''), on, off: !on, here: c.k === here };
  });
  const sel = live.filter(c => checked.includes(c.k)).map(c => c.t);
  const none = !sel.length, cancel = none && had.length > 0, text = weeksLabel(sel, live.map(c => c.t));
  const dropped = live.filter(c => had.includes(c.k) && !checked.includes(c.k)).map(c => c.t);
  const keep = sel.length ? `${changeLabel(info.kind, info.who)} ${text}` : '';
  const back = !dropped.length ? '' : info.kind === 'ajouté' ? `${info.name} n'est plus en ${listFr(dropped)}` : `${info.was} revient en ${listFr(dropped)}`;
  const foot = keep && back ? `${keep} · ${back}` : keep || (back ? back + '.' : '');
  return { items, sel, all: live.map(c => c.t), allOn: sel.length === live.length, text, foot,
    none, canValidate: !none, cantValidate: none && !cancel, isCancel: cancel, btn: cancel ? 'Annuler ce changement' : 'Valider' };
}

export const find = name => [...presets(), ...mine()].find(p => p.name === name);

// ——— Séances planifiées de Léa · Cycle Bloc — Oct./Nov. ———
// Force & conditionnement posée le lundi en S1, S2, S4 (décharge) et S5. S1 reçoit la séance-type telle quelle.
// changes : les trois changements de composition et les semaines cochées dans « Pour quelles semaines ? ».
const A1_NOTE = "Descente en 3 s, une seconde d'arrêt en bas.";
const rameur = n => ({ id: 'ra', code: 'B4', name: 'Rameur', tags: ['cardio'], cols: DE, rows: rep(n, ['1 min 30']), replaces: 'co', note: 'Allure régulière, sans sprint final.' });
const GL = { id: 'gl', code: 'A3', name: 'Gainage latéral', tags: [], cols: DE, rows: rep(4, ['30 s']) };
export const PLAN_LEA = (() => {
  const T = FORCE_COND;
  const weeks = [{ n: 1, date: '14 oct.' }, { n: 2, date: '21 oct.' }, { n: 3, date: '28 oct.' }, { n: 4, date: '4 nov.', deload: true }, { n: 5, date: '11 nov.' }];
  const placements = [1, 2, 4, 5].map(n => ({ week: n, day: 'lun' }));
  const changes = [
    { bi: 1, kind: 'ajouté', ex: GL, keys: ['S2lun'] },
    { bi: 2, kind: 'remplacé', id: 'co', ex: rameur(3), keys: ['S2lun', 'S5lun'] },
    { bi: 3, kind: 'retiré', id: 'ro', keys: ['S5lun'] }
  ];
  let sOf = { S1lun: T, S2lun: T, S4lun: T, S5lun: T };
  changes.forEach(ch => { sOf = applyToWeeks(sOf, ch.keys, ch); });
  // S2 lun : la note de A1, 62,5 kg au 4e tour de A1, bloc B à 4 tours, C2 à 5 répétitions.
  const P = sOf.S2lun;
  P.blocks[1].exs[0].note = A1_NOTE;
  P.blocks[1].exs[0].rows[3][1] = '62,5 kg';
  P.blocks[2].vals.n = '4';
  P.blocks[2].exs.forEach(e => e.rows.push([...e.rows[e.rows.length - 1]]));
  P.blocks[3].exs[1].rows[0][0] = '5';
  // S4 lun, décharge : charge de A1 à 50 kg, bloc A à 3 tours.
  const P4 = clone(T);
  P4.blocks[1].vals.n = '3';
  P4.blocks[1].exs.forEach(e => e.rows.pop());
  P4.blocks[1].exs[0].rows.forEach(r => { r[1] = '50 kg'; });
  return { weeks, placements, changes, seances: { S1lun: sOf.S1lun, S2lun: P, S4lun: P4, S5lun: sOf.S5lun } };
})();

// ——— Lecture athlète ———
// L'athlète lit toujours sa séance planifiée, jamais la séance-type.
// Aucune trace des ajustements : ni marqueur, ni étiquette, ni « remplacé pour … ». readBlocks ne garde ni added ni replaces :
// un remplaçant est simplement l'exercice de son rang (le Rameur est B4), avec sa note.
// Un bloc qui a un libellé affiche ce libellé, sans lettre ni codes. Un bloc sans libellé prend la lettre suivante,
// ses exercices les codes A1, A2…
const isEmptyV = v => v === '' || v == null;
const cellWord = (col, v) => {
  if (isEmptyV(v)) return `${col.toLowerCase()} —`;
  if (col === 'Répétitions') { const p = numOf(v); return p && !p.u ? pl(p.n, 'répétition', 'répétitions') : String(v); }
  if (col === "Durée d'effort") return `${v} d'effort`;
  return String(v);
};
// Une ligne de valeurs en phrase : « 6 répétitions à 60 kg », « 1 min 30 d'effort », « 5 répétitions, charge — ».
export function lineText(cols, row) {
  return cols.map((c, i) => cellWord(c, row[i])).reduce((s, x, i) => !i ? x
    : s + (cols[i] === 'Charge' && cols[i - 1] === 'Répétitions' && !isEmptyV(row[i]) && !isEmptyV(row[i - 1]) ? ' à ' : ', ') + x, '');
}
const oneBy = (c, nEx) => c.order === 'one' && nEx > 1 && c.go !== 'athlete';
// Nom d'une ligne de valeurs : « Série » avec un exercice, « Tour » à partir de deux, « Passage » avec « un seul par… ».
const rowWord = (c, nEx) => oneBy(c, nEx) ? 'Passage' : nEx === 1 ? 'Série' : 'Tour';
// Valeurs d'un exercice, au seuil de colonnes (inchangé) :
// - aucune colonne, ou toutes les cellules vides : pas de grille ; l'athlète lit le nom, la phrase du bloc et la note ;
// - une seule ligne se lit comme une phrase. Des lignes toutes identiques sont une seule ligne :
//   « À chaque tour : 6 répétitions à 60 kg » ;
// - sinon, jusqu'à 3 colonnes : un mini-tableau, une ligne par tour (ou série) ; 4 colonnes et plus : une carte par ligne.
// Dès qu'une cellule est remplie, la grille s'affiche ; une cellule vide y vaut « — », jamais une erreur.
// Jamais de défilement horizontal.
export function gridOf(e, c, nEx) {
  const rows = e.rows || [], cols = e.cols || [];
  if (!cols.length || !rows.some(r => r.some(v => !isEmptyV(v)))) return { none: true, isLine: false, isTable: false, isCards: false };
  const w = rowWord(c, nEx);
  if (rows.every(r => same(r, rows[0]))) {
    const each = c.times === 'once' ? '' : oneBy(c, nEx) ? `À chaque ${c.go === 'bip' ? 'bip' : 'intervalle'} : ` : `À chaque ${w.toLowerCase()} : `;
    // each : « À chaque tour : » ; line : les valeurs seules. Un chrono montre déjà la série ou le tour en cours : il affiche line.
    const line = lineText(cols, rows[0]);
    return { none: false, isLine: true, isTable: false, isCards: false, each, line, text: each + line };
  }
  const body = rows.map((r, i) => ({ label: `${w} ${i + 1}`, n: String(i + 1),
    cells: cols.map((col, ci) => ({ col, v: show(r[ci]), empty: isEmptyV(r[ci]), filled: !isEmptyV(r[ci]) })) }));
  const table = cols.length <= 3;
  return { none: false, isLine: false, isTable: table, isCards: !table, cols, rows: body };
}
// L'enchaînement d'un tour, quand au moins deux exercices se font à la suite : « A1, A2 et A3 à la suite, puis on recommence. »
export function flowOf(c, labels) {
  if (labels.length < 2 || oneBy(c, labels.length) || c.times === 'once') return '';
  return `${listFr(labels)} à la suite, puis on recommence.`;
}

// ——— Le chrono appartient au bloc ———
// Déduit des réglages du bloc. Il aide l'athlète : rien de ce qu'il mesure n'est enregistré ni envoyé au coach.
// kind :
// - 'rest' : quand l'athlète a fini, avec un nombre de tours : un repos se lance entre deux tours ou deux exercices ;
// - 'bip' : à chaque bip, un compte à rebours jusqu'au bip suivant ;
// - 'cycle' : effort puis repos imposés, alternés ;
// - 'cap' : autant que possible, un compte à rebours de la limite, sans compteur de tours ;
// - 'up' : un nombre de tours avec une limite de temps, un chrono qui monte, limite visible, sans compteur
//   (l'athlète va à son rythme ; rien n'est enregistré à l'arrêt) ;
// - null : une seule fois, sans limite, pas de chrono.
// counter(i) parle comme la phrase : « Série 3 / 6 » (un exercice), « Tour 3 / 10 » (à partir de deux),
// « Bip 4 / 10 · Burpees » (un seul par bip), « Intervalle 5 / 8 · … » (un seul par intervalle).
export function timerOf(c, nEx, names = []) {
  const one = oneBy(c, nEx), units = nEx === 1 ? 'séries' : 'tours';
  const word = one ? (c.go === 'bip' ? 'Bip' : 'Intervalle') : nEx === 1 ? 'Série' : 'Tour';
  const counter = i => `${word} ${i} / ${c.n}` + (one && names.length ? ` · ${names[(i - 1) % nEx]}` : '');
  const k = { isRest: false, isBip: false, isCycle: false, isCap: false, isUp: false };
  if (c.times === 'max') return { ...k, kind: 'cap', isCap: true, title: 'Temps restant', total: c.cap, what: `Compte à rebours de ${c.cap}`, counter: null };
  if (c.go === 'bip') return { ...k, kind: 'bip', isBip: true, title: 'Avant le prochain bip', total: c.every, what: `Un bip ${every(c.every)}`, counter };
  if (c.go === 'cycle') return { ...k, kind: 'cycle', isCycle: true, work: c.work, rest: c.rest, what: `${c.work} d'effort, ${c.rest} de repos`, counter };
  if (c.limit) return { ...k, kind: 'up', isUp: true, title: 'Temps écoulé', total: c.limit, limit: `limite ${c.limit}`, what: `Chrono, limite ${c.limit}`, counter: null };
  const rr = c.times === 'n' && c.restRound, re = nEx > 1 && c.restEx;
  if (rr || re) return { ...k, kind: 'rest', isRest: true, title: 'Repos', restRound: rr || '', restEx: re || '',
    what: [rr && `Repos de ${rr} entre ${units}`, re && `${re} entre exercices`].filter(Boolean).join(', '), counter: c.times === 'n' ? counter : null };
  return null;
}

// ——— Suivi coché ———
// Ouvert tout le temps : une séance à venir se coche, une séance débriefée reste cochable.
// Ce qui est coché remonte au coach avec le débrief. Le temps réalisé et le score d'un bloc ne sont pas enregistrés.
// Cases :
// - un nombre de tours, au moins deux exercices : une case par exercice et par tour, rangées par tour ;
// - un exercice seul : une case par série ; un seul par bip ou par intervalle : une case par bip ou intervalle ;
// - une seule fois : une case par exercice ;
// - autant que possible : une seule case « Bloc fait » (le nombre de tours n'est pas enregistré).
export function checksOf(c, labels) {
  const nEx = labels.length, one = oneBy(c, nEx);
  if (c.times === 'max') return { unit: null, rows: [{ label: '', boxes: ['Bloc fait'] }] };
  if (c.times === 'once') return { unit: ['exercice', 'exercices'], rows: [{ label: '', boxes: labels }] };
  const n = c.n || 1, idx = Array.from({ length: n }, (_, i) => i + 1);
  if (one) return { unit: c.go === 'bip' ? ['bip', 'bips'] : ['intervalle', 'intervalles'], rows: idx.map(i => ({ label: `${c.go === 'bip' ? 'Bip' : 'Intervalle'} ${i}`, boxes: [labels[(i - 1) % nEx]] })) };
  if (nEx === 1) return { unit: ['série', 'séries'], rows: idx.map(i => ({ label: `Série ${i}`, boxes: [labels[0]] })) };
  return { unit: ['tour', 'tours'], byRound: true, rows: idx.map(i => ({ label: `Tour ${i}`, boxes: labels })) };
}
// Décompte, trois états : « Terminé » quand tout est coché ; partiel, nommé par son unité (« 1 tour sur 4 ») ;
// rien de coché : non suivi, sans pastille dans la séance. Jamais « 0 sur 4 », jamais de rouge.
// Rangées par tour : un tour compte quand toutes ses cases sont cochées ; avant, « Tour 1 en cours ».
// ticked : une liste de booléens par rangée.
export function tally(chk, ticked) {
  const flat = ticked.flat(), any = flat.some(Boolean), all = flat.length > 0 && flat.every(Boolean);
  if (!any) return { state: 'none', none: true, partial: false, done: false, label: 'non suivi' };
  if (all) return { state: 'done', none: false, partial: false, done: true, label: 'Terminé' };
  const full = ticked.filter(r => r.every(Boolean)).length, rows = chk.rows.length;
  const label = chk.byRound
    ? (full ? `${pl(full, 'tour', 'tours')} sur ${rows}` : `Tour ${ticked.findIndex(r => !r.every(Boolean)) + 1} en cours`)
    : `${pl(flat.filter(Boolean).length, chk.unit[0], chk.unit[1])} sur ${flat.length}`;
  return { state: 'partial', none: false, partial: true, done: false, label };
}

// Texte sous les cases de « Mon suivi ». Rangées par tour : le nombre de cases d'un tour vient du nombre d'exercices.
const NUM = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
export function suiviNote(chk) {
  const undo = 'Décocher est toujours possible.';
  if (chk.byRound) { const n = chk.rows[0].boxes.length; return `Un tour compte quand ses ${NUM[n] || n} cases sont cochées. ${undo}`; }
  if (!chk.unit) return `Le nombre de tours n'est pas noté. ${undo}`;
  return undo;
}

export function readBlocks(seance) {
  let k = 0;
  return seance.blocks.map(b => {
    const letter = b.label ? '' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[k++];
    const c = cfgOf(b), nEx = b.exs.length, names = b.exs.map(e => e.name);
    const exs = b.exs.map((e, i) => ({ code: letter ? letter + (i + 1) : '', hasCode: !!letter, noCode: !letter, name: e.name,
      note: e.note || '', hasNote: !!e.note, grid: gridOf(e, c, nEx), cols: e.cols || [], rows: e.rows || [] }));
    const labels = letter ? exs.map(e => e.code) : names;
    const flow = flowOf(c, labels), ph = phrase(c, nEx, names);
    return { head: b.label || letter, isLabel: !!b.label, isLetter: !b.label, type: b.type, phrase: ph ? ph + '.' : '',
      consigne: b.consigne || '', hasConsigne: !!b.consigne, flow, hasFlow: !!flow, c, nEx, names, labels, exs,
      timer: timerOf(c, nEx, names), checks: checksOf(c, labels) };
  });
}

// Blocs d'exemple des chronos, repris du Constructeur et des structures prêtes.
const KB = { id: 'kb', name: 'KB swing', tags: ['renfo'], cols: RC, rows: rep(5, ['3', '']) };
const BU = n => ({ id: 'bu', name: 'Burpees', tags: ['cardio'], cols: ['Répétitions'], rows: rep(n, ['']) });
export const TIMER_EXAMPLES = {
  finisher: { name: 'Exemple', blocks: [{ label: 'Finisher', type: 'EMOM', c: { go: 'bip', every: '1 min', times: 'n', n: 10, order: 'one' }, vals: {}, exs: [KB, BU(5)] }] },
  departs: { name: 'Fractionné piste', blocks: [{ letter: 'A', type: 'Départs 4 min', c: S.DEP4, vals: {}, consigne: "Pars au bip, même si tu n'as pas fini de récupérer.",
    exs: [{ id: 'cr', name: 'Course', tags: ['course'], cols: ['Distance', 'Allure'], rows: rep(6, ['500 m', '']) }] }] },
  tabata: { name: 'Exemple', blocks: [{ letter: 'A', type: 'Tabata', c: S.TAB, vals: {}, exs: [BU(8)] }] },
  fortime: { name: 'Exemple', blocks: [FORCE_COND.blocks[1], { letter: 'B', type: 'For time', c: S.FT, vals: {}, exs: FORCE_COND.blocks[2].exs }] }
};

export const tagRow = active => TAGS.map(t => ({ t, on: t === active, off: t !== active }));
export const filterByTag = (list, tag) => tag ? list.filter(p => p.tags.includes(tag)) : list;

// Sélecteur « Choisir une structure ».
export function selector({ current = null, tag = null, selected = null, btn = 'Ajouter le bloc', framed = true, ready = true, mineOn = true, title = 'Choisir une structure', sub = '' } = {}) {
  const row = p => ({ ...p, isItem: true, isGroup: false, on: p.name === selected, off: p.name !== selected, isCurrent: p.name === current });
  const rows = [];
  const pr = ready ? filterByTag(presets(), tag) : [];
  const mi = mineOn ? filterByTag(mine(), tag) : [];
  if (pr.length) rows.push({ isGroup: true, isItem: false, label: 'Structures prêtes' }, ...pr.map(row));
  if (mi.length) rows.push({ isGroup: true, isItem: false, label: 'Mes structures' }, ...mi.map(row));
  return {
    framed, title, sub, hasSub: !!sub, rows, tags: tagRow(tag), readyOn: ready, readyOff: !ready, mineOn, mineOff: !mineOn,
    hasFilterNote: !!tag, filterNote: tag ? `${pl(mi.length + pr.length, 'structure', 'structures')} avec le tag ${tag}. Les structures prêtes n'ont pas de tags.` : '',
    btn, canGo: !!selected, cantGo: !selected
  };
}
