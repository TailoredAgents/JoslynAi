import type { Config } from "tailwindcss";

const config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./types/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b"
        },
        blush: {
          50: "#fff7f5",
          100: "#ffeceb",
          200: "#ffd4d3",
          300: "#ffb3b0",
          400: "#ff8a85",
          500: "#ff6b68",
          600: "#f9544f",
          700: "#d53a36",
          800: "#ae332f",
          900: "#8d2b28"
        }
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      },
      boxShadow: {
        uplift: "0 18px 40px -22px rgba(99, 102, 241, 0.45)"
      },
      backgroundImage: {
        "radiant-glow": "radial-gradient(circle at top, rgba(99,102,241,0.18), transparent 55%)"
      }
    }
  },
  plugins: []
} satisfies Config;

export default config;

