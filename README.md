# Softema Hub

Interaktivní návrh české marketingové a CRM aplikace pro Softema Creative. Všechny údaje jsou ukázkové. Neobsahuje produkční backend a neodesílá e-maily ani platby.

## Veřejný web

- Úvodní landing page, interaktivní náhled produktu, funkce, scénáře použití a FAQ.
- `/funkce` s přehledem modulů a odkazy do jejich ukázek.
- `/prihlaseni`, `/registrace` (dva kroky), `/obnova-hesla`: prototyp přístupových formulářů s validací. Přístupové údaje se neukládají ani neodesílají; nejde o autentizaci.
- `/aplikace` zachovává původní kompletní Hub. Původní odkazy s fragmenty URL vedou do aplikace.
- Veřejný web a aplikace mají navzájem propojenou navigaci.

## Obrazovky

- Přehled s grafy, změnou období a odkazy do modulů.
- Kontakty: hledání bez diakritiky, filtrování, detail, časová osa, poznámky, štítky, editace a CSV import.
- Kampaně: seznam, report odeslané kampaně, příjemci a čtyřkrokový průvodce.
- Editor e-mailů: přetažení bloků, změna pořadí, úprava obsahu, barev a zarovnání, duplikace, undo/redo, mobilní a desktopový náhled, personalizace.
- Automatizace: seznam a vizuální větvený scénář, přidávání a editace kroků, přepnutí stavu, zoom.
- Faktury, předplatné a transakce, detail a vytvoření ukázkové faktury.
- Kurzy, ukázková lekce, komunita, příspěvky, reakce a komentáře.
- Webináře, detail registrací a vytvoření ukázkového webináře.
- Chatbot: vzhled s živým náhledem, správa znalostní báze a chování, předem připravené testovací odpovědi.
- Nastavení pracovního prostoru, týmu, domén, integrací a oznámení.

Navigace používá fragmenty URL. Data se mění pouze v paměti stránky; po obnovení se resetují. Kontakty a kampaně jsou oddělené pro dva ukázkové pracovní prostory. Ostatní moduly demonstrují UX bez skutečných externích integrací.

## Technologie

React, TypeScript, Vinext / App Router, shadcn/ui, Tailwind CSS, Recharts, Lucide. Publikováno prostřednictvím Sites.

## Ověření

TypeScript kontrola bez chyb. V prohlížeči ověřeno hledání bez diakritiky, CRM detail a uložení poznámky, čtyři kroky kampaně, skutečné přetažení bloku, změna textu, mobilní náhled e-mailu, uložení a naplánování, navigace všech modulů, editace workflow uzlu, živý náhled a ukázkový chat, přepnutí pracovních prostorů.

Vestavěné WebMCP akce jsou registrovány pouze při dostupnosti document.modelContext. Aktuální QA prohlížeč tuto funkci neposkytuje, proto jejich runtime ověření nebylo dostupné. Validace vstupů a vazba na stejný stav UI jsou součástí implementace.
