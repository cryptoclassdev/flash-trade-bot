import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: {
          DEFAULT: "#0a0a0a",
          raised: "#141414",
          hover: "#1c1c1c",
        },
        border: {
          DEFAULT: "#262626",
          strong: "#3a3a3a",
        },
        fg: {
          DEFAULT: "#ededed",
          muted: "#a1a1a1",
          subtle: "#6b6b6b",
        },
        accent: {
          DEFAULT: "#14f195",
          hover: "#10c578",
        },
        danger: "#ef4444",
        warning: "#f59e0b",
      },
    },
  },
  plugins: [],
};

export default config;
