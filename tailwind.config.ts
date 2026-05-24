import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17201c",
        moss: "#315f52",
        mint: "#c8f2df",
        clay: "#b85d45",
        cloud: "#f6f8f5"
      },
      boxShadow: {
        panel: "0 14px 40px rgba(23, 32, 28, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
