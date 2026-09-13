/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1F33",
        navy: "#0F2942",
        marine: "#0F4C81",
        marineLight: "#3E7CB1",
        sand: "#F8F6F0",
        cream: "#F6F3EC",
        coral: "#E4572E",
        moss: "#2E7D5B",
        emerald: "#166534",
        amber: "#D97706",
        crimson: "#DC2626",
        slate: "#5B6B79",
        cardBorder: "rgba(11, 31, 51, 0.08)",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
        '3xl': "1.5rem",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(11, 31, 51, 0.05)",
        card: "0 2px 12px -1px rgba(11, 31, 51, 0.04), 0 1px 3px rgba(11, 31, 51, 0.02)",
        glow: "0 0 25px -5px rgba(228, 87, 46, 0.3)",
      },
    },
  },
  plugins: [],
};
