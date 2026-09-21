const forms = require("@tailwindcss/forms");
const containerQueries = require("@tailwindcss/container-queries");

module.exports = {
  content: {
    relative: true,
    files: [
      "./**/*.{html,js,mjs,jsx}",
      "../src/**/*.{js,mjs,jsx}",
    ],
  },
  theme: {
    extend: {
      colors: {
        "primary-dim": "#53534d",
        background: "#fafaf5",
        primary: "#5f5f59",
        secondary: "#6d5f07",
        surface: "#fafaf5",
        "surface-container": "#ecefe7",
        "surface-container-low": "#f3f4ee",
        "surface-container-lowest": "#ffffff",
        "inverse-surface": "#0d0f0c",
        "on-primary": "#faf8f0",
        "on-surface": "#2e342d",
        "on-surface-variant": "#5b6159",
        "outline-variant": "#aeb4aa",
        midnight: "#121414",
        obsidian: "#0d0e0f",
        glass: "#1a1c1c",
        glassHigh: "#282a2b",
        line: "#46464c",
        mist: "#c7c6cc",
        starlight: "#e2e2e2",
        gold: "#e9c349",
        purple: "#d3bcf9",
        blush: "#ffb4ab",
      },
      fontFamily: {
        notoSerif: ["Noto Serif", "serif"],
        manrope: ["Manrope", "sans-serif"],
        notoSansJP: ["Noto Sans JP", "sans-serif"],
        serif: ["Playfair Display", "serif"],
        sans: ["Manrope", "Noto Sans JP", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [forms, containerQueries],
};
