import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Softema Hub — méně přepínání, více výsledků',description:'Kontakty, kampaně a automatizace v jednom českém pracovním prostoru. Seznamte se se Softema Hub a prohlédněte si interaktivní ukázku aplikace.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="cs"><body className="antialiased">{children}</body></html>}
