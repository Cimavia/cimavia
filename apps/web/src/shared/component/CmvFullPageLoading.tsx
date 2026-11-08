import { useTranslation } from "react-i18next";

/** L'attente plein écran, le temps que la session se résolve. */
export function CmvFullPageLoading() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
      {t("common.loading")}
    </main>
  );
}
