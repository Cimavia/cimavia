import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "../dto/invoice.schema";
import { PlanStatus } from "../dto/plan.schema";
import {
  type AthleteRow,
  type AthleteRowPlan,
  type AthleteRowsInput,
  buildAthleteRows,
  visibleAthleteRows,
} from "./athlete-row.util";
import { InvoiceState } from "./invoice.util";

// 2026-10-19 est un lundi ; les cycles démarrent un lundi (planStartDateSchema).
const TODAY = "2026-10-26";

const LEA = { athleteId: "ath_lea", athleteName: "Léa Moreau" };
const NOAH = { athleteId: "ath_noah", athleteName: "Noah Fontaine" };

// Cycle de Léa : démarré le 2026-10-19, 4 semaines → on est dans la S2 au 2026-10-26.
const LEA_PLAN = {
  id: "pln_lea",
  athleteId: LEA.athleteId,
  title: "Cycle Bloc — Oct./Nov.",
  startDate: "2026-10-19",
  weekCount: 4,
  status: PlanStatus.PUBLISHED,
};

const FULL: AthleteRowsInput = {
  athletes: [LEA, NOAH],
  plans: [LEA_PLAN],
  feedbacks: [
    { id: "fbk_1", athleteId: LEA.athleteId, coachReadAt: null, createdAt: "2026-10-24T09:00:00Z" },
    { id: "fbk_2", athleteId: LEA.athleteId, coachReadAt: null, createdAt: "2026-10-25T09:00:00Z" },
    {
      id: "fbk_3",
      athleteId: LEA.athleteId,
      coachReadAt: "2026-10-23T09:00:00Z",
      createdAt: "2026-10-23T08:00:00Z",
    },
  ],
  conversations: [{ counterpartId: LEA.athleteId, unreadCount: 3 }],
  invoices: [
    {
      athleteId: LEA.athleteId,
      status: InvoiceStatus.PAID,
      dueDate: "2026-09-30",
      issuedAt: "2026-09-01T10:00:00Z",
    },
    {
      athleteId: LEA.athleteId,
      status: InvoiceStatus.PENDING,
      dueDate: "2026-10-20",
      issuedAt: "2026-10-01T10:00:00Z",
    },
  ],
  today: TODAY,
};

describe("buildAthleteRows", () => {
  it("compose une ligne par athlète, dans l'ordre de la liste d'athlètes", () => {
    const rows = buildAthleteRows(FULL);
    expect(rows?.map((row) => row.athleteName)).toEqual(["Léa Moreau", "Noah Fontaine"]);
  });

  it("situe le cycle diffusé dans sa progression", () => {
    const [lea] = buildAthleteRows(FULL) ?? [];
    expect(lea?.plan).toEqual({
      id: "pln_lea",
      title: "Cycle Bloc — Oct./Nov.",
      weekCount: 4,
      currentWeek: 2,
      phase: "ONGOING",
      startDate: "2026-10-19",
      endDate: "2026-11-15",
    });
  });

  /**
   * « Pas encore commencé » et « terminé » partagent `currentWeek: null` et ne demandent pas le même
   * geste : le premier est un cycle que le coach a DÉJÀ posé, le second un athlète qui attend une
   * suite. C'est `phase` qui les sépare, et c'est ce qui rend le filtre du tableau défendable.
   */
  it("distingue un cycle à venir d'un cycle terminé, là où currentWeek les confond", () => {
    const upcoming = { ...LEA_PLAN, startDate: "2026-11-02" }; // démarre la semaine prochaine
    const ended = { ...LEA_PLAN, startDate: "2026-09-07" }; // 4 semaines closes le 2026-10-04

    const [ahead] = buildAthleteRows({ ...FULL, plans: [upcoming] }) ?? [];
    expect(ahead?.plan).toMatchObject({ currentWeek: null, phase: "UPCOMING" });

    const [behind] = buildAthleteRows({ ...FULL, plans: [ended] }) ?? [];
    expect(behind?.plan).toMatchObject({
      currentWeek: null,
      phase: "ENDED",
      endDate: "2026-10-04",
    });
  });

  /**
   * `selectCurrentPlan` élit un cycle à venir avant un cycle terminé. Conséquence directe, et c'est
   * ce qui autorise à lire `ENDED` comme « athlète à relancer » : un athlète dont la suite est déjà
   * planifiée ne peut PAS ressortir terminé.
   */
  it("ne rend jamais ENDED quand un cycle à venir existe", () => {
    const ended = { ...LEA_PLAN, id: "pln_ended", startDate: "2026-09-07" };
    const next = { ...LEA_PLAN, id: "pln_next", startDate: "2026-11-02" };

    const [lea] = buildAthleteRows({ ...FULL, plans: [ended, next] }) ?? [];
    expect(lea?.plan).toMatchObject({ id: "pln_next", phase: "UPCOMING" });
  });

  // Un brouillon n'est pas le cycle de l'athlète : il ne le voit pas, la colonne ne le montre pas.
  it("ignore les cycles en brouillon", () => {
    const draft = { ...LEA_PLAN, id: "pln_draft", status: PlanStatus.DRAFT };
    const rows = buildAthleteRows({ ...FULL, plans: [draft] });
    expect(rows?.[0]?.plan).toBeNull();
  });

  /**
   * Le tableau liste des ATHLÈTES : un cycle sans destinataire (#144) n'appartient à aucune ligne,
   * et surtout pas à toutes. Le test fige l'absence pour qu'on ne la « corrige » pas un jour en
   * rangeant ces cycles chez quelqu'un — un athlète marqué « sans plan » appelle un geste du coach,
   * un cycle non affecté en appelle un autre, sur le cycle.
   */
  it("n'attribue à personne un cycle sans destinataire, même diffusé", () => {
    const unassigned = { ...LEA_PLAN, id: "pln_libre", athleteId: null };
    const rows = buildAthleteRows({ ...FULL, plans: [unassigned] });
    expect(rows?.map((row) => row.plan)).toEqual([null, null]);
  });

  it("compte les débriefs NON LUS et retient le plus récent pour le lien", () => {
    const [lea, noah] = buildAthleteRows(FULL) ?? [];
    expect(lea?.unreadFeedbacks).toBe(2);
    // Le plus récent des deux non lus — c'est celui que la colonne doit ouvrir.
    expect(lea?.lastUnreadFeedbackId).toBe("fbk_2");
    expect(noah?.unreadFeedbacks).toBe(0);
    expect(noah?.lastUnreadFeedbackId).toBeNull();
  });

  /**
   * La conversation désigne son interlocuteur par `counterpartId` (elle est vue depuis le coach) :
   * c'est le seul point de jointure qui change de nom, donc le seul où une inversion passerait
   * inaperçue.
   */
  it("rattache les messages non lus par counterpartId", () => {
    const [lea, noah] = buildAthleteRows(FULL) ?? [];
    expect(lea?.unreadMessages).toBe(3);
    // Aucun fil ouvert = 0 non lu, pas « inconnu » : la liste a répondu.
    expect(noah?.unreadMessages).toBe(0);
  });

  /**
   * Une seule pastille par athlète : la DERNIÈRE facture émise. Ici la plus récente est impayée et
   * son échéance est dépassée → OVERDUE, alors que la précédente est payée. Prendre la mauvaise
   * afficherait « Payé » à un coach qui a une relance à faire.
   */
  it("rend l'état de la dernière facture émise, pas d'une plus ancienne", () => {
    const [lea] = buildAthleteRows(FULL) ?? [];
    expect(lea?.invoiceState).toBe(InvoiceState.OVERDUE);
  });

  // Un brouillon n'est pas dû à l'athlète : il ne décide pas de la pastille.
  it("ignore les factures non émises", () => {
    const rows = buildAthleteRows({
      ...FULL,
      invoices: [
        {
          athleteId: LEA.athleteId,
          status: InvoiceStatus.DRAFT,
          dueDate: "2026-10-20",
          issuedAt: null,
        },
      ],
    });
    expect(rows?.[0]?.invoiceState).toBeNull();
  });

  /**
   * LE contrat de la règle nullable : une source ABSENTE rend `null` (→ « — »), une source présente
   * mais sans donnée rend `0` ou `null` selon la colonne. Sans cette distinction, une panne réseau
   * afficherait « 0 message non lu » — un mensonge tranquille.
   */
  it("distingue une source absente d'une source vide", () => {
    const blind = buildAthleteRows({
      athletes: [LEA],
      plans: undefined,
      feedbacks: undefined,
      conversations: undefined,
      invoices: undefined,
      today: TODAY,
    });
    expect(blind?.[0]).toMatchObject({
      plan: null,
      unreadFeedbacks: null,
      unreadMessages: null,
      invoiceState: null,
    });

    const empty = buildAthleteRows({
      athletes: [LEA],
      plans: [],
      feedbacks: [],
      conversations: [],
      invoices: [],
      today: TODAY,
    });
    expect(empty?.[0]).toMatchObject({ plan: null, unreadFeedbacks: 0, unreadMessages: 0 });
  });

  /**
   * Sans athlètes, il n'y a pas de lignes à composer — et un tableau vide ferait croire que le coach
   * n'en a aucun. `null` remonte l'ignorance jusqu'à l'écran, qui affiche une erreur plutôt qu'un
   * état vide.
   */
  it("rend null quand la liste des athlètes est absente", () => {
    expect(buildAthleteRows({ ...FULL, athletes: null })).toBeNull();
    expect(buildAthleteRows({ ...FULL, athletes: undefined })).toBeNull();
    expect(buildAthleteRows({ ...FULL, athletes: [] })).toEqual([]);
  });

  // Les données d'un athlète ne débordent jamais sur la ligne d'un autre.
  it("n'attribue à un athlète que ses propres données", () => {
    const [, noah] = buildAthleteRows(FULL) ?? [];
    expect(noah).toEqual({
      athleteId: NOAH.athleteId,
      athleteName: NOAH.athleteName,
      plan: null,
      unreadFeedbacks: 0,
      lastUnreadFeedbackId: null,
      unreadMessages: 0,
      invoiceState: null,
    });
  });
});

const BLANK: AthleteRow = {
  athleteId: "ath_blank",
  athleteName: "",
  plan: null,
  unreadFeedbacks: 0,
  lastUnreadFeedbackId: null,
  unreadMessages: 0,
  invoiceState: null,
};

// Seuls le nom et le cycle décident de ce que la barre d'outils retient : le reste de la ligne est
// posé une fois, et les cas de test ne fabriquent que ce qu'ils font varier.
function rowOf(athleteName: string, plan: AthleteRowPlan | null = null): AthleteRow {
  return { ...BLANK, athleteId: `ath_${athleteName}`, athleteName, plan };
}

function planOf(phase: AthleteRowPlan["phase"]): AthleteRowPlan {
  return {
    id: "pln",
    title: "Cycle Bloc",
    weekCount: 4,
    currentWeek: phase === "ONGOING" ? 2 : null,
    phase,
    startDate: "2026-10-19",
    endDate: "2026-11-15",
  };
}

const ONGOING = rowOf("Léa Moreau", planOf("ONGOING"));
const UPCOMING = rowOf("Thomas Rey", planOf("UPCOMING"));
const ENDED = rowOf("Camille Bernard", planOf("ENDED"));
const UNREADABLE = rowOf("Emma Girard", planOf(null));
const NO_PLAN = rowOf("Noah Fontaine");
const ALL_ROWS = [ONGOING, UPCOMING, ENDED, UNREADABLE, NO_PLAN];

const QUERY = { search: "", filter: "ALL", locale: "fr" } as const;

describe("visibleAthleteRows", () => {
  it("retient tout quand rien n'est demandé", () => {
    expect(visibleAthleteRows(ALL_ROWS, QUERY)).toHaveLength(ALL_ROWS.length);
  });

  /**
   * Le cas d'usage de la barre : le coach tape une bribe, sans accent, dans n'importe quelle casse,
   * et sur le nom de famille aussi bien que sur le prénom.
   */
  it("cherche par sous-chaîne, sans casse ni accent", () => {
    const names = (search: string) =>
      visibleAthleteRows(ALL_ROWS, { ...QUERY, search }).map((row) => row.athleteName);

    expect(names("lea")).toEqual(["Léa Moreau"]);
    expect(names("MOREAU")).toEqual(["Léa Moreau"]);
    expect(names("  bernard ")).toEqual(["Camille Bernard"]);
    expect(names("zzz")).toEqual([]);
  });

  /**
   * « Cycle terminé » ne doit attraper QUE le cycle fini. Ni celui en cours, ni — surtout — celui à
   * venir : un athlète dont le coach a déjà planifié la suite n'est pas à relancer.
   */
  it("ne retient sous ENDED_PLAN que le cycle terminé", () => {
    const rows = visibleAthleteRows(ALL_ROWS, { ...QUERY, filter: "ENDED_PLAN" });
    expect(rows.map((row) => row.athleteName)).toEqual(["Camille Bernard"]);
  });

  it("ne retient sous NO_PLAN que l'absence de cycle", () => {
    const rows = visibleAthleteRows(ALL_ROWS, { ...QUERY, filter: "NO_PLAN" });
    expect(rows.map((row) => row.athleteName)).toEqual(["Noah Fontaine"]);
  });

  /**
   * Un cycle non situable (`phase: null`, dates illisibles) n'est PAS un cycle terminé : le ranger
   * là inventerait un athlète à relancer. Il n'apparaît que sous « Tous ».
   */
  it("ne range un cycle non situable dans aucun des deux filtres", () => {
    const only = [UNREADABLE];
    expect(visibleAthleteRows(only, { ...QUERY, filter: "ENDED_PLAN" })).toEqual([]);
    expect(visibleAthleteRows(only, { ...QUERY, filter: "NO_PLAN" })).toEqual([]);
    expect(visibleAthleteRows(only, QUERY)).toHaveLength(1);
  });

  /**
   * L'invariant qui vaut à ces deux segments d'exister côte à côte (contrainte « aucune information
   * lue deux fois », tranchée en #52) : aucun athlète ne peut figurer sous les deux, quelle que
   * soit la ligne.
   */
  it("garde les deux filtres disjoints", () => {
    const ended = visibleAthleteRows(ALL_ROWS, { ...QUERY, filter: "ENDED_PLAN" });
    const noPlan = visibleAthleteRows(ALL_ROWS, { ...QUERY, filter: "NO_PLAN" });
    const shared = ended.filter((row) => noPlan.some((other) => other.athleteId === row.athleteId));
    expect(shared).toEqual([]);
  });

  it("combine recherche et filtre plutôt que de choisir", () => {
    const rows = visibleAthleteRows(ALL_ROWS, { ...QUERY, search: "camille", filter: "NO_PLAN" });
    expect(rows).toEqual([]);
  });

  /**
   * L'ordre remplace le tri « activité récente » de la maquette. Les accents se classent à leur
   * lettre — « Émile » entre « Alice » et « Zoé », pas rejeté en fin de liste comme le ferait une
   * comparaison de codes.
   */
  it("range par nom, accents à leur place", () => {
    const rows = [rowOf("Zoé Martin"), rowOf("Émile Bernard"), rowOf("Alice Dupont")];
    expect(visibleAthleteRows(rows, QUERY).map((row) => row.athleteName)).toEqual([
      "Alice Dupont",
      "Émile Bernard",
      "Zoé Martin",
    ]);
  });

  // Le tableau d'entrée vient du cache de TanStack Query : le trier sur place le corromprait.
  it("n'altère pas le tableau reçu", () => {
    const rows = [rowOf("Zoé Martin"), rowOf("Alice Dupont")];
    visibleAthleteRows(rows, QUERY);
    expect(rows.map((row) => row.athleteName)).toEqual(["Zoé Martin", "Alice Dupont"]);
  });
});
