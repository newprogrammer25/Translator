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
        canvas: {
          950: "#070512",
          900: "#0c0a1c",
          800: "#15122a",
          700: "#1d1936",
          600: "#2a2447",
        },
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
        display: ['"Inter Tight"', "Inter", "system-ui", "ui-sans-serif", "sans-serif"],
        sans: ["Inter", "system-ui", "ui-sans-serif", "Segoe UI", "Roboto", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      backgroundImage: {
        "brand-grad": "linear-gradient(135deg, #14b8a6 0%, #2dd4bf 30%, #8b5cf6 100%)",
        "brand-grad-hover": "linear-gradient(135deg, #0d9488 0%, #14b8a6 30%, #7c3aed 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 12px 40px -16px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        "glow-teal": "0 16px 50px -20px rgba(20,184,166,0.5), 0 0 0 1px rgba(20,184,166,0.15)",
        "glow-violet": "0 16px 50px -20px rgba(139,92,246,0.5), 0 0 0 1px rgba(139,92,246,0.15)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.32, 0.72, 0, 1)",
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "fade-up": "fadeUp 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        "fade-down": "fadeDown 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        "scale-in": "scaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        "slide-up": "slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-soft": "pulseSoft 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shine": "shine 2.4s linear infinite",
        "blob": "blob 14s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        shine: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        blob: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(4px,-6px,0) scale(1.03)" },
          "66%": { transform: "translate3d(-3px,4px,0) scale(0.97)" },
        },
      },
    },
  },
  plugins: [],
};
