import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
// Self-hosted by next/font at build time; latin-ext covers Czech diacritics.
const geist=Geist({subsets:['latin','latin-ext'],variable:'--font-geist-sans',display:'swap'});
export const metadata:Metadata={title:'Softema Hub — méně přepínání, více výsledků',description:'Kontakty, kampaně a automatizace v jednom českém pracovním prostoru. Seznamte se se Softema Hub a prohlédněte si interaktivní ukázku aplikace.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="cs" className={geist.variable}><body className="antialiased">{children}</body></html>}
