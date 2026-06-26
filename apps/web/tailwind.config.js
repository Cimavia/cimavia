// @ts-check
import cmvPreset from "@cmv/tokens/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [cmvPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
