// @ts-check
const cmvPreset = require("@cmv/tokens/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [cmvPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
