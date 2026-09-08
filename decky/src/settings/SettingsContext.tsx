import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Settings, applySettings, defaultSettings, loadSettings, saveSettings } from './settings';

interface Ctx {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // Apply + persist on every change.
  useEffect(() => { applySettings(settings); saveSettings(settings); }, [settings]);

  // Re-apply when the OS theme flips and the user is on "system".
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applySettings(settings);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings]);

  // Same for motion: somebody who turns on "reduce motion" mid-session gets it immediately.
  useEffect(() => {
    if (settings.motion !== 'system') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => applySettings(settings);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings]);

  const value = useMemo<Ctx>(() => ({
    settings,
    set: (key, val) => setSettings((s) => ({ ...s, [key]: val })),
    reset: () => setSettings({ ...defaultSettings }),
  }), [settings]);

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
