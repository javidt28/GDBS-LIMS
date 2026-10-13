import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1a1a",
        muted: "#5c5c5c",
        line: "#e4e4e4",
        paper: "#ffffff",
        wash: "#f6f6f5",
        danger: "#8f2d2d",
        warning: "#8a5a12",
        success: "#1f6b45",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: {
        institutional: "2px",
      },
      boxShadow: {
        lift: "0 1px 2px rgba(26, 26, 26, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
