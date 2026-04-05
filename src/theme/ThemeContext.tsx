import React, { createContext, useContext } from 'react';

const defaultTheme = {
  colors: {
    background: '#f6f8fb',
    card: '#ffffff',
    border: '#d1d5db',
    text: '#111827',
    textSecondary: '#4b5563',
    primary: '#2563eb',
    accent: '#0f766e',
    danger: '#dc2626',
    overlay: 'rgba(17, 24, 39, 0.35)',
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
