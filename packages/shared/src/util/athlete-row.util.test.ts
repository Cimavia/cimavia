import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "../dto/invoice.schema";
import { PlanStatus } from "../dto/plan.schema";
import { type AthleteRowsInput, buildAthleteRows } from "./athlete-row.util";
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
    });
  });

  // Un brouillon n'est pas le cycle de l'athlète : il ne le voit pas, la colonne ne le montre pas.
  it("ignore les cycles en brouillon", () => {
    const draft = { ...LEA_PLAN, id: "pln_draft", status: PlanStatus.DRAFT };
    const rows = buildAthleteRows({ ...FULL, plans: [draft] });
    expect(rows?.[0]?.plan).toBeNull();
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
