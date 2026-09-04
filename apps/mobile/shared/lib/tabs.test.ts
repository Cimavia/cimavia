import { describe, expect, it } from "vitest";
import { landingTab, redirectForPath, TABS, visibleTabs } from "./tabs";

/**
 * Le signal de contreparties (#198). Les cas qui ne portent pas sur lui passent `WITH` : la barre
 * d'onglets d'un compte qui a bien quelqu'un en face est celle que tous ces tests décrivaient déjà.
 */
const WITH = { asCoach: true, asAthlete: true };
const ALONE = { asCoach: false, asAthlete: false };
const COACHES_SOMEONE = { asCoach: true, asAthlete: false };

const COACH = { isCoach: true, isAthlete: false };
const ATHLETE = { isCoach: false, isAthlete: true };
const BOTH = { isCoach: true, isAthlete: true };
const NEITHER = { isCoach: false, isAthlete: false };

describe("visibleTabs", () => {
  /**
   * Ce que ce filtre empêche n'est pas cosmétique : `/planning` et `/messages` appellent des
   * routes `@Roles([ATHLETE])`. Un onglet athlète laissé visible à un coach ne l'égare pas, il lui
   * donne un 403.
   */
  it("cache au coach les onglets réservés à l'athlète", () => {
    const names = visibleTabs(COACH, WITH).map((tab) => tab.name);
    expect(names).not.toContain("planning");
    expect(names).not.toContain("sessions");
  });

  it("cache à l'athlète le tableau de bord du coach", () => {
    expect(visibleTabs(ATHLETE, WITH).map((tab) => tab.name)).not.toContain("dashboard");
  });

  it("sert à tout le monde les onglets sans capacité déclarée", () => {
    const shared = TABS.filter((tab) => tab.capability == null).map((tab) => tab.name);
    for (const capabilities of [COACH, ATHLETE, BOTH]) {
      expect(visibleTabs(capabilities, WITH).map((tab) => tab.name)).toEqual(
        expect.arrayContaining(shared),
      );
    }
  });

  it("montre toute la table à un compte à double capacité", () => {
    expect(visibleTabs(BOTH, WITH)).toHaveLength(TABS.length);
  });

  // Fail closed : `capabilitiesOf` peut rendre un compte sans aucune capacité connue.
  it("ne montre que le commun à un compte sans capacité", () => {
    expect(visibleTabs(NEITHER, WITH).every((tab) => tab.capability == null)).toBe(true);
  });

  /**
   * Le cas de #198 : un compte qui se coache seul n'a personne à qui écrire. L'onglet restait, et
   * menait à une liste dont la seule ligne était lui-même.
   */
  it("retire la messagerie à un compte sans personne en face", () => {
    expect(visibleTabs(BOTH, ALONE).map((tab) => tab.name)).not.toContain("messages");
  });

  /**
   * Un SEUL côté suffit, et c'est la différence assumée avec le web : là-bas l'entrée est par
   * espace, ici l'onglet est unique et le sélecteur de l'écran mène à l'autre moitié. Le retirer
   * pour un coach qui n'a pas de coach lui prendrait la messagerie de ses athlètes.
   */
  it("garde la messagerie dès qu'il y a quelqu'un d'un côté", () => {
    expect(visibleTabs(BOTH, COACHES_SOMEONE).map((tab) => tab.name)).toContain("messages");
  });

  // La contrepartie ne conditionne QUE ce qui la demande, sinon un coach sans athlète perdrait
  // aussi son tableau de bord et ses factures.
  it("ne touche à aucun autre onglet", () => {
    const unconditional = visibleTabs(BOTH, WITH)
      .filter((tab) => tab.requiresCounterpart !== true)
      .map((tab) => tab.name);
    expect(visibleTabs(BOTH, ALONE).map((tab) => tab.name)).toEqual(unconditional);
  });

  it("garde l'ordre de la table, dont dépend l'atterrissage", () => {
    const order = TABS.map((tab) => tab.name);
    const shown = visibleTabs(BOTH, WITH).map((tab) => tab.name);
    expect(shown).toEqual(order.filter((name) => shown.includes(name)));
  });
});

describe("landingTab", () => {
  /**
   * Dérivé du PREMIER onglet visible et non codé en dur : c'est ce qui fait qu'ajouter un onglet
   * en tête déplace l'atterrissage sans qu'on y touche. Le test s'appuie donc sur la table plutôt
   * que d'écrire « /dashboard » — sinon il figerait ce que la dérivation existe pour libérer.
   */
  it.each([
    ["coach", COACH],
    ["athlète", ATHLETE],
    ["double capacité", BOTH],
  ])("envoie un %s sur son premier onglet visible", (_qui, capabilities) => {
    expect(landingTab(capabilities, WITH)).toBe(`/${visibleTabs(capabilities, WITH)[0]?.name}`);
  });

  /**
   * Un compte sans capacité connue n'est PAS échoué sans nulle part où aller : les onglets servis
   * aux deux (compte, notifications) restent visibles, et c'est là qu'il atterrit.
   *
   * Corollaire assumé : le `null` que `landingTab` sait rendre est aujourd'hui **inatteignable**,
   * puisque la table porte toujours des onglets sans capacité. C'est une garde pour le jour où ce
   * ne serait plus vrai — on la laisse, on ne prétend pas la couvrir.
   */
  it("fait atterrir un compte sans capacité sur le premier onglet commun", () => {
    expect(landingTab(NEITHER, WITH)).toBe(`/${visibleTabs(NEITHER, WITH)[0]?.name}`);
    expect(landingTab(NEITHER, WITH)).not.toBeNull();
  });
});

describe("redirectForPath", () => {
  /**
   * `href: null` retire l'onglet de la barre mais le navigateur monte quand même sa route
   * initiale : un coach atterrissait sur `/planning` sans onglet actif. Cette garde est ce qui
   * rattrape ça — et aussi les liens profonds, les notifications ouvertes et l'état restauré.
   */
  it("renvoie un coach posé sur un chemin athlète vers son propre atterrissage", () => {
    expect(redirectForPath("/planning", COACH, WITH)).toBe(landingTab(COACH, WITH));
  });

  it("couvre aussi les sous-chemins, pas seulement la racine de l'onglet", () => {
    expect(redirectForPath("/planning/semaine-2", COACH, WITH)).toBe(landingTab(COACH, WITH));
  });

  it("ne renvoie nulle part quand le chemin est ouvert à cette capacité", () => {
    expect(redirectForPath("/planning", ATHLETE, WITH)).toBeNull();
    expect(redirectForPath("/messages", COACH, WITH)).toBeNull();
  });

  /**
   * Un chemin hors table est l'affaire du routeur, pas de cette garde. Y répondre déplacerait
   * l'utilisateur sur des écrans (`/reset-password`, une page inconnue) qui n'ont rien demandé.
   */
  it("laisse passer un chemin qui ne correspond à aucun onglet", () => {
    expect(redirectForPath("/reset-password", COACH, WITH)).toBeNull();
    expect(redirectForPath("/", COACH, WITH)).toBeNull();
  });

  /**
   * La garde porte sur la CAPACITÉ, jamais sur la contrepartie. Rester sur une messagerie devenue
   * sans objet montre un état vide qui s'explique ; rediriger déplacerait l'écran sous les doigts
   * de quelqu'un dont le dernier athlète vient de partir.
   */
  it("ne renvoie pas un compte hors de la messagerie qu'il vient de vider", () => {
    expect(redirectForPath("/messages", BOTH, ALONE)).toBeNull();
    expect(redirectForPath("/messages/ath-1", BOTH, ALONE)).toBeNull();
  });

  // Le préfixe doit être un SEGMENT entier : « /sessions-archivees » n'est pas dans « /sessions ».
  it("ne confond pas un onglet avec un chemin qui commence pareil", () => {
    expect(redirectForPath("/sessionsarchivees", COACH, WITH)).toBeNull();
  });
});
