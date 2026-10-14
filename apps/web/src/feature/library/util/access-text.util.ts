import {
  type AccessLabelSubject,
  type AccessLevel,
  accessLabel,
  isOwner,
  type MyAccess,
  type MyAccessLevel,
} from "@cmv/shared";
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
      return label.grants.map((grant) => grantText(grant.name, grant.level, t)).join(", ");
    case "sharedBy":
      return t("library.access.sharedBy", {
        owner: label.owner,
        level: t(`library.access.level.${label.level}`),
      });
  }
}

/** La colonne Propriétaire : « Moi » pour ce qui est à l'acteur, le nom de l'autre Coach sinon. */
export function ownerText(subject: Pick<AccessLabelSubject, "owner" | "myAccess">, t: TFunction) {
  return isOwner(subject.myAccess) ? t("library.access.me") : subject.owner.name;
}

/**
 * Le propriétaire d'un exercice à ajouter, et ce que l'acteur en peut (frame 8) : « Moi », ou
 * « M · Écriture ». Le sélecteur ne dit pas d'où vient le droit : la Lecture suffit à ajouter.
 */
export function ownerRightText(
  subject: Pick<AccessLabelSubject, "owner" | "myAccess">,
  t: TFunction,
): string {
  return isOwner(subject.myAccess)
    ? ownerText(subject, t)
    : grantText(subject.owner.name, subject.myAccess.level, t);
}

/** « F · Écriture » : un nom et un niveau, côté propriétaire comme côté lecteur. */
function grantText(name: string, level: AccessLevel | MyAccessLevel, t: TFunction): string {
  return t("library.access.grant", { name, level: t(`library.access.level.${level}`) });
}

/**
 * Le droit de l'acteur sur l'élément d'un autre, et d'où il le tient : « Lecture via F ». Sans
 * provenance (droit direct, #608), le niveau seul.
 */
export function myRightText({ level, via }: MyAccess, t: TFunction): string {
  const levelText = t(`library.access.level.${level}`);
  return via == null
    ? levelText
    : t("library.access.via", { level: levelText, organization: via.name });
}

/**
 * Sous un cycle ou une facture dans une liste (#607) : « Partagé par M · Lecture via F ». Une vue
 * qui agrège ce que l'acteur possède et ce qu'on lui ouvre nomme le propriétaire de ce qui n'est
 * pas à lui, et ce qu'il en peut. `null` sur le sien, et pour l'athlète, qui n'a pas de droit : il
 * en est le destinataire.
 */
export function sharedByText(owner: string, myAccess: MyAccess | null, t: TFunction) {
  if (myAccess == null || isOwner(myAccess)) return null;
  return t("library.access.sharedBy", { owner, level: myRightText(myAccess, t) });
}
