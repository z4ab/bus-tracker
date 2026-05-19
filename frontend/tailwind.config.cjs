module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1e40af",
        secondary: "#7c3aed",
      },
      animation: {
        "spin-slow": "spin 1s linear infinite",
      },
    },
  },
  plugins: [],
};
