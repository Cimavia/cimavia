import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodSafeParse } from "./zod.util";

// L'espace fine insécable que pose `Intl.NumberFormat("fr-FR")` entre les milliers.
const THIN = " ";

function refusal(schema: z.ZodType, data: unknown): { path: string; message: string }[] {
  try {
    zodSafeParse(schema, data);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      message: { path: string; message: string }[];
    };
    return body.message;
  }
  throw new Error("zodSafeParse aurait dû refuser");
}

function message(schema: z.ZodType, data: unknown): string | undefined {
  return refusal(schema, data)[0]?.message;
}

describe("zodSafeParse", () => {
  it("rend la donnée validée", () => {
    expect(zodSafeParse(z.object({ title: z.string() }), { title: "Bloc" })).toEqual({
      title: "Bloc",
    });
  });

  it("refuse en 400 avec le chemin du champ fautif, ou (root) à la racine", () => {
    expect(refusal(z.object({ plan: z.object({ title: z.string() }) }), { plan: {} })).toEqual([
      { path: "plan.title", message: "Ce champ est requis." },
    ]);
    expect(refusal(z.string(), 3)).toEqual([{ path: "(root)", message: "Valeur invalide." }]);
  });
});

describe("zodSafeParse — un refus sans message écrit sort en français (#319)", () => {
  it("dit la borne d'un texte trop long, jamais le texte anglais de Zod", () => {
    expect(message(z.string().max(200), "x".repeat(201))).toBe("Ce texte dépasse 200 caractères.");
    expect(message(z.string().max(5000), "x".repeat(5001))).toBe(
      `Ce texte dépasse 5${THIN}000 caractères.`,
    );
    expect(message(z.string().max(1), "xy")).toBe("Ce texte dépasse 1 caractère.");
  });

  it("dit d'un texte vide refusé par min(1) qu'il est requis, pas qu'il est trop court", () => {
    expect(message(z.string().min(1), "")).toBe("Ce champ est requis.");
    expect(message(z.string().min(2), "x")).toBe("Ce texte doit faire au moins 2 caractères.");
  });

  it("dit la borne d'une liste, singulier compris", () => {
    expect(message(z.array(z.string()).max(3), ["a", "b", "c", "d"])).toBe(
      "Cette liste dépasse 3 éléments.",
    );
    expect(message(z.array(z.string()).min(1), [])).toBe(
      "Cette liste doit compter au moins 1 élément.",
    );
    expect(message(z.set(z.string()).max(1), new Set(["a", "b"]))).toBe(
      "Cette liste dépasse 1 élément.",
    );
    expect(message(z.array(z.string()).length(2), ["a"])).toBe(
      "Cette liste doit compter au moins 2 éléments.",
    );
  });

  it("dit la borne d'un nombre, entier ou non, inclusive ou non — seul un nombre a lt et gt", () => {
    expect(message(z.number().max(10), 11)).toBe("Cette valeur ne peut pas dépasser 10.");
    expect(message(z.number().int().lt(10), 10)).toBe("Cette valeur doit rester sous 10.");
    expect(message(z.number().min(0), -5)).toBe("Cette valeur doit valoir au moins 0.");
    expect(message(z.number().positive(), 0)).toBe("Cette valeur doit dépasser 0.");
    expect(message(z.bigint().max(5n), 6n)).toBe("Cette valeur ne peut pas dépasser 5.");
  });

  it("dit qu'un champ absent est requis, et qu'un type faux est invalide", () => {
    expect(message(z.object({ title: z.string() }), {})).toBe("Ce champ est requis.");
    expect(message(z.object({ title: z.string() }), { title: 42 })).toBe("Valeur invalide.");
  });

  it("nomme une adresse e-mail invalide, et se replie sur « Valeur invalide. » ailleurs", () => {
    expect(message(z.email(), "pas-une-adresse")).toBe("Cette adresse e-mail n'est pas valide.");
    expect(message(z.uuid(), "pas-un-uuid")).toBe("Valeur invalide.");
    expect(message(z.enum(["A", "B"]), "C")).toBe("Valeur invalide.");
    expect(message(z.date().max(new Date(0)), new Date(1))).toBe("Valeur invalide.");
    expect(message(z.object({}).strict(), { inconnu: 1 })).toBe("Valeur invalide.");
  });

  it("laisse intact un message écrit par le schéma — refine comme regex", () => {
    expect(
      message(
        z.string().refine((value) => value === "lundi", { message: "Doit être un lundi" }),
        "mardi",
      ),
    ).toBe("Doit être un lundi");
    expect(message(z.string().regex(/^h/, { message: "Lien en http" }), "ftp")).toBe(
      "Lien en http",
    );
    expect(message(z.string().max(2, { message: "Titre trop long" }), "abc")).toBe(
      "Titre trop long",
    );
  });
});
