import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "../dto/invoice.schema";
import { INVOICE_STATE_BADGE, InvoiceState } from "./invoice.util";
import {
  buildInvoiceAthleteRows,
  countAthletesBySituation,
  INVOICE_HISTORY_PAGE_SIZE,
  INVOICE_ROW_FILTERS,
  INVOICE_SITUATION_STATE,
  type InvoiceRowSource,
  pageOfInvoices,
  sortAthleteInvoices,
  visibleInvoiceAthleteRows,
} from "./invoice-row.util";

const TODAY = "2026-08-25";

const LEA = { athleteId: "ath_lea", athleteName: "Léa Bonnet" };
const THEO = { athleteId: "ath_theo", athleteName: "Théo Marchand" };
const SARAH = { athleteId: "ath_sarah", athleteName: "Sarah Nguyen" };
const ADRIEN = { athleteId: "ath_adrien", athleteName: "Adrien Roux" };

/** Une facture réduite à ce dont la ligne dépend — le DTO complet n'apporterait rien au test. */
function invoice(
  athlete: { athleteId: string; athleteName: string },
  fields: Omit<InvoiceRowSource, "athleteId" | "athleteName" | "paidAt"> & { paidAt?: string },
): InvoiceRowSource {
  return { ...athlete, paidAt: null, ...fields };
}

// Léa : trois retards (le plus ancien au 18 juin, soit 68 jours) et deux factures réglées.
const LEA_INVOICES = [
  invoice(LEA, {
    period: "2026-08",
    amountCents: 18000,
    status: InvoiceStatus.PENDING,
    dueDate: "2026-08-05",
  }),
  invoice(LEA, {
    period: "2026-07",
    amountCents: 18000,
    status: InvoiceStatus.PENDING,
    dueDate: "2026-07-05",
  }),
  invoice(LEA, {
    period: "2026-06",
    amountCents: 18000,
    status: InvoiceStatus.PENDING,
    dueDate: "2026-06-18",
  }),
  invoice(LEA, {
    period: "2026-05",
    amountCents: 18000,
    status: InvoiceStatus.PAID,
    dueDate: "2026-05-05",
    paidAt: "2026-05-04T09:00:00Z",
  }),
  invoice(LEA, {
    period: "2026-04",
    amountCents: 18000,
    status: InvoiceStatus.PAID,
    dueDate: "2026-04-05",
    paidAt: "2026-04-06T09:00:00Z",
  }),
];

// Théo : un seul retard, plus récent que ceux de Léa (12 jours).
const THEO_INVOICES = [
  invoice(THEO, {
    period: "2026-08",
    amountCents: 18000,
    status: InvoiceStatus.PENDING,
    dueDate: "2026-08-13",
  }),
];

// Sarah : une facture émise dont l'échéance n'est pas passée.
const SARAH_INVOICES = [
  invoice(SARAH, {
    period: "2026-08",
    amountCents: 18000,
    status: InvoiceStatus.PENDING,
    dueDate: "2026-08-28",
  }),
];

// Adrien : tout est réglé, le dernier paiement au 2 août.
const ADRIEN_INVOICES = [
  invoice(ADRIEN, {
    period: "2026-08",
    amountCents: 15000,
    status: InvoiceStatus.PAID,
    dueDate: "2026-08-05",
    paidAt: "2026-08-02T09:00:00Z",
  }),
  invoice(ADRIEN, {
    period: "2026-07",
    amountCents: 15000,
    status: InvoiceStatus.PAID,
    dueDate: "2026-07-05",
    paidAt: "2026-07-03T09:00:00Z",
  }),
];

const ALL_INVOICES = [...LEA_INVOICES, ...THEO_INVOICES, ...SARAH_INVOICES, ...ADRIEN_INVOICES];

function rowsOf(invoices: readonly InvoiceRowSource[] = ALL_INVOICES) {
  return buildInvoiceAthleteRows(invoices, TODAY) ?? [];
}

function rowOf(athleteId: string, invoices: readonly InvoiceRowSource[] = ALL_INVOICES) {
  return rowsOf(invoices).find((row) => row.athleteId === athleteId);
}

describe("buildInvoiceAthleteRows", () => {
  it("rend null sur une liste absente, pour ne pas annoncer un écran vide sur une panne", () => {
    expect(buildInvoiceAthleteRows(null, TODAY)).toBeNull();
    expect(buildInvoiceAthleteRows(undefined, TODAY)).toBeNull();
  });

  it("ne compose une ligne que pour les athlètes FACTURÉS", () => {
    expect(rowsOf().map((row) => row.athleteName)).toEqual([
      "Léa Bonnet",
      "Théo Marchand",
      "Sarah Nguyen",
      "Adrien Roux",
    ]);
  });

  it("range en retard l'athlète dont au moins une échéance est passée", () => {
    expect(rowOf(LEA.athleteId)).toMatchObject({
      situation: "OVERDUE",
      count: 3,
      amountDueCents: 54000,
      subtitle: { kind: "OVERDUE_SINCE", days: 68 },
    });
  });

  it("compte les RETARDS et non toutes les impayées quand l'athlète est en retard", () => {
    const withUpcoming = [
      ...LEA_INVOICES,
      invoice(LEA, {
        period: "2026-09",
        amountCents: 9000,
        status: InvoiceStatus.PENDING,
        dueDate: "2026-09-05",
      }),
    ];
    // Trois retards affichés, mais les quatre impayées dans le montant dû : on doit tout.
    expect(rowOf(LEA.athleteId, withUpcoming)).toMatchObject({ count: 3, amountDueCents: 63000 });
  });

  it("range à échéance l'athlète dont rien n'est encore échu, et date la prochaine", () => {
    expect(rowOf(SARAH.athleteId)).toMatchObject({
      situation: "DUE",
      count: 1,
      amountDueCents: 18000,
      subtitle: { kind: "NEXT_DUE", date: "2026-08-28" },
    });
  });

  it("date la PROCHAINE échéance, et non la première de la liste", () => {
    const twoDue = [
      invoice(SARAH, {
        period: "2026-10",
        amountCents: 18000,
        status: InvoiceStatus.PENDING,
        dueDate: "2026-10-05",
      }),
      ...SARAH_INVOICES,
    ];
    const expected = { count: 2, amountDueCents: 36000 };
    const nearest = { kind: "NEXT_DUE", date: "2026-08-28" };
    // La plus proche gagne, qu'elle arrive avant ou après l'autre dans la liste reçue.
    expect(rowOf(SARAH.athleteId, twoDue)).toMatchObject({ ...expected, subtitle: nearest });
    expect(rowOf(SARAH.athleteId, [...twoDue].reverse())).toMatchObject({
      ...expected,
      subtitle: nearest,
    });
  });

  it("range à jour l'athlète sans impayé, et date son dernier règlement", () => {
    expect(rowOf(ADRIEN.athleteId)).toMatchObject({
      situation: "UP_TO_DATE",
      // Ni compteur ni montant : « 0 » et « 0 € » se lisent comme des valeurs, il n'y en a pas.
      count: null,
      amountDueCents: null,
      subtitle: { kind: "LAST_PAID", date: "2026-08-02" },
    });
  });

  it("écarte les factures annulées du montant dû comme de la situation", () => {
    const cancelled = [
      invoice(ADRIEN, {
        period: "2026-09",
        amountCents: 9000,
        status: InvoiceStatus.CANCELLED,
        dueDate: "2026-09-05",
      }),
      ...ADRIEN_INVOICES,
    ];
    const row = rowOf(ADRIEN.athleteId, cancelled);
    expect(row).toMatchObject({ situation: "UP_TO_DATE", amountDueCents: null });
    // Écartée des agrégats, mais TOUJOURS dans l'historique : elle a existé.
    expect(row?.invoices).toHaveLength(3);
  });

  it("dit à jour un athlète dont l'unique facture est annulée, sans sous-titre à inventer", () => {
    const onlyCancelled = [
      invoice(THEO, {
        period: "2026-08",
        amountCents: 9000,
        status: InvoiceStatus.CANCELLED,
        dueDate: "2026-08-05",
      }),
    ];
    expect(rowOf(THEO.athleteId, onlyCancelled)).toMatchObject({
      situation: "UP_TO_DATE",
      subtitle: null,
    });
  });

  it("garde due, et non à jour, une impayée dont l'échéance est illisible", () => {
    const unreadable = [
      invoice(THEO, {
        period: "2026-08",
        amountCents: 9000,
        status: InvoiceStatus.PENDING,
        dueDate: "05/08/2026",
      }),
    ];
    expect(rowOf(THEO.athleteId, unreadable)).toMatchObject({
      situation: "DUE",
      // Le montant reste dû : c'est le STATUT qui l'établit, pas la date.
      amountDueCents: 9000,
    });
  });

  it("écarte les échéances illisibles du plus ancien retard sans perdre les autres", () => {
    const mixed = [
      ...LEA_INVOICES,
      invoice(LEA, {
        period: "2026-03",
        amountCents: 9000,
        status: InvoiceStatus.PENDING,
        dueDate: "pas-une-date",
      }),
    ];
    expect(rowOf(LEA.athleteId, mixed)?.subtitle).toEqual({ kind: "OVERDUE_SINCE", days: 68 });
  });

  it("retient le dernier règlement, quel que soit l'ordre d'arrivée", () => {
    const settled = LEA_INVOICES.slice(3);
    const expected = { kind: "LAST_PAID", date: "2026-05-04" };
    // Mai est réglée après avril. Elle gagne, qu'elle soit listée avant ou après.
    expect(rowOf(LEA.athleteId, settled)?.subtitle).toEqual(expected);
    expect(rowOf(LEA.athleteId, [...settled].reverse())?.subtitle).toEqual(expected);
  });
});

describe("sortAthleteInvoices", () => {
  it("épingle les retards en tête, chaque bloc de la plus récente à la plus ancienne", () => {
    expect(sortAthleteInvoices(LEA_INVOICES, TODAY).map((entry) => entry.period)).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
    ]);
  });

  it("fait remonter un retard ancien au-dessus d'une facture récente déjà réglée", () => {
    const invoices = [
      invoice(LEA, {
        period: "2026-08",
        amountCents: 18000,
        status: InvoiceStatus.PAID,
        dueDate: "2026-08-05",
        paidAt: "2026-08-04T09:00:00Z",
      }),
      invoice(LEA, {
        period: "2026-06",
        amountCents: 18000,
        status: InvoiceStatus.PENDING,
        dueDate: "2026-06-18",
      }),
    ];
    expect(sortAthleteInvoices(invoices, TODAY).map((entry) => entry.period)).toEqual([
      "2026-06",
      "2026-08",
    ]);
  });

  it("n'altère pas la liste reçue", () => {
    const original = [...LEA_INVOICES];
    sortAthleteInvoices(LEA_INVOICES, TODAY);
    expect(LEA_INVOICES).toEqual(original);
  });
});

describe("visibleInvoiceAthleteRows", () => {
  const query = { search: "", filter: "ALL" as const, locale: "fr" };

  it("range les retards d'abord, du plus ancien au plus récent", () => {
    const visible = visibleInvoiceAthleteRows(rowsOf(), query);
    expect(visible.map((row) => row.athleteName)).toEqual([
      // 68 jours, puis 12 jours…
      "Léa Bonnet",
      "Théo Marchand",
      // …puis l'échéance à venir, puis qui ne doit rien.
      "Sarah Nguyen",
      "Adrien Roux",
    ]);
  });

  it("range les échéances de la plus proche à la plus lointaine", () => {
    const later = [
      invoice(ADRIEN, {
        period: "2026-09",
        amountCents: 15000,
        status: InvoiceStatus.PENDING,
        dueDate: "2026-09-30",
      }),
      ...SARAH_INVOICES,
    ];
    const visible = visibleInvoiceAthleteRows(rowsOf(later), query);
    expect(visible.map((row) => row.athleteName)).toEqual(["Sarah Nguyen", "Adrien Roux"]);
  });

  it("range les athlètes à jour par ordre alphabétique", () => {
    const settled = [...ADRIEN_INVOICES, ...LEA_INVOICES.slice(3)];
    const visible = visibleInvoiceAthleteRows(rowsOf(settled), query);
    expect(visible.map((row) => row.athleteName)).toEqual(["Adrien Roux", "Léa Bonnet"]);
  });

  it("ne retient que la situation demandée", () => {
    const visible = visibleInvoiceAthleteRows(rowsOf(), { ...query, filter: "OVERDUE" });
    expect(visible.map((row) => row.athleteName)).toEqual(["Léa Bonnet", "Théo Marchand"]);
  });

  it("cherche sans casse ni accent, sur le nom comme sur le prénom", () => {
    const found = visibleInvoiceAthleteRows(rowsOf(), { ...query, search: "  THEO " });
    expect(found.map((row) => row.athleteName)).toEqual(["Théo Marchand"]);
    expect(
      visibleInvoiceAthleteRows(rowsOf(), { ...query, search: "marchand" }).map(
        (row) => row.athleteName,
      ),
    ).toEqual(["Théo Marchand"]);
  });

  it("combine recherche et filtre", () => {
    const visible = visibleInvoiceAthleteRows(rowsOf(), {
      ...query,
      search: "lea",
      filter: "UP_TO_DATE",
    });
    expect(visible).toEqual([]);
  });

  it("n'altère pas les lignes reçues", () => {
    const rows = rowsOf();
    const order = rows.map((row) => row.athleteId);
    visibleInvoiceAthleteRows(rows, { ...query, filter: "OVERDUE" });
    expect(rows.map((row) => row.athleteId)).toEqual(order);
  });
});

describe("countAthletesBySituation", () => {
  it("compte les athlètes de chaque situation, filtre en cours ignoré", () => {
    expect(countAthletesBySituation(rowsOf())).toEqual({
      ALL: 4,
      OVERDUE: 2,
      DUE: 1,
      UP_TO_DATE: 1,
    });
  });

  it("couvre exactement les segments de la barre d'outils", () => {
    expect(Object.keys(countAthletesBySituation(rowsOf())).sort()).toEqual(
      [...INVOICE_ROW_FILTERS].sort(),
    );
  });

  it("compte zéro partout sur une liste vide", () => {
    expect(countAthletesBySituation([])).toEqual({ ALL: 0, OVERDUE: 0, DUE: 0, UP_TO_DATE: 0 });
  });

  /**
   * La recherche, contrairement au segment, RESTREINT la population : elle ne tranche pas la liste,
   * elle la réduit. Sans ça un segment annonce un nombre qui ne mène nulle part (#225).
   */
  it("applique la recherche, là où il ignore le segment", () => {
    // « bon » ne laisse que Léa Bonnet.
    const counts = countAthletesBySituation(rowsOf(), "bon");
    expect(counts.ALL).toBe(1);
    expect(counts.OVERDUE + counts.DUE + counts.UP_TO_DATE).toBe(1);
  });

  it("aucun segment ne peut annoncer un nombre qui ne mène nulle part", () => {
    const rows = rowsOf();
    const search = "bon";
    const counts = countAthletesBySituation(rows, search);

    for (const filter of INVOICE_ROW_FILTERS) {
      const visible = visibleInvoiceAthleteRows(rows, { search, filter, locale: "fr" });
      expect(visible).toHaveLength(counts[filter]);
    }
  });

  it("cherche sans casse ni accent, comme la liste qu'il décompte", () => {
    expect(countAthletesBySituation(rowsOf(), "LÉA").ALL).toBe(1);
    expect(countAthletesBySituation(rowsOf(), "lea").ALL).toBe(1);
  });
});

describe("pageOfInvoices", () => {
  const items = Array.from({ length: 14 }, (_, index) => index + 1);

  it("découpe par cinq et situe la tranche dans le total", () => {
    expect(pageOfInvoices(items, 2)).toEqual({
      items: [6, 7, 8, 9, 10],
      page: 2,
      pageCount: 3,
      from: 6,
      to: 10,
      total: 14,
    });
  });

  it("rend la dernière tranche, plus courte que les autres", () => {
    expect(pageOfInvoices(items, 3)).toMatchObject({ items: [11, 12, 13, 14], from: 11, to: 14 });
  });

  it("ramène dans les bornes une page hors bornes plutôt que de rendre du vide", () => {
    expect(pageOfInvoices(items, 9)).toMatchObject({ page: 3, items: [11, 12, 13, 14] });
    expect(pageOfInvoices(items, 0)).toMatchObject({ page: 1, from: 1 });
    expect(pageOfInvoices(items, -4)).toMatchObject({ page: 1, from: 1 });
  });

  it("donne une page vide, et non zéro page, sur une liste vide", () => {
    expect(pageOfInvoices([], 1)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
      total: 0,
    });
  });

  it("accepte une taille de page explicite", () => {
    expect(pageOfInvoices(items, 1, 2)).toMatchObject({ items: [1, 2], pageCount: 7 });
  });

  it("découpe par cinq par défaut, comme la maquette", () => {
    expect(INVOICE_HISTORY_PAGE_SIZE).toBe(5);
    expect(pageOfInvoices(items, 1).items).toHaveLength(INVOICE_HISTORY_PAGE_SIZE);
  });
});

describe("INVOICE_SITUATION_STATE", () => {
  /**
   * Ce test EST l'arbitrage de #120 sur les couleurs : la situation d'un athlète se colore comme
   * l'état de facture qu'elle résume. Le jour où quelqu'un rouvre une seconde table de couleurs,
   * il tombera ici avant de tomber sur un athlète orange sur un écran et rouge sur l'autre.
   */
  it("colore chaque situation comme l'état de facture correspondant", () => {
    expect(INVOICE_STATE_BADGE[INVOICE_SITUATION_STATE.OVERDUE].variant).toBe("error");
    expect(INVOICE_STATE_BADGE[INVOICE_SITUATION_STATE.DUE].variant).toBe("warning");
    expect(INVOICE_STATE_BADGE[INVOICE_SITUATION_STATE.UP_TO_DATE].variant).toBe("success");
  });

  it("ne range aucune situation sur l'état annulé, qui n'en est pas une", () => {
    expect(Object.values(INVOICE_SITUATION_STATE)).not.toContain(InvoiceState.CANCELLED);
  });
});
