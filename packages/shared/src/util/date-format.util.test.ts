import { describe, expect, it } from "vitest";
import { formatIsoDateTime, formatRelativeOrDateTime, relativeTimeFrom } from "./date-format.util";

const NOW = new Date("2026-08-05T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("relativeTimeFrom", () => {
  it("rend « à l'instant » sous la minute", () => {
    expect(relativeTimeFrom(ago(0), NOW)).toEqual({ unit: "now", value: 0 });
    expect(relativeTimeFrom(ago(59_000), NOW)).toEqual({ unit: "now", value: 0 });
  });

  it("compte en minutes, puis en heures, puis en jours", () => {
    expect(relativeTimeFrom(ago(MINUTE), NOW)).toEqual({ unit: "minute", value: 1 });
    expect(relativeTimeFrom(ago(59 * MINUTE), NOW)).toEqual({ unit: "minute", value: 59 });
    expect(relativeTimeFrom(ago(HOUR), NOW)).toEqual({ unit: "hour", value: 1 });
    expect(relativeTimeFrom(ago(23 * HOUR), NOW)).toEqual({ unit: "hour", value: 23 });
    expect(relativeTimeFrom(ago(DAY), NOW)).toEqual({ unit: "day", value: 1 });
  });

  it("tronque plutôt que d'arrondir : 90 min, c'est « il y a 1 h », pas 2", () => {
    expect(relativeTimeFrom(ago(90 * MINUTE), NOW)).toEqual({ unit: "hour", value: 1 });
  });

  it("rend la main au-delà d'une semaine — une date absolue informe alors davantage", () => {
    expect(relativeTimeFrom(ago(WEEK), NOW)).toEqual({ unit: "day", value: 7 });
    expect(relativeTimeFrom(ago(WEEK + DAY), NOW)).toBeNull();
  });

  it("rend null sur un instant illisible ou une horloge en avance", () => {
    expect(relativeTimeFrom("pas-une-date", NOW)).toBeNull();
    expect(relativeTimeFrom(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBeNull();
  });
});

describe("formatRelativeOrDateTime", () => {
  // Faux traducteur : on vérifie QUELLE clé et QUEL compte sont demandés — c'est le contrat avec
  // les fichiers i18n des apps. Le libellé lui-même ne vit pas ici.
  const translate = (key: string, params: { count: number }) => `${key}#${params.count}`;

  it("demande la clé et le compte de l'unité choisie", () => {
    expect(formatRelativeOrDateTime(ago(3 * HOUR), NOW, "fr", translate)).toBe(
      "common.relativeTime.hour#3",
    );
    expect(formatRelativeOrDateTime(ago(0), NOW, "fr", translate)).toBe(
      "common.relativeTime.now#0",
    );
  });

  // Au-delà de la semaine il n'y a plus de forme relative pertinente : on bascule sur la date
  // absolue, dans la locale demandée — et le traducteur n'est alors pas sollicité du tout.
  it("bascule sur la date complète au-delà d'une semaine", () => {
    const old = ago(WEEK + DAY);
    const rendered = formatRelativeOrDateTime(old, NOW, "fr", translate);

    expect(rendered).not.toContain("common.relativeTime");
    expect(rendered).toBe(formatIsoDateTime(old, "fr"));
  });

  it("suit la locale pour la forme absolue", () => {
    const old = ago(WEEK + DAY);
    expect(formatRelativeOrDateTime(old, NOW, "en", translate)).toBe(formatIsoDateTime(old, "en"));
  });
});
