import {
  PLAN_DESCRIPTION_MAX_LENGTH,
  PLAN_TITLE_MAX_LENGTH,
  type PlanDto,
  PlanStatus,
  type UpdatePlanInput,
} from "@cmv/shared";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanHeaderForm } from "@/feature/plan/component/PlanHeaderForm";
import type { SaveBeforeLeaving } from "@/shared/hook/useLeaveGuard";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [
      { athleteId: "ath_lea", athleteName: "Léa Moreau", isSelf: false },
      { athleteId: "ath_noah", athleteName: "Noah Fontaine", isSelf: false },
    ],
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));

// 2026-10-19 est un lundi : un cycle démarre un lundi (planStartDateSchema).
const MONDAY = "2026-10-19";
const NEXT_MONDAY = "2026-10-26";
const PREVIOUS_MONDAY = "2026-10-12";
// Le mercredi de la semaine suivante — ce qu'un coach choisit sans y penser.
const WEDNESDAY = "2026-10-28";
// Un jeudi de la semaine DÉJÀ enregistrée : il se recale sur le début actuel.
const SAME_WEEK_THURSDAY = "2026-10-22";

const plan = (over: Partial<PlanDto> = {}): PlanDto =>
  ({
    id: "pln_1",
    coachId: "coach_1",
    athleteId: "ath_lea",
    athleteName: "Léa Moreau",
    athleteEmail: "lea@example.test",
    title: "Cycle bloc",
    description: null,
    startDate: MONDAY,
    status: PlanStatus.DRAFT,
    publishedAt: null,
    weekCount: 4,
    sessionCount: 12,
    weeks: [],
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...over,
  }) as PlanDto;

// La version du cycle monté : celle que l'enregistrement cite tant que rien d'autre n'a été écrit.
const VERSION = "2026-10-01T10:00:00Z";

const onSave = vi.fn<(input: UpdatePlanInput) => Promise<PlanDto>>();
const onUnsavedChange = vi.fn<(save: SaveBeforeLeaving | null) => void>();
const onReload = vi.fn();

/** Les réponses des enregistrements partis, dans l'ordre : le test décide quand elles arrivent. */
let replies: Array<{ resolve: (saved: PlanDto) => void; reject: (error: unknown) => void }> = [];

/** Ce que reçoit `onSave` : les champs changés, et la version lue. */
const sent = (fields: object, version = VERSION) =>
  [{ ...fields, expectedUpdatedAt: version }] as const;

/** Le cycle enregistré revient : le formulaire repart de lui, ou garde ce qui a été saisi depuis. */
const reply = (index: number, saved: PlanDto) =>
  act(async () => {
    replies[index]?.resolve(saved);
  });

/** L'enregistrement que le formulaire remonte à l'écran, `null` sans saisie en attente. */
const reportedSave = () => onUnsavedChange.mock.lastCall?.[0] ?? null;

type FormProps = Partial<Parameters<typeof PlanHeaderForm>[0]>;

const form = (current: PlanDto, over: FormProps = {}) => (
  <PlanHeaderForm
    plan={current}
    hasInvoiceDocument={false}
    readOnly={false}
    canReassign
    isSaving={false}
    onSave={onSave}
    isStale={false}
    isReloading={false}
    onReload={onReload}
    onUnsavedChange={onUnsavedChange}
    {...over}
  />
);

beforeEach(() => {
  vi.clearAllMocks();
  replies = [];
  onSave.mockImplementation(
    () => new Promise<PlanDto>((resolve, reject) => replies.push({ resolve, reject })),
  );
});

const mount = (over: Partial<PlanDto> = {}, hasInvoiceDocument = false) =>
  renderWithProviders(form(plan(over), { hasInvoiceDocument }));

/**
 * Le cœur de l'issue : ces quatre champs ne se saisissaient qu'une fois, dans un panneau qui ne
 * revenait jamais (#207). Ce qui s'éprouve ici est donc CE QUE LE FORMULAIRE ENVOIE — pas le
 * transport, qui a ses propres tests.
 */
describe("PlanHeaderForm — ce qui part à l'enregistrement", () => {
  it("n'envoie que le champ modifié, et laisse les trois autres tranquilles", async () => {
    const { container, getByText, user } = mount();

    const title = container.querySelector("#planTitle") as HTMLInputElement;
    await user.clear(title);
    await user.type(title, "Bloc force max");
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith(...sent({ title: "Bloc force max" }));
  });

  /**
   * Renvoyer les quatre champs à chaque enregistrement ferait traverser `shiftSessions` à une date
   * immobile et rejouerait la propagation du destinataire sur six tables sans qu'il ait bougé.
   */
  it("n'envoie pas le destinataire quand il n'a pas changé", async () => {
    const { container, getByText, user } = mount();

    const description = container.querySelector("#planDescription") as HTMLTextAreaElement;
    await user.type(description, "Montée en charge");
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith(...sent({ description: "Montée en charge" }));
  });

  // Le choix neutre vaut « pas encore décidé », et part en `null` — jamais en chaîne vide, que
  // l'API prendrait pour un identifiant d'athlète (#144).
  it("transmet null, et non une chaîne vide, quand on détache le cycle", async () => {
    const { getByRole, getByText, user } = mount();

    await user.selectOptions(getByRole("combobox"), "");
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith(...sent({ athleteId: null }));
  });

  // Une description vidée vaut l'absence, pas une chaîne vide que le rendu afficherait en
  // paragraphe blanc (règle 5).
  it("transmet null quand la description est effacée", async () => {
    const { container, getByText, user } = mount({ description: "À réécrire" });

    await user.clear(container.querySelector("#planDescription") as HTMLTextAreaElement);
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith(...sent({ description: null }));
  });

  it("borne le titre et la description à ce que l'API accepte (#319)", () => {
    const { container } = mount();

    expect(container.querySelector("#planTitle")).toHaveAttribute(
      "maxLength",
      String(PLAN_TITLE_MAX_LENGTH),
    );
    expect(container.querySelector("#planDescription")).toHaveAttribute(
      "maxLength",
      String(PLAN_DESCRIPTION_MAX_LENGTH),
    );
  });

  it("ferme l'enregistrement tant que rien n'a changé", () => {
    const { getByText } = mount();

    expect((getByText("plan.header.submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("dit que l'enregistrement part, et ne se relance pas pendant ce temps", () => {
    const { getByRole } = renderWithProviders(form(plan(), { isSaving: true }));

    expect(getByRole("button", { name: "plan.header.submitting" })).toBeDisabled();
  });

  // Le titre reste la seule chose qu'un cycle ne peut pas découvrir plus tard.
  it("ferme l'enregistrement quand le titre est vidé", async () => {
    const { container, getByText, user } = mount();

    await user.clear(container.querySelector("#planTitle") as HTMLInputElement);

    expect((getByText("plan.header.submit") as HTMLButtonElement).disabled).toBe(true);
  });
});

/**
 * Un cycle démarre un lundi (contrainte du schéma partagé). Plutôt que de refuser la saisie, le
 * champ est RÉÉCRIT au lundi de la semaine choisie dès qu'on le quitte — une valeur qui change
 * toute seule sans explication étant plus déroutante qu'un refus, un toast le dit.
 */
describe("PlanHeaderForm — le début du cycle", () => {
  it("recale la date de début sur le lundi de la semaine choisie", async () => {
    const { container, user } = mount();
    const start = container.querySelector("#startDate") as HTMLInputElement;

    await user.clear(start);
    await user.type(start, WEDNESDAY);
    await user.tab();

    expect(start.value).toBe(NEXT_MONDAY);
  });

  // Rien n'a bougé tout seul : rien à expliquer.
  it("laisse un lundi tel quel, sans rien annoncer", async () => {
    const { container, queryByText, user } = mount();
    const start = container.querySelector("#startDate") as HTMLInputElement;

    await user.clear(start);
    await user.type(start, NEXT_MONDAY);
    await user.tab();

    expect(start.value).toBe(NEXT_MONDAY);
    expect(queryByText("plan.header.startDateSnapped")).toBeNull();
  });

  /**
   * Déplacer la date rejoue TOUTES les séances. Le dire avant l'enregistrement, sinon un report
   * d'un mois se lit comme un simple champ de formulaire.
   */
  it("annonce le décalage des séances avant qu'on enregistre", async () => {
    const { container, queryByText, user } = mount();
    expect(queryByText("plan.header.startDateShiftLater")).toBeNull();

    const start = container.querySelector("#startDate") as HTMLInputElement;
    await user.clear(start);
    await user.type(start, NEXT_MONDAY);

    expect(queryByText("plan.header.startDateShiftLater")).toBeTruthy();
  });

  // Avancer et repousser ne se disent pas de la même façon : « de 7 jours » sans le sens laisse
  // le coach deviner dans quelle direction son cycle vient de partir.
  it("distingue un cycle avancé d'un cycle repoussé", async () => {
    const { container, queryByText, user } = mount();

    const start = container.querySelector("#startDate") as HTMLInputElement;
    await user.clear(start);
    await user.type(start, PREVIOUS_MONDAY);

    expect(queryByText("plan.header.startDateShiftEarlier")).toBeTruthy();
    expect(queryByText("plan.header.startDateShiftLater")).toBeNull();
  });

  // Rien à décaler, rien à annoncer : un cycle vide se déplace sans conséquence.
  it("n'annonce aucun décalage sur un cycle sans séance", async () => {
    const { container, queryByText, user } = mount({ sessionCount: 0 });

    const start = container.querySelector("#startDate") as HTMLInputElement;
    await user.clear(start);
    await user.type(start, NEXT_MONDAY);

    expect(queryByText("plan.header.startDateShiftLater")).toBeNull();
  });
});

/**
 * Le bouton juge la date que le formulaire ENREGISTRERA — le lundi de la semaine saisie — et non la
 * saisie brute (#545). Choisir un jour au calendrier ne fait pas perdre le focus : le champ garde
 * le jour choisi jusqu'au blur, et un bouton grisé à ce moment-là disait « impossible » pour une
 * saisie que le clic enregistrait pourtant.
 */
describe("PlanHeaderForm — un début choisi hors lundi, avant le recalage", () => {
  const typeStart = async (value: string, over: Partial<PlanDto> = {}) => {
    const rendered = mount(over);
    const start = rendered.container.querySelector("#startDate") as HTMLInputElement;
    await rendered.user.clear(start);
    await rendered.user.type(start, value);
    const submit = rendered.getByRole("button", { name: "plan.header.submit" });
    return { ...rendered, start, submit };
  };

  it("ouvre l'enregistrement sans attendre que le champ soit quitté", async () => {
    const { start, submit } = await typeStart(WEDNESDAY);

    expect(start.value).toBe(WEDNESDAY);
    expect(submit).toBeEnabled();
  });

  it("enregistre le lundi de la semaine choisie", async () => {
    const { submit, user } = await typeStart(WEDNESDAY);

    await user.click(submit);

    expect(onSave).toHaveBeenCalledWith(...sent({ startDate: NEXT_MONDAY }));
  });

  /**
   * Entrée envoie sans blur : sans recalage à l'envoi, le mercredi brut partirait et l'API le
   * refuserait (`planStartDateSchema`). Le champ et le toast disent ce qui est parti.
   */
  it("recale aussi, et le dit, quand on envoie à la touche Entrée", async () => {
    const { start, getByText, user } = await typeStart(WEDNESDAY);

    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith(...sent({ startDate: NEXT_MONDAY }));
    expect(start.value).toBe(NEXT_MONDAY);
    expect(getByText("plan.header.startDateSnapped")).toBeTruthy();
  });

  // Un jour de la semaine déjà enregistrée retombe sur le même lundi : rien ne change, rien ne se
  // décale — là où la saisie brute annonçait un déplacement de trois jours qui n'aurait pas lieu.
  it("ne voit aucun changement dans un jour de la semaine déjà enregistrée", async () => {
    const { queryByText, submit } = await typeStart(SAME_WEEK_THURSDAY);

    expect(submit).toBeDisabled();
    expect(queryByText("plan.header.startDateShiftLater")).toBeNull();
    expect(queryByText("plan.header.startDateShiftEarlier")).toBeNull();
  });

  it("annonce le décalage vers le lundi de la semaine choisie", async () => {
    const { queryByText } = await typeStart(WEDNESDAY);

    expect(queryByText("plan.header.startDateShiftLater")).toBeTruthy();
  });

  // Un champ vidé n'a pas de lundi : rien ne part plutôt qu'une date inventée.
  it("ferme l'enregistrement quand la date est effacée", async () => {
    const { container, getByRole, user } = mount();

    await user.clear(container.querySelector("#startDate") as HTMLInputElement);

    expect(getByRole("button", { name: "plan.header.submit" })).toBeDisabled();
  });
});

/**
 * Fermé et EXPLIQUÉ, jamais masqué : faire disparaître les champs laisserait croire qu'un cycle ne
 * se nomme pas, alors qu'il ne se renomme plus. Même grammaire que « Coller ici », « Supprimer le
 * cycle » et le sélecteur de destinataire.
 */
describe("PlanHeaderForm — un cycle diffusé", () => {
  it("ferme les quatre champs sans les masquer, en disant pourquoi", () => {
    const { container, getByRole, getByText } = mount({ status: PlanStatus.PUBLISHED });

    expect((container.querySelector("#planTitle") as HTMLInputElement).disabled).toBe(true);
    expect((container.querySelector("#startDate") as HTMLInputElement).disabled).toBe(true);
    expect((container.querySelector("#planDescription") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(getByText("plan.header.lockedPublished")).toBeTruthy();
  });

  // Le bouton, lui, disparaît : le garder désactivé proposerait un geste qu'aucun champ ne peut
  // plus alimenter.
  it("retire le bouton d'enregistrement", () => {
    const { queryByText } = mount({ status: PlanStatus.PUBLISHED });

    expect(queryByText("plan.header.submit")).toBeNull();
  });
});

/**
 * Le justificatif fige le destinataire (#472), et lui SEUL : titre, début et description restent
 * ouverts — le PDF nomme un athlète, pas un titre de cycle.
 */
describe("PlanHeaderForm — un justificatif joint", () => {
  it("ferme le sélecteur de destinataire et laisse les trois autres champs ouverts", () => {
    const { container, getByRole, getByText } = mount({}, true);

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(getByText("plan.header.athleteLockedDocument")).toBeTruthy();
    expect((container.querySelector("#planTitle") as HTMLInputElement).disabled).toBe(false);
    expect((container.querySelector("#startDate") as HTMLInputElement).disabled).toBe(false);
  });
});

/**
 * Ce que l'écran apprend de la saisie : « Diffuser » part avec le cycle ENREGISTRÉ, et se ferme
 * tant que le formulaire montre autre chose (#326).
 */
describe("PlanHeaderForm — une saisie non enregistrée", () => {
  it("se déclare propre tant que rien n'a bougé", () => {
    mount();

    expect(reportedSave()).toBeNull();
  });

  it("signale un destinataire changé, puis rendu à sa valeur enregistrée", async () => {
    const { getByRole, user } = mount();

    await user.selectOptions(getByRole("combobox"), "ath_noah");
    expect(reportedSave()).not.toBeNull();

    await user.selectOptions(getByRole("combobox"), "ath_lea");
    expect(reportedSave()).toBeNull();
  });

  // Rien ne partirait à l'enregistrement, mais l'écran ne montre plus la date que la diffusion
  // emporterait : c'est un écart, pas un formulaire propre.
  it("signale une date effacée, que l'enregistrement ignorerait", async () => {
    const { container, user } = mount();

    await user.clear(container.querySelector("#startDate") as HTMLInputElement);

    expect(reportedSave()).not.toBeNull();
  });
});

/**
 * L'enregistrement que l'écran déclenche sans le bouton — « Enregistrer » du dialogue de sortie
 * (#682) : il part, ou dit ce qui l'en empêche, et rend `false` pour retenir la sortie.
 */
describe("PlanHeaderForm — l'enregistrement demandé par l'écran (#682)", () => {
  const title = (container: HTMLElement) =>
    container.querySelector("#planTitle") as HTMLInputElement;

  it("envoie la saisie, et répond vrai une fois le cycle enregistré", async () => {
    const { container, user } = mount();
    await user.type(title(container), " bis");

    let saved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saved = reportedSave()?.() ?? saved;
    });
    await reply(0, plan({ title: "Cycle bloc bis", updatedAt: "2026-10-12T08:03:00.000Z" }));

    await expect(saved).resolves.toBe(true);
    expect(onSave).toHaveBeenCalledWith(...sent({ title: "Cycle bloc bis" }));
  });

  // L'échec est déjà dit à l'écran — bandeau de conflit ou toast : il ne reste qu'à retenir.
  it("répond faux quand l'enregistrement échoue", async () => {
    const { container, user } = mount();
    await user.type(title(container), " bis");

    let saved: Promise<boolean> = Promise.resolve(true);
    act(() => {
      saved = reportedSave()?.() ?? saved;
    });
    await act(async () => {
      replies[0]?.reject(new Error("409"));
    });

    await expect(saved).resolves.toBe(false);
  });

  it("n'envoie rien sans titre, et dit pourquoi", async () => {
    const { container, findByText, user } = mount();
    await user.clear(title(container));

    await act(async () => {
      await expect(reportedSave()?.()).resolves.toBe(false);
    });

    expect(await findByText("plan.header.titleRequired")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("n'envoie rien sur une date effacée, et dit pourquoi", async () => {
    const { container, findByText, user } = mount();
    await user.clear(container.querySelector("#startDate") as HTMLInputElement);

    await act(async () => {
      await expect(reportedSave()?.()).resolves.toBe(false);
    });

    expect(await findByText("plan.header.startDateRequired")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

/**
 * Deux Coachs d'une même entreprise retouchent le même cycle (#604) : l'enregistrement cite la
 * version sur laquelle la saisie a COMMENCÉ, jamais celle que le cache a reçue depuis.
 */
describe("PlanHeaderForm — la version que l'enregistrement cite (#604)", () => {
  const LATEST = "2026-10-12T08:03:00.000Z";
  const title = (container: HTMLElement) =>
    container.querySelector("#planTitle") as HTMLInputElement;

  it("suit le cycle, version comprise, tant que rien n'est saisi", async () => {
    const { container, getByText, rerender, user } = mount();

    rerender(form(plan({ title: "Renommé ailleurs", updatedAt: LATEST })));
    expect(title(container).value).toBe("Renommé ailleurs");

    await user.type(container.querySelector("#planDescription") as HTMLTextAreaElement, "Ajout");
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith(...sent({ description: "Ajout" }, LATEST));
  });

  // Citer la version du cache ferait passer la saisie par-dessus l'écriture de l'autre Coach.
  it("fige la saisie ET la version dès la première frappe", async () => {
    const { container, getByText, rerender, user } = mount();
    await user.clear(title(container));
    await user.type(title(container), "Ma saisie");

    rerender(form(plan({ title: "Renommé ailleurs", updatedAt: LATEST })));
    expect(title(container).value).toBe("Ma saisie");

    await user.click(getByText("plan.header.submit"));
    expect(onSave).toHaveBeenCalledWith(...sent({ title: "Ma saisie" }));
  });

  // Le formulaire paraît propre : figé, il opposerait à l'autre Coach des champs que personne n'a
  // touchés, et fermerait « Diffuser » sans raison visible.
  it("suit de nouveau le cycle quand la saisie revient à son point de départ", async () => {
    const { container, rerender, user } = mount();
    await user.type(title(container), "x");
    await user.type(title(container), "{Backspace}");

    rerender(form(plan({ title: "Renommé ailleurs", updatedAt: LATEST })));

    expect(title(container).value).toBe("Renommé ailleurs");
    expect(reportedSave()).toBeNull();
  });

  it("repart du cycle enregistré quand rien n'a été saisi pendant l'envoi", async () => {
    const { container, getByText, rerender, user } = mount();
    await user.clear(title(container));
    await user.type(title(container), "Enregistré");
    await user.click(getByText("plan.header.submit"));
    const saved = plan({ title: "Enregistré", updatedAt: LATEST });

    await reply(0, saved);
    rerender(form(saved));
    // Le formulaire suit de nouveau le cycle : une écriture d'ailleurs s'y voit.
    rerender(form(plan({ title: "Puis renommé ailleurs", updatedAt: "2026-10-12T09:00:00.000Z" })));

    expect(title(container).value).toBe("Puis renommé ailleurs");
  });

  // L'écriture qui vient de passer est la NÔTRE : la citer à nouveau n'est pas un conflit.
  it("garde une saisie faite pendant l'envoi, et la fait citer la version écrite", async () => {
    const { container, getByText, rerender, user } = mount();
    await user.clear(title(container));
    await user.type(title(container), "Premier");
    await user.click(getByText("plan.header.submit"));
    await user.type(title(container), " jet");

    const saved = plan({ title: "Premier", updatedAt: LATEST });
    await reply(0, saved);
    rerender(form(saved));
    expect(title(container).value).toBe("Premier jet");

    await user.click(getByText("plan.header.submit"));
    expect(onSave).toHaveBeenLastCalledWith(...sent({ title: "Premier jet" }, LATEST));
  });

  it("dit le conflit par le bandeau, et « Recharger » le confie à l'écran", async () => {
    const { getByRole, getByText, user } = renderWithProviders(form(plan(), { isStale: true }));

    expect(getByText("plan.header.stale")).toBeTruthy();
    await user.click(getByRole("button", { name: "common.staleReload" }));

    expect(onReload).toHaveBeenCalledOnce();
  });

  it("ne montre aucun bandeau sans conflit", () => {
    const { queryByText } = mount();

    expect(queryByText("plan.header.stale")).toBeNull();
  });
});

describe("PlanHeaderForm — le cycle d'un autre Coach (#607)", () => {
  it("en Lecture, l'en-tête se lit : champs figés, rien à enregistrer", () => {
    const { container, getByText, queryByRole } = renderWithProviders(
      form(plan(), { readOnly: true, canReassign: false }),
    );

    expect(getByText("plan.header.lockedReadOnly")).toBeTruthy();
    for (const field of ["#planTitle", "#startDate", "#planDescription", "#planAthleteId"]) {
      expect((container.querySelector(field) as HTMLInputElement).disabled).toBe(true);
    }
    expect(queryByRole("button", { name: "plan.header.submit" })).toBeNull();
  });

  it("en Écriture, il se modifie, son destinataire excepté", () => {
    const { container, getByRole } = renderWithProviders(form(plan(), { canReassign: false }));

    expect((container.querySelector("#planTitle") as HTMLInputElement).disabled).toBe(false);
    expect((container.querySelector("#planAthleteId") as HTMLSelectElement).disabled).toBe(true);
    expect(getByRole("button", { name: "plan.header.submit" })).toBeTruthy();
  });
});
