import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'qltc.theme';
const DARK_CLASS = 'dark';

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  const resolved = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  root.classList.toggle(DARK_CLASS, resolved);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStored);

  useEffect(() => {
    applyMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  // React to system preference changes when mode is 'system'
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyMode('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode(prev => {
      const resolved = prev === 'dark' || (prev === 'system' && systemPrefersDark());
      return resolved ? 'light' : 'dark';
    });
  }, []);

  return { mode, setMode, toggle };
}
