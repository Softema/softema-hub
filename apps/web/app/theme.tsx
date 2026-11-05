'use client';
import React, { useSyncExternalStore } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { Monitor, Moon, Sun, SunMoon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Light / dark / system theme for the app (/aplikace). Public pages stay light. The choice is
    stored in localStorage; next-themes applies it before paint and follows OS changes in "system". */
export function AppTheme({ children }: { children: React.ReactNode }) {
  const inApp = usePathname()?.startsWith('/aplikace') ?? false;
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="softema-theme" disableTransitionOnChange forcedTheme={inApp ? undefined : 'light'}>
      {children}
    </ThemeProvider>
  );
}

const subscribeNoop = () => () => {};
const useMounted = () => useSyncExternalStore(subscribeNoop, () => true, () => false);
const options = [
  ['light', 'Světlý', Sun],
  ['dark', 'Tmavý', Moon],
  ['system', 'Podle systému', Monitor],
] as const;

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="icon-btn" aria-label="Vzhled aplikace" title="Vzhled aplikace">
          <SunMoon aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Vzhled aplikace</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mounted ? theme ?? 'system' : 'system'} onValueChange={setTheme}>
          {options.map(([value, label, Icon]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
