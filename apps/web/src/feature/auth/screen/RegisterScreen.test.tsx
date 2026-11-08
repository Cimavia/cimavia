import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { RegisterScreen } from "./RegisterScreen";

const { useSessionMock, signUpMock, sendVerificationEmailMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signUpMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(),
}));

// Better Auth est coupé : il porte le réseau et les cookies, deux choses que cet écran délègue.
// Ce qui est vérifié ici est ce qu'il LUI demande, et ce qu'il fait de sa réponse.
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => useSessionMock(),
    signUp: { email: signUpMock },
    sendVerificationEmail: sendVerificationEmailMock,
  },
}));

const NAME = "auth.register.name";
const COMPANY_NAME = "auth.register.companyName";
const EMAIL = "common.email";
const PASSWORD = "common.password";
const SUBMIT = "auth.register.submit";
const COACH = "auth.register.capabilityCoach";
const ATHLETE = "auth.register.capabilityAthlete";
const TRAINING = "auth.register.type.training";
const COMPANY = "auth.register.type.company";

function setup() {
  return renderInRoute(<RegisterScreen />, { path: "/register", links: ["/", "/login"] });
}

type View = Awaited<ReturnType<typeof setup>>;

/** Choisit la carte « Coach et/ou athlète » : le reste du formulaire n'existe qu'après. */
async function chooseTraining(view: View) {
  await view.user.click(view.getByRole("radio", { name: TRAINING }));
}

/** Remplit l'identité et soumet — quand le sujet est ce qui SUIT une inscription réussie. */
async function submitRegistration(view: View) {
  await chooseTraining(view);
  await fillIdentity(view);
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
}

/** Remplit l'identité, qui n'est jamais le sujet des assertions ci-dessous. */
async function fillIdentity(view: View, nameLabel = NAME) {
  await view.user.type(view.getByLabelText(nameLabel), "Kylian");
  await view.user.type(view.getByLabelText(EMAIL), "kylian@example.test");
  await view.user.type(view.getByLabelText(PASSWORD), "motdepasse1");
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  signUpMock.mockResolvedValue({ error: null });
});

describe("RegisterScreen — le type de compte (#600)", () => {
  /**
   * Le type engage le compte pour de bon — une entreprise ne deviendra jamais coach —, il ne se
   * présélectionne donc pas, et rien ne se saisit avant lui : c'est lui qui nomme le champ « nom ».
   */
  it("ne montre que le choix du type tant qu'aucun n'est choisi", async () => {
    const view = await setup();

    expect(view.getByRole("radio", { name: TRAINING })).not.toBeChecked();
    expect(view.getByRole("radio", { name: COMPANY })).not.toBeChecked();
    // L'explication est lue comme description, pas fondue dans le nom de la carte.
    expect(view.getByRole("radio", { name: COMPANY })).toHaveAccessibleDescription(
      "auth.register.type.companyHint",
    );
    expect(view.queryByLabelText(EMAIL)).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: SUBMIT })).not.toBeInTheDocument();
  });

  it("inscrit une entreprise seule, sous le nom de l'entreprise", async () => {
    const view = await setup();
    await view.user.click(view.getByRole("radio", { name: COMPANY }));

    // Pas de cases sous « Entreprise » : elle ne coache ni ne s'entraîne.
    expect(view.queryByLabelText(COACH)).not.toBeInTheDocument();
    await fillIdentity(view, COMPANY_NAME);
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: "kylian@example.test",
        password: "motdepasse1",
        name: "Kylian",
        isCoach: false,
        isAthlete: false,
        isCompany: true,
      }),
    );
  });

  it("garde l'e-mail et le mot de passe d'une carte à l'autre", async () => {
    const view = await setup();
    await chooseTraining(view);
    await fillIdentity(view);

    await view.user.click(view.getByRole("radio", { name: COMPANY }));

    expect(view.getByLabelText(COMPANY_NAME)).toHaveValue("Kylian");
    expect(view.getByLabelText(EMAIL)).toHaveValue("kylian@example.test");
    expect(view.getByLabelText(PASSWORD)).toHaveValue("motdepasse1");
  });
});

describe("RegisterScreen", () => {
  it("part avec la capacité athlète cochée", async () => {
    const view = await setup();
    await chooseTraining(view);

    // Le cas le plus courant est préparé : un athlète invité par son coach n'a rien à cocher.
    expect(view.getByLabelText(ATHLETE)).toBeChecked();
    expect(view.getByLabelText(COACH)).not.toBeChecked();
  });

  it("laisse cumuler les deux capacités", async () => {
    const view = await setup();
    await chooseTraining(view);
    await fillIdentity(view);

    await view.user.click(view.getByLabelText(COACH));
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    // Elles sont CUMULABLES (#7) : un coach qui se coache lui-même coche les deux, et `role`
    // n'est plus envoyé — l'API le déduit.
    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: "kylian@example.test",
        password: "motdepasse1",
        name: "Kylian",
        isCoach: true,
        isAthlete: true,
        isCompany: false,
      }),
    );
  });

  it("refuse une inscription sans aucune capacité, sans appeler l'API", async () => {
    const view = await setup();
    await chooseTraining(view);
    await fillIdentity(view);

    await view.user.click(view.getByLabelText(ATHLETE));
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    // Garde côté client EN PLUS de celle de l'API : un compte sans capacité se retrouverait
    // devant une application vide, et l'apprendre après un aller-retour serait pire.
    expect(await view.findByText("auth.errors.noCapability")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();

    // Le message s'efface dès qu'une case est cochée, sans attendre un nouvel envoi.
    await view.user.click(view.getByLabelText(COACH));
    expect(view.queryByText("auth.errors.noCapability")).not.toBeInTheDocument();
  });

  /**
   * L'inscription n'ouvre plus de session (#270) : l'écran reste, et dit qu'un e-mail est à ouvrir.
   * Sans ce changement d'état, l'inscription réussie laisserait l'utilisateur devant le formulaire
   * qu'il vient de soumettre — indiscernable d'un échec silencieux.
   */
  it("annonce l'e-mail à ouvrir une fois l'inscription envoyée, sans quitter la page", async () => {
    const view = await setup();

    await submitRegistration(view);

    expect(await view.findByText("auth.verificationSent.title")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "auth.verificationSent.resend" })).toBeInTheDocument();
    expect(view.queryByRole("button", { name: SUBMIT })).not.toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/register");
  });

  describe("ce que dit l'échec", () => {
    /**
     * Le message n'est pas cosmétique. « Une erreur est survenue, réessaie » ferait recommencer
     * une saisie juste : sur un environnement fermé (403, #263) aucune tentative ne passera. Une
     * adresse déjà prise, elle, ne se dit plus (#270) : l'API répond comme à une adresse neuve, et
     * c'est son propriétaire qu'elle prévient.
     */
    it.each([
      [403, "auth.errors.signupClosed"],
      [400, "auth.errors.generic"],
    ])("traduit le refus %s en %s", async (status, message) => {
      signUpMock.mockResolvedValue({ error: { status } });
      const view = await setup();

      await submitRegistration(view);

      expect(await view.findByText(message)).toBeInTheDocument();
    });

    it("dit quelque chose même quand l'appel casse", async () => {
      signUpMock.mockRejectedValue(new Error("réseau coupé"));
      const view = await setup();

      await submitRegistration(view);

      // Une panne réseau ne remonte pas d'`error.status` : sans ce `catch`, l'écran resterait
      // muet et l'utilisateur recliquerait indéfiniment.
      expect(await view.findByText("auth.errors.generic")).toBeInTheDocument();
    });
  });

  it("renvoie à l'accueil qui est déjà connecté", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const { router, queryByRole } = await setup();

    // La REDIRECTION est affirmée, pas seulement l'absence du formulaire : un DOM vide pour
    // n'importe quelle autre raison ferait passer une assertion d'absence sans rien vérifier.
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(queryByRole("radio", { name: TRAINING })).not.toBeInTheDocument();
  });

  it("montre le formulaire tant que la session n'est pas tranchée", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });
    const { getByRole } = await setup();

    // Rediriger pendant le chargement enverrait un visiteur non connecté vers l'accueil, d'où il
    // reviendrait aussitôt : la redirection attend une réponse, pas une absence de réponse.
    expect(getByRole("radio", { name: TRAINING })).toBeInTheDocument();
  });
});

describe("RegisterScreen — l'information à la collecte (#778)", () => {
  // `cimode` rend la phrase sous sa clé, sans ses liens : ceux-ci sont éprouvés avec le vrai
  // catalogue par `LegalLinks.test.tsx`. Ici, seule la place de la mention compte.
  it("pose la mention à côté du bouton, et pas avant", async () => {
    const view = await setup();
    expect(view.queryByText("auth.register.consent")).not.toBeInTheDocument();

    await chooseTraining(view);

    expect(view.getByText("auth.register.consent")).toBeInTheDocument();
  });

  it("garde les documents légaux joignables avant tout choix", async () => {
    const view = await setup();
    expect(view.getByRole("link", { name: "legal.privacy" })).toHaveAttribute(
      "href",
      "/legal/fr/privacy",
    );
  });
});
