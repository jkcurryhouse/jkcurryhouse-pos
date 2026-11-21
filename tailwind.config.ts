import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ivory: "#FAF6EC",
        cardamom: "#1C1812",
        // JK Curryhouse brand — black & gold, taken from the signage and monogram.
        gold: {
          DEFAULT: "#C9A14A",
          dark: "#8A6516", // text-safe on ivory/white (≥4.9:1)
          light: "#E7C77A", // text-safe on charcoal/onyx
        },
        onyx: {
          DEFAULT: "#16130E", // primary actions, active nav, top bar
          dark: "#0B0907",
          light: "#2E2820",
        },
        // Success / ready / online states (kept green so they read at a glance).
        jade: {
          DEFAULT: "#2F6B4A",
          dark: "#1F5138",
          light: "#6FB98F",
        },
        chili: {
          DEFAULT: "#AE3428",
          dark: "#7E241B",
          light: "#D65C4C",
        },
        ticket: "#F1E9D8",
        charcoal: {
          DEFAULT: "#15130F",
          light: "#221E17",
          lighter: "#2E2820",
        },
      },
      fontFamily: {
        display: [
          "Iowan Old Style",
          "Palatino Linotype",
          "URW Palladio L",
          "P052",
          "serif",
        ],
        body: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        ticket: "0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(28,24,18,0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
