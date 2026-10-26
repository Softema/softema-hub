# E2E a vizuální reference

Playwright (Chromium) ověřuje hlavní prokliky a vzhled prototypu. Server se nespouští automaticky, aplikaci je potřeba mít spuštěnou předem: `pnpm dev`, nebo `pnpm build` a `pnpm start`. Výchozí adresa je `http://localhost:3000`, jinou nastavíte proměnnou `E2E_BASE_URL`.

Projekty `desktop` (1440×900) a `mobile` (390×844). Každý test dostane nový kontext prohlížeče, a tedy prázdné úložiště a čerstvá ukázková data.

- `smoke.spec.ts` prochází všechny moduly:
  - navigace a zdroje na dashboardu;
  - kontakty: seznam → detail → zpět, vlastní pole a perzistence po obnovení stránky, oddělení prostorů, segmenty, import CSV, pipeline;
  - kampaně: průvodce → editor bloků (undo/redo) → naplánování;
  - kurzy (struktura, náhled studenta) a webináře (registrace bez duplicit, zrušení);
  - automatizace (šablona, aktivace, spouštěč z CRM, validace) a faktury;
  - komunita, chatbot (lead do CRM), nastavení a integrace bez API klíčů;
  - veřejné stránky.
  - koncept kampaně po obnovení stránky, zpět/vpřed, export → import dat do čistého prohlížeče, výpadek CDN Unlayeru.
- `visual.spec.ts`: snímky dashboardu, kontaktů, detailu kontaktu, průvodce kampaní, reportu kampaně a editoru bloků. Ukázková data se generují relativně k času prvního spuštění, proto test fixuje hodiny na 15. 10. 2026 10:00 (Europe/Prague).

```sh
pnpm test:e2e             # smoke testy + porovnání se snímky
pnpm test:e2e:reference   # přepíše referenční snímky; jen po schválené změně vzhledu
```

Referenční snímky v `__screenshots__/` pocházejí z původního prototypu před přepracováním vzhledu. Nový vzhled zatím schválený není, takže `visual.spec.ts` proti nim selhává záměrně. Po schválení je přepíše `pnpm test:e2e:reference`.

Snímky jsou pořízené na Windows (`-win32`), takže porovnání má smysl jen na stejném OS a ve stejném prohlížeči. V CI se proto nespouští.

V `next dev` skrývá `openHub()` odznak vývojového overlaye Next.js, protože by na mobilu zakrýval spodní navigaci.

## Průchod všemi obrazovkami

`node scripts/ui-audit.mjs --base http://localhost:3000` otevře každou obrazovku Hubu přímým odkazem (oba prostory, 1920/1440/1024/390 px, světlé i tmavé téma) a hlásí nezachycené chyby, chyby v konzoli, horizontální přetečení, chybějící `h1` a závažná porušení axe-core (kontrast, popisky, ARIA). Report je v `test-results/ui-audit.json`. Volbou `--shots docs/screenshots --shot-filter '…'` uloží snímky vybraných obrazovek.

Výsledky selhání jsou v `playwright-report/` a `test-results/` (neverzují se).
