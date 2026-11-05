'use client';
/* Shared pieces of the Courses & products screens. */
import React from 'react';
import { FileText, HelpCircle, Paperclip, Video } from 'lucide-react';
import { fmt } from '@/lib/hub/format';
import type { Course, LessonType } from '@/lib/hub/types';
import { useHub } from './state';
import { SubNav } from './kit';

export const ACCENTS: [string, string][] = [['orange', 'Oranžová'], ['blue', 'Modrá'], ['green', 'Zelená'], ['purple', 'Fialová'], ['dark', 'Tmavá']];
export const LESSON_ICON: Record<LessonType, typeof Video> = { Video, Text: FileText, Soubor: Paperclip, Kvíz: HelpCircle };
export const priceLabel = (c: Pick<Course, 'price' | 'priceType'>) => (c.priceType === 'Zdarma' ? 'Zdarma' : c.priceType === 'Součást členství' ? 'V rámci členství' : c.priceType === 'Předplatné' ? `${fmt(c.price)} Kč / měsíc` : `${fmt(c.price)} Kč`);
export const minutes = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);

/** Cover art: uploaded image or accent background with the title. */
export function Art({ accent, image, eyebrow, title, small = false }: { accent: string; image?: { dataUrl: string; name: string }; eyebrow?: string; title: string; small?: boolean }) {
  return (
    <div className={`art art-${accent} ${small ? 'small' : ''}`}>
      {image ? <img src={image.dataUrl} alt="" /> : <>{eyebrow && <span>{eyebrow}</span>}<strong>{title}</strong></>}
    </div>
  );
}

export function LearnNav({ active }: { active: 'kurzy' | 'kurzy/produkty' }) {
  const { w } = useHub();
  return <SubNav active={active} items={[['kurzy', 'Kurzy', w.courses.length], ['kurzy/produkty', 'Digitální produkty', w.products.length]]} />;
}
