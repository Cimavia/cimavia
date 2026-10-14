import { type AccessLabelSubject, accessLabel, MyAccessLevel } from "@cmv/shared";
import type { TFunction } from "i18next";

// i18n-values library.access.level: AccessLevel

/**
 * La cellule Accès d'une ligne (maquette #597, frame 1) : « Privé », « F · Écriture, G · Lecture »
 * ou « Partagé par M · Lecture ». Ce que la cellule DIT est décidé par `accessLabel` ; ici, seule
 * la traduction. Un accès qui ne se dit pas rend « — » (règle dure n°5).
 */
export function accessText(subject: AccessLabelSubject, t: TFunction): string {
  const label = accessLabel(subject);
  if (label == null) return "—";
  switch (label.kind) {
    case "private":
      return t("library.access.private");
    case "granted":
      return label.grants
        .map((grant) =>
          t("library.access.grant", {
            name: grant.name,
            level: t(`library.access.level.${grant.level}`),
          }),
        )
        .join(", ");
    case "sharedBy":
      return t("library.access.sharedBy", {
        owner: label.owner,
        level: t(`library.access.level.${label.level}`),
      });
  }
}

/** La colonne Propriétaire : « Moi » pour ce qui est à l'acteur, le nom de l'autre Coach sinon. */
export function ownerText(subject: Pick<AccessLabelSubject, "owner" | "myAccess">, t: TFunction) {
  return subject.myAccess.level === MyAccessLevel.OWNER
    ? t("library.access.me")
    : subject.owner.name;
}
