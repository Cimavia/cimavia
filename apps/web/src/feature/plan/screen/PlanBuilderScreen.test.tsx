import {
  mondayOfIsoWeek,
  type PlanDto,
  PlanStatus,
  type PlanSummaryDto,
  type PlanWeekDto,
  PlanWeekType,
  type ScheduledSessionDto,
  ScheduledSessionStatus,
  shiftIsoDate,
  todayIsoDate,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanBilling } from "@/feature/invoice/hook/useInvoices";
import { getScheduledSession } from "@/feature/plan/api";
import { usePlan, usePlanMutations } from "@/feature/plan/hook/usePlan";
import { clearPlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { PlanBuilderScreen } from "@/feature/plan/screen/PlanBuilderScreen";
import { renderInRoute } from "../../../../test/render";

/**
 * Les données ont leurs propres tests ; ce qui s'éprouve ici est ce que l'écran DÉCIDE — comment
 * il nomme un cycle sans destinataire, et ce qu'il ferme tant qu'il n'en a pas (#144).
 */
vi.mock("@/feature/plan/hook/usePlan", () => ({
  usePlan: vi.fn(),
  usePlanMutations: vi.fn(),
}));
vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  usePlanBilling: vi.fn(),
  useSavePlanBilling: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachInvoiceDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveInvoiceDocument: () => ({ mutate: vi.fn(), isPending: false }),
}));
const publishPlan = vi.hoisted(() => vi.fn());
const deletePlan = vi.hoisted(() => vi.fn());
vi.mock("@/feature/plan/hook/usePlans", () => ({
  useDeletePlan: () => ({ mutate: deletePlan, isPending: false }),
  usePublishPlan: () => ({ mutate: publishPlan, isPending: false }),
  // Les autres cycles du coach, dont l'écran tire ce que l'athlète voit de celui-ci (#172).
  usePlans: vi.fn(),
}));
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [
      { athleteId: "ath_lea", athleteName: "Léa Moreau", isSelf: false },
      { athleteId: "ath_tom", athleteName: "Tom Garnier", isSelf: false },
    ],
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    actions,
    children,
  }: Readonly<{ title: string; actions?: unknown; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {actions as never}
      {children as never}
    </div>
  ),
}));
vi.mock("@/feature/reminder", () => ({ ScheduleReminderButton: () => null }));
// Le détail d'une séance se charge à l'ouverture du panneau : c'est l'écran qui le demande.
vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  getScheduledSession: vi.fn(),
}));
// Le panneau pioche dans la bibliothèque : ses deux listes sont des entrées, vides ici.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  listSessions: vi.fn(async () => []),
  listExercises: vi.fn(async () => []),
}));

const plan = (over: Partial<PlanDto>): PlanDto =>
  ({
    id: "pln_1",
    coachId: "coach_1",
    athleteId: "ath_lea",
    athleteName: "Léa Moreau",
    athleteEmail: "lea@example.test",
    title: "Cycle bloc",
    description: null,
    startDate: "2026-10-19",
    status: PlanStatus.DRAFT,
    publishedAt: null,
    weekCount: 0,
    sessionCount: 0,
    weeks: [],
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...over,
  }) as PlanDto;

const saveHeader = vi.fn();
const addWeek = vi.fn();
const refetch = vi.fn();

type PlanQuery = { data?: PlanDto | undefined; isPending?: boolean; isError?: boolean };

const mount = async (
  over: Partial<PlanDto>,
  billing: unknown = null,
  // `null` = la liste n'a pas encore répondu, ce qui est un cas à part (#172). Pas `undefined` :
  // le passer explicitement déclencherait la valeur par défaut du paramètre.
  coachPlans: PlanSummaryDto[] | null = [],
  query: PlanQuery = {},
) => {
  vi.mocked(usePlans).mockReturnValue({
    data: coachPlans ?? undefined,
  } as unknown as ReturnType<typeof usePlans>);
  vi.mocked(usePlan).mockReturnValue({
    data: plan(over),
    isPending: false,
    isError: false,
    refetch,
    ...query,
  } as unknown as ReturnType<typeof usePlan>);
  vi.mocked(usePlanMutations).mockReturnValue({
    addWeek: { mutate: addWeek },
    saveHeader: { mutate: saveHeader, isPending: false },
    isBusy: false,
  } as unknown as ReturnType<typeof usePlanMutations>);
  vi.mocked(usePlanBilling).mockReturnValue({ data: billing } as unknown as ReturnType<
    typeof usePlanBilling
  >);

  return renderInRoute(<PlanBuilderScreen />, {
    path: "/plans/$planId",
    params: { planId: "pln_1" },
    links: ["/plans", "/invoices"],
  });
};

/**
 * Le TITRE n'est pas observable ici : il passe par `titleWithAthlete`, et le harnais i18n tourne en
 * `cimode`, qui perd les paramètres d'interpolation (cf. `test/i18n.ts`). Ce qui s'affirme est donc
 * ce qui GOUVERNE l'en-tête — le sélecteur, seul endroit où le destinataire est une valeur et non
 * une chaîne mise en forme.
 */
describe("PlanBuilderScreen — le destinataire", () => {
  it("montre le destinataire du cycle dans le formulaire", async () => {
    const { getByRole } = await mount({});

    expect((getByRole("combobox") as HTMLSelectElement).value).toBe("ath_lea");
  });

  // « Pas encore choisi » est une réponse, et le formulaire offre le geste qui la comble.
  it("montre le cycle comme non affecté, sélecteur ouvert", async () => {
    const { getByRole } = await mount({ athleteId: null, athleteName: null, athleteEmail: null });

    const picker = getByRole("combobox") as HTMLSelectElement;
    expect(picker.value).toBe("");
    expect(picker.disabled).toBe(false);
  });

  /**
   * Le CÂBLAGE, et lui seul : ce que le formulaire décide d'envoyer a ses propres tests. Sans ce
   * fil, le formulaire afficherait quatre champs modifiables que rien n'enregistrerait — la
   * panne exacte que #207 vient réparer, reproduite un cran plus loin.
   */
  it("enregistre par la mutation du builder ce que le formulaire a changé", async () => {
    const { getByRole, getByText, user } = await mount({
      athleteId: null,
      athleteName: null,
      athleteEmail: null,
    });

    await user.selectOptions(getByRole("combobox"), "ath_lea");
    await user.click(getByText("plan.header.submit"));

    expect(saveHeader).toHaveBeenCalledWith({ athleteId: "ath_lea" });
  });

  it("ferme la diffusion et la facturation tant que le cycle n'a pas de destinataire", async () => {
    const { getByText } = await mount({ athleteId: null, athleteName: null, athleteEmail: null });

    expect((getByText("plan.builder.publish") as HTMLButtonElement).disabled).toBe(true);
    expect(getByText("invoice.billing.athleteRequired")).toBeTruthy();
  });

  /**
   * La SEULE garde de cette lecture vit ici depuis #211 : la section de facturation reçoit ce
   * qu'on lit, elle ne le redemande plus. Trois cas où aucun brouillon ne peut exister, donc
   * trois questions qu'on ne pose pas — l'API y répondrait `null`, mais au prix d'un aller-retour.
   */
  it("ne demande pas les termes d'un cycle sans destinataire", async () => {
    await mount({ athleteId: null, athleteName: null, athleteEmail: null });

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", false);
  });

  it("ne demande pas les termes d'un cycle écrit pour soi", async () => {
    await mount({ athleteId: "coach_1", athleteName: "Moi" });

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", false);
  });

  /**
   * Le défaut de #211, côté client : ouvrir un cycle diffusé posait la question quand même, et
   * l'API la refusait. Le statut manquait aux deux gardes d'alors — celle-ci est la seule qui
   * reste, elle le porte.
   */
  it("ne demande pas les termes d'un cycle diffusé", async () => {
    await mount({ status: PlanStatus.PUBLISHED });

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", false);
  });

  it("demande les termes d'un cycle adressé à un athlète", async () => {
    await mount({});

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", true);
  });

  // Le câblage de #472 : c'est la facturation LUE ici qui dit au sélecteur qu'un PDF est joint.
  it("fige le destinataire quand la facturation porte un justificatif", async () => {
    const { getByRole } = await mount({}, { documentFileName: "facture.pdf" });

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
  });

  it("laisse le destinataire ouvert quand la facturation n'a pas de justificatif", async () => {
    const { getByRole } = await mount({}, { documentFileName: null });

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(false);
  });
});

/**
 * Le cœur de #172 côté coach : l'écran affirmait « L'athlète voit ce cycle » dès la diffusion, sans
 * condition. Ce qui s'éprouve ici est qu'il dit maintenant LAQUELLE des situations est vraie — et
 * qu'il se tait tant qu'il ne sait pas.
 */
describe("PlanBuilderScreen — ce que l'athlète voit du cycle", () => {
  const TODAY_MONDAY = mondayOfIsoWeek(todayIsoDate()) ?? "2026-10-12";
  const nextMonday = (weeks: number) => shiftIsoDate(TODAY_MONDAY, weeks * 7) ?? TODAY_MONDAY;

  const summary = (over: Partial<PlanSummaryDto>): PlanSummaryDto =>
    ({ ...plan({}), status: PlanStatus.PUBLISHED, weekCount: 4, ...over }) as PlanSummaryDto;

  const ongoing = { status: PlanStatus.PUBLISHED, startDate: TODAY_MONDAY, weekCount: 4 } as const;

  it("se tait tant que la liste des cycles n'a pas répondu", async () => {
    const { container } = await mount(ongoing, null, null);

    expect(container.textContent).not.toContain("plan.builder.audience");
  });

  it("confirme la visibilité d'un cycle en cours et seul à l'être", async () => {
    const { getByText } = await mount(ongoing, null, []);

    expect(getByText("plan.builder.audience.VISIBLE_ALONE")).toBeTruthy();
  });

  it("annonce la date d'un cycle diffusé qui n'a pas encore commencé", async () => {
    const { getByText } = await mount({ ...ongoing, startDate: nextMonday(3) }, null, []);

    expect(getByText("plan.builder.audience.VISIBLE_UPCOMING")).toBeTruthy();
  });

  // Ce que l'accumulation rend possible, et que le coach doit savoir avant d'en ajouter un.
  it("signale un second cycle mené en parallèle par le même athlète", async () => {
    const other = summary({ id: "pln_2", title: "Prépa falaise", startDate: TODAY_MONDAY });
    const { getByText } = await mount(ongoing, null, [other]);

    expect(getByText("plan.builder.audience.VISIBLE_WITH")).toBeTruthy();
  });
});

describe("PlanBuilderScreen — le cycle ne se lit pas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attend le cycle avant de rien affirmer", async () => {
    const { getByText } = await mount({}, null, [], { isPending: true, data: undefined });

    expect(getByText("common.loading")).toBeTruthy();
  });

  // Une panne n'est pas une disparition : rediriger vers la liste laisserait croire le cycle perdu.
  it("dit la panne et relit le cycle quand on réessaie", async () => {
    const { getByRole, user } = await mount({}, null, [], { isError: true, data: undefined });

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("ramène à la liste un cycle qui n'existe pas, ou plus", async () => {
    const { router } = await mount({}, null, [], { data: undefined });

    await waitFor(() => expect(router.state.location.pathname).toBe("/plans"));
  });
});

describe("PlanBuilderScreen — les semaines", () => {
  const MONDAY = "2026-10-19";

  const summary: ScheduledSessionDto = {
    id: "ss_1",
    planId: "pln_1",
    planWeekId: "pw_1",
    sourceSessionId: null,
    title: "Force max",
    notes: null,
    scheduledDate: MONDAY,
    position: 0,
    status: ScheduledSessionStatus.PLANNED,
    exerciseCount: 0,
    updatedAt: "2026-08-10T00:00:00.000Z",
    coachId: "coach_1",
    coachName: "Julie Renaud",
    exercises: [],
  };

  const week: PlanWeekDto = {
    id: "pw_1",
    weekNumber: 1,
    type: PlanWeekType.TRAINING,
    note: null,
    startDate: MONDAY,
    endDate: shiftIsoDate(MONDAY, 6) ?? MONDAY,
    sessions: [summary],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPlanClipboard();
    vi.mocked(getScheduledSession).mockResolvedValue(summary);
  });

  it("ouvre une séance vierge sur le jour choisi, et la referme", async () => {
    const { getAllByRole, getByRole, queryByText, user } = await mount({ weeks: [week] });

    await user.click(getAllByRole("button", { name: "plan.week.addSession" })[0] as HTMLElement);
    expect(queryByText("plan.session.createTitle")).toBeTruthy();

    await user.click(getByRole("button", { name: "common.cancel" }));
    expect(queryByText("plan.session.createTitle")).toBeNull();
  });

  // Le résumé de la semaine ne porte pas la composition : le panneau attend le détail chargé.
  it("charge le détail de la séance ouverte avant de montrer le panneau", async () => {
    const { findByText, getByRole, user } = await mount({ weeks: [week] });

    await user.click(getByRole("button", { name: /Force max/ }));

    expect(await findByText("plan.session.editTitle")).toBeTruthy();
    expect(getScheduledSession).toHaveBeenCalledWith("ss_1");
  });

  it("ajoute une semaine d'entraînement en fin de cycle", async () => {
    const { getByRole, user } = await mount({ weeks: [week] });

    await user.click(getByRole("button", { name: "plan.builder.addWeek" }));

    expect(addWeek).toHaveBeenCalledWith({ type: PlanWeekType.TRAINING });
  });

  // Sans ce bandeau, des « Coller ici » apparaîtraient sans que rien ne dise ce qui est armé.
  it("annonce la semaine copiée, et la désarme", async () => {
    const { getByRole, queryByText, user } = await mount({ weeks: [week] });
    expect(queryByText("plan.clipboard.banner")).toBeNull();

    await user.click(getByRole("button", { name: "plan.week.copy" }));
    expect(queryByText("plan.clipboard.banner")).toBeTruthy();

    await user.click(getByRole("button", { name: "plan.clipboard.clear" }));
    expect(queryByText("plan.clipboard.banner")).toBeNull();
  });
});

/**
 * Le scénario de #326 : le coach corrige le destinataire — Léa → Tom — puis clique « Diffuser » en
 * haut de page sans repasser par « Enregistrer ». Le cycle partait chez Léa, notification et
 * facture comprises, et l'API refuse ensuite d'en changer. Ce qui s'éprouve ici est le CÂBLAGE :
 * l'ordre des raisons a ses tests dans `PlanBuilderActions`.
 */
describe("PlanBuilderScreen — diffuser une saisie non enregistrée", () => {
  const week: PlanWeekDto = {
    id: "pw_1",
    weekNumber: 1,
    type: PlanWeekType.TRAINING,
    note: null,
    startDate: "2026-10-19",
    endDate: "2026-10-25",
    sessions: [],
  };
  const billing = {
    amountCents: 5000,
    dueDate: "2026-11-05",
    note: null,
    documentFileName: null,
  };
  const publishButton = (getByText: (text: string) => HTMLElement) =>
    getByText("plan.builder.publish").closest("button") as HTMLButtonElement;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne diffuse pas chez l'ancien destinataire quand le nouveau n'est pas enregistré", async () => {
    const { getByRole, getByText, getByTitle, user } = await mount({ weeks: [week] }, billing);

    await user.selectOptions(getByRole("combobox"), "ath_tom");
    await user.click(publishButton(getByText));

    expect(publishPlan).not.toHaveBeenCalled();
    expect(getByTitle("plan.builder.headerUnsaved")).toContainElement(publishButton(getByText));
  });

  it("rouvre la diffusion quand la saisie revient à ce qui est enregistré", async () => {
    const { getByRole, getByText, user } = await mount({ weeks: [week] }, billing);

    await user.selectOptions(getByRole("combobox"), "ath_tom");
    await user.selectOptions(getByRole("combobox"), "ath_lea");
    await user.click(publishButton(getByText));

    expect(publishPlan).toHaveBeenCalledWith("pln_1");
  });

  it("ne diffuse pas une facture dont le montant changé n'est pas enregistré", async () => {
    const { container, getByText, getByTitle, user } = await mount({ weeks: [week] }, billing);
    const amount = container.querySelector("#amount") as HTMLInputElement;

    await user.clear(amount);
    await user.type(amount, "80");
    await user.click(publishButton(getByText));

    expect(publishPlan).not.toHaveBeenCalled();
    expect(getByTitle("plan.builder.billingUnsaved")).toBeTruthy();
  });

  /**
   * Les champs grisés d'un cycle diffusé montraient encore « Tom » sous un titre qui disait Léa.
   * La diffusion peut partir d'un autre onglet, ou d'une saisie faite pendant qu'elle était en vol :
   * le verrou ne suffit pas, le formulaire doit repartir de l'enregistré. Le nouvel état arrive au
   * rendu suivant — ici, provoqué par l'ouverture d'un jour.
   */
  it("réaligne l'en-tête sur le cycle enregistré une fois celui-ci diffusé", async () => {
    const { getAllByRole, getByRole, user } = await mount({ weeks: [week] }, billing);
    await user.selectOptions(getByRole("combobox"), "ath_tom");

    vi.mocked(usePlan).mockReturnValue({
      data: plan({ weeks: [week], status: PlanStatus.PUBLISHED }),
      isPending: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof usePlan>);
    await user.click(getAllByRole("button", { name: "plan.week.addSession" })[0] as HTMLElement);

    // Le panneau de séance ouvert porte ses propres listes : le sélecteur se désigne par son nom.
    const picker = getByRole("combobox", { name: /plan\.header\.athlete/ }) as HTMLSelectElement;
    expect(picker.value).toBe("ath_lea");
  });
});

describe("PlanBuilderScreen — quitter une saisie non enregistrée (#327)", () => {
  const BACK = "plan.builder.back";
  const STAY = "common.leave.stay";
  const LEAVE = "common.leave.leave";
  const billing = {
    amountCents: 5000,
    dueDate: "2026-11-05",
    note: null,
    documentFileName: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("demande avant de quitter un en-tête modifié, et « Rester » le garde", async () => {
    const { getByRole, getByText, findByRole, queryByRole, router, user } = await mount(
      {},
      billing,
    );
    await user.selectOptions(getByRole("combobox"), "ath_tom");

    await user.click(getByText(BACK));
    await user.click(await findByRole("button", { name: STAY }));

    await waitFor(() => expect(queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/plans/pln_1");
    expect((getByRole("combobox") as HTMLSelectElement).value).toBe("ath_tom");
  });

  it("quitte une facturation modifiée quand le coach confirme", async () => {
    const { container, getByText, findByRole, router, user } = await mount({}, billing);
    const amount = container.querySelector("#amount") as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, "80");

    await user.click(getByText(BACK));
    await user.click(await findByRole("button", { name: LEAVE }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/plans"));
  });

  it("laisse quitter sans friction un cycle sans saisie en cours", async () => {
    const { getByText, queryByRole, router, user } = await mount({}, billing);

    await user.click(getByText(BACK));

    await waitFor(() => expect(router.state.location.pathname).toBe("/plans"));
    expect(queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Le cycle supprimé emporte sa saisie : demander s'il faut la perdre serait un contresens.
  it("part sans demander une fois le cycle supprimé", async () => {
    deletePlan.mockImplementation((_id: string, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    const { getByRole, getByText, queryByRole, router, user } = await mount({}, billing);
    await user.selectOptions(getByRole("combobox"), "ath_tom");

    await user.click(getByText("plan.builder.delete"));
    await user.click(getByText("common.confirmDelete"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/plans"));
    expect(queryByRole("dialog")).not.toBeInTheDocument();
  });
});
