import {
  draftAfterLoad,
  INVOICE_NOTE_MAX_LENGTH,
  type InvoiceDto,
  MAX_INVOICE_DOCUMENT_SIZE_BYTES,
  required,
} from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, type SubmitEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAttachInvoiceDocument,
  useRemoveInvoiceDocument,
  useSavePlanBilling,
} from "@/feature/invoice/hook/useInvoices";
import { CmvButton, CmvCard, CmvTextArea, CmvTextField, useToast } from "@/shared/component";
import { useCheckedSave } from "@/shared/hook/useCheckedSave";
import type { SaveBeforeLeaving } from "@/shared/hook/useLeaveGuard";
import { useReportUnsaved } from "@/shared/hook/useReportUnsaved";

type PlanBillingSectionProps = {
  planId: string;
  // Une fois le cycle diffusé, la facturation est émise et figée : on n'affiche plus le formulaire.
  isPublished: boolean;
  /**
   * Le cycle a un destinataire (#144). `Invoice.athleteId` est NOT NULL : sans lui il n'y a
   * personne à facturer, et l'API refuse la saisie en 409.
   */
  hasAthlete: boolean;
  /**
   * Les termes déjà saisis, `null` s'il n'y en a pas, `undefined` tant que la réponse n'est pas
   * là. Reçus du builder plutôt que relus ici (#211) : la lecture n'a qu'une garde, et c'est la
   * sienne. Deux observateurs sur la même clé de requête suffisaient à la rendre inopérante — il
   * suffisait que l'un des deux soit actif pour que la requête parte.
   */
  billing: InvoiceDto | null | undefined;
  /**
   * Le cycle d'un autre Coach, ouvert en Lecture (#607) : ses termes et son justificatif se lisent,
   * rien ne s'y saisit ni ne s'y joint. En Écriture, la facturation se saisit comme la sienne.
   */
  readOnly: boolean;
  /**
   * La saisie diffère des termes enregistrés, et voici de quoi l'enregistrer — `null` sinon :
   * « Diffuser » émet la facture ENREGISTRÉE, et se ferme tant qu'elle attend (#326) ; le dialogue
   * de sortie l'enregistre (#682). Doit être stable.
   */
  onUnsavedChange: (save: SaveBeforeLeaving | null) => void;
};

// Euros saisis → centimes entiers. `Math.round` absorbe l'imprécision du float de saisie
// (49.90 * 100 = 4989.999…) : la seule multiplication par 100 du flux vit ici.
function toAmountCents(euros: string): number | null {
  const value = Number(euros);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

type BillingDraft = { amount: string; dueDate: string; note: string };

/**
 * Les termes enregistrés tels que le formulaire les affiche — montant en euros. `null` champ par
 * champ quand rien n'est enregistré (ou pas encore lu) : `draftAfterLoad` le lit comme un champ vide.
 */
function termsAsDraft(billing: InvoiceDto | null | undefined): {
  [Field in keyof BillingDraft]: string | null;
} {
  return {
    amount: billing == null ? null : String(billing.amountCents / 100),
    dueDate: billing?.dueDate ?? null,
    note: billing?.note ?? null,
  };
}

/**
 * La saisie s'écarte-t-elle des termes enregistrés ? Comparée sur ce qui PARTIRAIT, pas sur le
 * texte : « 50 » et « 50.00 » valent les mêmes 5000 centimes, une note faite d'espaces vaut
 * l'absence de note. Sans termes enregistrés (`null`, ou pas encore lus), tout champ rempli est
 * un écart — même incomplet : diffuser tant qu'on le remplit n'aurait de toute façon rien émis.
 */
function hasUnsavedTerms(draft: BillingDraft, billing: InvoiceDto | null | undefined): boolean {
  const note = draft.note.trim() || null;
  if (billing == null) return draft.amount !== "" || draft.dueDate !== "" || note != null;
  return (
    toAmountCents(draft.amount) !== billing.amountCents ||
    draft.dueDate !== billing.dueDate ||
    note !== billing.note
  );
}

/**
 * Section « Facturation » du builder, sous les semaines (p6-1). Édite la facture DRAFT du cycle ;
 * la diffusion l'exige (gating). Le coach saisit un montant en euros, converti en centimes (entier)
 * au dernier moment — jamais de float stocké. La période (mois de début) et l'athlète sont dérivés
 * côté API : rien à saisir ici.
 */
export function PlanBillingSection({
  planId,
  isPublished,
  hasAthlete,
  billing,
  readOnly,
  onUnsavedChange,
}: Readonly<PlanBillingSectionProps>) {
  const { t } = useTranslation();
  const save = useSavePlanBilling(planId);

  const loaded = termsAsDraft(billing);
  const [amount, setAmount] = useState(loaded.amount ?? "");
  const [dueDate, setDueDate] = useState(loaded.dueDate ?? "");
  const [note, setNote] = useState(loaded.note ?? "");

  /**
   * Le formulaire part des termes enregistrés, et les suit — sauf là où le coach a tapé (#334).
   * Chaque lecture rend un NOUVEL objet, ne serait-ce que parce que `documentUrl` est re-signé :
   * joindre un PDF ou revenir sur l'onglet suffit. Ni l'`id` ni `updatedAt` ne disent « les termes
   * ont changé » — joindre un justificatif avance `updatedAt`. La frappe gagne donc champ par champ,
   * comme au débrief (#284) : un champ qui diffère des termes lus au dernier examen est gardé.
   *
   * Ajusté PENDANT le render et non dans un effet : c'est de l'état dérivé d'une donnée chargée.
   */
  const [synced, setSynced] = useState(billing);
  if (billing !== synced) {
    const lastLoaded = termsAsDraft(synced);
    setSynced(billing);
    setAmount(draftAfterLoad(amount, lastLoaded.amount, loaded.amount));
    setDueDate(draftAfterLoad(dueDate, lastLoaded.dueDate, loaded.dueDate));
    setNote(draftAfterLoad(note, lastLoaded.note, loaded.note));
  }

  const amountCents = toAmountCents(amount);
  const canSubmit = amountCents != null && dueDate !== "";

  /**
   * Enregistre les termes, ou dit ce qui manque — le bouton fermé ne suffit pas : le dialogue de
   * sortie enregistre sans lui (#682). Un formulaire à moitié rempli compte comme une saisie, mais
   * ne part pas. Vrai si les termes sont partis ; un échec de l'API se dit par son toast.
   */
  const sendTerms = useCheckedSave(
    () => (canSubmit ? null : "invoice.billing.incomplete"),
    async () => {
      await save.mutateAsync({
        amountCents: required(amountCents, "montant contrôlé avant l'envoi"),
        dueDate,
        note: note.trim() || null,
      });
      return true;
    },
  );
  const saveTerms = async () => (await sendTerms()) != null;

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    void saveTerms();
  }

  useReportUnsaved(hasUnsavedTerms({ amount, dueDate, note }, billing), saveTerms, onUnsavedChange);

  /**
   * Fermée, expliquée, jamais masquée : la faire disparaître laisserait croire qu'un cycle ne se
   * facture pas, alors qu'il ne se facture pas ENCORE. La phrase dit aussi le geste qui débloque —
   * choisir le destinataire, en haut de la page.
   */
  if (!hasAthlete) {
    return (
      <CmvCard>
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("invoice.billing.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("invoice.billing.athleteRequired")}
          </p>
        </div>
      </CmvCard>
    );
  }

  if (isPublished) {
    return (
      <CmvCard>
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("invoice.billing.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-mid">{t("invoice.billing.issuedHint")}</p>
          {/* Depuis le builder : le coach suit ce qu'il a ÉMIS. */}
          <Link
            to="/invoices"
            search={{ as: "coach", q: undefined, situation: undefined, athlete: undefined }}
            className="text-cmv-caption text-cmv-accent hover:underline"
          >
            {t("invoice.billing.trackLink")}
          </Link>
        </div>
      </CmvCard>
    );
  }

  return (
    <CmvCard>
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("invoice.billing.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-lo">
            {t(readOnly ? "invoice.billing.readOnlyHint" : "invoice.billing.hint")}
          </p>
        </div>

        <div className="grid gap-cmv-md md:grid-cols-2">
          <CmvTextField
            label={t("invoice.billing.amount")}
            name="amount"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("invoice.billing.amountPlaceholder")}
            min={0}
            required
            requiredMark={!readOnly}
            disabled={readOnly}
          />
          <CmvTextField
            label={t("invoice.billing.dueDate")}
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
            requiredMark={!readOnly}
            disabled={readOnly}
          />
        </div>

        {readOnly ? null : (
          <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
        )}

        <CmvTextArea
          label={t("invoice.billing.note")}
          name="note"
          maxLength={INVOICE_NOTE_MAX_LENGTH}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("invoice.billing.notePlaceholder")}
          rows={2}
          disabled={readOnly}
        />

        {readOnly ? null : (
          <div>
            <CmvButton type="submit" variant="secondary" disabled={!canSubmit || save.isPending}>
              {save.isPending ? t("invoice.billing.saving") : t("invoice.billing.save")}
            </CmvButton>
          </div>
        )}
      </form>

      {/* Justificatif PDF : disponible une fois les termes enregistrés (l'API le rattache à la
          facture DRAFT). Tant que rien n'est saisi, on invite à enregistrer d'abord. */}
      <div className="mt-cmv-md flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-md">
        <h3 className="text-cmv-body text-cmv-text-hi">{t("invoice.billing.document")}</h3>
        <BillingDocumentSlot planId={planId} billing={billing} readOnly={readOnly} />
      </div>
    </CmvCard>
  );
}

/**
 * Le justificatif, ou ce qui en tient lieu. Tant que rien n'est saisi, on invite à enregistrer
 * d'abord ; en Lecture, on dit seulement ce qui est joint — ou que rien ne l'est.
 */
function BillingDocumentSlot({
  planId,
  billing,
  readOnly,
}: Readonly<{ planId: string; billing: InvoiceDto | null | undefined; readOnly: boolean }>) {
  const { t } = useTranslation();
  if (readOnly) {
    return billing?.documentUrl == null || billing.documentFileName == null ? (
      <p className="text-cmv-caption text-cmv-text-lo">{t("invoice.billing.documentNone")}</p>
    ) : (
      <DocumentLink url={billing.documentUrl} fileName={billing.documentFileName} />
    );
  }
  return billing == null ? (
    <p className="text-cmv-caption text-cmv-text-lo">{t("invoice.billing.documentAfterSave")}</p>
  ) : (
    <BillingDocument planId={planId} billing={billing} />
  );
}

function DocumentLink({ url, fileName }: Readonly<{ url: string; fileName: string }>) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cmv-body text-cmv-accent hover:underline"
    >
      {fileName}
    </a>
  );
}

function BillingDocument({ planId, billing }: Readonly<{ planId: string; billing: InvoiceDto }>) {
  const { t } = useTranslation();
  const toast = useToast();
  const attach = useAttachInvoiceDocument(planId);
  const remove = useRemoveInvoiceDocument(planId);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Réinitialise pour pouvoir resélectionner le même fichier après un retrait.
    event.target.value = "";
    if (file == null) return;
    if (file.type !== "application/pdf") {
      toast.error(t("invoice.billing.documentPdfOnly"));
      return;
    }
    if (file.size > MAX_INVOICE_DOCUMENT_SIZE_BYTES) {
      toast.error(t("invoice.billing.documentTooBig"));
      return;
    }
    attach.mutate(file);
  }

  const busy = attach.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-cmv-sm">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onPick}
      />

      {billing.documentUrl == null || billing.documentFileName == null ? (
        <div className="flex flex-col gap-cmv-xs">
          <CmvButton variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {attach.isPending
              ? t("invoice.billing.documentUploading")
              : t("invoice.billing.documentAdd")}
          </CmvButton>
          <p className="text-cmv-caption text-cmv-text-lo">{t("invoice.billing.documentHint")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-cmv-sm">
          <DocumentLink url={billing.documentUrl} fileName={billing.documentFileName} />
          <CmvButton variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {t("invoice.billing.documentReplace")}
          </CmvButton>
          <CmvButton variant="ghost" disabled={busy} onClick={() => remove.mutate()}>
            {t("invoice.billing.documentRemove")}
          </CmvButton>
        </div>
      )}
    </div>
  );
}
