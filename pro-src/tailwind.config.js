/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // CSS vars so Settings brand picker re-themes; <alpha-value> keeps brand/20 etc.
        brand: {
          DEFAULT: "color-mix(in srgb, var(--brand, #0c4a6e) calc(<alpha-value> * 100%), transparent)",
          dark: "color-mix(in srgb, var(--brand-dark, #082f49) calc(<alpha-value> * 100%), transparent)",
          soft: "color-mix(in srgb, var(--brand-soft, #e0f2fe) calc(<alpha-value> * 100%), transparent)",
        },
        accent: {
          DEFAULT: "#d97706", // Warm amber accent
          soft: "#fffbeb",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};