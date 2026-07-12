import type { SessionDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { SessionCard } from "@/feature/library/component/SessionCard";
import { useSessions } from "@/feature/library/hook/useSessions";
import { CmvButton, CmvEmptyState } from "@/shared/component";

type SessionListProps = {
  onCreate: () => void;
  onEdit: (session: SessionDto) => void;
};

export function SessionList({ onCreate, onEdit }: Readonly<SessionListProps>) {
  const { t } = useTranslation();
  const { data: sessions, isPending, isError } = useSessions();

  return (
    <>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}
      {isError ? <p className="text-cmv-error">{t("common.error")}</p> : null}

      {sessions?.length === 0 ? (
        <CmvEmptyState
          title={t("library.session.emptyTitle")}
          description={t("library.session.emptyDescription")}
          action={<CmvButton onClick={onCreate}>{t("library.newSession")}</CmvButton>}
        />
      ) : null}

      <div className="grid gap-cmv-lg sm:grid-cols-2 lg:grid-cols-3">
        {sessions?.map((session) => (
          <SessionCard key={session.id} session={session} onSelect={onEdit} />
        ))}
      </div>
    </>
  );
}
