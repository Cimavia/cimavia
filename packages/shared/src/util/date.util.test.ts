import { isMainThread } from "node:worker_threads";
import { describe, expect, it, vi } from "vitest";
import {
  dateToIsoDate,
  daysBetweenIsoDates,
  isIsoDate,
  isMondayIsoDate,
  isoDateOfInstant,
  isoDateToDate,
  mondayOfIsoWeek,
  shiftDate,
  shiftIsoDate,
  startOfIsoDateIn,
  todayIsoDate,
  todayIsoDateIn,
} from "./date.util";

// 2026-10-12 est un lundi (référence de tous les cas ci-dessous).
const MONDAY = "2026-10-12";

describe("isIsoDate", () => {
  it("refuse un format non ISO et une date inexistante", () => {
    expect(isIsoDate(MONDAY)).toBe(true);
    expect(isIsoDate("12/10/2026")).toBe(false);
    // Date.parse REPORTE le 31 février au 3 mars au lieu de le refuser : le piège est ici.
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });
});

describe("shiftIsoDate", () => {
  it("décale d'un nombre de jours, y compris en changeant de mois", () => {
    expect(shiftIsoDate(MONDAY, 7)).toBe("2026-10-19");
    expect(shiftIsoDate("2026-10-30", 3)).toBe("2026-11-02");
    expect(shiftIsoDate(MONDAY, -12)).toBe("2026-09-30");
  });

  it("traverse un changement d'heure sans dériver (calcul en UTC)", () => {
    // Passage à l'heure d'hiver en Europe : 2026-10-25. Un décalage naïf en heure locale
    // ferait tomber ce lundi+14 sur un dimanche.
    expect(shiftIsoDate(MONDAY, 14)).toBe("2026-10-26");
    expect(isMondayIsoDate("2026-10-26")).toBe(true);
  });

  it("retourne null sur une date invalide ou un décalage non entier", () => {
    expect(shiftIsoDate("2026-02-31", 1)).toBeNull();
    expect(shiftIsoDate("12/10/2026", 1)).toBeNull();
    expect(shiftIsoDate(MONDAY, 1.5)).toBeNull();
  });
});

describe("daysBetweenIsoDates", () => {
  it("compte les jours, négatif si la cible précède l'origine", () => {
    expect(daysBetweenIsoDates(MONDAY, "2026-10-19")).toBe(7);
    expect(daysBetweenIsoDates("2026-10-19", MONDAY)).toBe(-7);
    expect(daysBetweenIsoDates(MONDAY, MONDAY)).toBe(0);
  });

  it("retourne null sur une date invalide", () => {
    expect(daysBetweenIsoDates(MONDAY, "pas-une-date")).toBeNull();
  });
});

describe("isMondayIsoDate", () => {
  it("ne reconnaît que le lundi", () => {
    expect(isMondayIsoDate(MONDAY)).toBe(true);
    expect(isMondayIsoDate("2026-10-13")).toBe(false);
    expect(isMondayIsoDate("2026-10-18")).toBe(false); // dimanche
  });

  it("est faux (jamais null) sur une entrée invalide", () => {
    expect(isMondayIsoDate("2026-13-01")).toBe(false);
  });
});

describe("mondayOfIsoWeek", () => {
  it("remonte au lundi de la semaine (lundi → lui-même, dimanche → 6 jours en arrière)", () => {
    expect(mondayOfIsoWeek(MONDAY)).toBe(MONDAY);
    expect(mondayOfIsoWeek("2026-10-15")).toBe(MONDAY); // jeudi
    expect(mondayOfIsoWeek("2026-10-18")).toBe(MONDAY); // dimanche — le piège du getUTCDay() = 0
  });

  it("retourne null sur une date invalide", () => {
    expect(mondayOfIsoWeek("2026-02-31")).toBeNull();
  });
});

describe("pont Date ↔ date civile", () => {
  /**
   * Une colonne `@db.Date` arrive en `Date` à minuit UTC. La lire en heure locale ferait reculer
   * d'un jour tout utilisateur à l'ouest de Greenwich : le pont passe toujours par l'UTC.
   */
  it("fait l'aller-retour sans dériver d'un jour", () => {
    const date = isoDateToDate(MONDAY);
    expect(date?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(date == null ? null : dateToIsoDate(date)).toBe(MONDAY);
  });

  it("lit la date civile UTC d'un instant, quelle que soit son heure", () => {
    expect(dateToIsoDate(new Date("2026-10-12T23:59:59Z"))).toBe(MONDAY);
  });
});

describe("shiftDate", () => {
  // Par la date civile : un passage à l'heure d'hiver (25 octobre) ne décale pas d'une heure.
  it("décale d'un nombre de jours en traversant un changement d'heure", () => {
    const monday = new Date("2026-10-19T00:00:00Z");
    expect(shiftDate(monday, 7)?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(shiftDate(monday, -7)?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("refuse un décalage qui n'est pas un nombre entier de jours", () => {
    expect(shiftDate(new Date("2026-10-19T00:00:00Z"), 1.5)).toBeNull();
  });
});

/**
 * Les tests tournent à Paris (`vitest.config.ts`, #382) : c'est ce qui rend l'écart UTC observable.
 * Le lundi 14/09/2026 à 0 h 30 à Paris est encore le dimanche 13 à 22 h 30 UTC — le cas de #321.
 */
const MONDAY_0030_PARIS = new Date("2026-09-13T22:30:00Z");

function at<T>(now: Date, read: () => T): T {
  vi.useFakeTimers({ now });
  try {
    return read();
  } finally {
    vi.useRealTimers();
  }
}

describe("todayIsoDate", () => {
  it("rend le jour de l'appareil, pas le jour UTC, juste après minuit", () => {
    expect(at(MONDAY_0030_PARIS, todayIsoDate)).toBe("2026-09-14");
  });

  /**
   * L'autre sens de l'écart : à l'ouest d'UTC, le jour UTC change dès le soir.
   *
   * Changer `TZ` en cours de route n'agit que dans un process : un worker thread garde le fuseau du
   * process qui l'a lancé. Le mutation testing impose des threads (#626) — le test y mentirait, il
   * n'y tourne pas. Sous `pnpm test`, il s'exécute dans un fork, où il mord.
   */
  it.skipIf(!isMainThread)(
    "rend encore la veille aux Antilles quand UTC est déjà passé au lendemain",
    () => {
      const parisTz = process.env.TZ;
      process.env.TZ = "America/Martinique";
      try {
        expect(at(new Date("2026-09-14T01:00:00Z"), todayIsoDate)).toBe("2026-09-13");
      } finally {
        process.env.TZ = parisTz;
      }
    },
  );
});

describe("isoDateOfInstant", () => {
  it("rend le jour de l'appareil où tombe l'instant, pas ses dix premiers caractères", () => {
    expect(isoDateOfInstant("2026-09-13T22:30:00.000Z")).toBe("2026-09-14");
    expect(isoDateOfInstant("2026-09-13T21:59:59.999Z")).toBe("2026-09-13");
  });

  it("rend null sur un instant illisible", () => {
    expect(isoDateOfInstant("hier")).toBeNull();
    expect(isoDateOfInstant("")).toBeNull();
  });
});

describe("todayIsoDateIn", () => {
  it("rend le jour du fuseau nommé, quel que soit celui de l'appareil", () => {
    expect(at(MONDAY_0030_PARIS, () => todayIsoDateIn("Europe/Paris"))).toBe("2026-09-14");
    expect(at(MONDAY_0030_PARIS, () => todayIsoDateIn("UTC"))).toBe("2026-09-13");
    expect(at(MONDAY_0030_PARIS, () => todayIsoDateIn("America/Martinique"))).toBe("2026-09-13");
  });

  it("rend null sur un fuseau inconnu", () => {
    expect(todayIsoDateIn("Europe/Atlantide")).toBeNull();
  });
});

describe("startOfIsoDateIn", () => {
  it("rend minuit à l'heure du fuseau, en été comme en hiver", () => {
    expect(startOfIsoDateIn("2026-10-05", "Europe/Paris")?.toISOString()).toBe(
      "2026-10-04T22:00:00.000Z",
    );
    expect(startOfIsoDateIn("2026-01-05", "Europe/Paris")?.toISOString()).toBe(
      "2026-01-04T23:00:00.000Z",
    );
    expect(startOfIsoDateIn("2026-10-05", "America/Martinique")?.toISOString()).toBe(
      "2026-10-05T04:00:00.000Z",
    );
    expect(startOfIsoDateIn("2026-10-05", "UTC")?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  /**
   * Les jours de changement d'heure : minuit UTC n'a pas le même décalage que minuit à Paris. Le
   * 29 mars, minuit est encore en heure d'hiver alors que minuit UTC tombe déjà en heure d'été.
   */
  it("tient les jours de changement d'heure", () => {
    expect(startOfIsoDateIn("2026-03-29", "Europe/Paris")?.toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(startOfIsoDateIn("2026-10-25", "Europe/Paris")?.toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });

  // Au Chili, l'heure d'été commence À minuit : ce jour-là, 00:00 n'existe pas, le jour commence à 1 h.
  it("commence le jour à 1 h là où minuit n'existe pas", () => {
    expect(startOfIsoDateIn("2026-09-06", "America/Santiago")?.toISOString()).toBe(
      "2026-09-06T04:00:00.000Z",
    );
  });

  it("rend null sur un jour que le fuseau a sauté", () => {
    expect(startOfIsoDateIn("2011-12-30", "Pacific/Apia")).toBeNull();
  });

  it("rend null sur une date illisible ou un fuseau inconnu", () => {
    expect(startOfIsoDateIn("2026-02-31", "Europe/Paris")).toBeNull();
    expect(startOfIsoDateIn("2026-10-05", "Europe/Atlantide")).toBeNull();
  });
});
