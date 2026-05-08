/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        // Deep aubergine canvas — warmer than slate, no "dashboard" feel.
        canvas: {
          950: "#070512",
          900: "#0c0a1c",
          800: "#15122a",
          700: "#1d1936",
          600: "#2a2447",
        },
        // Cool teal accent (no neon), pairs with violet for the brand gradient.
        teal: {
          200: "#a7f3e1",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
        },
        violet: {
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
        // Keep ink namespace for legacy refs.
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        // Backwards-compat for any "brand-*" classes still in legacy code.
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
        },
      },
      fontFamily: {
        display: [
          '"Inter Tight"',
          "Inter",
          "system-ui",
          "ui-sans-serif",
          "Segoe UI",
          "sans-serif",
        ],
        sans: [
          "Inter",
          "system-ui",
          "ui-sans-serif",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      backgroundImage: {
        "edge-light":
          "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 60%)",
        "aurora":
          "radial-gradient(at 18% 0%, rgba(139,92,246,0.18) 0%, transparent 55%), radial-gradient(at 82% 0%, rgba(20,184,166,0.14) 0%, transparent 55%), radial-gradient(at 50% 110%, rgba(124,58,237,0.10) 0%, transparent 60%)",
        "brand-grad":
          "linear-gradient(135deg, #14b8a6 0%, #2dd4bf 35%, #8b5cf6 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 12px 40px -16px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
        "glow-teal":
          "0 18px 60px -24px rgba(20,184,166,0.55), 0 0 0 1px rgba(20,184,166,0.18)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      animation: {
        "pulse-soft": "pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 180ms ease-out",
        "fade-up": "fadeUp 240ms cubic-bezier(0.32, 0.72, 0, 1)",
        "shine": "shine 2.4s linear infinite",
        "blob": "blob 14s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shine: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        blob: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(0,-8px,0) scale(1.04)" },
        },
      },
    },
  },
  plugins: [],
};
