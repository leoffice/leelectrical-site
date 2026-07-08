/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1a365d", // BLZ navy — --brand
          dark: "#153050",
          soft: "#ebf4ff",
        },
        accent: {
          DEFAULT: "#2c5282", // BLZ blue — --accent
          soft: "#e6f0fa",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
