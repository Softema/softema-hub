# E2E a vizuální reference

Playwright (Chromium) ověřuje hlavní prokliky a vzhled prototypu. Servery se nespouštějí automaticky, aplikaci je potřeba mít spuštěnou předem.

| Projekt | Server | Výchozí URL (proměnná) |
| --- | --- | --- |
| `vinext-desktop`, `vinext-mobile` | `pnpm dev` (Vinext) | `http://localhost:5173` (`E2E_VINEXT_URL`) |
| `next-desktop`, `next-mobile` | `pnpm dev:next`, nebo `pnpm build:next` + `next start` | `http://localhost:3000` (`E2E_NEXT_URL`) |

- `visual.spec.ts`: snímky dashboardu, kontaktů, detailu kontaktu, průvodce kampaní a editoru, desktop 1440×900 a mobil 390×844.
- `smoke.spec.ts`: navigace, seznam → detail kontaktu → zpět, nová kampaň → editor → návrat a veřejné stránky.

```sh
pnpm test:e2e:vinext      # proti referenci (Vinext)
pnpm test:e2e:next        # Next.js proti stejným referenčním snímkům
pnpm test:e2e:reference   # přepíše referenci ze současného Vinextu; jen po schválení změny vzhledu
```

Referenční snímky v `__screenshots__/` jsou pořízené na Windows (`-win32`) a vykreslují systémové písmo (Inter se nenačítá). Porovnání má smysl jen na stejném OS a ve stejném prohlížeči. V CI se proto nespouští. Výsledky selhání: `playwright-report/` a `test-results/` (neverzují se).
