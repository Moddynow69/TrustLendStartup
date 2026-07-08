import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          200: "#b8ccff",
          300: "#8aa9ff",
          400: "#5c7eff",
          500: "#3555f2",
          600: "#233fcc",
          700: "#1b31a3",
          800: "#182a7f",
          900: "#162564",
        },
        ink: {
          900: "#0b0f19",
          800: "#141a2b",
          700: "#1f2740",
          600: "#2e3a5c",
          400: "#657199",
          300: "#94a0c4",
          100: "#e7eaf5",
          50: "#f5f7fc",
        },
        status: {
          red: "#dc4b4b",
          yellow: "#e0a626",
          green: "#2fa86a",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
