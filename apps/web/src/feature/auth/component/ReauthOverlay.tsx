import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/component";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";

type ReauthOverlayProps = {
  /** Le compte qui a ouvert l'écran — le seul sous lequel on peut le reprendre. */
  owner: Readonly<{ id: string; email: string }>;
};

/**
 * La reconnexion SUR PLACE, posée par `CmvRoleGate` quand la session tombe sous un écran déjà
 * ouvert (#336).
 *
 * Elle recouvre l'écran sans le démonter : c'est tout son objet. Renvoyer vers `/login` aurait jeté
 * le constructeur que le coach venait de remplir — la perte même que le constat reprochait. Le
 * voile est OPAQUE : sur un poste partagé, celui qui trouve l'onglet ne doit pas lire l'écran du
 * compte parti.
 *
 * L'e-mail n'est pas saisissable : on ne reprend l'écran que sous le compte qui l'a ouvert. Un autre
 * compte hériterait sinon du brouillon, et des données en cache, du précédent. Qui veut changer
 * de compte passe par « Changer de compte », qui purge tout avant de partir.
 */
export function ReauthOverlay({ owner }: Readonly<ReauthOverlayProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchAccount() {
    resetAccountData(queryClient);
    navigate({ to: "/login", replace: true });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email: owner.email,
        password,
      });
      if (signInError) {
        setError(t("auth.errors.invalidCredentials"));
        return;
      }
      // Garde-fou : l'e-mail est celui du compte parti, mais il a pu changer entre-temps. Un autre
      // identifiant ne reprend PAS l'écran : il repart de zéro, comme à une connexion ordinaire.
      if (data?.user.id !== owner.id) {
        switchAccount();
        return;
      }
      // Les lectures tombées en 401 pendant la perte restent en erreur jusqu'à leur prochain
      // chargement : on les relance toutes, la fenêtre partie l'écran doit être juste.
      await queryClient.invalidateQueries();
      toast.success(t("auth.reauth.restored"));
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-cmv-bg-0 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-cmv-border bg-cmv-surface p-6">
        <h1 id={titleId} className="mb-2 font-cmv-display text-2xl text-cmv-text-hi">
          {t("auth.reauth.title")}
        </h1>
        <p className="mb-6 text-sm text-cmv-text-mid">{t("auth.reauth.body")}</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-cmv-text-mid">
            {t("auth.reauth.account")}{" "}
            <span className="font-medium text-cmv-text-hi">{owner.email}</span>
          </p>
          <CmvTextField
            label={t("common.password")}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error != null && <p className="text-sm text-cmv-error">{error}</p>}
          <CmvButton type="submit" disabled={submitting} fullWidth>
            {submitting ? t("auth.login.submitting") : t("auth.reauth.submit")}
          </CmvButton>
        </form>
        <div className="mt-2">
          <CmvButton variant="ghost" onClick={switchAccount} fullWidth>
            {t("auth.reauth.switchAccount")}
          </CmvButton>
        </div>
      </div>
    </div>
  );
}
