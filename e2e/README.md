# E2E a vizuální reference

Playwright (Chromium) ověřuje hlavní prokliky a vzhled prototypu. Server se nespouští automaticky, aplikaci je potřeba mít spuštěnou předem: `pnpm dev`, nebo `pnpm build` a `pnpm start`. Výchozí adresa je `http://localhost:3000`, jinou nastavíte proměnnou `E2E_BASE_URL`.

Projekty `desktop` (1440×900) a `mobile` (390×844):

- `visual.spec.ts`: snímky dashboardu, kontaktů, detailu kontaktu, průvodce kampaní, reportu kampaně a editoru.
- `smoke.spec.ts`: navigace, seznam → detail kontaktu → zpět, nová kampaň → editor → návrat a veřejné stránky.

```sh
pnpm test:e2e             # smoke testy + porovnání se snímky
pnpm test:e2e:reference   # přepíše referenční snímky; jen po schválené změně vzhledu
```

Referenční snímky v `__screenshots__/` pocházejí z původního Vinext prototypu (archivní větev `archive/sites-vinext`). Next.js verze se s nimi shoduje na pixel. Jsou pořízené na Windows (`-win32`) se systémovým písmem (Inter se nenačítá), takže porovnání má smysl jen na stejném OS a ve stejném prohlížeči. V CI se proto nespouští. Výsledky selhání: `playwright-report/` a `test-results/` (neverzují se).
