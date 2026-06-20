/** @type {import('tailwindcss').Config} */
// Fable+ design tokens — sourced directly from the UI/UX Design Brief (teal / off-white / near-black).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: {
          50: "#EEF3F4",
          100: "#D8E5E8",
          200: "#B9D0D5",
          300: "#93B5BD",
          400: "#759EA8",
          500: "#5E8B96", // BRAND — the logo teal
          600: "#4E7A85",
          700: "#3C6A75", // white-text-safe (AA)
          800: "#2E535C",
          900: "#213C43",
        },
        canvas: "#F2F4F4", // off-white app background
        ink: "#1A1A1A", // warm near-black primary text
        grey: {
          100: "#E8EAEB",
          200: "#D5D8D9",
          400: "#9CA3A6",
          500: "#6B7280",
          700: "#3A3F42",
        },
        success: "#2E9E6B",
        warning: "#E0A11B",
        error: "#D64545",
        // --- per-section accents (muted to sit beside the teal brand) -----------
        // Each major area of the app gets one of these so you can tell at a glance
        // where you are. Used by src/lib/sections.ts (nav active state + headers).
        sky: { 50: "#EAF1FA", 100: "#D2E2F4", 600: "#3B6FB0", 700: "#305C93", 800: "#264A76" }, // Search
        amber: { 50: "#FBF3E2", 100: "#F5E4BE", 600: "#C8841B", 700: "#A66C14", 800: "#855610" }, // Bookings
        plum: { 50: "#F2EDF6", 100: "#E2D6EC", 600: "#7A5A91", 700: "#654A78", 800: "#503B5F" }, // Profile
        emerald: { 50: "#E7F5EE", 100: "#C7E8D6", 600: "#2E9E6B", 700: "#257F56", 800: "#1D6444" }, // Provider dashboard
        slate: { 50: "#EDF0F1", 100: "#D8DEE0", 600: "#5B6B73", 700: "#49565C", 800: "#374247" }, // Garage / vehicle
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        btn: "14px",
        input: "12px",
        sheet: "24px",
        img: "16px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(26,26,26,0.06)",
        float: "0 6px 24px rgba(26,26,26,0.10)",
        nav: "0 -2px 16px rgba(26,26,26,0.06)",
      },
      backgroundImage: {
        // signature teal gradient (Teal-400 → Teal-700, diagonal)
        "teal-gradient": "linear-gradient(135deg, #759EA8 0%, #3C6A75 100%)",
      },
      maxWidth: {
        app: "448px",
      },
      keyframes: {
        sheen: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        sheen: "sheen 1.4s ease-in-out infinite",
        "fade-up": "fade-up 260ms ease-out both",
      },
    },
  },
  plugins: [],
};
