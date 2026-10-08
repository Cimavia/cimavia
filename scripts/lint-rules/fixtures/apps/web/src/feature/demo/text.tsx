declare function t(key: string): string;
declare const n: number;
declare const done: boolean;
declare const status: string;

export const child = <p>Bonjour</p>; // ✗ noHardcodedText
export const literalChild = <p>{"Bonjour"}</p>; // ✗ noHardcodedText
export const templateChild = <p>{`${n} km`}</p>; // ✗ noHardcodedText
export const ternary = <p>{done ? "Oui" : t("demo.no")}</p>; // ✗ noHardcodedText
export const and = <p>{done && "Terminé"}</p>; // ✗ noHardcodedText
export const concat = <p>{"Séance " + n}</p>; // ✗ noHardcodedText
export const placeholder = <input placeholder="Ton e-mail" />; // ✗ noHardcodedText
export const title = <div title="Séance" />; // ✗ noHardcodedText
export const ariaLabel = <button type="button" aria-label={"Fermer"} />; // ✗ noHardcodedText
export const alt = <img src="a.png" alt="Photo" />; // ✗ noHardcodedText
export const label = <Field label={`Exercice ${n}`} />; // ✗ noHardcodedText
export const ternaryAttribute = <div title={done ? t("demo.done") : "En cours"} />; // ✗ noHardcodedText

// Ce qui n'est pas du texte : glyphes, entités, nombres, ponctuation, clés passées à t(),
// conditions, classes et attributs techniques.
export const glyphs = <p>— · + ✓ 1. {n}</p>;
export const entity = <p>&nbsp;&mdash;</p>;
export const translated = <p title={t("demo.title")}>{t("demo.body")}</p>;
export const chosenKey = <p>{t(done ? "demo.done" : "demo.todo")}</p>;
export const condition = <p>{status === "DONE" ? t("demo.done") : t("demo.todo")}</p>;
export const classes = <p className={done ? "flex" : "hidden"}>{n}</p>;
export const composed = <Field label={`${t("demo.move")} ${n + 1}`} />;
export const arrow = <Field label="←" />;
export const technical = <div className="flex" data-testid="demo-row" aria-labelledby="demo" />;
export const emptyAlt = <img src="a.png" alt="" />;

// Une exception se déclare, avec sa raison ; elle n'est alors plus signalée.
export const declared = (
  <p>
    {/* biome-ignore lint/plugin/noHardcodedText: glyphe de démonstration */}
    <b>B</b>
  </p>
);

function Field(_: { label: string }) {
  return null;
}
