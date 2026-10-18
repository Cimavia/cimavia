import { MyAccessLevel } from "@cmv/shared";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { invoiceSharedByText } from "@/feature/invoice/component/InvoiceSharedBy";

/** Une traduction qui garde les paramètres : `cimode` les perd. */
const t = ((key: string, values?: object) =>
  values == null ? key : `${key} ${JSON.stringify(values)}`) as unknown as TFunction;

const F = { id: "org-f", name: "F" };

describe("invoiceSharedByText", () => {
  it("rien sur la facture du Coach, ni pour l'athlète, sans droit", () => {
    const owner = { level: MyAccessLevel.OWNER, via: null };
    expect(invoiceSharedByText({ coachName: "C", myAccess: owner }, t)).toBeNull();
    expect(invoiceSharedByText({ coachName: "C", myAccess: null }, t)).toBeNull();
  });

  it("le propriétaire, le droit et l'entreprise qui l'ouvre", () => {
    const myAccess = { level: MyAccessLevel.READ, via: F };
    const right = `invoice.coach.rightVia ${JSON.stringify({ right: "invoice.coach.rightRead", organization: "F" })}`;
    expect(invoiceSharedByText({ coachName: "M", myAccess }, t)).toBe(
      `invoice.coach.sharedBy ${JSON.stringify({ owner: "M", right })}`,
    );
  });

  it("un droit direct se dit sans provenance", () => {
    const myAccess = { level: MyAccessLevel.WRITE, via: null };
    expect(invoiceSharedByText({ coachName: "M", myAccess }, t)).toBe(
      `invoice.coach.sharedBy ${JSON.stringify({ owner: "M", right: "invoice.coach.rightWrite" })}`,
    );
  });
});
