import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          '"Outfit"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
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
        link: {
          DEFAULT: "var(--link)",
          hover: "var(--link-hover)",
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
      },
    },
  },
  plugins: [],
};
export default config;
