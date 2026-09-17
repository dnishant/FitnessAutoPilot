/**
 * Lightweight consumer design tokens.
 * Keep screens on these values — avoid one-off hex sprawl.
 */

export const colors = {
  background: "#F6F3EE",
  backgroundElevated: "#FFFcf7",
  surface: "#FFFFFF",
  surfaceMuted: "#EFEBE3",
  surfaceDark: "#1A2E26",
  border: "#D9D2C5",
  borderStrong: "#C4BAA8",
  text: "#14231C",
  textSecondary: "#4A5C52",
  textMuted: "#6F7F75",
  textOnDark: "#F6F3EE",
  textOnDarkMuted: "#B7C6BC",
  primary: "#1F6F4A",
  primaryPressed: "#175538",
  primarySoft: "#E3F0E8",
  accent: "#C45C26",
  accentSoft: "#F7E8DF",
  success: "#1F6F4A",
  warning: "#A56A1B",
  error: "#9B2C2C",
  errorSoft: "#F8E8E8",
  skeleton: "#E4DFD6",
  overlay: "rgba(20, 35, 28, 0.45)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700" as const,
    letterSpacing: -0.6,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700" as const,
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700" as const,
    letterSpacing: -0.2,
  },
  subheading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600" as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500" as const,
    letterSpacing: 0.2,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
  },
  metric: {
    fontSize: 48,
    lineHeight: 54,
    fontWeight: "700" as const,
    letterSpacing: -1,
  },
} as const;

export const shadows = {
  soft: {
    shadowColor: "#14231C",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  typography,
  shadows,
} as const;

export type Theme = typeof theme;
