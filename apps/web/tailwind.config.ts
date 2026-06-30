import type { Config } from "tailwindcss";

/**
 * Tracktist visual direction (brief §12): modern, musical, not busy. Dark
 * interface with subtle accents, calm typography, accessible.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0f",
          soft: "#12121a",
          card: "#16161f",
        },
        border: "#26263300",
        accent: {
          DEFAULT: "#7c5cff", // violet — "musical" accent
          soft: "#9d86ff",
          contrast: "#0a0a0f",
        },
        glow: "#19e6c8", // teal globe-marker glow
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px -2px rgba(124,92,255,0.5)",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
