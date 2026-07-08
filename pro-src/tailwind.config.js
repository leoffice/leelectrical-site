/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1e4a8c", // LE logo blue — --brand
          dark: "#163a6e",
          soft: "#e8f0fa",
        },
        accent: {
          DEFAULT: "#c8102e", // LE logo red accent — --accent
          soft: "#fde8ec",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
