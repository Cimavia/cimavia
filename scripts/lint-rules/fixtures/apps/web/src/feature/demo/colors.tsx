export const six = "#1a2b3c"; // ✗ noHardcodedColor
export const eight = "#1a2b3c80"; // ✗ noHardcodedColor
export const three = "#fff"; // ✗ noHardcodedColor
export const four = '#ffff'; // ✗ noHardcodedColor
export const inTemplate = `border ${six} #abcdef`; // ✗ noHardcodedColor
export const tailwind = <div className="bg-[#ff0000]" />; // ✗ noHardcodedColor
export const tailwindShort = "text-[#abc]"; // ✗ noHardcodedColor

// Un renvoi d'issue n'est pas une couleur : 3 ou 4 chiffres ailleurs que seuls ou entre crochets.
export const issue = "tranché en #602 et #1234";
// Une ancre d'url non plus : le # y est collé à un mot.
export const anchor = "https://exemple.fr/doc#facade";
export const token = <div className="bg-cmv-accent" />;
