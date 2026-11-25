import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";

/**
 * Sous le titre d'un cycle d'archive (#910) : « Suivi terminé le … ». Rien pour un cycle dont le
 * suivi court — `null` n'y est pas une date manquante, c'est « pas de fin ».
 */
export function FollowEndedLine({ followEndedAt }: Readonly<{ followEndedAt: string | null }>) {
  const followEndedText = useFollowEndedText();
  if (followEndedAt == null) return null;
  return (
    <span className="text-cmv-caption text-cmv-text-lo">{followEndedText(followEndedAt)}</span>
  );
}
