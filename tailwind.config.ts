import type { Config } from "tailwindcss";

// Palette from the GMD Bakery logo: logo green and white, with gold as a
// small accent. Gold is only a fill behind dark text (never text on white).
// Amber and red stay for warnings/errors. Text pairings pass WCAG AA.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#13261B",
        surface: "#F3F8F4",
        line: "#D8E6DC",
        muted: "#587062",
        brand: { DEFAULT: "#096B38", dark: "#06502A", light: "#E6F2EB" },
        gold: "#F3C430",
        leaf: "#06502A",
        amber: "#935705",
        danger: "#B3261E",
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "sans-serif"],
      },
      borderRadius: { tile: "18px" },
    },
  },
  plugins: [],
} satisfies Config;
