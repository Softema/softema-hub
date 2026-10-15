'use client';
import { createContext, useContext } from 'react';

/** Actions of the app shell that screens may trigger (e.g. the dashboard opens notifications). */
export const ShellContext = createContext<{ openNotifications: () => void }>({ openNotifications: () => {} });
export const useShell = () => useContext(ShellContext);
