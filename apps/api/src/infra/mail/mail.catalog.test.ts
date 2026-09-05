import { EMAILABLE_NOTIFICATION_TYPES, Locale, NotificationType } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { en } from "./locale/en";
import { fr } from "./locale/fr";
import { mailCatalog, mailStringsFor } from "./mail.catalog";

// Une URL Better Auth réaliste : le `&` entre les paramètres est le caractère qui casse un href
// mal échappé, et le jeton qui arriverait tronqué ferait échouer la réinitialisation.
const RESET_URL =
  "https://app.cimavia.fr/reset-password?token=abc123&callbackURL=%2Freset-password";

describe("mailStringsFor — choix de la langue", () => {
  it("rend la langue demandée quand elle existe", () => {
    expect(mailStringsFor(Locale.EN)).toBe(en);
    expect(mailStringsFor(Locale.FR)).toBe(fr);
  });

  // Le repli couvre les trois façons dont la langue peut manquer : absente, nulle, ou inconnue.
  it.each([[null], [undefined], ["es"], [""]])("replie sur le français pour %p", (locale) => {
    expect(mailStringsFor(locale)).toBe(fr);
  });

  // `Object.hasOwn` et non `in` : sans ça, une propriété du prototype passerait pour une langue
  // et `STRINGS["toString"]` rendrait une fonction là où on attend des textes.
  it("ne prend pas une propriété héritée pour une langue", () => {
    expect(mailStringsFor("toString")).toBe(fr);
    expect(mailStringsFor("constructor")).toBe(fr);
  });
});

describe("catalogues — parité des deux langues", () => {
  // Le `satisfies MailStrings` garantit déjà la parité à la compilation. Ce test tient le
  // deuxième bout : qu'aucun texte ne soit vide ou resté en français côté anglais.
  it("porte exactement les mêmes clés", () => {
    expect(Object.keys(en.resetPassword).sort()).toEqual(Object.keys(fr.resetPassword).sort());
    expect(Object.keys(en.common).sort()).toEqual(Object.keys(fr.common).sort());
  });

  it("ne laisse aucun texte vide ni identique d'une langue à l'autre", () => {
    const texts = [
      [fr.resetPassword.subject, en.resetPassword.subject],
      [fr.resetPassword.heading, en.resetPassword.heading],
      [fr.resetPassword.intro, en.resetPassword.intro],
      [fr.resetPassword.cta, en.resetPassword.cta],
      [fr.resetPassword.ignore, en.resetPassword.ignore],
      [fr.common.signature, en.common.signature],
      [fr.common.linkFallback, en.common.linkFallback],
    ] as const;
    for (const [french, english] of texts) {
      expect(french.length).toBeGreaterThan(0);
      expect(english.length).toBeGreaterThan(0);
      expect(english).not.toBe(french);
    }
  });

  // Une heure au singulier, plusieurs au pluriel — dans les deux langues.
  it("accorde la durée de validité au nombre d'heures", () => {
    expect(fr.resetPassword.expiry(1)).toContain("une heure");
    expect(fr.resetPassword.expiry(3)).toContain("3 heures");
    expect(en.resetPassword.expiry(1)).toContain("one hour");
    expect(en.resetPassword.expiry(3)).toContain("3 hours");
  });
});

describe("mailCatalog — gabarit de réinitialisation", () => {
  it("rend le sujet et les deux corps dans la langue demandée", () => {
    const mail = mailCatalog(Locale.EN).resetPassword({ url: RESET_URL, expiresInHours: 1 });
    expect(mail.subject).toBe(en.resetPassword.subject);
    expect(mail.text).toContain(en.resetPassword.cta);
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain(en.common.signature);
  });

  // La partie texte n'est pas décorative : certains clients refusent le HTML, et un message qui
  // en est dépourvu part plus souvent en indésirable.
  it("porte le lien en clair dans la version texte", () => {
    const mail = mailCatalog(Locale.FR).resetPassword({ url: RESET_URL, expiresInHours: 1 });
    expect(mail.text).toContain(RESET_URL);
    expect(mail.text).toContain(fr.resetPassword.ignore);
  });

  it("interpole la durée de validité qu'on lui donne, sans la réécrire", () => {
    const mail = mailCatalog(Locale.FR).resetPassword({ url: RESET_URL, expiresInHours: 6 });
    expect(mail.text).toContain("6 heures");
    expect(mail.html).toContain("6 heures");
  });

  // Le vrai piège du HTML : un `&` brut dans un href peut être relu comme le début d'une entité,
  // et le jeton arriverait tronqué — un lien qui ne marche « que parfois ».
  it("échappe l'esperluette de l'url dans le html, jamais dans le texte", () => {
    const mail = mailCatalog(Locale.FR).resetPassword({ url: RESET_URL, expiresInHours: 1 });
    expect(mail.html).toContain("token=abc123&amp;callbackURL");
    expect(mail.html).not.toContain("token=abc123&callbackURL");
    expect(mail.text).toContain("token=abc123&callbackURL");
  });

  // Une URL hostile ne doit pas pouvoir fermer l'attribut href et injecter du balisage.
  it("neutralise une url qui tenterait de sortir de son attribut", () => {
    const mail = mailCatalog(Locale.FR).resetPassword({
      url: 'https://x.fr/"><script>alert(1)</script>',
      expiresInHours: 1,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("mailCatalog — gabarits de notification", () => {
  const SETTINGS = "https://app.cimavia.fr/settings";

  // Le `Record<EmailableNotificationType, …>` l'impose déjà à la compilation. Ce test tient
  // l'autre bout : qu'aucun gabarit ne rende un sujet ou un corps vide, dans l'une ou l'autre
  // langue — une chaîne vide compile parfaitement.
  it.each([...EMAILABLE_NOTIFICATION_TYPES])("rend les deux langues pour %s", (type) => {
    for (const locale of [Locale.FR, Locale.EN]) {
      const mail = mailCatalog(locale).notification(type, {
        actorName: "Léa",
        subjectLabel: "Cycle force",
        settingsUrl: SETTINGS,
      });
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.text.length).toBeGreaterThan(0);
      expect(mail.html).toContain("</html>");
    }
  });

  /**
   * `actorName` et `subjectLabel` sont nullables (règle dure n°5). Le repli doit être une SECONDE
   * RÉDACTION, pas une interpolation vide : ce test refuse les guillemets vides et le mot
   * « null », les deux formes que prend une valeur manquante mal traitée.
   */
  it.each([
    ...EMAILABLE_NOTIFICATION_TYPES,
  ])("tourne une phrase complète sans acteur ni sujet pour %s", (type) => {
    for (const locale of [Locale.FR, Locale.EN]) {
      const mail = mailCatalog(locale).notification(type, {
        actorName: null,
        subjectLabel: null,
        settingsUrl: SETTINGS,
      });
      expect(mail.subject).not.toContain("null");
      expect(mail.text).not.toContain("null");
      expect(mail.text).not.toContain("«  »");
      expect(mail.text).not.toContain('""');
      expect(mail.subject).not.toMatch(/:\s*$/);
    }
  });

  it("porte le lien de réglages quand il est configuré", () => {
    const mail = mailCatalog(Locale.FR).notification(NotificationType.MESSAGE_RECEIVED, {
      actorName: "Léa",
      subjectLabel: null,
      settingsUrl: SETTINGS,
    });
    expect(mail.text).toContain(SETTINGS);
    expect(mail.html).toContain(`href="${SETTINGS}"`);
  });

  /**
   * Sans `WEB_URL`, le pied disparaît — mais le message part. Le rendu ne doit alors porter
   * AUCUN vestige : ni ancre vide, ni « si le lien ne fonctionne pas » sans lien dessous.
   */
  it("se rend proprement sans lien de réglages", () => {
    const strings = mailStringsFor(Locale.FR);
    const mail = mailCatalog(Locale.FR).notification(NotificationType.MESSAGE_RECEIVED, {
      actorName: "Léa",
      subjectLabel: null,
      settingsUrl: null,
    });
    expect(mail.html).not.toContain("<a href");
    expect(mail.text).not.toContain(strings.common.linkFallback);
    expect(mail.text).toContain(strings.common.signature);
  });

  // La conversation est une donnée de santé au sens du CDC : son contenu ne doit jamais transiter
  // par une boîte mail qu'on ne maîtrise pas. Le gabarit n'a d'ailleurs pas de quoi le faire —
  // `Notification` ne persiste pas le texte du message. Ce test fige l'invariant.
  it("ne peut pas divulguer le contenu d'un message", () => {
    const mail = mailCatalog(Locale.FR).notification(NotificationType.MESSAGE_RECEIVED, {
      actorName: "Léa",
      subjectLabel: "texte confidentiel du message",
      settingsUrl: null,
    });
    expect(mail.text).not.toContain("texte confidentiel");
    expect(mail.subject).not.toContain("texte confidentiel");
  });
});

describe("mailCatalog — gabarit d'invitation", () => {
  const PARAMS = { coachName: "Marc Keller", code: "7QK4M2XZ9", expiresInDays: 7 };

  /**
   * Le CODE est le contenu de ce message : sans lui, le destinataire n'a rien sur quoi agir. Il
   * doit donc figurer dans les deux corps — et le test le vérifie AUSSI sans lien, parce que
   * c'est le cas où il porte le message tout seul.
   */
  it("porte le code dans les deux corps, avec ou sans lien d'inscription", () => {
    const withLink = mailCatalog(Locale.FR).invitation({
      ...PARAMS,
      registerUrl: "https://app.cimavia.fr/register",
    });
    expect(withLink.text).toContain("7QK4M2XZ9");
    expect(withLink.html).toContain("7QK4M2XZ9");
    expect(withLink.html).toContain("https://app.cimavia.fr/register");

    const withoutLink = mailCatalog(Locale.FR).invitation({ ...PARAMS, registerUrl: null });
    expect(withoutLink.text).toContain("7QK4M2XZ9");
    expect(withoutLink.html).toContain("7QK4M2XZ9");
    expect(withoutLink.html).not.toContain("<a href");
  });

  /**
   * Le destinataire n'a AUCUN contexte — pas de compte, pas d'application, rien qui dise de qui
   * vient ce message. Le nom du coach est donc dans l'objet, et c'est ce qui distingue cet e-mail
   * d'un courrier non sollicité.
   */
  it("nomme l'inviteur dans l'objet, et se replie sans mentir quand le nom manque", () => {
    expect(mailCatalog(Locale.FR).invitation({ ...PARAMS, registerUrl: null }).subject).toContain(
      "Marc Keller",
    );
    const anonymous = mailCatalog(Locale.FR).invitation({
      ...PARAMS,
      coachName: null,
      registerUrl: null,
    });
    expect(anonymous.subject.length).toBeGreaterThan(0);
    expect(anonymous.subject).not.toContain("null");
    expect(anonymous.text).not.toContain("null");
  });

  // Comme la validité du lien de réinitialisation : la durée annoncée est celle qu'on reçoit,
  // jamais une valeur réécrite dans le gabarit.
  it("interpole la durée de validité qu'on lui donne, dans les deux langues", () => {
    expect(
      mailCatalog(Locale.FR).invitation({ ...PARAMS, expiresInDays: 3, registerUrl: null }).text,
    ).toContain("3 jours");
    expect(
      mailCatalog(Locale.EN).invitation({ ...PARAMS, expiresInDays: 3, registerUrl: null }).text,
    ).toContain("3 days");
    expect(fr.invitation.expiry(1)).toContain("une journée");
    expect(en.invitation.expiry(1)).toContain("one day");
  });

  /**
   * Le message part vers une adresse dont on ne sait RIEN — elle peut appartenir à quelqu'un qui
   * n'a jamais entendu parler du produit. Il doit donc dire comment l'ignorer, et surtout ne rien
   * révéler en retour : recevoir cet e-mail n'apprend à personne d'autre qu'on l'a reçu.
   */
  it("dit comment l'ignorer, dans les deux langues", () => {
    expect(fr.invitation.ignore.length).toBeGreaterThan(0);
    expect(en.invitation.ignore.length).toBeGreaterThan(0);
    expect(en.invitation.ignore).not.toBe(fr.invitation.ignore);
  });
});
