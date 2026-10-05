import { type InvoiceDto, MAX_INVOICE_DOCUMENT_SIZE_BYTES } from "@cmv/shared";
import { act, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanBillingSection } from "@/feature/invoice/component/PlanBillingSection";
import {
  useAttachInvoiceDocument,
  useRemoveInvoiceDocument,
  useSavePlanBilling,
} from "@/feature/invoice/hook/useInvoices";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useSavePlanBilling: vi.fn(),
  useAttachInvoiceDocument: vi.fn(),
  useRemoveInvoiceDocument: vi.fn(),
}));

const save = vi.fn();
const onDirtyChange = vi.fn();
// Des objets et non des valeurs figées : un test passe une mutation « en vol » en basculant
// `isPending`, remis à plat avant chaque test.
const saving = { mutate: save, isPending: false };
const attach = { mutate: vi.fn(), isPending: false };
const remove = { mutate: vi.fn(), isPending: false };
vi.mocked(useSavePlanBilling).mockReturnValue(
  saving as unknown as ReturnType<typeof useSavePlanBilling>,
);
vi.mocked(useAttachInvoiceDocument).mockReturnValue(
  attach as unknown as ReturnType<typeof useAttachInvoiceDocument>,
);
vi.mocked(useRemoveInvoiceDocument).mockReturnValue(
  remove as unknown as ReturnType<typeof useRemoveInvoiceDocument>,
);
// Remis à chaque test : les compteurs d'appel doivent repartir de zéro — un test qui enregistre
// ne doit pas décrire le suivant.
beforeEach(() => {
  vi.clearAllMocks();
  for (const mutation of [saving, attach, remove]) mutation.isPending = false;
});

// `billing` arrive en prop depuis le builder (#211) : la section ne lit plus rien elle-même. Par
// défaut « aucun terme saisi », l'état d'un cycle qu'on vient d'ouvrir.
const mount = (props: {
  isPublished?: boolean;
  hasAthlete?: boolean;
  billing?: InvoiceDto | null;
}) =>
  renderInRoute(
    <PlanBillingSection
      planId="pln_1"
      isPublished={false}
      hasAthlete={true}
      billing={null}
      onDirtyChange={onDirtyChange}
      {...props}
    />,
    { path: "/plans/$planId", params: { planId: "pln_1" }, links: ["/invoices"] },
  );

/**
 * jsdom n'exécute PAS l'algorithme de soumission d'un formulaire depuis un clic sur son bouton
 * `type="submit"` : l'événement `submit` doit être dispatché à la main, sinon le test observe un
 * clic qui ne déclenche rien et conclut à tort que le composant ne fait rien.
 */
function submit(container: HTMLElement): void {
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
}

describe("PlanBillingSection — le verrou de destinataire", () => {
  it("ouvre la saisie sur un brouillon adressé à quelqu'un", async () => {
    const { getByText } = await mount({});

    expect(getByText("invoice.billing.save")).toBeTruthy();
  });

  /**
   * Fermée, expliquée, jamais masquée : faire disparaître la section laisserait croire qu'un cycle
   * ne se facture pas, alors qu'il ne se facture pas ENCORE. Le titre reste, la phrase dit le
   * geste qui débloque (#144).
   */
  it("se ferme sans disparaître tant que le cycle n'a pas de destinataire", async () => {
    const { getByText, queryByText } = await mount({ hasAthlete: false });

    expect(getByText("invoice.billing.title")).toBeTruthy();
    expect(getByText("invoice.billing.athleteRequired")).toBeTruthy();
    expect(queryByText("invoice.billing.save")).toBeNull();
  });

  /**
   * Les euros saisis deviennent des CENTIMES entiers au dernier moment — jamais de float stocké.
   * `49,90 €` est le cas qui pique : `49.9 * 100` vaut `4989.999…` en flottant, et sans l'arrondi
   * la facture partirait à 49,89 €.
   */
  it("convertit les euros saisis en centimes entiers", async () => {
    const { container, user } = await mount({});

    await user.type(container.querySelector("#amount") as HTMLInputElement, "49.90");
    await user.type(container.querySelector("#dueDate") as HTMLInputElement, "2026-10-31");
    submit(container);

    expect(save).toHaveBeenCalledWith({
      amountCents: 4990,
      dueDate: "2026-10-31",
      note: null,
    });
  });

  // Une note faite d'espaces n'est pas une note : elle part nettoyée, ou pas du tout.
  it("envoie la note nettoyée", async () => {
    const { container, user } = await mount({});

    await user.type(container.querySelector("#amount") as HTMLInputElement, "60");
    await user.type(container.querySelector("#dueDate") as HTMLInputElement, "2026-10-31");
    await user.type(container.querySelector("#note") as HTMLTextAreaElement, "  Cycle automne  ");
    submit(container);

    expect(save).toHaveBeenCalledWith({
      amountCents: 6000,
      dueDate: "2026-10-31",
      note: "Cycle automne",
    });
  });

  /**
   * Un montant absent ou illisible n'est pas « zéro euro » : rien ne part. Le bouton est fermé, et
   * la garde de `onSubmit` tient quand même — un formulaire soumis au clavier ne passe pas par lui.
   */
  it("n'enregistre rien sans montant, bouton fermé ou pas", async () => {
    const { container, getByText, user } = await mount({});

    await user.type(container.querySelector("#dueDate") as HTMLInputElement, "2026-10-31");

    expect((getByText("invoice.billing.save") as HTMLButtonElement).disabled).toBe(true);
    submit(container);
    expect(save).not.toHaveBeenCalled();
  });

  // Les termes déjà enregistrés repeuplent le formulaire, montant réaffiché en EUROS.
  it("préremplit le formulaire avec les termes déjà saisis", async () => {
    const { container } = await mount({
      billing: {
        amountCents: 6000,
        dueDate: "2026-11-05",
        note: "Cycle automne",
      } as InvoiceDto,
    });

    expect((container.querySelector("#amount") as HTMLInputElement).value).toBe("60");
    expect((container.querySelector("#note") as HTMLTextAreaElement).value).toBe("Cycle automne");
  });

  it("cède la place au suivi une fois le cycle diffusé", async () => {
    const { getByText, queryByText } = await mount({ isPublished: true });

    expect(getByText("invoice.billing.trackLink")).toBeTruthy();
    expect(queryByText("invoice.billing.save")).toBeNull();
  });
});

describe("PlanBillingSection — l'enregistrement", () => {
  it("dit l'enregistrement en cours, bouton éteint", async () => {
    saving.isPending = true;
    const { getByRole } = await mount({});

    expect(getByRole("button", { name: "invoice.billing.saving" })).toBeDisabled();
  });
});

describe("PlanBillingSection — le justificatif", () => {
  const DRAFT = { amountCents: 6000, dueDate: "2026-11-05", note: null } as InvoiceDto;
  const WITH_DOCUMENT = {
    ...DRAFT,
    documentUrl: "https://s3/signé/facture.pdf",
    documentFileName: "facture.pdf",
  } as InvoiceDto;

  function pick(container: HTMLElement, files: File[]): void {
    fireEvent.change(container.querySelector("input[type=file]") as HTMLInputElement, {
      target: { files },
    });
  }

  const pdf = (size?: number) => {
    const file = new File(["%PDF"], "facture.pdf", { type: "application/pdf" });
    if (size != null) Object.defineProperty(file, "size", { value: size });
    return file;
  };

  // L'API le rattache à la facture DRAFT : sans termes enregistrés, il n'y a rien où l'accrocher.
  it("invite à enregistrer d'abord tant qu'aucun terme n'est saisi", async () => {
    const { getByText, queryByRole } = await mount({});

    expect(getByText("invoice.billing.documentAfterSave")).toBeInTheDocument();
    expect(queryByRole("button", { name: "invoice.billing.documentAdd" })).toBeNull();
  });

  it("joint le PDF choisi", async () => {
    const { container } = await mount({ billing: DRAFT });
    const file = pdf();

    pick(container, [file]);

    expect(attach.mutate).toHaveBeenCalledWith(file);
  });

  it("ne fait rien quand le choix est abandonné", async () => {
    const { container } = await mount({ billing: DRAFT });

    pick(container, []);

    expect(attach.mutate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "un fichier qui n'est pas un PDF",
      new File(["x"], "photo.png", { type: "image/png" }),
      "invoice.billing.documentPdfOnly",
    ],
    [
      "un PDF trop lourd",
      pdf(MAX_INVOICE_DOCUMENT_SIZE_BYTES + 1),
      "invoice.billing.documentTooBig",
    ],
  ])("refuse %s avant tout envoi, en le disant", async (_what, file, message) => {
    const { container, findByRole } = await mount({ billing: DRAFT });

    pick(container, [file]);

    expect(await findByRole("status")).toHaveTextContent(message);
    expect(attach.mutate).not.toHaveBeenCalled();
  });

  it("dit l'envoi en cours, gestes éteints", async () => {
    attach.isPending = true;
    const { getByRole } = await mount({ billing: DRAFT });

    expect(getByRole("button", { name: "invoice.billing.documentUploading" })).toBeDisabled();
  });

  // Une url sans nom de fichier n'a rien à afficher : on propose d'en joindre un, pas un lien muet.
  it("propose d'en joindre un quand le nom du fichier manque", async () => {
    const { getByRole, queryByRole } = await mount({
      billing: { ...WITH_DOCUMENT, documentFileName: null } as InvoiceDto,
    });

    expect(getByRole("button", { name: "invoice.billing.documentAdd" })).toBeInTheDocument();
    expect(queryByRole("link", { name: "facture.pdf" })).toBeNull();
  });

  it("ouvre le sélecteur depuis « ajouter » et depuis « remplacer »", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const empty = await mount({ billing: DRAFT });
    await empty.user.click(empty.getByRole("button", { name: "invoice.billing.documentAdd" }));
    empty.unmount();

    const joined = await mount({ billing: WITH_DOCUMENT });
    await joined.user.click(
      joined.getByRole("button", { name: "invoice.billing.documentReplace" }),
    );

    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it("montre le justificatif joint dans un nouvel onglet, et le retire", async () => {
    const { user, getByRole } = await mount({ billing: WITH_DOCUMENT });

    const link = getByRole("link", { name: "facture.pdf" });
    expect(link).toHaveAttribute("href", WITH_DOCUMENT.documentUrl);
    expect(link).toHaveAttribute("target", "_blank");

    await user.click(getByRole("button", { name: "invoice.billing.documentRemove" }));

    expect(remove.mutate).toHaveBeenCalled();
  });

  it("éteint les gestes pendant un retrait", async () => {
    remove.isPending = true;
    const { getByRole } = await mount({ billing: WITH_DOCUMENT });

    expect(getByRole("button", { name: "invoice.billing.documentReplace" })).toBeDisabled();
    expect(getByRole("button", { name: "invoice.billing.documentRemove" })).toBeDisabled();
  });
});

/**
 * Ce que l'écran apprend de la saisie : « Diffuser » émet la facture ENREGISTRÉE, et se ferme tant
 * que le formulaire montre autre chose (#326).
 */
describe("PlanBillingSection — une saisie non enregistrée", () => {
  const DRAFT = { amountCents: 5000, dueDate: "2026-11-05", note: null } as InvoiceDto;

  it("se déclare propre sur les termes tels qu'enregistrés", async () => {
    await mount({ billing: DRAFT });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("signale un montant changé, puis rendu à sa valeur enregistrée", async () => {
    const { container, user } = await mount({ billing: DRAFT });
    const amount = container.querySelector("#amount") as HTMLInputElement;

    await user.clear(amount);
    await user.type(amount, "80");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.clear(amount);
    await user.type(amount, "50.00");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("signale une note ajoutée, mais pas des espaces seuls", async () => {
    const { container, user } = await mount({ billing: DRAFT });
    const note = container.querySelector("#note") as HTMLTextAreaElement;

    await user.type(note, "   ");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    await user.type(note, "Virement");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  // Rien d'enregistré : le premier champ rempli est déjà une saisie à ne pas perdre.
  it("signale une première saisie, même incomplète", async () => {
    const { container, user } = await mount({});

    await user.type(container.querySelector("#amount") as HTMLInputElement, "60");

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

/**
 * Le builder relit la facturation, et chaque lecture redescend un NOUVEL objet — `documentUrl` est
 * re-signé à chaque fois. Ce builder minimal rend la seconde valeur que `mount` ne sait pas rendre.
 */
let reloadBilling: (next: InvoiceDto | null | undefined) => void = () => {};
function ReloadingBuilder({ first }: Readonly<{ first: InvoiceDto | undefined }>) {
  const [billing, setBilling] = useState<InvoiceDto | null | undefined>(first);
  reloadBilling = setBilling;
  return (
    <PlanBillingSection
      planId="pln_1"
      isPublished={false}
      hasAthlete={true}
      billing={billing}
      onDirtyChange={onDirtyChange}
    />
  );
}

/** La saisie en cours survit aux relectures : seul un champ que le coach n'a pas touché suit (#334). */
describe("PlanBillingSection — une relecture pendant la saisie", () => {
  const SAVED = {
    amountCents: 12000,
    dueDate: "2026-11-05",
    note: null,
    documentUrl: "https://s3/signé/facture.pdf",
    documentFileName: "facture.pdf",
  } as InvoiceDto;

  async function mountReloading(first: InvoiceDto | undefined) {
    const view = await renderInRoute(<ReloadingBuilder first={first} />, {
      path: "/plans/$planId",
      params: { planId: "pln_1" },
      links: ["/invoices"],
    });
    const field = (id: string) =>
      view.container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
    const reload = (next: InvoiceDto | null | undefined) => act(() => reloadBilling(next));
    return { ...view, field, reload };
  }

  // Le scénario de l'issue : 120 → 150, nouveau justificatif, et la facture partait à 120 €.
  it("garde le montant tapé quand la facture revient re-signée", async () => {
    const { container, field, reload, user } = await mountReloading(SAVED);

    await user.clear(field("amount"));
    await user.type(field("amount"), "150");
    reload({ ...SAVED, documentUrl: "https://s3/re-signé/facture.pdf" });

    expect(field("amount").value).toBe("150");
    submit(container);
    expect(save).toHaveBeenCalledWith({ amountCents: 15000, dueDate: "2026-11-05", note: null });
  });

  it("suit les termes relus là où le coach n'a rien tapé", async () => {
    const { field, reload, user } = await mountReloading(SAVED);

    await user.clear(field("amount"));
    await user.type(field("amount"), "150");
    reload({ ...SAVED, amountCents: 13000, note: "Virement" });

    expect(field("amount").value).toBe("150");
    expect(field("note").value).toBe("Virement");
  });

  // Les termes arrivent après la première frappe : elle n'est pas effacée par leur arrivée.
  it("garde ce qui a été tapé avant que les termes arrivent", async () => {
    const { field, reload, user } = await mountReloading(undefined);

    await user.type(field("amount"), "90");
    reload(SAVED);

    expect(field("amount").value).toBe("90");
    expect(field("dueDate").value).toBe("2026-11-05");
  });
});
