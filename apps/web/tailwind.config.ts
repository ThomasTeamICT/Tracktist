import type { Config } from "tailwindcss";

/**
 * Tracktist visual direction (brief §12): modern, musical, not busy. Dark
 * interface with a violet→magenta accent and a teal "radar" glow; calm,
 * confident typography; the globe as hero element.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#07070c",
          soft: "#0d0d16",
          card: "#12121d",
          elevated: "#171724",
        },
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#9d86ff",
          deep: "#5b3df0",
          contrast: "#07070c",
        },
        magenta: "#c65cff",
        glow: "#19e6c8",
        pink: "#ff5c8a",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(124,92,255,0.55)",
        "glow-lg": "0 0 48px -6px rgba(124,92,255,0.6)",
        "glow-teal": "0 0 20px -2px rgba(25,230,200,0.65)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      backgroundImage: {
        "mesh":
          "radial-gradient(60% 50% at 15% 0%, rgba(124,92,255,0.18), transparent 60%), radial-gradient(50% 50% at 100% 10%, rgba(198,92,255,0.14), transparent 55%), radial-gradient(40% 40% at 70% 100%, rgba(25,230,200,0.10), transparent 60%)",
        "accent-grad": "linear-gradient(135deg, #7c5cff 0%, #c65cff 100%)",
        "accent-grad-soft": "linear-gradient(135deg, rgba(124,92,255,0.18), rgba(198,92,255,0.12))",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.7)", opacity: "0.7" },
          "80%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2.4s ease-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
