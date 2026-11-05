'use client';
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Btn } from '../ui';
import { message } from './api';

export function LoadFailure({ error, onRetry, title = 'Data se nepodařilo načíst' }: { error: unknown; onRetry: () => void; title?: string }) {
  return <section className="panel empty" role="alert"><h3>{title}</h3><p>{message(error)}</p><Btn onClick={onRetry}><RefreshCw aria-hidden />Zkusit znovu</Btn></section>;
}
export const LoadingBlock = ({ label }: { label: string }) => <div className="hub-loading" role="status"><span className="sr-only">{label}</span><i /><i /><i /></div>;
