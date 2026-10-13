O co jde

Stavíme vlastní all-in-one marketingovou a CRM platformu Softema Hub — česká obdoba nástrojů typu GoHighLevel, ale na míru nám a našim klientům, plně v češtině a s daty pod naší kontrolou. Kompletní funkční zadání (moduly, datový model, bezpečnost, fáze) je v souboru ZADANI-APLIKACE.md — ber ho jako závazný podklad, co všechno aplikace umí a jak je to propojené.

Cíl tohoto zadání

Teď nepotřebuju backend ani funkčnost — potřebuju moderní, plně proklikatelný designový prototyp, který ukáže, jak by aplikace mohla vypadat a jak se v ní člověk proklikává. Slouží nám k tomu, abychom viděli směr, mohli ho připomínkovat a měli vizuální základ pro následný vývoj.

Co vytvořit

Interaktivní prototyp webové aplikace (klidně přes Claude Design — připravený prompt je na konci tohoto dokumentu) s levým sidebarem a těmito moduly:

Přehled — dashboard s metrikami a grafy
Kontakty — CRM: seznam + detail kontaktu s časovou osou aktivit
Kampaně — seznam + průvodce tvorbou e-mailové kampaně + drag & drop editor e-mailu
Automatizace — vizuální workflow builder (uzly, spouštěče, větvení)
Platby — faktury, předplatné, transakce
Kurzy + komunita — membership (kurzy, digitální produkty, skupiny)
Webináře — live + evergreen, registrace
Chatbot — editor vzhledu + znalostní báze
Nastavení — profil, tým, integrace
Priorita — co rozpracovat nejvíc
E-mailing — tvorba kampaně a hlavně editor e-mailu (to je jádro produktu, priorita č. 1).
Detail kontaktu v CRM — se vším (časová osa, vlastní pole, historie).

Zbytek modulů stačí na úrovni hlavních obrazovek, ale ať jsou proklikatelné.

Vizuální směr
Naváž na náš stávající design systém — vizuální jazyk (barvy, typografie, komponenty) už máme vyřešený, prosím drž se ho, nevymýšlej nový.
Moderní, čistý SaaS styl — vzdušné, přehledné, profesionální.
Celé v češtině — texty, tlačítka, stavy i ukázkový obsah (česká jména, částky v Kč, data ve formátu 25. 9. 2026).
Naplň obrazovky realistickým obsahem, ať to působí jako živá aplikace, ne prázdná kostra.
Co od tebe potřebuju jako výstup
Proklikatelný prototyp — kliknutí v sidebaru přepíná moduly, klik na kontakt otevře detail, „Nová kampaň" otevře průvodce a z něj se prokliknu do editoru e-mailu, hover a aktivní stavy fungují.
Nejdřív pošli shell + dashboard + CRM + e-mailing, ať potvrdíme směr, pak dolaď zbytek. Nemusíš stavět všechno najednou.
K rozhodnutí spolu
Přesný rozsah první iterace (kolik modulů do prvního průchodu).
Jestli do prototypu chceš zapojit reálná ukázková data z některého našeho klienta, nebo smyšlená.