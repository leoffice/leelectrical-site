/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4f46e5", // Sleek indigo — --brand
          dark: "#4338ca",
          soft: "#eef2ff",
        },
        accent: {
          DEFAULT: "#7c3aed", // Sleek violet — --accent
          soft: "#f5f3ff",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
