export type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'nodspice.theme.v1';

export function resolveTheme(stored: string | null, prefersLight: boolean): ThemeMode {
  if (stored === 'dark' || stored === 'light') return stored;
  return prefersLight ? 'light' : 'dark';
}

export function loadTheme(): ThemeMode {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    // Continue with the operating-system preference.
  }
  return resolveTheme(
    stored,
    window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false,
  );
}

export function applyTheme(theme: ThemeMode): void {
  const root = window.document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  window.document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f5f7fb' : '#050a10');
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The active page still keeps the selected theme.
  }
}

export function toggleTheme(theme: ThemeMode): ThemeMode {
  return theme === 'light' ? 'dark' : 'light';
}
