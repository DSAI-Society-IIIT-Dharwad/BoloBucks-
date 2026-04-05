import React, { createContext, useContext } from 'react';

const defaultTheme = {
  colors: {
    background: '#050816',
    surface: '#0b1120',
    card: '#111827',
    cardElevated: '#182033',
    border: '#243041',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    primary: '#22c55e',
    accent: '#38bdf8',
    success: '#16a34a',
    warning: '#f59e0b',
    danger: '#ef4444',
    overlay: 'rgba(2, 6, 23, 0.55)',
    muted: '#64748b',
  },
};

type ThemeContextValue = {
  theme: typeof defaultTheme;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={{ theme: defaultTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
