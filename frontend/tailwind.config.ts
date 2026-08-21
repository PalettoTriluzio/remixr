import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0d10",
          panel: "#141820",
          card: "#1c222c",
          hover: "#242b37",
        },
        accent: {
          DEFAULT: "#7c5cff",
          hot: "#ff5c7c",
          cool: "#5cd4ff",
        },
        line: "#2a313d",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
