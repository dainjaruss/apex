/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"Courier Prime"',
          "Courier",
          "monospace"
        ]
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        navy: {
          50: "#f0f4f8",
          100: "#dbe3ef",
          200: "#bcccdb",
          300: "#91aec9",
          400: "#608bb3",
          500: "#3e6e99",
          600: "#2e567d",
          700: "#264666",
          800: "#223b55",
          900: "#1f3347",
          950: "#142131",
        },
        gold: {
          400: "#facc15",
          500: "#eab308",
          600: "#ca8a04",
        }
      },
    },
  },
  plugins: [],
}
