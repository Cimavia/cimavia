import {
  capabilitiesOf,
  eraseAccountSchema,
  erasureFailureOf,
  erasureNotices,
  PASSWORD_MAX_LENGTH,
} from "@cmv/shared";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountErasure } from "@/feature/account/hook/useAccountErasure";
import { CmvAppShell, CmvButton, CmvFormError, CmvWarningNotice } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";

// i18n-values account.delete.gone: coach, athlete, company
// i18n-values account.delete.kept: coach, athlete
// i18n-values account.delete.failure: wrongPassword, tooManyAttempts, busy

/**
 * Supprimer son compte (#795) : ce qui part, ce qui reste, puis le mot de passe.
 *
 * Seul un mot de passe refusé vide le champ : après un « réessaie dans un instant » ou une panne,
 * le mot de passe est bon, le faire retaper ne servirait à rien.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const notices = erasureNotices(capabilitiesOf(session?.user));
  const [password, setPassword] = useState("");
  const erase = useAccountErasure();
  const failure = erasureFailureOf(erase.error);
  // Reste éteint après le succès : la page est en train d'être quittée.
  const busy = erase.isPending || erase.isSuccess;
  const valid = eraseAccountSchema.safeParse({ password }).success;

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    erase.mutate(
      { password },
      {
        onError: (error) => {
          if (erasureFailureOf(error) === "wrongPassword") setPassword("");
        },
      },
    );
  }

  return (
    <CmvAppShell
      title={t("account.delete.title")}
      back={{ label: t("account.title"), link: { to: "/account" } }}
    >
      <div className="flex max-w-xl flex-col gap-cmv-lg">
        <CmvWarningNotice>{t("account.delete.warning")}</CmvWarningNotice>

        <section className="flex flex-col gap-cmv-sm">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("account.delete.goneTitle")}</h2>
          <ul className="flex list-disc flex-col gap-cmv-xs pl-cmv-lg text-cmv-caption text-cmv-text-mid">
            {notices.gone.map((name) => (
              <li key={name}>{t(`account.delete.gone.${name}`)}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-cmv-sm">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("account.delete.keptTitle")}</h2>
          <ul className="flex list-disc flex-col gap-cmv-xs pl-cmv-lg text-cmv-caption text-cmv-text-mid">
            {notices.kept.map((name) => (
              <li key={name}>{t(`account.delete.kept.${name}`)}</li>
            ))}
            <li>{t("account.delete.backups")}</li>
          </ul>
        </section>

        <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
          <CmvTextField
            label={t("common.password")}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <CmvFormError
            error={erase.error}
            message={failure == null ? undefined : t(`account.delete.failure.${failure}`)}
          />
          <div>
            <CmvButton type="submit" variant="danger" disabled={!valid || busy}>
              {busy ? t("account.delete.submitting") : t("account.delete.submit")}
            </CmvButton>
          </div>
        </form>
      </div>
    </CmvAppShell>
  );
}
