import { describe, expect, test } from 'bun:test';
import { resolveTheme, toggleTheme } from './theme';

describe('theme preference', () => {
  test('keeps an explicit saved preference', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  test('falls back to the operating-system preference', () => {
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme('unsupported', false)).toBe('dark');
  });

  test('toggles between both themes', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });
});
