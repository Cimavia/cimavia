import { type CapabilityName, capabilitiesOf } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoWarningOutline } from "react-icons/io5";
import { useCapabilityUpdate } from "@/feature/account/hook/useCapabilityUpdate";
import { CmvAppShell, CmvButton } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

// i18n-values account.capabilities.option: coach, athlete
// i18n-values account.capabilities.hint: coach, athlete
const OPTIONS: readonly CapabilityName[] = ["coach", "athlete"];

/**
 * Le compte : identité, et les capacités qu'on peut ajouter ou retirer après coup (#13).
 *
 * Hors des deux espaces de navigation, comme l'onglet Profil du mobile : ce n'est ni du coach ni
 * de l'athlète, c'est le compte. D'où son entrée dans le pied de la barre latérale, visible quel
 * que soit l'espace actif.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const current = capabilitiesOf(session?.user);
  const [selected, setSelected] = useState<Set<CapabilityName>>(
    new Set(OPTIONS.filter((name) => (name === "coach" ? current.isCoach : current.isAthlete))),
  );
  const update = useCapabilityUpdate();

  const isCoach = selected.has("coach");
  const isAthlete = selected.has("athlete");
  const unchanged = isCoach === current.isCoach && isAthlete === current.isAthlete;

  function toggle(name: CapabilityName) {
    const next = new Set(selected);
    if (!next.delete(name)) next.add(name);
    setSelected(next);
  }

  return (
    <CmvAppShell title={t("account.title")}>
      <section className="flex max-w-xl flex-col gap-cmv-md">
        <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("account.capabilities.title")}</h2>
        <p className="text-cmv-caption text-cmv-text-mid">
          {t("account.capabilities.description")}
        </p>

        <div className="flex flex-col gap-cmv-sm">
          {OPTIONS.map((name) => {
            const checked = selected.has(name);
            return (
              <label
                key={name}
                className={
                  checked
                    ? "flex cursor-pointer flex-col gap-cmv-xs rounded-cmv-md border border-cmv-accent bg-cmv-accent-soft p-cmv-md focus-within:ring-2 focus-within:ring-cmv-accent"
                    : "flex cursor-pointer flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md focus-within:ring-2 focus-within:ring-cmv-accent"
                }
              >
                <span className="flex items-center gap-cmv-sm text-cmv-body text-cmv-text-hi">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggle(name)}
                  />
                  {t(`account.capabilities.option.${name}`)}
                </span>
                <span className="text-cmv-caption text-cmv-text-mid">
                  {t(`account.capabilities.hint.${name}`)}
                </span>
              </label>
            );
          })}
        </div>

        {/* L'avertissement ne s'affiche QUE sur un retrait effectif : rappeler ce qu'on garde
            n'a de sens qu'au moment où l'on s'apprête à le perdre de vue. */}
        {current.isCoach && !isCoach && (
          // Couleurs d'avertissement du design system, mêmes tokens que le variant `warning` de
          // `CmvBadge` : ce n'est pas une note d'information, c'est ce qu'on s'apprête à perdre
          // de vue.
          <p className="flex items-center gap-cmv-sm rounded-cmv-md border border-cmv-warning-line bg-cmv-warning-soft p-cmv-md text-cmv-caption text-cmv-warning-on">
            <IoWarningOutline aria-hidden className="shrink-0 text-cmv-body" />
            <span>{t("account.capabilities.warnCoach")}</span>
          </p>
        )}
        {!isCoach && !isAthlete && (
          <p className="text-cmv-caption text-cmv-error">{t("account.capabilities.atLeastOne")}</p>
        )}

        <div>
          <CmvButton
            onClick={() => update.mutate({ isCoach, isAthlete })}
            disabled={unchanged || (!isCoach && !isAthlete) || update.isPending}
          >
            {update.isPending ? t("common.saving") : t("common.save")}
          </CmvButton>
        </div>
      </section>
    </CmvAppShell>
  );
}
