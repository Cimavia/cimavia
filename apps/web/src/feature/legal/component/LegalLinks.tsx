import { LEGAL_DOCUMENTS, type LegalDocument, legalDocumentUrl } from "@cmv/shared";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

type LegalAnchorProps = {
  document: LegalDocument;
  className?: string;
  /** Posé par `Trans` quand le lien vit au milieu d'une phrase. */
  children?: ReactNode;
};

/**
 * Un lien vers un document légal (#778). Une ancre et non un `Link` du routeur : ces pages sont
 * HORS de la SPA, servies par nginx. Un nouvel onglet : l'ouvrir depuis l'inscription ne doit pas
 * faire perdre le formulaire à moitié rempli.
 *
 * Chemin relatif (`/legal/…`) : le web les sert lui-même, sur sa propre origine.
 */
function LegalAnchor({ document, className, children }: Readonly<LegalAnchorProps>) {
  const { i18n } = useTranslation();
  return (
    <a
      href={legalDocumentUrl("", document, i18n.language)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-cmv-accent hover:text-cmv-accent-hi"}
    >
      {children}
    </a>
  );
}

/**
 * Les documents, en ligne : pied des pages d'authentification et section de l'écran Compte.
 * Lisibles sans compte — c'est tout leur intérêt avant l'inscription.
 */
export function LegalLinks({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("legal.title")} className={className}>
      <ul className="flex flex-wrap gap-x-cmv-lg gap-y-cmv-xs text-cmv-caption">
        {LEGAL_DOCUMENTS.map(({ document, labelKey }) => (
          <li key={document}>
            <LegalAnchor document={document} className="text-cmv-text-lo hover:text-cmv-text-hi">
              {t(labelKey)}
            </LegalAnchor>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * La mention sous le bouton d'inscription, et non une case à cocher : la base du traitement est
 * l'exécution du contrat, qui ne demande pas de consentement (« Tranché en #778 »).
 */
export function LegalConsent() {
  return (
    <p className="text-center text-cmv-caption text-cmv-text-lo">
      <Trans
        i18nKey="auth.register.consent"
        components={{
          terms: <LegalAnchor document="terms" />,
          privacy: <LegalAnchor document="privacy" />,
        }}
      />
    </p>
  );
}
