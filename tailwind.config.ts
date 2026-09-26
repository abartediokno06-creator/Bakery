import type { Config } from "tailwindcss";

// Palette: ube purple as the brand accent (a Filipino bakery staple),
// with cool neutrals so product tiles and numbers stay the focus.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#221A2E",
        surface: "#F6F5F9",
        line: "#E3E0EA",
        muted: "#6E6680",
        ube: { DEFAULT: "#6C3FA3", dark: "#52307D", light: "#EDE5F7" },
        leaf: "#2F7D4F",
        amber: "#B8730F",
        danger: "#B3261E",
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "sans-serif"],
      },
      borderRadius: { tile: "14px" },
    },
  },
  plugins: [],
} satisfies Config;
