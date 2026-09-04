import { type PlanDto, PlanStatus } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { usePlanBilling } from "@/feature/invoice/hook/useInvoices";
import { usePlan, usePlanMutations } from "@/feature/plan/hook/usePlan";
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
vi.mock("@/feature/plan/hook/usePlans", () => ({
  useDeletePlan: () => ({ mutate: vi.fn(), isPending: false }),
  usePublishPlan: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [{ athleteId: "ath_lea", athleteName: "Léa Moreau", isSelf: false }],
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

const mount = async (over: Partial<PlanDto>, billing: unknown = null) => {
  vi.mocked(usePlan).mockReturnValue({
    data: plan(over),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof usePlan>);
  vi.mocked(usePlanMutations).mockReturnValue({
    addWeek: { mutate: vi.fn() },
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
   * L'API refuse la lecture des termes sur un cycle qu'on ne peut pas facturer — sans
   * destinataire (#144) comme en auto-coaching (#14). On ne pose pas la question.
   */
  it("ne demande pas les termes d'un cycle sans destinataire", async () => {
    await mount({ athleteId: null, athleteName: null, athleteEmail: null });

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", false);
  });

  it("ne demande pas les termes d'un cycle écrit pour soi", async () => {
    await mount({ athleteId: "coach_1", athleteName: "Moi" });

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", false);
  });

  it("demande les termes d'un cycle adressé à un athlète", async () => {
    await mount({});

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", true);
  });
});
