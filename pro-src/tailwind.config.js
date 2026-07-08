/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0c4a6e", // Sky navy — no purple
          dark: "#082f49",
          soft: "#e0f2fe",
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