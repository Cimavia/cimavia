import { describe, expect, it } from "vitest";
import { draftAfterSend } from "./message-draft.util";

describe("draftAfterSend", () => {
  it("vide le champ quand il porte encore ce qui est parti", () => {
    expect(draftAfterSend("Bien joué", "Bien joué")).toBe("");
  });

  // Le texte part sans ses blancs : ceux restés dans le champ ne le distinguent pas de l'envoi.
  it("ignore les blancs autour de ce qui est parti", () => {
    expect(draftAfterSend("  Bien joué \n", "Bien joué")).toBe("");
  });

  it("garde ce qui a été écrit après, pendant l'envoi", () => {
    expect(draftAfterSend("Bien joué\nEt demain repos", "Bien joué")).toBe("Et demain repos");
  });

  it("laisse intacte une réécriture de ce qui est parti", () => {
    expect(draftAfterSend("Bien joué !", "Bien jouée")).toBe("Bien joué !");
  });

  it("laisse intact un champ vidé pendant l'envoi", () => {
    expect(draftAfterSend("", "Bien joué")).toBe("");
  });
});
