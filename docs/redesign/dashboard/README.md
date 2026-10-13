# Redesign dashboardu: snímky k posouzení

Větev `redesign/dashboard`. Snímky jsou pořízené 13. 10. 2026 v Chromiu na Windows, s ukázkovými daty (datum prototypu 25. 9. 2026).

| Složka | Obsah |
| --- | --- |
| `before/` | Původní dashboard (`main`) při 1440, 1280, 1024, 768 a 390 px. Pořízeno z `next dev`, proto je vlevo dole vidět indikátor Next.js „N“. |
| `after/` | Redesign při 1440, 1280, 1024, 768 a 390 px z produkčního buildu. `*-390-viewport.png` je první obrazovka telefonu se spodní navigací. Na celostránkových mobilních snímcích je pevná spodní lišta skrytá, jinak by se vykreslila uprostřed stránky. |
| `after/kontakty-1440.png`, `after/kampane-nova-390*.png` | Kontrola dopadu sdíleného shellu (font, sidebar, horní lišta, spodní navigace) na ostatní moduly. |

Původní referenční snímky v `e2e/__screenshots__/` nejsou přepsané. Po výběru varianty je aktualizuje `pnpm test:e2e:reference`.
