export const error = <p className="text-cmv-caption text-cmv-error"/>; // ✗ noStateColorAsText
export const link = <a className="text-cmv-accent hover:underline"/>; // ✗ noStateColorAsText
export const hover = "text-cmv-text-hi hover:text-cmv-accent"; // ✗ noStateColorAsText
export const last = "text-cmv-success"; // ✗ noStateColorAsText
export const inTemplate = `shrink-0 text-cmv-info ${link}`; // ✗ noStateColorAsText
export const warning = <span className="text-cmv-warning" />; // ✗ noStateColorAsText

// La nuance prévue pour le texte, les aplats et les bordures restent libres.
export const on = <p className="text-cmv-error-on"/>;
export const accentHi = "text-cmv-accent-hi";
export const fill = <span className="bg-cmv-accent border-cmv-error text-cmv-text-hi" />;
export const soft = "bg-cmv-error-soft text-cmv-error-on";
