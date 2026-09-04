import { type PlanDto, PlanStatus } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanHeaderForm } from "@/feature/plan/component/PlanHeaderForm";
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

const onSave = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

const mount = (over: Partial<PlanDto> = {}) =>
  renderWithProviders(<PlanHeaderForm plan={plan(over)} isSaving={false} onSave={onSave} />);

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

    expect(onSave).toHaveBeenCalledWith({ title: "Bloc force max" });
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

    expect(onSave).toHaveBeenCalledWith({ description: "Montée en charge" });
  });

  // Le choix neutre vaut « pas encore décidé », et part en `null` — jamais en chaîne vide, que
  // l'API prendrait pour un identifiant d'athlète (#144).
  it("transmet null, et non une chaîne vide, quand on détache le cycle", async () => {
    const { getByRole, getByText, user } = mount();

    await user.selectOptions(getByRole("combobox"), "");
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith({ athleteId: null });
  });

  // Une description vidée vaut l'absence, pas une chaîne vide que le rendu afficherait en
  // paragraphe blanc (règle 5).
  it("transmet null quand la description est effacée", async () => {
    const { container, getByText, user } = mount({ description: "À réécrire" });

    await user.clear(container.querySelector("#planDescription") as HTMLTextAreaElement);
    await user.click(getByText("plan.header.submit"));

    expect(onSave).toHaveBeenCalledWith({ description: null });
  });

  it("ferme l'enregistrement tant que rien n'a changé", () => {
    const { getByText } = mount();

    expect((getByText("plan.header.submit") as HTMLButtonElement).disabled).toBe(true);
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
