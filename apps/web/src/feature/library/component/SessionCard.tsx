import type { SessionDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge, CmvCard } from "@/shared/component";

// Nombre d'exercices détaillés sur la carte ; au-delà, on résume (« +N autres »).
const PREVIEW_COUNT = 2;

type SessionCardProps = {
  session: SessionDto;
  onSelect: (session: SessionDto) => void;
};

export function SessionCard({ session, onSelect }: Readonly<SessionCardProps>) {
  const { t } = useTranslation();

  const preview = session.exercises.slice(0, PREVIEW_COUNT);
  const remaining = session.exercises.length - preview.length;

  return (
    <CmvCard onClick={() => onSelect(session)} className="flex flex-col gap-cmv-sm">
      <h3 className="text-cmv-subtitle text-cmv-text-hi">{session.title}</h3>

      {/* Consignes nullable → tiret, jamais de valeur par défaut (règle dure n°5). */}
      <p className="line-clamp-2 text-cmv-body text-cmv-text-mid">{session.notes ?? "—"}</p>

      <ol className="flex flex-col gap-cmv-xs">
        {preview.map((exercise) => (
          <li key={exercise.id} className="flex items-center gap-cmv-sm text-cmv-caption">
            <span className="text-cmv-text-lo">{exercise.position + 1}</span>
            <span className="truncate text-cmv-text-mid">{exercise.title}</span>
          </li>
        ))}
        {remaining > 0 ? (
          <li className="text-cmv-caption text-cmv-text-lo">
            {t("library.session.more", { count: remaining })}
          </li>
        ) : null}
      </ol>

      <CmvBadge variant="accent">
        {t("library.session.exerciseCount", { count: session.exercises.length })}
      </CmvBadge>
    </CmvCard>
  );
}
