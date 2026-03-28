import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // TitanCrew Brand
        "trade-navy": {
          DEFAULT: "#1A2744",
          50: "#E8EBF2",
          100: "#C5CCDF",
          200: "#9FADC9",
          300: "#798EB3",
          400: "#5B74A3",
          500: "#3D5A93",
          600: "#2E4478",
          700: "#1A2744",
          800: "#111A2E",
          900: "#080D17",
        },
        "safety-orange": {
          DEFAULT: "#FF6B00",
          50: "#FFF3E8",
          100: "#FFE0C2",
          200: "#FFCB99",
          300: "#FFB570",
          400: "#FFA247",
          500: "#FF8F1F",
          600: "#FF6B00",
          700: "#CC5500",
          800: "#994000",
          900: "#662B00",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "agent-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.15)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "agent-pulse": "agent-pulse 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "fade-in-up": "fade-in-up 0.4s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
      backgroundImage: {
        "navy-gradient": "linear-gradient(135deg, #1A2744 0%, #2E4478 100%)",
        "orange-gradient": "linear-gradient(135deg, #FF6B00 0%, #FF8F1F 100%)",
        "hero-gradient": "linear-gradient(135deg, #1A2744 0%, #0F1A30 60%, #FF6B00 200%)",
      },
      boxShadow: {
        "orange-glow": "0 0 20px rgba(255, 107, 0, 0.35)",
        "navy-glow": "0 0 20px rgba(26, 39, 68, 0.5)",
        card: "0 4px 24px rgba(26, 39, 68, 0.08)",
        "card-hover": "0 8px 32px rgba(26, 39, 68, 0.15)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
