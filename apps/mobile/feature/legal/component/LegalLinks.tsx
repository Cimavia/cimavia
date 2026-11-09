import { LEGAL_DOCUMENTS, type LegalDocument, legalDocumentUrl } from "@cmv/shared";
import * as Sentry from "@sentry/react-native";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Linking, Text, View } from "react-native";
import { CmvText } from "@/shared/component";
import { WEB_URL } from "@/shared/lib/web-url";

type LegalLinkProps = {
  document: LegalDocument;
  className?: string;
  /** Posé par `Trans` quand le lien vit au milieu d'une phrase. */
  children?: ReactNode;
};

/**
 * Un lien vers un document légal (#778), ouvert dans le navigateur : ces pages sont servies par le
 * web, lisibles sans compte. Un `Text` et non un `Pressable` : posé dans une phrase, il doit
 * couler avec elle — un `Text` imbriqué le permet, une vue non. `Text` et non `CmvText`, qui ne
 * prend pas `onPress` : même choix que le lien de `CmvRichDocument`.
 */
function LegalLink({ document, className, children }: Readonly<LegalLinkProps>) {
  const { i18n } = useTranslation();
  return (
    <Text
      accessibilityRole="link"
      className={className ?? "text-cmv-accent"}
      onPress={() => {
        // Aucun navigateur pour l'ouvrir : rare, mais le lien resterait muet — Sentry le dira.
        Linking.openURL(legalDocumentUrl(WEB_URL, document, i18n.language)).catch(
          (error: unknown) => Sentry.captureException(error),
        );
      }}
    >
      {children}
    </Text>
  );
}

/** Les documents, l'un sous l'autre : écran Profil et écran Entreprise. */
export function LegalLinks() {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      {LEGAL_DOCUMENTS.map(({ document, labelKey }) => (
        <LegalLink key={document} document={document} className="text-cmv-text-mid text-sm">
          {t(labelKey)}
        </LegalLink>
      ))}
    </View>
  );
}

/**
 * La mention sous le bouton d'inscription, et non une case à cocher : la base du traitement est
 * l'exécution du contrat, qui ne demande pas de consentement (« Tranché en #778 »).
 */
export function LegalConsent() {
  return (
    <CmvText className="text-center text-cmv-text-lo text-xs">
      <Trans
        i18nKey="auth.register.consent"
        components={{
          terms: <LegalLink document="terms" />,
          privacy: <LegalLink document="privacy" />,
        }}
      />
    </CmvText>
  );
}
